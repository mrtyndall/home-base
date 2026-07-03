import express from "express";
import type { Request, Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";

const PORT = Number(process.env.MCP_PORT || 8081);
const API_BASE = process.env.HOME_BASE_API_URL || "http://127.0.0.1:3002/api/v1";

function parseBearerToken(authHeader: string | undefined) {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function createServer(bearerToken: string) {
  const server = new McpServer(
    { name: "home-base-mcp", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  registerTools(server, bearerToken);
  return server;
}

function registerTools(server: McpServer, bearerToken: string) {
  server.registerTool(
    "all_clear_summary",
    {
      description: "Read the Home Base Today/all-clear summary.",
      inputSchema: z.object({}),
    },
    async () => toToolResult(await apiFetch(bearerToken, "/today")),
  );

  server.registerTool(
    "search",
    {
      description: "Full-text search across captures, tasks, ideas, references, and project activity.",
      inputSchema: z.object({ query: z.string().min(1) }),
    },
    async ({ query }) =>
      toToolResult(await apiFetch(bearerToken, `/search?q=${encodeURIComponent(query)}`)),
  );

  server.registerTool(
    "create_task",
    {
      description: "Create a task. No work items are deleted by this API.",
      inputSchema: z.object({
        title: z.string().min(1),
        notes: z.string().optional(),
        dueDate: z.string().optional(),
        dueTime: z.string().optional(),
        domainName: z.string().optional(),
        projectId: z.string().optional(),
        reminderOffsets: z.array(z.union([z.string(), z.number()])).optional(),
        recurrenceRule: z.string().optional(),
      }),
    },
    async (input) => toToolResult(await apiFetch(bearerToken, "/tasks", "POST", input)),
  );

  server.registerTool(
    "complete_task",
    {
      description: "Complete an open task by ID. Recurring tasks generate their next instance.",
      inputSchema: z.object({ taskId: z.string().min(1) }),
    },
    async ({ taskId }) =>
      toToolResult(await apiFetch(bearerToken, `/tasks/${taskId}/complete`, "POST", {})),
  );

  server.registerTool(
    "update_project_state",
    {
      description: "Update project current state, next step, status, and activity log.",
      inputSchema: z.object({
        projectId: z.string().min(1),
        currentState: z.string().optional(),
        nextStep: z.string().optional(),
        status: z.enum(["active", "parked", "completed", "killed"]).optional(),
        logEntry: z.string().optional(),
      }),
    },
    async ({ projectId, ...body }) =>
      toToolResult(await apiFetch(bearerToken, `/projects/${projectId}`, "PATCH", body)),
  );

  server.registerTool(
    "park_project",
    {
      description: "Park a project into Someday without deleting or hiding history.",
      inputSchema: z.object({
        projectId: z.string().min(1),
        whereLeftOff: z.string().optional(),
      }),
    },
    async ({ projectId, whereLeftOff }) =>
      toToolResult(
        await apiFetch(bearerToken, `/projects/${projectId}`, "PATCH", {
          status: "parked",
          currentState: whereLeftOff,
          logEntry: whereLeftOff ? `Parked: ${whereLeftOff}` : "Project parked.",
        }),
      ),
  );

  server.registerTool(
    "unpark_project",
    {
      description: "Return a parked project to active status.",
      inputSchema: z.object({ projectId: z.string().min(1), logEntry: z.string().optional() }),
    },
    async ({ projectId, logEntry }) =>
      toToolResult(
        await apiFetch(bearerToken, `/projects/${projectId}`, "PATCH", {
          status: "active",
          logEntry: logEntry ?? "Project unparked.",
        }),
      ),
  );

  server.registerTool(
    "capture_idea",
    {
      description: "Create an idea.",
      inputSchema: z.object({
        title: z.string().min(1),
        body: z.string().optional(),
        tags: z.array(z.string()).optional(),
      }),
    },
    async (input) => toToolResult(await apiFetch(bearerToken, "/ideas", "POST", input)),
  );

  server.registerTool(
    "convert_idea",
    {
      description: "Convert an idea into a task or project while preserving lineage on the idea record.",
      inputSchema: z.object({
        ideaId: z.string().min(1),
        to: z.enum(["task", "project"]),
        title: z.string().optional(),
        domainId: z.string().optional(),
      }),
    },
    async ({ ideaId, ...body }) =>
      toToolResult(await apiFetch(bearerToken, `/ideas/${ideaId}/convert`, "POST", body)),
  );

  server.registerTool(
    "calendar_read",
    {
      description: "Read local Home Base calendar events.",
      inputSchema: z.object({}),
    },
    async () => toToolResult(await apiFetch(bearerToken, "/calendar-events")),
  );
}

async function apiFetch(
  bearerToken: string,
  path: string,
  method = "GET",
  body?: unknown,
) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      "Content-Type": "application/json",
    },
    body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
  });

  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(JSON.stringify(json ?? { error: response.statusText }));
  }

  return json;
}

function toToolResult(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

async function handleMcpRequest(req: Request, res: Response) {
  const bearerToken = parseBearerToken(req.headers.authorization);
  const resourceMetadataUrl = `${req.protocol}://${req.get("host")}/.well-known/oauth-protected-resource/api/mcp`;

  if (!bearerToken) {
    res
      .status(401)
      .set(
        "WWW-Authenticate",
        `Bearer realm="home-base-mcp", resource_metadata="${resourceMetadataUrl}", scope="read write capture"`,
      )
      .json({
        jsonrpc: "2.0",
        error: { code: -32001, message: "Missing bearer token" },
        id: null,
      });
    return;
  }

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "string") headers.set(key, value);
    if (Array.isArray(value)) headers.set(key, value.join(", "));
  }
  if ((headers.get("accept") ?? "").includes("*/*")) {
    headers.set("accept", "application/json, text/event-stream");
  }

  const mcpServer = createServer(bearerToken);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  await mcpServer.connect(transport);
  const webReq = new Request(`${req.protocol}://${req.get("host")}${req.originalUrl}`, {
    method: req.method,
    headers,
    body: req.method === "POST" ? JSON.stringify(req.body ?? {}) : undefined,
  });
  const response = await transport.handleRequest(webReq, { parsedBody: req.body });
  const responseHeaders = new Headers(response.headers);
  const reqProtocolVersion = headers.get("mcp-protocol-version");
  if (reqProtocolVersion && !responseHeaders.has("mcp-protocol-version")) {
    responseHeaders.set("mcp-protocol-version", reqProtocolVersion);
  }

  res.status(response.status);
  responseHeaders.forEach((value, key) => res.setHeader(key, value));
  res.send(Buffer.from(await response.arrayBuffer()));
}

const app = express();
app.set("trust proxy", true);
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.get("/.well-known/oauth-protected-resource", (req, res) => {
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  res.json({
    resource: `${baseUrl}/api/mcp`,
    authorization_servers: [],
    bearer_methods_supported: ["header"],
    scopes_supported: ["read", "write", "capture"],
    resource_name: "Home Base MCP",
  });
});

app.get("/.well-known/oauth-protected-resource/api/mcp", (req, res) => {
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  res.json({
    resource: `${baseUrl}/api/mcp`,
    authorization_servers: [],
    bearer_methods_supported: ["header"],
    scopes_supported: ["read", "write", "capture"],
    resource_name: "Home Base MCP",
  });
});

app.post("/api/mcp", async (req, res) => {
  try {
    await handleMcpRequest(req, res);
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : "Internal server error",
        },
        id: null,
      });
    }
  }
});

app.all("/api/mcp", (_req, res) => {
  res.status(405).set("Allow", "POST").json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed." },
    id: null,
  });
});

app.listen(PORT, () => {
  console.log(`[home-base-mcp] listening on :${PORT}`);
});
