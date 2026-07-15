import type { AssistantToolCall } from "../../src/lib/agent/schemas.js";
import { assistantToolCallSchema } from "../../src/lib/agent/schemas.js";

export function buildHomeBaseToolRequest(rawCall: AssistantToolCall) {
  const call = assistantToolCallSchema.parse(rawCall);
  const params = new URLSearchParams();
  let path: string;

  switch (call.name) {
    case "search":
      params.set("q", call.arguments.query);
      params.set("limit", String(call.arguments.limit));
      path = "/api/v1/search";
      break;
    case "list_areas":
      params.set("limit", String(call.arguments.limit));
      path = "/api/v1/areas";
      break;
    case "list_projects":
      params.set("limit", String(call.arguments.limit));
      if (call.arguments.status) params.set("status", call.arguments.status);
      path = "/api/v1/projects";
      break;
    case "list_tasks":
      params.set("limit", String(call.arguments.limit));
      if (call.arguments.status === "open") params.set("view", "open");
      if (call.arguments.status === "completed") params.set("view", "done");
      path = "/api/v1/tasks";
      break;
    case "list_routines":
      params.set("limit", String(call.arguments.limit));
      path = "/api/v1/routines";
      break;
    case "list_people":
      params.set("limit", String(call.arguments.limit));
      path = "/api/v1/people";
      break;
    case "list_references":
      params.set("limit", String(call.arguments.limit));
      if (call.arguments.type) params.set("type", call.arguments.type);
      path = "/api/v1/references";
      break;
    case "read_entity": {
      const resource = {
        area: "areas",
        project: "projects",
        task: "tasks",
        routine: "routines",
        person: "people",
        reference: "references",
      }[call.arguments.entityType];
      path = `/api/v1/${resource}/${encodeURIComponent(call.arguments.id)}`;
      break;
    }
    case "all_clear":
      path = "/api/v1/today";
      break;
  }

  const query = params.toString();
  return { id: call.id, name: call.name, path: query ? `${path}?${query}` : path };
}

export async function executeHomeBaseTool(input: {
  call: AssistantToolCall;
  baseUrl: string;
  apiToken: string;
  signal: AbortSignal;
}) {
  const tool = buildHomeBaseToolRequest(input.call);
  const response = await fetch(`${input.baseUrl}${tool.path}`, {
    method: "GET",
    headers: { authorization: `Bearer ${input.apiToken}`, accept: "application/json" },
    redirect: "error",
    signal: input.signal,
  });
  if (!response.ok) {
    return { id: tool.id, name: tool.name, ok: false, error: `Home Base read failed (${response.status}).` };
  }
  const body = await readBoundedBody(response, 60_000);
  return body.truncated
    ? { id: tool.id, name: tool.name, ok: true, data: { truncated: true, jsonPrefix: body.text } }
    : { id: tool.id, name: tool.name, ok: true, data: JSON.parse(body.text) };
}

async function readBoundedBody(response: Response, maxBytes: number) {
  if (!response.body) throw new Error("Home Base returned an empty response body.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let truncated = false;
  try {
    while (bytes <= maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      const remaining = maxBytes - bytes;
      if (value.byteLength > remaining) {
        if (remaining > 0) chunks.push(value.subarray(0, remaining));
        bytes = maxBytes;
        truncated = true;
        await reader.cancel();
        break;
      }
      chunks.push(value);
      bytes += value.byteLength;
      if (bytes === maxBytes) {
        const next = await reader.read();
        if (!next.done) {
          truncated = true;
          await reader.cancel();
        }
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }
  const combined = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { text: decodeWithinByteLimit(combined, maxBytes), truncated };
}

function decodeWithinByteLimit(bytes: Uint8Array, maxBytes: number) {
  const encoder = new TextEncoder();
  let text = new TextDecoder().decode(bytes);
  let encodedBytes = encoder.encode(text).byteLength;
  while (encodedBytes > maxBytes && text.length > 0) {
    text = text.slice(0, -Math.max(1, encodedBytes - maxBytes));
    encodedBytes = encoder.encode(text).byteLength;
  }
  return text;
}
