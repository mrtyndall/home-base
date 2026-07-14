"use client";

import { type ChangeEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { validateAttachmentMetadata } from "@/lib/attachment-policy";

export function AttachmentUpload({
  parentType,
  parentId,
  accept,
  label = "Upload file",
  variant = "pill",
}: {
  parentType: "area" | "journal_entry" | "project";
  parentId: string;
  accept?: string;
  label?: string;
  variant?: "pill" | "quiet";
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [, startTransition] = useTransition();

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || pending) return;

    setMessage("");
    const validation = validateAttachmentMetadata({
      filename: file.name,
      mime: file.type,
      size: file.size,
    });
    if (!validation.ok) {
      setMessage(validation.error);
      event.target.value = "";
      return;
    }

    setPending(true);
    try {
      const presignResponse = await fetch("/api/documents/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentType,
          parentId,
          filename: file.name,
          mime: validation.mime,
          size: file.size,
        }),
      });
      if (!presignResponse.ok) {
        const body = (await presignResponse.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Upload is not configured.");
      }

      const { uploadUrl } = (await presignResponse.json()) as {
        uploadUrl: string;
      };
      const uploadResponse = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": validation.mime },
        body: file,
      });
      if (!uploadResponse.ok) {
        const body = (await uploadResponse.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Upload failed. Try again.");
      }

      setMessage("Attachment uploaded.");
      startTransition(() => router.refresh());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setPending(false);
      event.target.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <label
        aria-busy={pending}
        className={
          variant === "quiet"
            ? "inline-flex h-8 cursor-pointer items-center px-2 text-[13px] font-medium text-stone-500 transition hover:text-stone-950"
            : "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border border-[#E2E6DF] bg-white px-3.5 text-[13px] font-medium text-stone-600 transition hover:border-teal-700/50 hover:text-teal-700"
        }
      >
        {pending ? "Uploading" : label}
        <input
          type="file"
          accept={accept}
          className="sr-only"
          onChange={upload}
          disabled={pending}
        />
      </label>
      {message ? (
        <p
          role="status"
          aria-live="polite"
          className={`text-[13px] ${
            message === "Attachment uploaded."
              ? "text-[#6B7268]"
              : "text-amber-800"
          }`}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
