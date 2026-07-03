const HEALTH_TIMEOUT_MS = 3_000;

// Read-only probe of the MCP server's /health endpoint. The MCP process runs
// beside the app only in the local runtime; on Railway this reports unreachable,
// which is the accurate posture rather than an error.
export async function GET() {
  const base = process.env.MCP_HEALTH_URL ?? "http://127.0.0.1:8081";
  const target = base.endsWith("/health") ? base : `${base.replace(/\/$/, "")}/health`;

  const checkedAt = new Date().toISOString();
  try {
    const response = await fetch(target, {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
      cache: "no-store",
    });

    return Response.json({
      ok: response.ok,
      httpStatus: response.status,
      checkedAt,
    });
  } catch {
    return Response.json({
      ok: false,
      unreachable: true,
      checkedAt,
    });
  }
}
