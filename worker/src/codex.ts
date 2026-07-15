import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { Codex, CodexOptions } from "@openai/codex-sdk";
import type { WorkerConfig } from "./config.js";

const maxAuthFileBytes = 256 * 1024;

/** Model-visible/tool-bearing feature flags present in the pinned Codex CLI 0.144.4. */
export const CODEX_DISABLED_CAPABILITIES = [
  "apps",
  "artifact",
  "auth_elicitation",
  "browser_use",
  "browser_use_external",
  "browser_use_full_cdp_access",
  "code_mode",
  "code_mode_host",
  "code_mode_only",
  "computer_use",
  "current_time_reminder",
  "default_mode_request_user_input",
  "deferred_executor",
  "enable_fanout",
  "enable_mcp_apps",
  "exec_permission_approvals",
  "goals",
  "guardian_approval",
  "hooks",
  "image_generation",
  "in_app_browser",
  "memories",
  "mentions_v2",
  "multi_agent",
  "multi_agent_v2",
  "network_proxy",
  "personality",
  "plugin_sharing",
  "plugins",
  "realtime_conversation",
  "remote_plugin",
  "request_permissions_tool",
  "shell_snapshot",
  "shell_tool",
  "shell_zsh_fork",
  "skill_mcp_dependency_install",
  "standalone_web_search",
  "terminal_visualization_instructions",
  "tool_call_mcp_elicitation",
  "tool_suggest",
  "unified_exec",
  "unified_exec_zsh_fork",
  "workspace_dependencies",
] as const;

export function buildCodexOptions(input: {
  codexHome: string;
  path: string;
  home: string;
  tmpdir: string;
}): CodexOptions {
  const disabledFeatures = Object.fromEntries(
    CODEX_DISABLED_CAPABILITIES.map((feature) => [feature, false]),
  );
  return {
    config: {
      model_provider: "openai",
      cli_auth_credentials_store: "file",
      forced_login_method: "chatgpt",
      mcp_oauth_credentials_store: "file",
      allow_login_shell: false,
      web_search: "disabled",
      mcp_servers: {},
      skills: { config: [] },
      project_doc_max_bytes: 0,
      project_doc_fallback_filenames: [],
      check_for_update_on_startup: false,
      notify: [],
      history: { persistence: "none" },
      shell_environment_policy: {
        inherit: "none",
        ignore_default_excludes: false,
        include_only: [],
        set: {},
      },
      analytics: { enabled: false },
      feedback: { enabled: false },
      features: disabledFeatures,
    },
    env: {
      CODEX_HOME: input.codexHome,
      PATH: input.path,
      HOME: input.home,
      TMPDIR: input.tmpdir,
      LANG: "C.UTF-8",
    },
  };
}

export async function codexAuthReady(input: {
  codexHome: string;
  nowMs?: number;
  signal?: AbortSignal;
  probe: (input: { signal?: AbortSignal }) => Promise<boolean>;
}) {
  try {
    const authPath = join(input.codexHome, "auth.json");
    const info = await stat(authPath);
    if (!info.isFile() || info.size === 0 || info.size > maxAuthFileBytes) return false;
    const document: unknown = JSON.parse(await readFile(authPath, "utf8"));
    if (!validAuthDocument(document, input.nowMs ?? Date.now())) return false;
    return await input.probe({ signal: input.signal });
  } catch {
    return false;
  }
}

function validAuthDocument(value: unknown, nowMs: number) {
  if (!isRecord(value) || typeof value.auth_mode !== "string" || !value.auth_mode.trim()) {
    return false;
  }
  if (value.auth_mode !== "chatgpt") return false;
  if (!isRecord(value.tokens) || typeof value.tokens.access_token !== "string" || !value.tokens.access_token.trim()) {
    return false;
  }
  const expiration = jwtExpirationMs(value.tokens.access_token);
  if (expiration === null) return false;
  if (typeof value.tokens.refresh_token === "string" && value.tokens.refresh_token.trim()) {
    return true;
  }
  return expiration > nowMs + 30_000;
}

function jwtExpirationMs(token: string) {
  const segments = token.split(".");
  if (segments.length !== 3 || segments.some((segment) => !segment || !/^[A-Za-z0-9_-]+$/.test(segment))) {
    return null;
  }
  try {
    const header: unknown = JSON.parse(Buffer.from(segments[0], "base64url").toString("utf8"));
    const payload: unknown = JSON.parse(Buffer.from(segments[1], "base64url").toString("utf8"));
    return isRecord(header) && isRecord(payload) && typeof payload.exp === "number" && Number.isFinite(payload.exp)
      ? payload.exp * 1_000
      : null;
  } catch {
    return null;
  }
}

const sessionProbeSchema = {
  type: "object",
  properties: { ready: { type: "boolean", const: true } },
  required: ["ready"],
  additionalProperties: false,
} as const;

export async function probeCodexSession(input: {
  codex: Codex;
  config: WorkerConfig;
  signal?: AbortSignal;
}) {
  try {
    const thread = input.codex.startThread(lockedThreadOptions(input.config));
    const turn = await thread.run("Return the private readiness confirmation required by the schema.", {
      outputSchema: sessionProbeSchema,
      signal: input.signal,
    });
    const result: unknown = JSON.parse(turn.finalResponse);
    return isRecord(result) && result.ready === true && Object.keys(result).length === 1;
  } catch {
    return false;
  }
}

type ReadinessProbe = (input: { signal?: AbortSignal }) => Promise<boolean>;

export class CodexReadinessVerifier {
  readonly #codexHome: string;
  readonly #probe: ReadinessProbe;
  readonly #successTtlMs: number;
  readonly #failureBackoffMs: number;
  readonly #now: () => number;
  #readyUntil = 0;
  #retryAfter = 0;
  #inFlight: Promise<boolean> | null = null;

  constructor(input: {
    codexHome: string;
    codex?: Codex;
    config?: WorkerConfig;
    probe?: ReadinessProbe;
    successTtlMs?: number;
    failureBackoffMs?: number;
    now?: () => number;
  }) {
    this.#codexHome = input.codexHome;
    if (input.probe) {
      this.#probe = input.probe;
    } else if (input.codex && input.config) {
      this.#probe = ({ signal }) => probeCodexSession({
        codex: input.codex!,
        config: input.config!,
        signal,
      });
    } else {
      throw new Error("A Codex SDK session probe is required.");
    }
    this.#successTtlMs = input.successTtlMs ?? Number.POSITIVE_INFINITY;
    this.#failureBackoffMs = input.failureBackoffMs ?? 30_000;
    this.#now = input.now ?? Date.now;
  }

  get ready() {
    return this.#readyUntil > this.#now();
  }

  async ensureReady(signal?: AbortSignal) {
    const now = this.#now();
    if (this.#readyUntil > now) return true;
    if (this.#retryAfter > now) return false;
    if (this.#inFlight) return this.#inFlight;

    const verification = codexAuthReady({
      codexHome: this.#codexHome,
      nowMs: now,
      signal,
      probe: this.#probe,
    }).then((verified) => {
      const completedAt = this.#now();
      this.#readyUntil = verified ? completedAt + this.#successTtlMs : 0;
      this.#retryAfter = verified ? 0 : completedAt + this.#failureBackoffMs;
      return verified;
    }).finally(() => {
      this.#inFlight = null;
    });
    this.#inFlight = verification;
    return verification;
  }

  invalidate() {
    this.#readyUntil = 0;
    this.#retryAfter = 0;
  }
}

export function isCodexAuthenticationError(error: unknown) {
  if (!isRecord(error) && !(error instanceof Error)) return false;
  const status = isRecord(error) ? error.status : undefined;
  const code = isRecord(error) ? error.code : undefined;
  if (status === 401 || code === 401 || code === "unauthorized" || code === "invalid_token") {
    return true;
  }
  const message = error instanceof Error
    ? error.message
    : typeof error.message === "string" ? error.message : "";
  return /\b(?:401|unauthori[sz]ed|authentication failed|login required|not logged in|access token|refresh token|invalid credentials?)\b/i.test(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class ShutdownCoordinator {
  readonly #shutdown = new AbortController();
  readonly #controllers = new Set<AbortController>();

  get stopping() {
    return this.#shutdown.signal.aborted;
  }

  createController() {
    const controller = new AbortController();
    if (this.stopping) {
      controller.abort();
      return controller;
    }
    this.#controllers.add(controller);
    return controller;
  }

  release(controller: AbortController) {
    this.#controllers.delete(controller);
  }

  stop() {
    this.#shutdown.abort();
    for (const controller of this.#controllers) controller.abort();
    this.#controllers.clear();
  }

  wait(ms: number) {
    if (this.stopping) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        this.#shutdown.signal.removeEventListener("abort", abort);
        resolve(true);
      }, ms);
      const abort = () => {
        clearTimeout(timer);
        resolve(false);
      };
      this.#shutdown.signal.addEventListener("abort", abort, { once: true });
    });
  }
}

export async function createLockedCodex(config: WorkerConfig) {
  const { Codex } = await import("@openai/codex-sdk");
  return new Codex(
    buildCodexOptions({
      codexHome: config.codexHome,
      path: config.path,
      home: config.home,
      tmpdir: config.tmpdir,
    }),
  );
}

export function lockedThreadOptions(config: WorkerConfig) {
  return {
    model: config.model,
    sandboxMode: "read-only" as const,
    approvalPolicy: "never" as const,
    workingDirectory: config.cwd,
    skipGitRepoCheck: true,
    networkAccessEnabled: false,
    webSearchMode: "disabled" as const,
  };
}
