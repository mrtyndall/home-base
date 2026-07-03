"use client";

import { type ChangeEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function AttachmentUpload({
  parentType,
  parentId,
}: {
  parentType: "area" | "project";
  parentId: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [, startTransition] = useTransition();

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || pending) return;

    setPending(true);
    setMessage("");
    try {
      const presignResponse = await fetch("/api/documents/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentType,
          parentId,
          filename: file.name,
          mime: file.type || "application/octet-stream",
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
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!uploadResponse.ok) {
        throw new Error("Upload failed.");
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
      <label className="inline-flex h-9 cursor-pointer items-center justify-center rounded-md border border-stone-300 bg-white px-3 text-sm font-medium text-stone-700 transition hover:border-teal-500 hover:text-teal-700">
        {pending ? "Uploading" : "Upload file"}
        <input type="file" className="sr-only" onChange={upload} />
      </label>
      {message ? <p className="text-sm text-stone-600">{message}</p> : null}
    </div>
  );
}
