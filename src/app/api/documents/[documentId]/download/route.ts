import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createDownloadUrl, isR2Configured } from "@/lib/r2";

type RouteContext = {
  params: Promise<{ documentId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { documentId } = await context.params;
  const document = await prisma.document.findUnique({
    where: { id: documentId },
  });
  if (!document) {
    return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
  }

  if (!isR2Configured()) {
    if (!document.r2Key.startsWith("local/")) {
      return NextResponse.json({ error: "R2 is not configured." }, { status: 503 });
    }

    const file = await readFile(
      path.join(process.cwd(), ".data", "attachments", document.id),
    );
    return new NextResponse(file, {
      headers: {
        "Content-Type": document.mime,
        "Content-Disposition": `attachment; filename="${document.filename.replace(/"/g, "")}"`,
      },
    });
  }

  return NextResponse.redirect(await createDownloadUrl(document.r2Key));
}
