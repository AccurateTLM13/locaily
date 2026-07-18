const assert = require("node:assert");
const { mkdtempSync, rmSync, writeFileSync, mkdirSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const {
  createDevelopmentCaptureProcessor,
  createDevelopmentCaptureWorker,
  configureCaptureGate,
  init,
  emitDecisionRecorded,
  emitObjectiveCompleted
} = require("../companion/memory/events/capture");
const { createDevelopmentSessionManager } = require("../companion/memory/events/session-manager");
const { createDevelopmentEventStore } = require("../companion/memory/events/event-store");
const { createDevelopmentCandidateStore } = require("../companion/memory/events/candidate-store");
const { buildContextPack } = require("../companion/memory/context-pack-builder");
const { createVaultAdapter } = require("../companion/memory/vault-adapter");
const validPolicy = require("../companion/schemas/fixtures/development-memory/capture-policy.valid.json");

let passed = 0;
let failed = 0;

function check(name, fn) {
  return (async () => {
    try {
      await fn();
      passed += 1;
      console.log(`PASS: ${name}`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL: ${name}`);
      console.error(`  ${error.message}`);
    }
  })();
}

function makeSuiteRoot() {
  return mkdtempSync(join(tmpdir(), "locaily-dm-capture-processor-"));
}

function writeEnabledPolicy(processorRoot, project = "locaily") {
  mkdirSync(processorRoot, { recursive: true });
  writeFileSync(
    join(processorRoot, "capture-policy.json"),
    `${JSON.stringify({ ...validPolicy, enabled: true, project }, null, 2)}\n`,
    "utf8"
  );
}

function makeProcessor(root, { idleSessionCloseMs = 1000 } = {}) {
  const processorRoot = join(root, "capture");
  writeEnabledPolicy(processorRoot);

  configureCaptureGate({
    project: "locaily",
    policyPath: join(processorRoot, "capture-policy.json"),
    captureEnabled: true,
    paused: false
  });

  return createDevelopmentCaptureProcessor({
    project: "locaily",
    eventsDir: join(root, "events"),
    sessionsRoot: join(root, "sessions"),
    candidatesRoot: join(root, "candidates"),
    maintainerRoot: join(root, "maintainer"),
    processorRoot,
    idleSessionCloseMs
  });
}

async function seedClosedSession(root) {
  const eventsDir = join(root, "events");
  const sessionsRoot = join(root, "sessions");
  const sessionManager = createDevelopmentSessionManager({
    project: "locaily",
    eventsDir,
    sessionsRoot
  });
  const eventStore = createDevelopmentEventStore({ dataDir: eventsDir });

  init({ project: "locaily", dataDir: eventsDir, sessionsRoot, captureEnabled: true });

  const started = sessionManager.startSession({ objectiveId: "dm9-processor-test", runId: "run_dm9" });
  assert.strictEqual(started.ok, true);

  emitObjectiveCompleted({
    projectRoot: join(__dirname, ".."),
    objectiveId: "dm9-processor-test",
    runId: "run_dm9",
    acceptedTaskCount: 1
  });

  emitDecisionRecorded({
    projectRoot: join(__dirname, ".."),
    projectSlug: "locaily",
    title: "Keep capture processing non-blocking",
    reason: "Background worker should extract candidates after close."
  });

  await new Promise((resolve) => setTimeout(resolve, 250));

  const closed = await sessionManager.closeSession({ sessionId: started.result.sessionId });
  assert.strictEqual(closed.ok, true);

  const events = await eventStore.queryEvents({ project: "locaily" });
  assert.ok(events.result.count >= 2);

  return closed.result.sessionId;
}

async function run() {
  const checks = [
    ["status exposes DM9 capture fields", async () => {
      const root = makeSuiteRoot();
      const processor = makeProcessor(root);
      const status = await processor.getStatus();

      assert.strictEqual(status.ok, true);
      assert.ok(Object.prototype.hasOwnProperty.call(status.result, "captureEnabled"));
      assert.ok(Object.prototype.hasOwnProperty.call(status.result, "lastEventAt"));
      assert.ok(Object.prototype.hasOwnProperty.call(status.result, "unprocessedEvents"));
      assert.ok(Object.prototype.hasOwnProperty.call(status.result, "openSessions"));
      assert.ok(Object.prototype.hasOwnProperty.call(status.result, "pendingCandidates"));
      assert.ok(Object.prototype.hasOwnProperty.call(status.result, "pendingHumanReview"));
      assert.ok(Object.prototype.hasOwnProperty.call(status.result, "lastSuccessfulWritebackAt"));
      assert.ok(Array.isArray(status.result.warnings));
      assert.strictEqual(status.result.retrievalEnabled, true);

      rmSync(root, { recursive: true, force: true });
    }],
    ["pause capture skips recording without blocking retrieval", async () => {
      const root = makeSuiteRoot();
      const processor = makeProcessor(root);
      const vaultRoot = mkdtempSync(join(tmpdir(), "locaily-dm9-vault-"));
      mkdirSync(join(vaultRoot, "projects", "locaily"), { recursive: true });
      writeFileSync(join(vaultRoot, "index.md"), "# Vault\n");
      writeFileSync(join(vaultRoot, "projects", "locaily", "STATUS.md"), "# Status\n");

      await processor.pauseCapture();

      init({
        project: "locaily",
        dataDir: join(root, "events"),
        sessionsRoot: join(root, "sessions"),
        captureEnabled: true
      });

      const { recordCaptureEvent } = require("../companion/memory/events/capture/recorder");
      const skipped = await recordCaptureEvent({
        eventType: "decision_recorded",
        summary: "Should be skipped while paused.",
        source: { adapter: "memory" },
        idParts: ["locaily", "decision_recorded", "paused", "1"]
      });

      assert.strictEqual(skipped.skipped, true);
      assert.strictEqual(skipped.reason, "capture_paused");

      const adapter = createVaultAdapter({
        enabled: true,
        vaultPath: vaultRoot,
        allowedPaths: ["index.md", "projects/"],
        blockedPaths: ["raw/"]
      });

      const pack = buildContextPack(adapter, { project: "locaily", task: "Verify retrieval while paused" });
      assert.strictEqual(pack.ok, true);

      rmSync(root, { recursive: true, force: true });
      rmSync(vaultRoot, { recursive: true, force: true });
    }],
    ["processOnce extracts candidates idempotently from closed sessions", async () => {
      const root = makeSuiteRoot();
      const processor = makeProcessor(root);
      const sessionId = await seedClosedSession(root);

      const first = await processor.processOnce();
      assert.strictEqual(first.ok, true);
      assert.ok(first.result.extractedSessions.some((entry) => entry.sessionId === sessionId));

      const candidateStore = createDevelopmentCandidateStore({ rootDir: join(root, "candidates") });
      const afterFirst = candidateStore.listCandidates({ project: "locaily" });
      assert.ok(afterFirst.length >= 1);

      const second = await processor.processOnce();
      assert.strictEqual(second.ok, true);
      const duplicateRun = second.result.extractedSessions.find((entry) => entry.sessionId === sessionId);
      assert.ok(!duplicateRun || duplicateRun.idempotent === true || second.result.extractedSessions.length === 0);

      const afterSecond = candidateStore.listCandidates({ project: "locaily" });
      assert.strictEqual(afterSecond.length, afterFirst.length);

      rmSync(root, { recursive: true, force: true });
    }],
    ["processor state survives restart and remains idempotent", async () => {
      const root = makeSuiteRoot();
      const sessionId = await seedClosedSession(root);

      const processorA = makeProcessor(root);
      const first = await processorA.processOnce();
      assert.strictEqual(first.ok, true);

      const processorB = makeProcessor(root);
      const state = processorB.getProcessorStore().readState();
      assert.ok(state.extractedSessionIds.includes(sessionId));

      const second = await processorB.processOnce();
      assert.strictEqual(second.ok, true);
      assert.strictEqual(second.result.extractedSessions.length, 0);

      rmSync(root, { recursive: true, force: true });
    }],
    ["background worker tick is non-blocking and updates status", async () => {
      const root = makeSuiteRoot();
      const processor = makeProcessor(root);
      await seedClosedSession(root);

      const worker = createDevelopmentCaptureWorker({
        processor,
        pollIntervalMs: 100000
      });

      await worker.tick();
      const status = worker.getStatus();
      assert.strictEqual(status.isProcessing, false);
      assert.ok(status.lastResult);
      assert.strictEqual(status.lastResult.ok, true);

      rmSync(root, { recursive: true, force: true });
    }]
  ];

  for (const [name, fn] of checks) {
    await check(name, fn);
  }

  console.log(`\nCapture processor tests: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
