export const ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;
export const ATTACHMENT_MAX_MEGABYTES = 25;

const ALLOWED_ATTACHMENT_MIMES = new Set([
  "application/json",
  "application/msword",
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/zip",
  "audio/m4a",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/csv",
  "text/markdown",
  "text/plain",
  "video/mp4",
  "video/quicktime",
]);

export function canonicalAttachmentMime(mime: string): string {
  return mime.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

type ValidationResult =
  | { ok: true; mime: string }
  | { ok: false; error: string };

export function validateAttachmentMetadata({
  filename,
  mime,
  size,
}: {
  filename: string;
  mime: string;
  size: number;
}): ValidationResult {
  if (!filename.trim() || !Number.isSafeInteger(size) || size <= 0) {
    return { ok: false, error: "Choose a non-empty file to upload." };
  }
  if (size > ATTACHMENT_MAX_BYTES) {
    return {
      ok: false,
      error: `Attachments must be ${ATTACHMENT_MAX_MEGABYTES} MB or smaller.`,
    };
  }

  const canonicalMime = canonicalAttachmentMime(mime);
  if (!ALLOWED_ATTACHMENT_MIMES.has(canonicalMime)) {
    return { ok: false, error: "This file type is not supported." };
  }

  return { ok: true, mime: canonicalMime };
}
