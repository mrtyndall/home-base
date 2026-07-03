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
      description:
        "Full-text search across captures, tasks, ideas, references, project activity, notes, and docs.",
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
        areaId: z.string().optional(),
        areaName: z.string().optional(),
        projectId: z.string().optional(),
        someday: z.boolean().optional(),
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
    "list_areas",
    {
      description: "List Home Base areas, including their parent domains.",
      inputSchema: z.object({}),
    },
    async () => toToolResult(await apiFetch(bearerToken, "/areas")),
  );

  server.registerTool(
    "read_area",
    {
      description: "Read an area with its open tasks, projects, notes, docs, and attachments.",
      inputSchema: z.object({ areaId: z.string().min(1) }),
    },
    async ({ areaId }) => toToolResult(await apiFetch(bearerToken, `/areas/${areaId}`)),
  );

  server.registerTool(
    "create_area",
    {
      description: "Create an area under an existing or named domain.",
      inputSchema: z.object({
        name: z.string().min(1),
        domainId: z.string().optional(),
        domainName: z.string().optional(),
        currentState: z.string().optional(),
        nextStep: z.string().optional(),
        tendingCadence: z.string().optional(),
      }),
    },
    async (input) => toToolResult(await apiFetch(bearerToken, "/areas", "POST", input)),
  );

  server.registerTool(
    "update_area_state",
    {
      description: "Update an area's current state, next step, tending cadence, or status.",
      inputSchema: z.object({
        areaId: z.string().min(1),
        currentState: z.string().optional(),
        nextStep: z.string().optional(),
        tendingCadence: z.string().optional(),
        status: z.enum(["active", "parked", "retired"]).optional(),
      }),
    },
    async ({ areaId, ...body }) =>
      toToolResult(await apiFetch(bearerToken, `/areas/${areaId}`, "PATCH", body)),
  );

  server.registerTool(
    "create_project",
    {
      description: "Create a project in an area. Projects can start active or someday.",
      inputSchema: z.object({
        name: z.string().min(1),
        areaId: z.string().optional(),
        areaName: z.string().optional(),
        status: z.enum(["someday", "active", "parked", "completed", "killed"]).optional(),
        currentState: z.string().optional(),
        nextStep: z.string().optional(),
        targetDate: z.string().optional(),
      }),
    },
    async (input) => toToolResult(await apiFetch(bearerToken, "/projects", "POST", input)),
  );

  server.registerTool(
    "update_project_state",
    {
      description: "Update project current state, next step, status, and activity log.",
      inputSchema: z.object({
        projectId: z.string().min(1),
        areaId: z.string().optional(),
        areaName: z.string().optional(),
        currentState: z.string().optional(),
        nextStep: z.string().optional(),
        status: z.enum(["someday", "active", "parked", "completed", "killed"]).optional(),
        logEntry: z.string().optional(),
      }),
    },
    async ({ projectId, ...body }) =>
      toToolResult(await apiFetch(bearerToken, `/projects/${projectId}`, "PATCH", body)),
  );

  server.registerTool(
    "park_project",
    {
      description: "Park a project without deleting or hiding history.",
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
        areaId: z.string().optional(),
        projectId: z.string().optional(),
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
        areaId: z.string().optional(),
      }),
    },
    async ({ ideaId, ...body }) =>
      toToolResult(await apiFetch(bearerToken, `/ideas/${ideaId}/convert`, "POST", body)),
  );

  server.registerTool(
    "add_entity_note",
    {
      description: "Append a markdown note to an area or project.",
      inputSchema: z.object({
        parentType: z.enum(["area", "project"]),
        parentId: z.string().min(1),
        bodyMd: z.string().min(1),
      }),
    },
    async (input) => toToolResult(await apiFetch(bearerToken, "/entity-notes", "POST", input)),
  );

  server.registerTool(
    "create_entity_doc",
    {
      description: "Create a markdown doc on an area or project.",
      inputSchema: z.object({
        parentType: z.enum(["area", "project"]),
        parentId: z.string().min(1),
        title: z.string().min(1),
        bodyMd: z.string().default(""),
      }),
    },
    async (input) => toToolResult(await apiFetch(bearerToken, "/entity-docs", "POST", input)),
  );

  server.registerTool(
    "update_entity_doc",
    {
      description: "Update or archive an area/project markdown doc.",
      inputSchema: z.object({
        docId: z.string().min(1),
        title: z.string().optional(),
        bodyMd: z.string().optional(),
        status: z.enum(["active", "archived"]).optional(),
      }),
    },
    async ({ docId, ...body }) =>
      toToolResult(await apiFetch(bearerToken, `/entity-docs/${docId}`, "PATCH", body)),
  );

  server.registerTool(
    "create_milestone",
    {
      description: "Create a project milestone.",
      inputSchema: z.object({
        projectId: z.string().min(1),
        title: z.string().min(1),
        sortOrder: z.number().int().optional(),
      }),
    },
    async (input) => toToolResult(await apiFetch(bearerToken, "/milestones", "POST", input)),
  );

  server.registerTool(
    "complete_milestone",
    {
      description: "Mark a project milestone complete without deleting it.",
      inputSchema: z.object({ milestoneId: z.string().min(1) }),
    },
    async ({ milestoneId }) =>
      toToolResult(
        await apiFetch(bearerToken, `/milestones/${milestoneId}`, "PATCH", {
          status: "completed",
        }),
      ),
  );

  server.registerTool(
    "calendar_read",
    {
      description: "Read local Home Base calendar events.",
      inputSchema: z.object({}),
    },
    async () => toToolResult(await apiFetch(bearerToken, "/calendar-events")),
  );

  server.registerTool(
    "star_task",
    {
      description: "Star or unstar a task. Starred tasks surface in the Today Top Tasks strip.",
      inputSchema: z.object({
        taskId: z.string().min(1),
        starred: z.boolean().default(true),
      }),
    },
    async ({ taskId, starred }) =>
      toToolResult(await apiFetch(bearerToken, `/tasks/${taskId}/star`, "POST", { starred })),
  );

  server.registerTool(
    "list_tasks",
    {
      description:
        "List tasks with optional filters: q (title search), starred (true), view (open|done).",
      inputSchema: z.object({
        q: z.string().optional(),
        starred: z.boolean().optional(),
        view: z.enum(["open", "done"]).optional(),
        limit: z.number().int().min(1).max(100).optional(),
      }),
    },
    async ({ q, starred, view, limit }) => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (starred) params.set("starred", "1");
      if (view) params.set("view", view);
      if (limit) params.set("limit", String(limit));
      const query = params.toString();
      return toToolResult(
        await apiFetch(bearerToken, `/tasks${query ? `?${query}` : ""}`),
      );
    },
  );

  server.registerTool(
    "list_check_ins",
    {
      description: "List check-ins, optionally scoped to an area or project.",
      inputSchema: z.object({
        parentType: z.enum(["area", "project"]).optional(),
        parentId: z.string().optional(),
      }),
    },
    async ({ parentType, parentId }) => {
      const params = new URLSearchParams();
      if (parentType) params.set("parentType", parentType);
      if (parentId) params.set("parentId", parentId);
      const query = params.toString();
      return toToolResult(
        await apiFetch(bearerToken, `/check-ins${query ? `?${query}` : ""}`),
      );
    },
  );

  server.registerTool(
    "create_check_in",
    {
      description:
        "Post a check-in (timestamped markdown status update) to a project or area. Append-only.",
      inputSchema: z.object({
        parentType: z.enum(["area", "project"]),
        parentId: z.string().min(1),
        bodyMd: z.string().min(1),
      }),
    },
    async (input) => toToolResult(await apiFetch(bearerToken, "/check-ins", "POST", input)),
  );

  server.registerTool(
    "draft_check_in_summary",
    {
      description:
        "Draft (never post) an AI check-in summarizing activity since the last check-in on a project or area.",
      inputSchema: z.object({
        parentType: z.enum(["area", "project"]),
        parentId: z.string().min(1),
      }),
    },
    async (input) =>
      toToolResult(await apiFetch(bearerToken, "/check-ins/draft", "POST", input)),
  );

  server.registerTool(
    "list_journal_entries",
    {
      description: "List journal entries, newest first, optionally filtered by q.",
      inputSchema: z.object({
        q: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional(),
      }),
    },
    async ({ q, limit }) => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (limit) params.set("limit", String(limit));
      const query = params.toString();
      return toToolResult(
        await apiFetch(bearerToken, `/journal-entries${query ? `?${query}` : ""}`),
      );
    },
  );

  server.registerTool(
    "create_journal_entry",
    {
      description: "Save a journal entry (markdown; entryDate defaults to today).",
      inputSchema: z.object({
        bodyMd: z.string().min(1),
        entryDate: z.string().optional(),
        tags: z.array(z.string()).optional(),
      }),
    },
    async (input) =>
      toToolResult(await apiFetch(bearerToken, "/journal-entries", "POST", input)),
  );

  server.registerTool(
    "read_resurfaced_item",
    {
      description: "Read today's resurfaced memory (journal entry or idea), if any.",
      inputSchema: z.object({}),
    },
    async () => toToolResult(await apiFetch(bearerToken, "/resurfacing")),
  );

  server.registerTool(
    "respond_to_resurfaced_item",
    {
      description: "Boost or dismiss today's resurfaced memory by its seen id.",
      inputSchema: z.object({
        seenId: z.string().min(1),
        response: z.enum(["boost", "dismiss"]),
      }),
    },
    async ({ seenId, response }) =>
      toToolResult(
        await apiFetch(bearerToken, `/resurfacing/${seenId}/${response}`, "POST", {}),
      ),
  );

  server.registerTool(
    "list_scheduled_reviews",
    {
      description:
        "List scheduled reviews (needs-review follow-ups), optionally filtered by status.",
      inputSchema: z.object({
        status: z.enum(["pending", "surfaced", "done", "dismissed"]).optional(),
      }),
    },
    async ({ status }) =>
      toToolResult(
        await apiFetch(
          bearerToken,
          `/scheduled-reviews${status ? `?status=${status}` : ""}`,
        ),
      ),
  );

  server.registerTool(
    "settle_scheduled_review",
    {
      description:
        "Settle a scheduled review: done, dismiss, or snooze (snooze needs reviewAt YYYY-MM-DD).",
      inputSchema: z.object({
        reviewId: z.string().min(1),
        outcome: z.enum(["done", "dismiss", "snooze"]),
        reviewAt: z.string().optional(),
      }),
    },
    async ({ reviewId, outcome, reviewAt }) =>
      toToolResult(
        await apiFetch(
          bearerToken,
          `/scheduled-reviews/${reviewId}/${outcome}`,
          "POST",
          outcome === "snooze" ? { reviewAt } : {},
        ),
      ),
  );

  server.registerTool(
    "list_routines",
    {
      description:
        "List routines with today's state, run length (plain fact), and recent completions.",
      inputSchema: z.object({}),
    },
    async () => toToolResult(await apiFetch(bearerToken, "/routines")),
  );

  server.registerTool(
    "create_routine",
    {
      description:
        "Create a routine (recurring habit, separate from tasks — no due dates).",
      inputSchema: z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        areaId: z.string().optional(),
        frequency: z.enum(["daily", "weekly", "custom"]).optional(),
        days: z.array(z.string()).optional(),
        timeWindow: z.enum(["morning", "afternoon", "evening", "anytime"]).optional(),
        graceDays: z.number().optional(),
        temporary: z.boolean().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }),
    },
    async (input) => toToolResult(await apiFetch(bearerToken, "/routines", "POST", input)),
  );

  server.registerTool(
    "complete_routine",
    {
      description:
        "Complete a routine for today by ID. A second completion the same day is a no-op.",
      inputSchema: z.object({ routineId: z.string().min(1) }),
    },
    async ({ routineId }) =>
      toToolResult(
        await apiFetch(bearerToken, `/routines/${routineId}/complete`, "POST", {}),
      ),
  );

  server.registerTool(
    "list_people",
    {
      description: "List people, optionally filtered by q (name).",
      inputSchema: z.object({ q: z.string().optional() }),
    },
    async ({ q }) =>
      toToolResult(
        await apiFetch(bearerToken, `/people${q ? `?q=${encodeURIComponent(q)}` : ""}`),
      ),
  );

  server.registerTool(
    "read_person",
    {
      description: "Read a person with their facts and interaction timeline.",
      inputSchema: z.object({ personId: z.string().min(1) }),
    },
    async ({ personId }) =>
      toToolResult(await apiFetch(bearerToken, `/people/${personId}`)),
  );

  server.registerTool(
    "create_person",
    {
      description: "Add a person to the personal CRM.",
      inputSchema: z.object({
        name: z.string().min(1),
        relationshipType: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
        company: z.string().optional(),
        areaId: z.string().optional(),
      }),
    },
    async (input) => toToolResult(await apiFetch(bearerToken, "/people", "POST", input)),
  );

  server.registerTool(
    "create_person_fact",
    {
      description:
        "Save a fact about a person (dateRelevant YYYY-MM-DD + recurring for dates worth surfacing ahead).",
      inputSchema: z.object({
        personId: z.string().min(1),
        factType: z.string().optional(),
        factValue: z.string().min(1),
        dateRelevant: z.string().optional(),
        recurring: z.boolean().optional(),
      }),
    },
    async ({ personId, ...body }) =>
      toToolResult(
        await apiFetch(bearerToken, `/people/${personId}/facts`, "POST", body),
      ),
  );

  server.registerTool(
    "log_interaction",
    {
      description: "Log an interaction with a person.",
      inputSchema: z.object({
        personId: z.string().min(1),
        interactionType: z.string().optional(),
        notes: z.string().optional(),
        occurredAt: z.string().optional(),
      }),
    },
    async ({ personId, ...body }) =>
      toToolResult(
        await apiFetch(bearerToken, `/people/${personId}/interactions`, "POST", body),
      ),
  );

  server.registerTool(
    "read_domain_page",
    {
      description:
        "Read a domain's derived aggregate: areas with latest check-ins, project facts, task pulse.",
      inputSchema: z.object({ domainId: z.string().min(1) }),
    },
    async ({ domainId }) =>
      toToolResult(await apiFetch(bearerToken, `/domains/${domainId}/aggregate`)),
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
