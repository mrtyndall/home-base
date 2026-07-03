"use client";

import { useState } from "react";

type HealthResult =
  | { kind: "ok"; latencyMs: number }
  | { kind: "unhealthy"; httpStatus?: number }
  | { kind: "unreachable" }
  | { kind: "error" };

export function McpHealthCheck() {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<HealthResult | null>(null);

  async function runCheck() {
    setChecking(true);
    const startedAt = performance.now();
    try {
      const response = await fetch("/api/settings/mcp-health", { cache: "no-store" });
      const body = (await response.json()) as {
        ok: boolean;
        unreachable?: boolean;
        httpStatus?: number;
      };
      if (body.ok) {
        setResult({ kind: "ok", latencyMs: Math.round(performance.now() - startedAt) });
      } else if (body.unreachable) {
        setResult({ kind: "unreachable" });
      } else {
        setResult({ kind: "unhealthy", httpStatus: body.httpStatus });
      }
    } catch {
      setResult({ kind: "error" });
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={runCheck}
        disabled={checking}
        className="inline-flex h-9 items-center rounded-md border border-stone-300 bg-white px-3 text-sm font-medium text-stone-700 transition hover:border-teal-500 hover:text-teal-700 disabled:opacity-60"
      >
        {checking ? "Checking…" : "Check health"}
      </button>
      {result ? <p className="text-sm">{describe(result)}</p> : null}
    </div>
  );
}

function describe(result: HealthResult) {
  switch (result.kind) {
    case "ok":
      return <span className="text-teal-700">MCP server is healthy ({result.latencyMs}ms).</span>;
    case "unhealthy":
      return (
        <span className="text-red-700">
          MCP server responded{result.httpStatus ? ` with HTTP ${result.httpStatus}` : ""} but is not healthy.
        </span>
      );
    case "unreachable":
      return (
        <span className="text-stone-600">
          MCP server is not reachable from this app server. It runs beside the local runtime, not on Railway.
        </span>
      );
    case "error":
      return <span className="text-red-700">Health check request failed.</span>;
  }
}
