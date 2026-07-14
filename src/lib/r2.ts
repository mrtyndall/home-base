import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

type R2Config = {
  bucket: string;
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
};

function getR2Config(): R2Config | null {
  const bucket = process.env.R2_BUCKET;
  const endpoint = process.env.R2_ENDPOINT;
  const region = process.env.R2_REGION ?? "auto";
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!bucket || !endpoint || !accessKeyId || !secretAccessKey) {
    return null;
  }

  return { bucket, endpoint, region, accessKeyId, secretAccessKey };
}

export function isR2Configured() {
  return Boolean(getR2Config());
}

function createClient(config: R2Config) {
  return new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

export async function createUploadUrl({
  key,
  mime,
  size,
}: {
  key: string;
  mime: string;
  size: number;
}) {
  const config = getR2Config();
  if (!config) throw new Error("R2 is not configured.");

  const client = createClient(config);
  return getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      ContentType: mime,
      ContentLength: size,
    }),
    { expiresIn: 600 },
  );
}

export async function createDownloadUrl(key: string) {
  const config = getR2Config();
  if (!config) throw new Error("R2 is not configured.");

  const client = createClient(config);
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: key,
    }),
    { expiresIn: 600 },
  );
}
