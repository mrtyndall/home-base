import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  ATTACHMENT_MAX_BYTES,
  validateAttachmentMetadata,
} from "../src/lib/attachment-policy";
import { writeVerifiedAttachment } from "../src/lib/attachment-storage";

const PDF_MIME = "application/pdf";

test("attachment metadata accepts a safe file within the 25 MiB limit", () => {
  assert.deepEqual(
    validateAttachmentMetadata({
      filename: "reference.pdf",
      mime: PDF_MIME,
      size: ATTACHMENT_MAX_BYTES,
    }),
    { ok: true, mime: PDF_MIME },
  );
});

test("attachment metadata rejects oversized and unsupported files", () => {
  assert.deepEqual(
    validateAttachmentMetadata({
      filename: "large.pdf",
      mime: PDF_MIME,
      size: ATTACHMENT_MAX_BYTES + 1,
    }),
    { ok: false, error: "Attachments must be 25 MB or smaller." },
  );
  assert.deepEqual(
    validateAttachmentMetadata({
      filename: "page.html",
      mime: "text/html",
      size: 10,
    }),
    { ok: false, error: "This file type is not supported." },
  );
});

async function withTempDir(
  run: (directory: string) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "home-base-attachment-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function requestWithBody(
  body: BodyInit,
  headers: Record<string, string> = {},
): Request {
  return new Request("http://localhost/upload", {
    method: "PUT",
    headers,
    body,
    // Required by Node when Request receives a streaming body.
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

test("local upload rejects missing content-length without creating a partial file", async () => {
  await withTempDir(async (directory) => {
    const request = requestWithBody("hello", { "content-type": "text/plain" });
    await assert.rejects(
      writeVerifiedAttachment({
        request,
        directory,
        documentId: "document-1",
        expectedMime: "text/plain",
        expectedSize: 5,
      }),
      /Content-Length is required/,
    );
    assert.deepEqual(await readdir(directory), []);
  });
});

test("local upload rejects a lying content-length before consuming the body", async () => {
  await withTempDir(async (directory) => {
    const request = requestWithBody("hello", {
      "content-type": "text/plain",
      "content-length": "4",
    });
    await assert.rejects(
      writeVerifiedAttachment({
        request,
        directory,
        documentId: "document-2",
        expectedMime: "text/plain",
        expectedSize: 5,
      }),
      /Content-Length does not match/,
    );
    assert.deepEqual(await readdir(directory), []);
  });
});

test("local upload rejects a content-type mismatch", async () => {
  await withTempDir(async (directory) => {
    const request = requestWithBody("hello", {
      "content-type": "application/pdf",
      "content-length": "5",
    });
    await assert.rejects(
      writeVerifiedAttachment({
        request,
        directory,
        documentId: "document-3",
        expectedMime: "text/plain",
        expectedSize: 5,
      }),
      /Content-Type does not match/,
    );
    assert.deepEqual(await readdir(directory), []);
  });
});

test("local upload caps the actual stream and cleans the partial temp file", async () => {
  await withTempDir(async (directory) => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.enqueue(new Uint8Array([4, 5, 6]));
        controller.close();
      },
    });
    const request = requestWithBody(body, {
      "content-type": "application/pdf",
      "content-length": "5",
    });

    await assert.rejects(
      writeVerifiedAttachment({
        request,
        directory,
        documentId: "document-4",
        expectedMime: PDF_MIME,
        expectedSize: 5,
      }),
      /Uploaded file is larger than declared/,
    );
    assert.deepEqual(await readdir(directory), []);
  });
});

test("local upload enforces the 25 MiB cap against the streamed bytes", async () => {
  await withTempDir(async (directory) => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(ATTACHMENT_MAX_BYTES));
        controller.enqueue(new Uint8Array(1));
        controller.close();
      },
    });
    const request = requestWithBody(body, {
      "content-type": PDF_MIME,
      "content-length": String(ATTACHMENT_MAX_BYTES),
    });

    await assert.rejects(
      writeVerifiedAttachment({
        request,
        directory,
        documentId: "document-over-limit",
        expectedMime: PDF_MIME,
        expectedSize: ATTACHMENT_MAX_BYTES,
      }),
      /Uploaded file is larger than declared/,
    );
    assert.deepEqual(await readdir(directory), []);
  });
});

test("local upload rejects a short stream and cleans the partial temp file", async () => {
  await withTempDir(async (directory) => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.close();
      },
    });
    const request = requestWithBody(body, {
      "content-type": PDF_MIME,
      "content-length": "5",
    });

    await assert.rejects(
      writeVerifiedAttachment({
        request,
        directory,
        documentId: "document-5",
        expectedMime: PDF_MIME,
        expectedSize: 5,
      }),
      /Uploaded byte count does not match/,
    );
    assert.deepEqual(await readdir(directory), []);
  });
});

test("local upload atomically publishes a complete verified file", async () => {
  await withTempDir(async (directory) => {
    const request = requestWithBody("hello", {
      "content-type": "text/plain; charset=utf-8",
      "content-length": "5",
    });
    const result = await writeVerifiedAttachment({
      request,
      directory,
      documentId: "document-6",
      expectedMime: "text/plain",
      expectedSize: 5,
    });

    assert.deepEqual(result, { bytesWritten: 5 });
    assert.equal(await readFile(path.join(directory, "document-6"), "utf8"), "hello");
    assert.deepEqual(await readdir(directory), ["document-6"]);
  });
});

test("presign and local routes enforce policy and remove failed metadata", () => {
  const presignRoute = fs.readFileSync(
    "src/app/api/documents/presign/route.ts",
    "utf8",
  );
  const localRoute = fs.readFileSync(
    "src/app/api/documents/[documentId]/upload-local/route.ts",
    "utf8",
  );
  const r2 = fs.readFileSync("src/lib/r2.ts", "utf8");

  assert.match(presignRoute, /validateAttachmentMetadata/);
  assert.match(presignRoute, /prisma\.document\s*\.delete/);
  assert.match(presignRoute, /createUploadUrl\(\{ key, mime[\s\S]*size/);
  assert.match(localRoute, /writeVerifiedAttachment/);
  assert.match(localRoute, /prisma\.document\s*\.delete/);
  assert.doesNotMatch(localRoute, /arrayBuffer\(\)/);
  assert.match(r2, /ContentLength:\s*size/);
});

test("attachment picker preflights limits and exposes an accessible status", () => {
  const component = fs.readFileSync(
    "src/components/attachment-upload.tsx",
    "utf8",
  );

  assert.match(component, /validateAttachmentMetadata/);
  assert.match(component, /aria-live="polite"/);
  assert.match(component, /role="status"/);
  assert.match(component, /aria-busy=\{pending\}/);
  assert.match(component, /disabled=\{pending\}/);
  assert.match(component, /uploadResponse\.json\(\)/);
});
