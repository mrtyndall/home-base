import path from "node:path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  AttachmentUploadError,
  writeVerifiedAttachment,
} from "@/lib/attachment-storage";
import { isR2Configured } from "@/lib/r2";

type RouteContext = {
  params: Promise<{ documentId: string }>;
};

export async function PUT(request: Request, context: RouteContext) {
  if (isR2Configured()) {
    return NextResponse.json({ error: "Local upload is disabled." }, { status: 404 });
  }

  const { documentId } = await context.params;
  const document = await prisma.document.findUnique({
    where: { id: documentId },
  });
  if (!document || !document.r2Key.startsWith("local/")) {
    return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
  }

  const attachmentDir = path.join(process.cwd(), ".data", "attachments");
  try {
    await writeVerifiedAttachment({
      request,
      directory: attachmentDir,
      documentId: document.id,
      expectedMime: document.mime,
      expectedSize: document.size,
    });
  } catch (error) {
    await prisma.document
      .delete({ where: { id: document.id } })
      .catch(() => undefined);
    if (error instanceof AttachmentUploadError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Upload failed." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
