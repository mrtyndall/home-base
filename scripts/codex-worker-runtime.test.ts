import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildCodexOptions,
  CODEX_DISABLED_CAPABILITIES,
  codexAuthReady,
  CodexReadinessVerifier,
  probeCodexSession,
  ShutdownCoordinator,
} from "../worker/src/codex";
import { loadWorkerConfig } from "../worker/src/config";
import {
  buildHomeBaseToolRequest,
  executeHomeBaseTool,
} from "../worker/src/home-base-tools";

const token = "worker-test-token-that-is-longer-than-thirty-two";

test("worker config accepts only local or Railway-private Home Base origins", () => {
  const config = loadWorkerConfig({
    WORKER_ROLE: "sorter",
    HOME_BASE_URL: "http://home-base.railway.internal:3000",
    HOME_BASE_WORKER_TOKEN: token,
    CODEX_HOME: "/data/codex",
    PATH: "/usr/bin:/bin",
  });
  assert.equal(config.role, "sorter");
  assert.throws(() =>
    loadWorkerConfig({
      WORKER_ROLE: "sorter",
      HOME_BASE_URL: "https://home-base-production.example.com",
      HOME_BASE_WORKER_TOKEN: token,
      CODEX_HOME: "/data/codex",
    }),
  );
  assert.throws(() =>
    loadWorkerConfig({
      WORKER_ROLE: "sorter",
      HOME_BASE_URL: "http://home-base.railway.internal:3000",
      HOME_BASE_WORKER_TOKEN: token,
      CODEX_HOME: "/data/codex",
      CODEX_MODEL: "m".repeat(201),
    }),
  );
});

test("Codex child has no Home Base secret and no built-in tools", () => {
  const options = buildCodexOptions({
    codexHome: "/data/codex",
    path: "/usr/bin:/bin",
    home: "/home/homebase",
    tmpdir: "/tmp",
  });
  assert.equal(options.config?.features?.shell_tool, false);
  assert.equal(options.config?.features?.unified_exec, false);
  assert.equal(options.config?.features?.apps, false);
  assert.equal(options.config?.features?.multi_agent, false);
  assert.equal(options.config?.web_search, "disabled");
  assert.equal(options.env?.CODEX_HOME, "/data/codex");
  assert.equal("HOME_BASE_API_TOKEN" in (options.env ?? {}), false);
  assert.equal("HOME_BASE_WORKER_TOKEN" in (options.env ?? {}), false);
});

test("Codex 0.144.4 capability surface is explicitly denied", () => {
  const options = buildCodexOptions({
    codexHome: "/data/codex",
    path: "/usr/bin:/bin",
    home: "/home/homebase",
    tmpdir: "/tmp",
  });
  const features = options.config?.features as Record<string, unknown>;
  for (const capability of CODEX_DISABLED_CAPABILITIES) {
    assert.equal(features[capability], false, `${capability} must be disabled`);
  }
  assert.deepEqual(options.config?.mcp_servers, {});
  assert.deepEqual(options.config?.skills, { config: [] });
  assert.deepEqual(options.config?.shell_environment_policy, {
    inherit: "none",
    ignore_default_excludes: false,
    include_only: [],
    set: {},
  });
  assert.deepEqual(options.config?.history, { persistence: "none" });
  assert.equal(options.config?.project_doc_max_bytes, 0);
  assert.equal(options.config?.check_for_update_on_startup, false);
  assert.equal(options.config?.cli_auth_credentials_store, "file");
  assert.equal(options.config?.forced_login_method, "chatgpt");
  assert.equal(options.config?.mcp_oauth_credentials_store, "file");
  assert.equal(options.config?.model_provider, "openai");
  assert.equal(options.config?.allow_login_shell, false);
});

test("pinned Codex CLI accepts and applies every denied capability override", () => {
  const args = ["features", "list"];
  for (const capability of CODEX_DISABLED_CAPABILITIES) {
    args.push("--config", `features.${capability}=false`);
  }
  const result = spawnSync(
    join(process.cwd(), "node_modules/@openai/codex/bin/codex.js"),
    args,
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, "pinned Codex CLI must recognize the complete deny-list");
  for (const capability of CODEX_DISABLED_CAPABILITIES) {
    assert.match(result.stdout, new RegExp(`^${capability}\\s+.*\\s+false$`, "m"));
  }
});

test("Codex auth readiness rejects malformed and expired credential documents before probing", async () => {
  const directory = await mkdtemp(join(tmpdir(), "home-base-auth-test-"));
  try {
    let probes = 0;
    const probe = async () => {
      probes += 1;
      return true;
    };
    await writeFile(join(directory, "auth.json"), "not-json", "utf8");
    assert.equal(await codexAuthReady({ codexHome: directory, probe }), false);
    assert.equal(probes, 0);

    await writeFile(
      join(directory, "auth.json"),
      JSON.stringify({ auth_mode: "chatgpt", tokens: { access_token: jwtWithExpiration(1) } }),
      "utf8",
    );
    assert.equal(await codexAuthReady({ codexHome: directory, nowMs: 2_000, probe }), false);
    assert.equal(probes, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Codex auth readiness requires a successful SDK session probe", async () => {
  const directory = await mkdtemp(join(tmpdir(), "home-base-auth-test-"));
  try {
    await writeFile(
      join(directory, "auth.json"),
      JSON.stringify(fakeChatGptAuth()),
      "utf8",
    );
    assert.equal(
      await codexAuthReady({ codexHome: directory, probe: async () => false }),
      false,
    );
    assert.equal(
      await codexAuthReady({ codexHome: directory, probe: async () => true }),
      true,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Codex auth readiness rejects API-key authentication", async () => {
  const directory = await mkdtemp(join(tmpdir(), "home-base-auth-test-"));
  try {
    await writeFile(
      join(directory, "auth.json"),
      JSON.stringify({ auth_mode: "apikey", OPENAI_API_KEY: "test-placeholder-credential" }),
      "utf8",
    );
    assert.equal(
      await codexAuthReady({ codexHome: directory, probe: async () => true }),
      false,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Codex auth readiness rejects credential fields under an unknown auth mode", async () => {
  const directory = await mkdtemp(join(tmpdir(), "home-base-auth-test-"));
  try {
    await writeFile(
      join(directory, "auth.json"),
      JSON.stringify({ auth_mode: "unknown", OPENAI_API_KEY: "test-placeholder-credential" }),
      "utf8",
    );
    assert.equal(
      await codexAuthReady({ codexHome: directory, probe: async () => true }),
      false,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Codex auth readiness rejects a non-JWT access token even when a refresh token exists", async () => {
  const directory = await mkdtemp(join(tmpdir(), "home-base-auth-test-"));
  try {
    await writeFile(
      join(directory, "auth.json"),
      JSON.stringify({
        ...fakeChatGptAuth(),
        tokens: {
          ...fakeChatGptAuth().tokens,
          access_token: "fabricated-access-token",
        },
      }),
      "utf8",
    );
    let probes = 0;
    assert.equal(
      await codexAuthReady({
        codexHome: directory,
        probe: async () => {
          probes += 1;
          return true;
        },
      }),
      false,
    );
    assert.equal(probes, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("an expired structurally valid access token may refresh only through a real probe", async () => {
  const directory = await mkdtemp(join(tmpdir(), "home-base-auth-test-"));
  try {
    await writeFile(
      join(directory, "auth.json"),
      JSON.stringify({
        ...fakeChatGptAuth(),
        tokens: {
          ...fakeChatGptAuth().tokens,
          access_token: jwtWithExpiration(1),
        },
      }),
      "utf8",
    );
    let probes = 0;
    assert.equal(
      await codexAuthReady({
        codexHome: directory,
        nowMs: 2_000,
        probe: async () => {
          probes += 1;
          return true;
        },
      }),
      true,
    );
    assert.equal(probes, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Codex SDK session probe requires the exact private readiness envelope", async () => {
  const signals: AbortSignal[] = [];
  const codex = {
    startThread() {
      return {
        async run(_prompt: string, options: { signal?: AbortSignal }) {
          if (options.signal) signals.push(options.signal);
          return { finalResponse: JSON.stringify({ ready: true }) };
        },
      };
    },
  };
  const controller = new AbortController();
  assert.equal(
    await probeCodexSession({
      codex: codex as never,
      config: testWorkerConfig(),
      signal: controller.signal,
    }),
    true,
  );
  assert.deepEqual(signals, [controller.signal]);

  const wrong = {
    startThread() {
      return { run: async () => ({ finalResponse: JSON.stringify({ ready: false }) }) };
    },
  };
  assert.equal(
    await probeCodexSession({ codex: wrong as never, config: testWorkerConfig() }),
    false,
  );
});

test("Codex readiness caches successful probes and invalidation forces a new probe", async () => {
  const directory = await mkdtemp(join(tmpdir(), "home-base-auth-test-"));
  try {
    await writeFile(join(directory, "auth.json"), JSON.stringify(fakeChatGptAuth()), "utf8");
    let probes = 0;
    let now = 1_000;
    const verifier = new CodexReadinessVerifier({
      codexHome: directory,
      probe: async () => {
        probes += 1;
        return true;
      },
      now: () => now,
    });
    assert.equal(await verifier.ensureReady(), true);
    now += 10 * 365 * 24 * 60 * 60_000;
    assert.equal(await verifier.ensureReady(), true);
    assert.equal(verifier.ready, true);
    assert.equal(probes, 1);

    verifier.invalidate();
    assert.equal(verifier.ready, false);
    assert.equal(await verifier.ensureReady(), true);
    assert.equal(probes, 2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Codex readiness backs off failed paid probes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "home-base-auth-test-"));
  try {
    await writeFile(join(directory, "auth.json"), JSON.stringify(fakeChatGptAuth()), "utf8");
    let probes = 0;
    const verifier = new CodexReadinessVerifier({
      codexHome: directory,
      probe: async () => {
        probes += 1;
        return false;
      },
      failureBackoffMs: 60_000,
    });
    assert.equal(await verifier.ensureReady(), false);
    assert.equal(await verifier.ensureReady(), false);
    assert.equal(verifier.ready, false);
    assert.equal(probes, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("shutdown aborts tracked work and interruptible waits", async () => {
  const shutdown = new ShutdownCoordinator();
  const work = shutdown.createController();
  const wait = shutdown.wait(60_000);
  shutdown.stop();
  assert.equal(shutdown.stopping, true);
  assert.equal(work.signal.aborted, true);
  assert.equal(await wait, false);
});

test("worker polling binds auth probes, claims, turns, and heartbeats to shutdown", () => {
  const source = readFileSync(join(process.cwd(), "worker/src/index.ts"), "utf8");
  assert.match(source, /new CodexReadinessVerifier\(\{[\s\S]*codexHome: config\.codexHome/);
  assert.match(source, /authVerifier\.ensureReady\(authController\.signal\)/);
  assert.match(source, /const authReady = authVerifier\.ready/);
  assert.match(source, /isCodexAuthenticationError\(error\)[\s\S]*authVerifier\.invalidate\(\)/);
  assert.doesNotMatch(source, /login["'],\s*["']status/);
  assert.doesNotMatch(source, /stat\(join\(config\.codexHome, "auth\.json"\)\)/);
  assert.ok(
    (source.match(/shutdown\.createController\(\)/g) ?? []).length >= 2,
    "idle claims and active turns must both receive shutdown-linked signals",
  );
  assert.match(source, /if \(shutdown\.stopping\)[\s\S]*queue\.fail/);
  assert.match(source, /shutdown\.wait\(/);
});

test("Home Base policy broker maps reads and rejects writes", () => {
  const request = buildHomeBaseToolRequest({
    id: "search-1",
    name: "search",
    arguments: { query: "ham radio", limit: 10 },
  });
  assert.equal(request.path, "/api/v1/search?q=ham+radio&limit=10");
  assert.throws(() =>
    buildHomeBaseToolRequest({
      id: "write-1",
      name: "create_task",
      arguments: { title: "No" },
    } as never),
  );
});

test("Home Base policy broker stops reading after 60,000 response bytes", async () => {
  const originalFetch = globalThis.fetch;
  let pulls = 0;
  globalThis.fetch = async () =>
    new Response(
      new ReadableStream<Uint8Array>({
        pull(controller) {
          pulls += 1;
          controller.enqueue(new TextEncoder().encode(`{"payload":"${"x".repeat(19_980)}"}`));
          if (pulls >= 20) controller.close();
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  try {
    const result = await executeHomeBaseTool({
      call: { id: "areas-1", name: "list_areas", arguments: { limit: 10 } },
      baseUrl: "http://home-base.railway.internal:3000",
      apiToken: "test-placeholder-credential",
      signal: new AbortController().signal,
    });
    assert.equal(result.ok, true);
    assert.equal((result as { data: { truncated?: boolean } }).data.truncated, true);
    assert.ok(pulls <= 5, `stream should be cancelled near the byte limit, got ${pulls} pulls`);
    const prefix = (result as { data: { jsonPrefix: string } }).data.jsonPrefix;
    assert.ok(new TextEncoder().encode(prefix).byteLength <= 60_000);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("truncated Home Base response never expands past 60,000 UTF-8 bytes", async () => {
  const originalFetch = globalThis.fetch;
  const oversized = new TextEncoder().encode(JSON.stringify({ p: "💾".repeat(20_000) }));
  globalThis.fetch = async () => new Response(oversized, { status: 200 });
  try {
    const result = await executeHomeBaseTool({
      call: { id: "areas-2", name: "list_areas", arguments: { limit: 10 } },
      baseUrl: "http://home-base.railway.internal:3000",
      apiToken: "test-placeholder-credential",
      signal: new AbortController().signal,
    });
    const prefix = (result as { data: { jsonPrefix: string } }).data.jsonPrefix;
    assert.ok(new TextEncoder().encode(prefix).byteLength <= 60_000);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("worker image drops privileges after preparing its persistent Codex home", () => {
  const dockerfile = readFileSync(join(process.cwd(), "worker/Dockerfile"), "utf8");
  assert.match(dockerfile, /node:22-bookworm-slim/);
  assert.match(dockerfile, /gosu/);
  assert.match(dockerfile, /CODEX_HOME=\/data\/codex/);
  assert.match(dockerfile, /ENTRYPOINT \["\/usr\/local\/bin\/worker-entrypoint"\]/);
  const runtimeStage = dockerfile.slice(dockerfile.indexOf("FROM node:22-bookworm-slim AS runtime"));
  assert.match(
    runtimeStage,
    /COPY worker\/package\.json worker\/package-lock\.json \.\//,
    "the runtime image must install only the dedicated worker dependency graph",
  );
  assert.doesNotMatch(runtimeStage, /COPY package\.json package-lock\.json \.\//);
  const entrypoint = readFileSync(
    join(process.cwd(), "worker/entrypoint.sh"),
    "utf8",
  );
  assert.match(entrypoint, /chown.*\/data\/codex/);
  assert.match(entrypoint, /exec gosu homebase/);
  assert.equal(
    (dockerfile.match(/npm ci[^\n]*--ignore-scripts/g) ?? []).length,
    2,
    "worker dependency installs must not run the app Prisma postinstall",
  );
});

function jwtWithExpiration(exp: number) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none" })}.${encode({ exp })}.test-signature`;
}

function fakeChatGptAuth() {
  return {
    auth_mode: "chatgpt",
    OPENAI_API_KEY: null,
    tokens: {
      id_token: jwtWithExpiration(4_102_444_800),
      access_token: jwtWithExpiration(4_102_444_800),
      refresh_token: "test-placeholder-refresh",
      account_id: "test-placeholder-account",
    },
    last_refresh: "2099-01-01T00:00:00Z",
  };
}

function testWorkerConfig() {
  return loadWorkerConfig({
    WORKER_ROLE: "sorter",
    HOME_BASE_URL: "http://home-base.railway.internal:3000",
    HOME_BASE_WORKER_TOKEN: token,
    CODEX_HOME: "/data/codex",
    PATH: "/usr/bin:/bin",
  });
}
