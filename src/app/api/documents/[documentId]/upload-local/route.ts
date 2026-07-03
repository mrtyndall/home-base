import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
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

  const bytes = Buffer.from(await request.arrayBuffer());
  const attachmentDir = path.join(process.cwd(), ".data", "attachments");
  await mkdir(attachmentDir, { recursive: true });
  await writeFile(path.join(attachmentDir, document.id), bytes);

  return NextResponse.json({ ok: true });
}
