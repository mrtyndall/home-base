import { z } from "zod";

const httpUrl = z.string().url().refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === "http:" || protocol === "https:";
}, "URL must use HTTP(S).");
const nullableId = z.string().min(1).nullable().optional();

export const readLaterMcpSchemas = {
  list: z.object({
    status: z.enum(["unread", "read", "archived"]).optional(),
    limit: z.number().int().min(1).max(100).optional(),
  }),
  save: z.object({
    url: httpUrl,
    title: z.string().min(1).optional(),
    body: z.string().min(1).optional(),
    tags: z.array(z.string()).optional(),
    areaId: nullableId,
    projectId: nullableId,
  }),
  file: z.object({
    referenceId: z.string().min(1),
    areaId: nullableId,
    projectId: nullableId,
  }),
  status: z.object({
    referenceId: z.string().min(1),
    status: z.enum(["unread", "read", "archived"]),
  }),
};

type ToolName = "list_read_later" | "save_read_later" | "file_reference" | "set_read_later_status";

export function readLaterProxyRequest(name: ToolName, rawInput: unknown) {
  if (name === "list_read_later") {
    const input = readLaterMcpSchemas.list.parse(rawInput);
    const params = new URLSearchParams();
    if (input.status) params.set("status", input.status);
    if (input.limit) params.set("limit", String(input.limit));
    const query = params.toString();
    return { path: `/read-later${query ? `?${query}` : ""}`, method: "GET" as const };
  }
  if (name === "save_read_later") {
    const input = readLaterMcpSchemas.save.parse(rawInput);
    return { path: "/read-later", method: "POST" as const, body: input };
  }
  if (name === "file_reference") {
    const { referenceId, ...body } = readLaterMcpSchemas.file.parse(rawInput);
    return { path: `/references/${referenceId}/file`, method: "POST" as const, body };
  }
  const { referenceId, ...body } = readLaterMcpSchemas.status.parse(rawInput);
  return { path: `/read-later/${referenceId}/status`, method: "POST" as const, body };
}
