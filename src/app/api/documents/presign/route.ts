import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveVerifiedDestination } from "@/lib/destinations";
import { validateAttachmentMetadata } from "@/lib/attachment-policy";
import { createUploadUrl, isR2Configured } from "@/lib/r2";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parentType = body?.parentType;
  const parentId = typeof body?.parentId === "string" ? body.parentId : null;
  const filename = typeof body?.filename === "string" ? body.filename : "";
  const requestedMime = typeof body?.mime === "string" ? body.mime : "";
  const size = Number(body?.size ?? 0);

  if (
    (parentType !== "area" &&
      parentType !== "project" &&
      parentType !== "journal_entry" &&
      parentType != null) ||
    ((parentType == null) !== (parentId == null)) ||
    !filename
  ) {
    return NextResponse.json({ error: "Invalid attachment request." }, { status: 400 });
  }

  const validation = validateAttachmentMetadata({
    filename,
    mime: requestedMime,
    size,
  });
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }
  const mime = validation.mime;

  if (parentType === "area") {
    await resolveVerifiedDestination({ areaId: parentId });
  } else if (parentType === "project") {
    const project = await prisma.project.findUnique({
      where: { id: parentId! },
      select: { areaId: true },
    });
    if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
    await resolveVerifiedDestination({ areaId: project.areaId, projectId: parentId });
  }

  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]+/g, "_");
  const key = isR2Configured()
    ? `${parentType ?? "inbox"}/${parentId ?? "global"}/${randomUUID()}-${safeFilename}`
    : `local/${randomUUID()}-${safeFilename}`;
  const document = await prisma.document.create({
    data: {
      parentType: parentType ?? null,
      parentId,
      filename,
      r2Key: key,
      mime,
      size,
    },
  });
  let uploadUrl: string;
  try {
    uploadUrl = isR2Configured()
      ? await createUploadUrl({ key, mime, size })
      : `/api/documents/${document.id}/upload-local`;
  } catch {
    await prisma.document
      .delete({ where: { id: document.id } })
      .catch(() => undefined);
    return NextResponse.json(
      { error: "Upload could not be prepared. Try again." },
      { status: 503 },
    );
  }

  return NextResponse.json({ documentId: document.id, uploadUrl });
}
