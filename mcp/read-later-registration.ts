import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readLaterMcpSchemas, readLaterProxyRequest } from "./read-later-tools";
import { toToolResult } from "./proxy-result";

export type ReadLaterApiFetch = (
  bearerToken: string,
  path: string,
  method?: string,
  body?: unknown,
) => Promise<unknown>;

export function registerReadLaterTools(
  server: Pick<McpServer, "registerTool">,
  bearerToken: string,
  apiFetch: ReadLaterApiFetch,
) {
  server.registerTool(
    "list_read_later",
    {
      description: "List the Read Later queue, optionally filtered by status.",
      inputSchema: readLaterMcpSchemas.list,
    },
    async (input) => {
      const request = readLaterProxyRequest("list_read_later", input);
      return toToolResult(await apiFetch(bearerToken, request.path, request.method));
    },
  );
  server.registerTool(
    "save_read_later",
    {
      description: "Save an HTTP(S) URL to Read Later with optional filing.",
      inputSchema: readLaterMcpSchemas.save,
    },
    async (input) => {
      const request = readLaterProxyRequest("save_read_later", input);
      return toToolResult(await apiFetch(bearerToken, request.path, request.method, request.body));
    },
  );
  server.registerTool(
    "file_reference",
    {
      description: "File a Reference in an Area, Project, or the global Inbox.",
      inputSchema: readLaterMcpSchemas.file,
    },
    async (input) => {
      const request = readLaterProxyRequest("file_reference", input);
      return toToolResult(await apiFetch(bearerToken, request.path, request.method, request.body));
    },
  );
  server.registerTool(
    "set_read_later_status",
    {
      description: "Set a Read Later item to unread, read, or archived. Items are never deleted.",
      inputSchema: readLaterMcpSchemas.status,
    },
    async (input) => {
      const request = readLaterProxyRequest("set_read_later_status", input);
      return toToolResult(await apiFetch(bearerToken, request.path, request.method, request.body));
    },
  );
}
