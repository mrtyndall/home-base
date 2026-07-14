import { mkdir, open, rename, rm } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  ATTACHMENT_MAX_BYTES,
  canonicalAttachmentMime,
} from "@/lib/attachment-policy";

export class AttachmentUploadError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "AttachmentUploadError";
  }
}

export async function writeVerifiedAttachment({
  request,
  directory,
  documentId,
  expectedMime,
  expectedSize,
}: {
  request: Request;
  directory: string;
  documentId: string;
  expectedMime: string;
  expectedSize: number;
}): Promise<{ bytesWritten: number }> {
  const contentLengthHeader = request.headers.get("content-length");
  if (!contentLengthHeader) {
    throw new AttachmentUploadError("Content-Length is required.", 411);
  }
  if (!/^\d+$/.test(contentLengthHeader)) {
    throw new AttachmentUploadError("Content-Length is invalid.");
  }
  const contentLength = Number(contentLengthHeader);
  if (!Number.isSafeInteger(contentLength) || contentLength > ATTACHMENT_MAX_BYTES) {
    throw new AttachmentUploadError("Attachment exceeds the upload limit.", 413);
  }
  if (contentLength !== expectedSize) {
    throw new AttachmentUploadError("Content-Length does not match the attachment record.");
  }

  const requestMime = canonicalAttachmentMime(
    request.headers.get("content-type") ?? "",
  );
  if (!requestMime || requestMime !== canonicalAttachmentMime(expectedMime)) {
    throw new AttachmentUploadError("Content-Type does not match the attachment record.");
  }
  if (!request.body) {
    throw new AttachmentUploadError("Upload body is required.");
  }

  await mkdir(directory, { recursive: true });
  const finalPath = path.join(directory, documentId);
  const temporaryPath = path.join(directory, `.${documentId}.${randomUUID()}.part`);
  const file = await open(temporaryPath, "wx", 0o600);
  const reader = request.body.getReader();
  let bytesWritten = 0;
  let closed = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesWritten += value.byteLength;
      if (bytesWritten > expectedSize || bytesWritten > ATTACHMENT_MAX_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new AttachmentUploadError("Uploaded file is larger than declared.", 413);
      }
      let offset = 0;
      while (offset < value.byteLength) {
        const result = await file.write(
          value,
          offset,
          value.byteLength - offset,
        );
        if (result.bytesWritten <= 0) {
          throw new Error("Attachment storage stopped accepting bytes.");
        }
        offset += result.bytesWritten;
      }
    }

    if (bytesWritten !== expectedSize) {
      throw new AttachmentUploadError("Uploaded byte count does not match the attachment record.");
    }

    await file.sync();
    await file.close();
    closed = true;
    await rename(temporaryPath, finalPath);
    return { bytesWritten };
  } catch (error) {
    if (!closed) await file.close().catch(() => undefined);
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
}
