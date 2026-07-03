import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { config } from "dotenv";
import { createReadStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

config({ path: ".env.local" });
config();

type DatabaseConnection = {
  host: string;
  port: string;
  database: string;
  username: string;
  password: string;
  sslMode?: string;
};

function parseDatabaseUrl(rawUrl: string): DatabaseConnection {
  const url = new URL(rawUrl);
  const sslMode = url.searchParams.get("sslmode") ?? undefined;

  return {
    host: url.hostname,
    port: url.port || "5432",
    database: decodeURIComponent(url.pathname.replace(/^\//, "")),
    username: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    sslMode,
  };
}

async function runPgDump(connection: DatabaseConnection, outputPath: string) {
  const child = spawn(
    "pg_dump",
    [
      "--format=custom",
      "--compress=9",
      "--no-owner",
      "--no-acl",
      "--no-password",
      "--host",
      connection.host,
      "--port",
      connection.port,
      "--username",
      connection.username,
      "--dbname",
      connection.database,
      "--file",
      outputPath,
    ],
    {
      env: {
        ...process.env,
        PGPASSWORD: connection.password,
        PGSSLMODE: connection.sslMode ?? process.env.PGSSLMODE ?? "prefer",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  await new Promise<void>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`pg_dump failed with code ${code}: ${stderr.trim()}`));
    });
  });
}

async function uploadToS3(filePath: string, key: string) {
  const bucket = process.env.S3_BACKUP_BUCKET;
  if (!bucket) {
    return false;
  }

  const endpoint = process.env.S3_BACKUP_ENDPOINT;
  const region = process.env.S3_BACKUP_REGION ?? "auto";
  const accessKeyId = process.env.S3_BACKUP_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_BACKUP_SECRET_ACCESS_KEY;

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "S3 backup is enabled, but endpoint or credential environment variables are missing.",
    );
  }

  const client = new S3Client({
    endpoint,
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: createReadStream(filePath),
      ContentType: "application/octet-stream",
    }),
  );

  return true;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  const backupRoot =
    process.env.BACKUP_DIR ?? path.join(os.homedir(), "home-base-backups");
  await mkdir(backupRoot, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `home-base-${timestamp}.dump`;
  const outputPath = path.join(backupRoot, fileName);

  await runPgDump(parseDatabaseUrl(databaseUrl), outputPath);

  const file = await stat(outputPath);
  const uploaded = await uploadToS3(outputPath, `home-base/${fileName}`);

  console.log(
    JSON.stringify({
      status: "ok",
      file: outputPath,
      bytes: file.size,
      uploaded,
    }),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
