import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveVerifiedDestination } from "@/lib/destinations";
import { createUploadUrl, isR2Configured } from "@/lib/r2";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parentType = body?.parentType;
  const parentId = typeof body?.parentId === "string" ? body.parentId : null;
  const filename = typeof body?.filename === "string" ? body.filename : "";
  const mime = typeof body?.mime === "string" ? body.mime : "application/octet-stream";
  const size = Number(body?.size ?? 0);

  if (
    (parentType !== "area" &&
      parentType !== "project" &&
      parentType !== "journal_entry" &&
      parentType != null) ||
    ((parentType == null) !== (parentId == null)) ||
    !filename ||
    !Number.isFinite(size) ||
    size <= 0
  ) {
    return NextResponse.json({ error: "Invalid attachment request." }, { status: 400 });
  }

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
  const uploadUrl = isR2Configured()
    ? await createUploadUrl({ key, mime })
    : `/api/documents/${document.id}/upload-local`;

  return NextResponse.json({ documentId: document.id, uploadUrl });
}
