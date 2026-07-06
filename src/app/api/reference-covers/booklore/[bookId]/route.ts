import { NextResponse } from "next/server";

type BookLoreCoverRouteProps = {
  params: Promise<{ bookId: string }>;
};

export async function GET(_request: Request, { params }: BookLoreCoverRouteProps) {
  const baseUrl = process.env.BOOKLORE_BASE_URL?.replace(/\/$/, "");
  const token = process.env.BOOKLORE_TOKEN;
  const { bookId } = await params;

  if (!baseUrl || !token || !bookId) {
    return new NextResponse(null, { status: 404 });
  }

  const response = await fetch(
    `${baseUrl}/api/v1/media/book/${encodeURIComponent(bookId)}/thumbnail`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (!response.ok || !response.body) {
    return new NextResponse(null, { status: response.status });
  }

  return new NextResponse(response.body, {
    status: 200,
    headers: {
      "content-type": response.headers.get("content-type") ?? "image/jpeg",
      "cache-control": "private, max-age=3600",
    },
  });
}
