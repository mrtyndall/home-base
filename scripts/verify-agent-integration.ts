import { pathToFileURL } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

type ToolRequest = { name: string; arguments: Record<string, unknown> };
type ToolResult = {
  content?: Array<{ type: string; text?: string }>;
  isError?: boolean;
};
type CallTool = (request: ToolRequest) => Promise<unknown>;

export const READ_PROBES: ReadonlyArray<ToolRequest> = [
  { name: "all_clear_summary", arguments: {} },
  { name: "search", arguments: { query: "Hermes integration smoke" } },
  { name: "list_captures", arguments: { limit: 1 } },
  { name: "list_tasks", arguments: { view: "open" } },
  { name: "list_areas", arguments: {} },
  { name: "list_projects", arguments: {} },
  { name: "list_ideas", arguments: {} },
  { name: "list_references", arguments: {} },
  { name: "list_read_later", arguments: { status: "unread", limit: 1 } },
  { name: "calendar_read", arguments: {} },
  { name: "list_notifications", arguments: {} },
  { name: "list_entity_notes", arguments: {} },
  { name: "list_entity_docs", arguments: {} },
  { name: "list_milestones", arguments: {} },
  { name: "list_check_ins", arguments: {} },
  { name: "list_journal_entries", arguments: {} },
  { name: "read_resurfaced_item", arguments: {} },
  { name: "list_scheduled_reviews", arguments: {} },
  { name: "list_routines", arguments: {} },
  { name: "list_people", arguments: {} },
];

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
const VERIFIED_ORIGINS: Record<string, Set<string>> = {
  "/api/v1": new Set([
    "http://127.0.0.1:3002",
    "http://localhost:3002",
    "http://[::1]:3002",
    "https://mac-studio.tail3baa7a.ts.net",
    "https://home-base-production-e3b7.up.railway.app",
  ]),
  "/api/mcp": new Set([
    "http://127.0.0.1:8081",
    "http://localhost:8081",
    "http://[::1]:8081",
    "https://mac-studio.tail3baa7a.ts.net:8443",
  ]),
};

export function safeEndpoint(
  name: string,
  value: string | undefined,
  expectedPath: string,
  options: { unsafeAllowUnverifiedHost?: boolean } = {},
) {
  if (!value) throw new Error(`${name} is required`);

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }

  if (!new Set(["http:", "https:"]).has(url.protocol)) {
    throw new Error(`${name} must use HTTP or HTTPS`);
  }
  if (url.protocol === "http:" && !LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error(`${name} must use HTTPS except on loopback`);
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(`${name} must not contain credentials, query parameters, or fragments`);
  }
  if (url.pathname !== expectedPath) {
    throw new Error(`${name} must end at the exact ${expectedPath} route`);
  }
  const verifiedOrigins = VERIFIED_ORIGINS[expectedPath];
  const unsafeHttpsOverride = url.protocol === "https:" && options.unsafeAllowUnverifiedHost;
  if (!verifiedOrigins?.has(url.origin) && !unsafeHttpsOverride) {
    throw new Error(
      `${name} uses an unverified host; refuse to forward credentials without HOME_BASE_UNSAFE_ALLOW_UNVERIFIED_HOST=1`,
    );
  }

  return url;
}

export function redactSensitive(message: string, secrets: Array<string | undefined> = []) {
  let redacted = message;
  for (const secret of secrets) {
    if (secret) redacted = redacted.split(secret).join("[REDACTED]");
  }
  return redacted
    .replace(/Bearer\s+[^\s"']+/gi, "Bearer [REDACTED]")
    .replace(/(https?:\/\/)[^\s/@:]+:[^\s/@]+@/gi, "$1[REDACTED]@");
}

export function shouldRunWriteSmoke(
  env: { HOME_BASE_ENABLE_WRITE_SMOKE?: string },
  token: string | undefined,
) {
  return env.HOME_BASE_ENABLE_WRITE_SMOKE === "1" && Boolean(token);
}

function textPayload(result: unknown) {
  if (!result || typeof result !== "object") {
    throw new Error("MCP tool returned an invalid result");
  }
  const toolResult = result as ToolResult;
  const text = toolResult.content?.find((item) => item.type === "text")?.text;
  if (!text) throw new Error("MCP tool returned no text result");
  if (toolResult.isError) throw new Error("MCP tool reported a redacted application error");
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error("MCP tool returned malformed JSON");
  }
}

function createdTaskId(result: unknown) {
  const payload = textPayload(result);
  const task = payload.task;
  if (!task || typeof task !== "object" || !("id" in task) || typeof task.id !== "string") {
    throw new Error("create_task returned no task ID; completion was not attempted");
  }
  return task.id;
}

const SMOKE_TASK_TITLE = "[HERMES-SMOKE] Agent integration verification task";
const SMOKE_CAPTURE_IDEMPOTENCY_KEY = "5b9f23d4-3e09-4f2f-8946-bdd621b4b5b2";

function matchingOpenSmokeTaskIds(result: unknown) {
  const payload = textPayload(result);
  if (!Array.isArray(payload.tasks)) throw new Error("list_tasks returned no task list");
  return payload.tasks.flatMap((task) => {
    if (!task || typeof task !== "object") return [];
    const candidate = task as { id?: unknown; title?: unknown; status?: unknown };
    return candidate.title === SMOKE_TASK_TITLE &&
      candidate.status === "open" &&
      typeof candidate.id === "string"
      ? [candidate.id]
      : [];
  });
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function runWriteSmoke(callTool: CallTool) {
  const discoveredIds = new Set<string>();
  const completedIds = new Set<string>();
  let createdTask: string | undefined;
  let primaryError: unknown;

  try {
    const before = await callTool({
      name: "list_tasks",
      arguments: { q: SMOKE_TASK_TITLE, view: "open", limit: 100 },
    });
    for (const taskId of matchingOpenSmokeTaskIds(before)) discoveredIds.add(taskId);

    textPayload(await callTool({
      name: "capture_input",
      arguments: {
        rawText: "[HERMES-SMOKE] Persistence-only integration capture audit record",
        captureIntent: "preserve_only",
        idempotencyKey: SMOKE_CAPTURE_IDEMPOTENCY_KEY,
      },
    }));
    const created = await callTool({
      name: "create_task",
      arguments: {
        title: SMOKE_TASK_TITLE,
        notes: "Non-destructive integration smoke task. Complete after creation; never delete.",
      },
    });
    createdTask = createdTaskId(created);
    discoveredIds.add(createdTask);
    textPayload(await callTool({ name: "complete_task", arguments: { taskId: createdTask } }));
    completedIds.add(createdTask);
  } catch (error) {
    primaryError = error;
  }

  const cleanupErrors: string[] = [];
  try {
    const after = await callTool({
      name: "list_tasks",
      arguments: { q: SMOKE_TASK_TITLE, view: "open", limit: 100 },
    });
    for (const taskId of matchingOpenSmokeTaskIds(after)) discoveredIds.add(taskId);
  } catch (error) {
    cleanupErrors.push(`post-write task discovery: ${errorMessage(error)}`);
  }

  for (const taskId of discoveredIds) {
    if (completedIds.has(taskId)) continue;
    try {
      textPayload(await callTool({ name: "complete_task", arguments: { taskId } }));
      completedIds.add(taskId);
    } catch (error) {
      cleanupErrors.push(`task ${taskId}: ${errorMessage(error)}`);
    }
  }

  if (primaryError && cleanupErrors.length > 0) {
    throw new Error(
      `Write smoke failed: ${errorMessage(primaryError)}; cleanup failed: ${cleanupErrors.join("; ")}`,
    );
  }
  if (primaryError) throw primaryError;
  if (cleanupErrors.length > 0) {
    throw new Error(`Write smoke cleanup failed: ${cleanupErrors.join("; ")}`);
  }
  return { taskId: createdTask };
}

async function checkHttp(label: string, url: URL) {
  const response = await fetch(url, {
    headers: { accept: "application/json,text/html" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}`);
  console.log(`${label}: ok (HTTP ${response.status})`);
}

async function run() {
  const unsafeAllowUnverifiedHost = process.env.HOME_BASE_UNSAFE_ALLOW_UNVERIFIED_HOST === "1";
  const apiUrl = safeEndpoint(
    "HOME_BASE_API_URL",
    process.env.HOME_BASE_API_URL,
    "/api/v1",
    { unsafeAllowUnverifiedHost },
  );
  const mcpUrl = safeEndpoint(
    "HOME_BASE_MCP_URL",
    process.env.HOME_BASE_MCP_URL,
    "/api/mcp",
    { unsafeAllowUnverifiedHost },
  );
  const token = process.env.HOME_BASE_API_TOKEN;

  await checkHttp("Home Base app health", new URL("/", apiUrl));
  await checkHttp("Home Base MCP health", new URL("/health", mcpUrl));

  if (!token) {
    console.log("Authenticated MCP discovery and reads: skipped (HOME_BASE_API_TOKEN is not set)");
    console.log("Write smoke: skipped (requires both HOME_BASE_API_TOKEN and HOME_BASE_ENABLE_WRITE_SMOKE=1)");
    return;
  }

  const client = new Client({ name: "home-base-agent-verifier", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(mcpUrl, {
    requestInit: { headers: { authorization: `Bearer ${token}` } },
  });

  try {
    await client.connect(transport);
    console.log("MCP initialize: ok");
    const discovered = await client.listTools();
    const toolNames = new Set(discovered.tools.map((tool) => tool.name));
    const required = [
      ...READ_PROBES.map((probe) => probe.name),
      "capture_input",
      "create_task",
      "complete_task",
    ];
    const missing = required.filter((name) => !toolNames.has(name));
    if (missing.length > 0) throw new Error(`MCP discovery missing required tools: ${missing.join(", ")}`);
    console.log(`MCP tool discovery: ok (${discovered.tools.length} tools)`);

    for (const probe of READ_PROBES) {
      textPayload(await client.callTool(probe));
      console.log(`Read probe ${probe.name}: ok`);
    }

    if (shouldRunWriteSmoke(
      { HOME_BASE_ENABLE_WRITE_SMOKE: process.env.HOME_BASE_ENABLE_WRITE_SMOKE },
      token,
    )) {
      await runWriteSmoke((request) => client.callTool(request));
      console.log("Write smoke: ok (capture retained; task created and completed)");
    } else {
      console.log("Write smoke: skipped (set HOME_BASE_ENABLE_WRITE_SMOKE=1 to opt in)");
    }
  } finally {
    await client.close();
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  run().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Agent integration verification failed: ${redactSensitive(message, [process.env.HOME_BASE_API_TOKEN])}`);
    process.exitCode = 1;
  });
}
