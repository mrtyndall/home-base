import { createServer } from "node:http";
import {
  CodexReadinessVerifier,
  createLockedCodex,
  isCodexAuthenticationError,
  ShutdownCoordinator,
} from "./codex.js";
import { loadWorkerConfig } from "./config.js";
import { QueueClient } from "./queue-client.js";
import { runAssistant } from "./assistant.js";
import { runSorter } from "./sorter.js";

const config = loadWorkerConfig();
const codex = await createLockedCodex(config);
const queue = new QueueClient(config);
const shutdown = new ShutdownCoordinator();
const authVerifier = new CodexReadinessVerifier({
  codexHome: config.codexHome,
  codex,
  config,
});
let active = false;
let lastClaimOk = false;

const server = createServer(async (request, response) => {
  if (request.method !== "GET" || (request.url !== "/healthz" && request.url !== "/readyz")) {
    response.writeHead(404).end();
    return;
  }
  if (request.url === "/healthz") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true, role: config.role }));
    return;
  }
  const authReady = authVerifier.ready;
  const ready = authReady && lastClaimOk && !shutdown.stopping;
  response.writeHead(ready ? 200 : 503, { "content-type": "application/json" });
  response.end(JSON.stringify({ ready, role: config.role, active, authReady }));
});

server.listen(config.port, "0.0.0.0", () => {
  console.log(JSON.stringify({ event: "worker_started", role: config.role, port: config.port }));
});

void pollLoop();

async function pollLoop() {
  while (!shutdown.stopping) {
    const authController = shutdown.createController();
    const authReady = await authVerifier.ensureReady(authController.signal);
    shutdown.release(authController);
    if (!authReady) {
      lastClaimOk = false;
      await shutdown.wait(5_000);
      continue;
    }

    const idleController = shutdown.createController();
    try {
      const claim = await queue.claim(idleController.signal);
      shutdown.release(idleController);
      lastClaimOk = true;
      if (shutdown.stopping) {
        if (claim) await failWithDeadline(claim.jobId, claim.leaseToken, "Worker is shutting down.");
        break;
      }
      if (!claim) {
        await shutdown.wait(config.pollIntervalMs);
        continue;
      }

      active = true;
      const jobController = shutdown.createController();
      const timeout = setTimeout(() => jobController.abort(), config.jobTimeoutMs);
      const heartbeat = setInterval(() => {
        void queue.heartbeat(claim.jobId, claim.leaseToken, jobController.signal).catch(() => {
          jobController.abort();
        });
      }, 60_000);
      try {
        const result = claim.kind === "capture_sort"
          ? await runSorter({ codex, config, job: claim.input, signal: jobController.signal })
          : await runAssistant({ codex, config, job: claim.input, signal: jobController.signal });
        await queue.complete(claim.jobId, claim.leaseToken, result, jobController.signal);
        console.log(JSON.stringify({ event: "job_completed", role: config.role, kind: claim.kind, jobId: claim.jobId }));
      } catch (error) {
        if (isCodexAuthenticationError(error)) {
          authVerifier.invalidate();
          lastClaimOk = false;
        }
        const message = shutdown.stopping
          ? "Worker is shutting down."
          : isCodexAuthenticationError(error)
            ? "Codex authentication failed."
            : "Worker job failed.";
        await failWithDeadline(claim.jobId, claim.leaseToken, message);
        console.error(JSON.stringify({ event: "job_failed", role: config.role, kind: claim.kind, jobId: claim.jobId, errorClass: error instanceof Error ? error.name : "UnknownError" }));
      } finally {
        clearTimeout(timeout);
        clearInterval(heartbeat);
        shutdown.release(jobController);
        active = false;
      }
    } catch (error) {
      shutdown.release(idleController);
      if (shutdown.stopping) break;
      lastClaimOk = false;
      console.error(JSON.stringify({ event: "poll_failed", role: config.role, errorClass: error instanceof Error ? error.name : "UnknownError" }));
      await shutdown.wait(Math.max(config.pollIntervalMs, 3_000));
    }
  }
  server.close();
}

async function failWithDeadline(jobId: string, leaseToken: string, error: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    await queue.fail(jobId, leaseToken, error, controller.signal).catch(() => undefined);
  } finally {
    clearTimeout(timeout);
  }
}

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    if (shutdown.stopping) return;
    console.log(JSON.stringify({ event: "worker_stopping", role: config.role, signal }));
    shutdown.stop();
    server.close();
    setTimeout(() => process.exit(1), 25_000).unref();
  });
}
