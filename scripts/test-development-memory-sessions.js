const assert = require("node:assert");
const { mkdtempSync, rmSync, existsSync, unlinkSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const capture = require("../companion/memory/events/capture");
const { createDevelopmentEventStore } = require("../companion/memory/events/event-store");
const { createDevelopmentSessionManager } = require("../companion/memory/events/session-manager");
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

function makeTempDirs() {
  const dir = mkdtempSync(join(tmpdir(), "locaily-dm-session-"));
  return {
    dir,
    eventsDir: join(dir, "events"),
    sessionsRoot: join(dir, "sessions")
  };
}

async function run() {
  const checks = [
    ["startSession creates valid open manifest with marker event", async () => {
      const { dir, eventsDir, sessionsRoot } = makeTempDirs();
      const manager = createDevelopmentSessionManager({ eventsDir, sessionsRoot, project: "locaily" });
      const started = manager.startSession({ objectiveId: "dm4-test", runId: "run_1", branch: "main", label: "unit test" });
      assert.strictEqual(started.ok, true);
      assert.strictEqual(started.result.status, "open");
      assert.ok(started.result.sessionId.startsWith("sess_"));
      assert.ok(started.result.summary.linkedEventIds.length >= 1);

      const store = createDevelopmentEventStore({ dataDir: eventsDir });
      const marker = await store.getEvent(started.result.summary.linkedEventIds[0]);
      assert.strictEqual(marker.ok, true);
      assert.strictEqual(marker.result.correlation.sessionId, started.result.sessionId);

      rmSync(dir, { recursive: true, force: true });
    }],
    ["closeSession aggregates captured events deterministically", async () => {
      const { dir, eventsDir, sessionsRoot } = makeTempDirs();
      const manager = createDevelopmentSessionManager({ eventsDir, sessionsRoot, project: "locaily" });
      const started = manager.startSession({ objectiveId: "dm4-close", runId: "run_close", branch: "main" });
      assert.strictEqual(started.ok, true);

      capture.init({ project: "locaily", dataDir: eventsDir, sessionsRoot });
      capture.emitTaskAccepted({
        projectRoot: ROOT,
        objectiveId: "dm4-close",
        taskId: "task-1",
        runId: "run_close",
        iteration: 0
      });
      await sleep(400);

      const closed = await manager.closeSession({ sessionId: started.result.sessionId });
      assert.strictEqual(closed.ok, true);
      assert.strictEqual(closed.result.status, "closed");
      assert.ok(closed.result.metrics.tasksCompleted >= 1);
      assert.ok(closed.result.summary.text.includes("Tasks completed"));
      assert.ok(closed.result.eventIds.length >= 2);

      rmSync(dir, { recursive: true, force: true });
    }],
    ["starting a new session marks the prior open session interrupted", async () => {
      const { dir, eventsDir, sessionsRoot } = makeTempDirs();
      const manager = createDevelopmentSessionManager({ eventsDir, sessionsRoot, project: "locaily" });
      const first = manager.startSession({ objectiveId: "first", runId: "run_a" });
      const second = manager.startSession({ objectiveId: "second", runId: "run_b" });
      assert.strictEqual(first.ok, true);
      assert.strictEqual(second.ok, true);

      const status = await manager.getStatus();
      assert.strictEqual(status.result.activeSessionId, second.result.sessionId);

      const { createDevelopmentSessionStore } = require("../companion/memory/events/session-store");
      const sessionStore = createDevelopmentSessionStore({ rootDir: sessionsRoot });
      const firstClosed = sessionStore.readManifest(first.result.sessionId);
      assert.strictEqual(firstClosed.status, "interrupted");

      rmSync(dir, { recursive: true, force: true });
    }],
    ["recoverInterruptedSessions closes orphaned open manifests", async () => {
      const { dir, eventsDir, sessionsRoot } = makeTempDirs();
      const manager = createDevelopmentSessionManager({ eventsDir, sessionsRoot, project: "locaily" });
      const started = manager.startSession({ objectiveId: "orphan", runId: "run_orphan" });
      assert.strictEqual(started.ok, true);

      const { createDevelopmentSessionStore } = require("../companion/memory/events/session-store");
      const sessionStore = createDevelopmentSessionStore({ rootDir: sessionsRoot });
      unlinkSync(sessionStore.getActiveSessionPath());

      const recovered = await manager.recoverInterruptedSessions();
      assert.strictEqual(recovered.ok, true);
      assert.ok(recovered.result.recovered.includes(started.result.sessionId));

      const manifest = sessionStore.readManifest(started.result.sessionId);
      assert.strictEqual(manifest.status, "interrupted");

      rmSync(dir, { recursive: true, force: true });
    }],
    ["rebuildSession refreshes manifest from source events without deleting evidence", async () => {
      const { dir, eventsDir, sessionsRoot } = makeTempDirs();
      const manager = createDevelopmentSessionManager({ eventsDir, sessionsRoot, project: "locaily" });
      const started = manager.startSession({ objectiveId: "rebuild", runId: "run_rebuild" });
      assert.strictEqual(started.ok, true);

      capture.init({ project: "locaily", dataDir: eventsDir, sessionsRoot });
      capture.emitTaskAccepted({
        projectRoot: ROOT,
        objectiveId: "rebuild",
        taskId: "task-1",
        runId: "run_rebuild",
        iteration: 0
      });
      await sleep(400);

      const closed = await manager.closeSession({ sessionId: started.result.sessionId });
      assert.strictEqual(closed.ok, true);
      assert.strictEqual(closed.result.metrics.tasksCompleted, 1);

      const eventStore = createDevelopmentEventStore({ dataDir: eventsDir });
      const beforeCount = (await eventStore.queryEvents({ project: "locaily", limit: 1000 })).result.totalMatched;

      const lateEvent = {
        eventId: buildStableEventId(["rebuild", "task-2", "run_rebuild"]),
        schemaVersion: "1.0",
        project: "locaily",
        eventType: "task_accepted",
        occurredAt: closed.result.startedAt,
        capturedAt: new Date().toISOString(),
        source: { adapter: "controller" },
        summary: "Task accepted for rebuild coverage.",
        artifacts: [],
        validation: { sourceVerified: true, status: "accepted" },
        sensitivity: "internal",
        correlation: {
          runId: "run_rebuild",
          objectiveId: "rebuild",
          taskId: "task-2",
          sessionId: started.result.sessionId
        }
      };
      const appended = await eventStore.appendEvent(lateEvent);
      assert.strictEqual(appended.ok, true);

      const rebuilt = await manager.rebuildSession({ sessionId: started.result.sessionId });
      assert.strictEqual(rebuilt.ok, true);
      assert.ok(rebuilt.result.metrics.tasksCompleted >= 2);

      const afterCount = (await eventStore.queryEvents({ project: "locaily", limit: 1000 })).result.totalMatched;
      assert.strictEqual(beforeCount + 1, afterCount);

      rmSync(dir, { recursive: true, force: true });
    }]
  ];

  for (const [name, fn] of checks) {
    await check(name, fn);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
