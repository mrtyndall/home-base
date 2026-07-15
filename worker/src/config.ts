import { randomUUID } from "node:crypto";
import { isAbsolute, resolve } from "node:path";
import { z } from "zod";

const envSchema = z.object({
  WORKER_ROLE: z.enum(["sorter", "assistant"]),
  HOME_BASE_URL: z.string().url(),
  HOME_BASE_WORKER_TOKEN: z.string().min(32),
  HOME_BASE_API_TOKEN: z.string().min(32).optional(),
  CODEX_HOME: z.string().min(1),
  CODEX_MODEL: z.string().trim().min(1).max(200).default("gpt-5.4"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  PATH: z.string().default("/usr/local/bin:/usr/bin:/bin"),
  HOME: z.string().default("/home/homebase"),
  TMPDIR: z.string().default("/tmp/homebase"),
  WORKER_CWD: z.string().default("/home/homebase/work"),
  PROMPT_DIR: z.string().default("/app/worker/prompts"),
  WORKER_ID: z.string().trim().min(1).max(200).optional(),
  POLL_INTERVAL_MS: z.coerce.number().int().min(250).max(30_000).default(1_500),
  JOB_TIMEOUT_MS: z.coerce.number().int().min(10_000).max(600_000).default(120_000),
});

export type WorkerConfig = ReturnType<typeof loadWorkerConfig>;

export function loadWorkerConfig(env: Record<string, string | undefined> = process.env) {
  const parsed = envSchema.parse(env);
  const homeBaseUrl = new URL(parsed.HOME_BASE_URL);
  const local = homeBaseUrl.hostname === "127.0.0.1" || homeBaseUrl.hostname === "localhost";
  const railwayPrivate = homeBaseUrl.hostname.endsWith(".railway.internal");
  if ((!local && !railwayPrivate) || homeBaseUrl.username || homeBaseUrl.password) {
    throw new Error("HOME_BASE_URL must use an exact local or Railway-private origin.");
  }
  if (homeBaseUrl.pathname !== "/" || homeBaseUrl.search || homeBaseUrl.hash) {
    throw new Error("HOME_BASE_URL cannot include a path, query, or fragment.");
  }
  if (parsed.WORKER_ROLE === "assistant" && !parsed.HOME_BASE_API_TOKEN) {
    throw new Error("The assistant requires a read-only Home Base API credential.");
  }
  if (!isAbsolute(parsed.CODEX_HOME) || !isAbsolute(parsed.WORKER_CWD)) {
    throw new Error("CODEX_HOME and WORKER_CWD must be absolute paths.");
  }

  return {
    role: parsed.WORKER_ROLE,
    homeBaseUrl: homeBaseUrl.origin,
    workerToken: parsed.HOME_BASE_WORKER_TOKEN,
    apiToken: parsed.HOME_BASE_API_TOKEN,
    codexHome: resolve(parsed.CODEX_HOME),
    model: parsed.CODEX_MODEL,
    port: parsed.PORT,
    path: parsed.PATH,
    home: parsed.HOME,
    tmpdir: parsed.TMPDIR,
    cwd: resolve(parsed.WORKER_CWD),
    promptDir: resolve(parsed.PROMPT_DIR),
    workerId: parsed.WORKER_ID ?? `${parsed.WORKER_ROLE}-${randomUUID()}`,
    pollIntervalMs: parsed.POLL_INTERVAL_MS,
    jobTimeoutMs: parsed.JOB_TIMEOUT_MS,
  } as const;
}
