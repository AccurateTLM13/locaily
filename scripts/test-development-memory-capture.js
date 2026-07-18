const assert = require("node:assert");
const { mkdtempSync, rmSync, readFileSync, existsSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const capture = require("../companion/memory/events/capture");
const { createDevelopmentEventStore } = require("../companion/memory/events/event-store");
const { buildStableEventId } = require("../companion/memory/events/capture/event-id");

const ROOT = join(__dirname, "..");

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  const checks = [
    ["buildStableEventId is deterministic", () => {
      const first = buildStableEventId(["locaily", "objective_started", "demo"]);
      const second = buildStableEventId(["locaily", "objective_started", "demo"]);
      assert.strictEqual(first, second);
      assert.ok(first.startsWith("evt_"));
    }],
    ["controller adapter emits objective_started", async () => {
      const dir = mkdtempSync(join(tmpdir(), "locaily-dm-capture-"));
      const dataDir = join(dir, "events");
      capture.init({ project: "locaily", dataDir });
      capture.emitObjectiveStarted({
        projectRoot: ROOT,
        objectiveId: "dm3-capture-test",
        runId: "run_capture_test",
        baseCommit: "abc123"
      });
      await sleep(400);
      const store = createDevelopmentEventStore({ dataDir });
      const result = await store.queryEvents({ project: "locaily", eventType: "objective_started" });
      assert.ok(result.result.count >= 1, "objective_started event missing");
      rmSync(dir, { recursive: true, force: true });
    }],
    ["supervisor adapter emits task lifecycle events", async () => {
      const dir = mkdtempSync(join(tmpdir(), "locaily-dm-capture-"));
      const dataDir = join(dir, "events");
      capture.init({ project: "locaily", dataDir });
      capture.emitTaskDispatched({
        projectRoot: ROOT,
        objectiveId: "dm3-capture-test",
        taskId: "task-1",
        runId: "run_1",
        iteration: 0
      });
      capture.emitTaskAccepted({
        projectRoot: ROOT,
        objectiveId: "dm3-capture-test",
        taskId: "task-1",
        runId: "run_1",
        iteration: 0
      });
      await sleep(400);
      const store = createDevelopmentEventStore({ dataDir });
      const dispatched = await store.queryEvents({ eventType: "task_dispatched", taskId: "task-1" });
      const accepted = await store.queryEvents({ eventType: "task_accepted", taskId: "task-1" });
      assert.strictEqual(dispatched.result.count, 1);
      assert.strictEqual(accepted.result.count, 1);
      rmSync(dir, { recursive: true, force: true });
    }],
    ["worker adapter emits blocker and test events", async () => {
      const dir = mkdtempSync(join(tmpdir(), "locaily-dm-capture-"));
      const dataDir = join(dir, "events");
      capture.init({ project: "locaily", dataDir });
      capture.emitWorkerValidationCompleted({
        projectRoot: ROOT,
        objectiveId: "dm3-capture-test",
        taskId: "task-2",
        runId: "run_2",
        workerResult: {
          blocker: "tests failed",
          tests: [{ status: "fail", command: "node scripts/test.js" }]
        }
      });
      await sleep(400);
      const store = createDevelopmentEventStore({ dataDir });
      const blockers = await store.queryEvents({ eventType: "blocker_recorded", taskId: "task-2" });
      const tests = await store.queryEvents({ eventType: "test_completed", taskId: "task-2" });
      assert.strictEqual(blockers.result.count, 1);
      assert.strictEqual(tests.result.count, 1);
      rmSync(dir, { recursive: true, force: true });
    }],
    ["duplicate capture uses stable event ids", async () => {
      const dir = mkdtempSync(join(tmpdir(), "locaily-dm-capture-"));
      const dataDir = join(dir, "events");
      capture.init({ project: "locaily", dataDir });
      capture.emitObjectiveBlocked({
        projectRoot: ROOT,
        objectiveId: "dup-test",
        runId: "run_dup",
        blocker: "same blocker"
      });
      capture.emitObjectiveBlocked({
        projectRoot: ROOT,
        objectiveId: "dup-test",
        runId: "run_dup",
        blocker: "same blocker"
      });
      await sleep(400);
      const store = createDevelopmentEventStore({ dataDir });
      const result = await store.queryEvents({ eventType: "objective_blocked", objectiveId: "dup-test" });
      assert.strictEqual(result.result.count, 1);
      rmSync(dir, { recursive: true, force: true });
    }],
    ["memory:decision CLI records decision_recorded", async () => {
      const dir = mkdtempSync(join(tmpdir(), "locaily-dm-decision-"));
      const dataDir = join(dir, "events");

      const script = spawnSync(
        process.execPath,
        [
          join(ROOT, "scripts", "memory-decision.js"),
          "--project", "locaily",
          "--data-dir", dataDir,
          "--title", "Keep proposal-only writeback as default",
          "--reason", "Protect user-controlled memory"
        ],
        {
          cwd: ROOT,
          encoding: "utf8"
        }
      );

      assert.strictEqual(script.status, 0, script.stderr || script.stdout);
      const store = createDevelopmentEventStore({ dataDir });
      const result = await store.queryEvents({ eventType: "decision_recorded", limit: 20 });
      const match = (result.result.events || []).find((event) => event.summary.includes("Keep proposal-only writeback"));
      assert.ok(match, "decision event not found");
      rmSync(dir, { recursive: true, force: true });
    }],
    ["capture failures are logged without throwing", async () => {
      const dir = mkdtempSync(join(tmpdir(), "locaily-dm-capture-"));
      const dataDir = join(dir, "events");
      const failureLog = join(dataDir, "capture-failures.jsonl");
      capture.init({ project: "locaily", dataDir, failureLogPath: failureLog });
      const result = await capture.recordCaptureEvent({
        eventType: "not_a_real_type",
        summary: "should fail schema",
        source: { adapter: "human" },
        idParts: ["bad", "event"]
      });
      assert.strictEqual(result.ok, false);
      assert.ok(existsSync(failureLog));
      const lines = readFileSync(failureLog, "utf8").trim().split("\n");
      assert.ok(lines.length >= 1);
      rmSync(dir, { recursive: true, force: true });
    }]
  ];

  for (const [name, fn] of checks) {
    await check(name, fn);
  }

  console.log(`\n${passed}/${passed + failed} development memory capture tests passed`);
  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
