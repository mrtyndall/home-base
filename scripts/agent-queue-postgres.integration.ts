import assert from "node:assert/strict";

const proposalBarrierKey = "88404207141450017";
const proposalBarrierFunction = "agent_queue_proposal_barrier_fn";
const proposalBarrierTrigger = "agent_queue_proposal_barrier_trigger";

function verifiedTestDatabaseUrl() {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL;
  if (!testDatabaseUrl) throw new Error("TEST_DATABASE_URL is required.");
  if (process.env.ALLOW_DISPOSABLE_DATABASE !== "1") {
    throw new Error("ALLOW_DISPOSABLE_DATABASE=1 is required.");
  }

  const parsed = new URL(testDatabaseUrl);
  const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    !loopbackHosts.has(parsed.hostname)
  ) {
    throw new Error(
      "Agent queue integration tests require a loopback PostgreSQL URL.",
    );
  }
  if (
    !decodeURIComponent(parsed.pathname)
      .toLowerCase()
      .includes("agent_queue_test")
  ) {
    throw new Error("Disposable database name must contain agent_queue_test.");
  }
  if (/railway|rlwy|supabase/i.test(testDatabaseUrl)) {
    throw new Error(
      "Remote database URLs are forbidden for this integration harness.",
    );
  }
  return testDatabaseUrl;
}

function proposalForm(proposalId: string) {
  const form = new FormData();
  form.set("proposalId", proposalId);
  return form;
}

function conversionForm(
  captureId: string,
  proposalId: string,
  destination: { areaId?: string; projectId?: string } = {},
) {
  const form = proposalForm(proposalId);
  form.set("captureId", captureId);
  form.set("targetType", "task");
  if (destination.areaId) form.set("areaId", destination.areaId);
  if (destination.projectId) form.set("projectId", destination.projectId);
  return form;
}

async function tolerateStandaloneRevalidation(action: Promise<void>) {
  try {
    await action;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        "Invariant: static generation store missing in revalidatePath /"
    ) {
      return;
    }
    throw error;
  }
}

async function main() {
  const testDatabaseUrl = verifiedTestDatabaseUrl();
  process.env.DATABASE_URL = testDatabaseUrl;

  const [
    { prisma },
    queue,
    jobs,
    agentChat,
    actions,
    areaCompatibility,
    { Client },
  ] = await Promise.all([
    import("../src/lib/db"),
    import("../src/lib/agent/queue"),
    import("../src/lib/agent/jobs"),
    import("../src/lib/agent/chat"),
    import("../src/app/actions"),
    import("../src/lib/area-compat"),
    import("pg"),
  ]);
  const { claimAgentJob, completeAgentJob, enqueueAgentJob, failAgentJob } =
    queue;
  const control = new Client({ connectionString: testDatabaseUrl });
  let barrierHeld = false;

  async function waitForAdvisoryWaiterCount(expected: number) {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const result = await control.query<{ count: number }>(`
        SELECT count(*)::int AS count
        FROM pg_stat_activity
        WHERE datname = current_database()
          AND wait_event_type = 'Lock'
          AND wait_event = 'advisory'
      `);
      const count = Number(result.rows[0]?.count ?? 0);
      if (count === expected) return;
      if (count > expected) {
        throw new Error(
          `Expected ${expected} advisory waiter(s), observed ${count}.`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`Timed out waiting for ${expected} advisory waiter(s).`);
  }

  async function dropProposalBarrier() {
    await control.query(
      `DROP TRIGGER IF EXISTS ${proposalBarrierTrigger} ON capture_review_proposals`,
    );
    await control.query(`DROP FUNCTION IF EXISTS ${proposalBarrierFunction}()`);
  }

  async function installProposalBarrier() {
    await dropProposalBarrier();
    await control.query(`
      CREATE FUNCTION ${proposalBarrierFunction}() RETURNS trigger
      LANGUAGE plpgsql AS $function$
      BEGIN
        PERFORM pg_advisory_xact_lock(${proposalBarrierKey}::bigint);
        RETURN NEW;
      END
      $function$
    `);
    await control.query(`
      CREATE TRIGGER ${proposalBarrierTrigger}
      BEFORE UPDATE ON capture_review_proposals
      FOR EACH ROW EXECUTE FUNCTION ${proposalBarrierFunction}()
    `);
  }

  await control.connect();
  try {
    const capture = await prisma.capture.create({
      data: { rawText: "agent queue integration fixture", source: "api" },
    });
    const first = await enqueueAgentJob({
      role: "sorter",
      kind: "capture_sort",
      idempotencyKey: `queue-integration:${capture.id}:first`,
      payload: { captureId: capture.id },
      captureId: capture.id,
    });
    const second = await enqueueAgentJob({
      role: "sorter",
      kind: "capture_sort",
      idempotencyKey: `queue-integration:${capture.id}:second`,
      payload: { captureId: capture.id },
      captureId: capture.id,
    });

    const [claimA, claimB] = await Promise.all([
      claimAgentJob({ role: "sorter", leaseOwner: "integration-a" }),
      claimAgentJob({ role: "sorter", leaseOwner: "integration-b" }),
    ]);
    assert.ok(claimA && claimB);
    assert.notEqual(claimA.job.id, claimB.job.id);
    assert.equal(claimA.job.captureId, capture.id);
    assert.equal(claimB.job.captureId, capture.id);

    const claimForFirst = claimA.job.id === first.id ? claimA : claimB;
    const claimForSecond = claimA.job.id === second.id ? claimA : claimB;
    await completeAgentJob({
      jobId: claimForFirst.job.id,
      leaseToken: claimForFirst.leaseToken,
      result: { ok: true },
    });
    const duplicate = await completeAgentJob({
      jobId: claimForFirst.job.id,
      leaseToken: claimForFirst.leaseToken,
      result: { ok: true },
    });
    assert.equal(duplicate.status, "succeeded");

    await failAgentJob({
      jobId: claimForSecond.job.id,
      leaseToken: claimForSecond.leaseToken,
      error: "retry fixture",
    });
    await prisma.agentJob.update({
      where: { id: claimForSecond.job.id },
      data: { availableAt: new Date(0) },
    });
    const reclaimed = await claimAgentJob({
      role: "sorter",
      leaseOwner: "integration-c",
    });
    assert.ok(reclaimed);
    assert.equal(reclaimed.job.id, claimForSecond.job.id);
    await assert.rejects(() =>
      completeAgentJob({
        jobId: reclaimed.job.id,
        leaseToken: claimForSecond.leaseToken,
        result: { stale: true },
      }),
    );
    await completeAgentJob({
      jobId: reclaimed.job.id,
      leaseToken: reclaimed.leaseToken,
      result: { ok: true },
    });

    const crashAtLimit = await enqueueAgentJob({
      role: "sorter",
      kind: "capture_sort",
      idempotencyKey: `queue-integration:${capture.id}:crash-at-limit`,
      payload: { captureId: capture.id },
      captureId: capture.id,
      maxAttempts: 1,
    });
    const finalLease = await claimAgentJob({
      role: "sorter",
      leaseOwner: "integration-crash",
    });
    assert.equal(finalLease?.job.id, crashAtLimit.id);
    await prisma.agentJob.update({
      where: { id: crashAtLimit.id },
      data: { leaseExpiresAt: new Date(0) },
    });
    assert.equal(
      await claimAgentJob({
        role: "sorter",
        leaseOwner: "integration-after-crash",
      }),
      null,
    );
    assert.equal(
      (
        await prisma.agentJob.findUniqueOrThrow({
          where: { id: crashAtLimit.id },
        })
      ).status,
      "dead_letter",
    );
    await assert.rejects(() =>
      prisma.agentJob.delete({ where: { id: first.id } }),
    );

    const provenanceModel = "gpt-provenance-integration";
    const provenanceCapture = await prisma.capture.create({
      data: {
        rawText: "file this provenance integration fixture",
        source: "api",
        parseStatus: "ambiguous",
      },
    });
    await enqueueAgentJob({
      role: "sorter",
      kind: "capture_sort",
      idempotencyKey: `queue-integration:${provenanceCapture.id}:provenance`,
      payload: { captureId: provenanceCapture.id },
      captureId: provenanceCapture.id,
      promptVersion: "provenance-integration-v1",
    });
    const provenanceClaim = await jobs.claimNextWorkerJob({
      role: "sorter",
      workerId: "integration-provenance",
    });
    assert.ok(provenanceClaim && provenanceClaim.kind === "capture_sort");
    await jobs.completeWorkerJob({
      role: "sorter",
      jobId: provenanceClaim.jobId,
      leaseToken: provenanceClaim.leaseToken,
      model: provenanceModel,
      result: {
        disposition: "proposal",
        targetType: "task",
        areaId: null,
        projectId: null,
        confidence: 0.95,
        reason: "Clear action language.",
      },
    });
    const provenanceJob = await prisma.agentJob.findUniqueOrThrow({
      where: { id: provenanceClaim.jobId },
    });
    const provenanceProposal =
      await prisma.captureReviewProposal.findUniqueOrThrow({
        where: { agentJobId: provenanceClaim.jobId },
      });
    assert.equal(provenanceJob.model, provenanceModel);
    assert.equal(provenanceProposal.model, provenanceModel);
    await tolerateStandaloneRevalidation(
      actions.convertPendingCapture(
        conversionForm(provenanceCapture.id, provenanceProposal.id),
      ),
    );
    const provenanceFeedback =
      await prisma.captureRoutingFeedback.findUniqueOrThrow({
        where: { proposalId: provenanceProposal.id },
      });
    assert.equal(provenanceFeedback.model, provenanceModel);
    assert.equal(provenanceFeedback.promptVersion, "provenance-integration-v1");

    const destinationArea = await areaCompatibility.createCompatibleArea(
      prisma,
      {
        name: "Proposal destination fixture",
      },
    );
    const destinationProject = await prisma.project.create({
      data: {
        name: "Suggested Project fixture",
        areaId: destinationArea.id,
        status: "active",
      },
    });
    const projectCapture = await prisma.capture.create({
      data: { rawText: "project proposal acceptance fixture", source: "api" },
    });
    const projectProposal = await prisma.captureReviewProposal.create({
      data: {
        captureId: projectCapture.id,
        suggestedType: "task",
        suggestedAreaId: destinationArea.id,
        suggestedProjectId: destinationProject.id,
        reason: "integration fixture",
      },
    });
    await tolerateStandaloneRevalidation(
      actions.convertPendingCapture(
        conversionForm(projectCapture.id, projectProposal.id, {
          projectId: destinationProject.id,
        }),
      ),
    );
    const projectTask = await prisma.task.findFirstOrThrow({
      where: { captureId: projectCapture.id },
    });
    assert.equal(projectTask.projectId, destinationProject.id);
    assert.equal(projectTask.areaId, destinationArea.id);
    const projectFeedback =
      await prisma.captureRoutingFeedback.findFirstOrThrow({
        where: { proposalId: projectProposal.id },
      });
    assert.equal(projectFeedback.outcome, "accepted");
    assert.deepEqual(projectFeedback.final, {
      targetType: "task",
      areaId: destinationArea.id,
      projectId: destinationProject.id,
    });

    const globalCapture = await prisma.capture.create({
      data: { rawText: "global proposal acceptance fixture", source: "api" },
    });
    const globalProposal = await prisma.captureReviewProposal.create({
      data: {
        captureId: globalCapture.id,
        suggestedType: "task",
        reason: "integration fixture",
      },
    });
    await tolerateStandaloneRevalidation(
      actions.convertPendingCapture(
        conversionForm(globalCapture.id, globalProposal.id),
      ),
    );
    const globalTask = await prisma.task.findFirstOrThrow({
      where: { captureId: globalCapture.id },
    });
    assert.equal(globalTask.areaId, null);
    assert.equal(globalTask.projectId, null);
    const globalFeedback = await prisma.captureRoutingFeedback.findFirstOrThrow(
      {
        where: { proposalId: globalProposal.id },
      },
    );
    assert.equal(globalFeedback.outcome, "accepted");
    assert.deepEqual(globalFeedback.final, {
      targetType: "task",
      areaId: null,
      projectId: null,
    });

    const routedCapture = await prisma.capture.create({
      data: {
        rawText: "concurrent proposal resolution fixture",
        source: "api",
      },
    });
    const proposal = await prisma.captureReviewProposal.create({
      data: {
        captureId: routedCapture.id,
        suggestedType: "task",
        reason: "integration fixture",
      },
    });

    await control.query("SELECT pg_advisory_lock($1::bigint)", [
      proposalBarrierKey,
    ]);
    barrierHeld = true;
    await installProposalBarrier();

    const acceptRun = tolerateStandaloneRevalidation(
      actions.convertPendingCapture(
        conversionForm(routedCapture.id, proposal.id),
      ),
    );
    acceptRun.catch(() => undefined);
    await waitForAdvisoryWaiterCount(1);
    const dismissRun = tolerateStandaloneRevalidation(
      actions.dismissCaptureReviewProposal(proposalForm(proposal.id)),
    );
    dismissRun.catch(() => undefined);
    await waitForAdvisoryWaiterCount(2);

    const unlock = await control.query<{ unlocked: boolean }>(
      "SELECT pg_advisory_unlock($1::bigint) AS unlocked",
      [proposalBarrierKey],
    );
    assert.equal(unlock.rows[0]?.unlocked, true);
    barrierHeld = false;
    const resolutions = await Promise.allSettled([acceptRun, dismissRun]);
    const resolutionErrors = resolutions.flatMap((result) =>
      result.status === "rejected"
        ? [
            result.reason instanceof Error
              ? result.reason.message
              : "unknown rejection",
          ]
        : [],
    );
    assert.deepEqual(resolutionErrors, []);

    assert.equal(
      (
        await prisma.captureReviewProposal.findUniqueOrThrow({
          where: { id: proposal.id },
        })
      ).status,
      "accepted",
    );
    assert.equal(
      await prisma.captureRoutingFeedback.count({
        where: { proposalId: proposal.id },
      }),
      1,
      "a proposal must record exactly one final routing outcome",
    );
    assert.equal(
      (
        await prisma.captureRoutingFeedback.findFirstOrThrow({
          where: { proposalId: proposal.id },
        })
      ).outcome,
      "accepted",
    );
    assert.equal(
      await prisma.task.count({ where: { captureId: routedCapture.id } }),
      1,
    );

    await actions.snoozeCaptureReviewProposalOneDay(proposalForm(proposal.id));
    assert.equal(
      (
        await prisma.captureReviewProposal.findUniqueOrThrow({
          where: { id: proposal.id },
        })
      ).status,
      "accepted",
      "a resolved proposal cannot be snoozed",
    );
    assert.equal(
      await prisma.notification.count({
        where: {
          type: "capture_review_snoozed",
          sourceRef: { path: ["id"], equals: proposal.id },
        },
      }),
      0,
    );

    const feedback = await prisma.captureRoutingFeedback.findFirstOrThrow({
      where: { proposalId: proposal.id },
    });
    await assert.rejects(() =>
      prisma.captureRoutingFeedback.update({
        where: { id: feedback.id },
        data: { outcome: "dismissed" },
      }),
    );

    await dropProposalBarrier();
    const dismissedCapture = await prisma.capture.create({
      data: { rawText: "dismiss-first proposal fixture", source: "api" },
    });
    const dismissedProposal = await prisma.captureReviewProposal.create({
      data: {
        captureId: dismissedCapture.id,
        suggestedType: "task",
        reason: "integration fixture",
      },
    });
    await control.query("SELECT pg_advisory_lock($1::bigint)", [
      proposalBarrierKey,
    ]);
    barrierHeld = true;
    await installProposalBarrier();

    const dismissFirstRun = tolerateStandaloneRevalidation(
      actions.dismissCaptureReviewProposal(proposalForm(dismissedProposal.id)),
    );
    dismissFirstRun.catch(() => undefined);
    await waitForAdvisoryWaiterCount(1);
    const staleAcceptRun = tolerateStandaloneRevalidation(
      actions.convertPendingCapture(
        conversionForm(dismissedCapture.id, dismissedProposal.id),
      ),
    );
    staleAcceptRun.catch(() => undefined);
    await waitForAdvisoryWaiterCount(2);

    const dismissFirstUnlock = await control.query<{ unlocked: boolean }>(
      "SELECT pg_advisory_unlock($1::bigint) AS unlocked",
      [proposalBarrierKey],
    );
    assert.equal(dismissFirstUnlock.rows[0]?.unlocked, true);
    barrierHeld = false;
    const dismissFirstResolutions = await Promise.allSettled([
      dismissFirstRun,
      staleAcceptRun,
    ]);
    assert.deepEqual(
      dismissFirstResolutions.flatMap((result) =>
        result.status === "rejected"
          ? [
              result.reason instanceof Error
                ? result.reason.message
                : "unknown rejection",
            ]
          : [],
      ),
      [],
    );
    assert.equal(
      (
        await prisma.captureReviewProposal.findUniqueOrThrow({
          where: { id: dismissedProposal.id },
        })
      ).status,
      "dismissed",
    );
    assert.equal(
      await prisma.captureRoutingFeedback.count({
        where: { proposalId: dismissedProposal.id },
      }),
      1,
    );
    assert.equal(
      await prisma.task.count({ where: { captureId: dismissedCapture.id } }),
      0,
      "a stale acceptance cannot create a destination after dismissal wins",
    );

    const firstFallbackTurn = await agentChat.createFallbackAssistantTurn({
      question: "What is due?",
    });
    assert.deepEqual(firstFallbackTurn.history, []);
    await agentChat.completeFallbackAssistantTurn(
      firstFallbackTurn.assistantMessageId,
      "Nothing is due today.",
    );
    const followUpFallbackTurn = await agentChat.createFallbackAssistantTurn({
      question: "What about tomorrow?",
      threadId: firstFallbackTurn.threadId,
    });
    assert.deepEqual(followUpFallbackTurn.history, [
      { role: "user", content: "What is due?" },
      { role: "assistant", content: "Nothing is due today." },
    ]);
    await agentChat.failFallbackAssistantTurn(
      followUpFallbackTurn.assistantMessageId,
      "integration fixture",
    );

    const interruptedFallbackTurn = await agentChat.createFallbackAssistantTurn(
      {
        question: "Will this interrupted turn recover?",
      },
    );
    await prisma.chatMessage.update({
      where: { id: interruptedFallbackTurn.assistantMessageId },
      data: {
        updatedAt: new Date(
          Date.now() - agentChat.FALLBACK_TURN_STALE_MS - 1_000,
        ),
      },
    });
    const recoveredFallbackTurn = await agentChat.createFallbackAssistantTurn({
      question: "Continue after the interruption.",
      threadId: interruptedFallbackTurn.threadId,
    });
    assert.equal(
      (
        await prisma.chatMessage.findUniqueOrThrow({
          where: { id: interruptedFallbackTurn.assistantMessageId },
        })
      ).status,
      "failed",
    );
    await agentChat.failFallbackAssistantTurn(
      recoveredFallbackTurn.assistantMessageId,
      "integration fixture",
    );

    const previousAssistantFlag = process.env.HOME_BASE_CODEX_ASSISTANT_ENABLED;
    let terminalTurn: Awaited<ReturnType<typeof agentChat.createAssistantTurn>>;
    try {
      process.env.HOME_BASE_CODEX_ASSISTANT_ENABLED = "true";
      terminalTurn = await agentChat.createAssistantTurn({
        question: "Exercise terminal lease reconciliation.",
      });
    } finally {
      if (previousAssistantFlag === undefined) {
        delete process.env.HOME_BASE_CODEX_ASSISTANT_ENABLED;
      } else {
        process.env.HOME_BASE_CODEX_ASSISTANT_ENABLED = previousAssistantFlag;
      }
    }
    const terminalJob = await prisma.agentJob.update({
      where: { chatMessageId: terminalTurn.turnId },
      data: { maxAttempts: 1 },
    });
    const terminalClaim = await claimAgentJob({
      role: "assistant",
      leaseOwner: "terminal-reconciliation",
    });
    assert.equal(terminalClaim?.job.id, terminalJob.id);
    await prisma.agentJob.update({
      where: { id: terminalJob.id },
      data: { leaseExpiresAt: new Date(0) },
    });
    assert.equal(
      await claimAgentJob({
        role: "assistant",
        leaseOwner: "after-terminal-reconciliation",
      }),
      null,
    );
    assert.equal(
      (
        await prisma.chatMessage.findUniqueOrThrow({
          where: { id: terminalTurn.turnId },
        })
      ).status,
      "failed",
    );

    console.log("agent queue PostgreSQL integration passed");
    console.log(
      "- worker model provenance persisted through job, proposal, and feedback",
    );
    console.log(
      "- Project and global sorter suggestions accepted their exact destinations",
    );
    console.log(
      "- concurrent proposal resolution committed one immutable outcome",
    );
    console.log(
      "- dismiss-first resolution prevented stale conversion side effects",
    );
    console.log("- resolved proposals rejected later snooze attempts");
    console.log(
      "- fallback chat retained only canonical server-owned thread history",
    );
    console.log(
      "- stale fallbacks and terminal jobs released pending chat turns",
    );
  } finally {
    if (barrierHeld) {
      await control.query("SELECT pg_advisory_unlock($1::bigint)", [
        proposalBarrierKey,
      ]);
    }
    await dropProposalBarrier().catch(() => undefined);
    await control.end().catch(() => undefined);
    await prisma.$disconnect().catch(() => undefined);
  }
}

void main().then(
  () => process.exit(0),
  (error) => {
    console.error(
      error instanceof Error ? error.message : "Integration test failed.",
    );
    process.exit(1);
  },
);
