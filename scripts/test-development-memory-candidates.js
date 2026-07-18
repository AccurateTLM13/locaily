const assert = require("node:assert");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const capture = require("../companion/memory/events/capture");
const { createDevelopmentSessionManager } = require("../companion/memory/events/session-manager");
const { createDevelopmentCandidateManager } = require("../companion/memory/events/candidate-manager");
const { createDevelopmentCandidateStore } = require("../companion/memory/events/candidate-store");
const { extractCandidatesFromSession } = require("../companion/memory/events/candidate-extractor");
const { validateResult } = require("../companion/core/result-validator");
const candidateSchema = require("../companion/schemas/development-memory-candidate.schema.json");

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
  const dir = mkdtempSync(join(tmpdir(), "locaily-dm-candidate-"));
  return {
    dir,
    eventsDir: join(dir, "events"),
    sessionsRoot: join(dir, "sessions"),
    candidatesRoot: join(dir, "candidates")
  };
}

async function buildClosedSession({ eventsDir, sessionsRoot, objectiveId, runId, emitFn }) {
  const sessionManager = createDevelopmentSessionManager({ eventsDir, sessionsRoot, project: "locaily" });
  const started = sessionManager.startSession({ objectiveId, runId, branch: "main" });
  assert.strictEqual(started.ok, true);

  capture.init({ project: "locaily", dataDir: eventsDir, sessionsRoot });
  emitFn(started.result.sessionId);

  await sleep(400);

  const closed = await sessionManager.closeSession({ sessionId: started.result.sessionId });
  assert.strictEqual(closed.ok, true);
  return { sessionManager, session: closed.result };
}

async function run() {
  const checks = [
    ["decision_recorded event produces decision candidate", async () => {
      const { dir, eventsDir, sessionsRoot, candidatesRoot } = makeTempDirs();
      const { session } = await buildClosedSession({
        eventsDir,
        sessionsRoot,
        objectiveId: "dm5-decision",
        runId: "run_decision",
        emitFn: () => {
          capture.emitDecisionRecorded({
            projectRoot: ROOT,
            projectSlug: "locaily",
            title: "Keep proposal-only writeback",
            reason: "Until DM6 review inbox ships"
          });
        }
      });

      const manager = createDevelopmentCandidateManager({ eventsDir, sessionsRoot, candidatesRoot });
      const extracted = await manager.extractFromSession({ sessionId: session.sessionId });
      assert.strictEqual(extracted.ok, true);
      assert.ok(extracted.result.savedCount >= 1);

      const listed = manager.listCandidates({ sessionId: session.sessionId });
      const decision = listed.result.candidates.find((candidate) => candidate.candidateType === "decision");
      assert.ok(decision, "decision candidate missing");
      assert.ok(decision.proposedStatement.includes("Keep proposal-only writeback"));

      const validation = validateResult(decision, candidateSchema, decision.candidateId);
      assert.strictEqual(validation.ok, true);

      rmSync(dir, { recursive: true, force: true });
    }],
    ["duplicate extraction is surfaced without creating a second candidate file", async () => {
      const { dir, eventsDir, sessionsRoot, candidatesRoot } = makeTempDirs();
      const { session } = await buildClosedSession({
        eventsDir,
        sessionsRoot,
        objectiveId: "dm5-dup",
        runId: "run_dup",
        emitFn: () => {
          capture.emitDecisionRecorded({
            projectRoot: ROOT,
            projectSlug: "locaily",
            title: "Duplicate test decision",
            reason: "Same wording"
          });
        }
      });

      const manager = createDevelopmentCandidateManager({ eventsDir, sessionsRoot, candidatesRoot });
      const first = await manager.extractFromSession({ sessionId: session.sessionId });
      const second = await manager.extractFromSession({ sessionId: session.sessionId });

      assert.strictEqual(first.ok, true);
      assert.strictEqual(second.ok, true);
      assert.ok(second.result.duplicateCount >= 1);
      assert.strictEqual(second.result.savedCount, 0);

      const listed = manager.listCandidates({ sessionId: session.sessionId });
      assert.strictEqual(listed.result.count, first.result.savedCount);

      rmSync(dir, { recursive: true, force: true });
    }],
    ["completed and blocked objective evidence surfaces contradiction", async () => {
      const { dir, eventsDir, sessionsRoot, candidatesRoot } = makeTempDirs();
      const sessionManager = createDevelopmentSessionManager({ eventsDir, sessionsRoot, project: "locaily" });
      const started = sessionManager.startSession({ objectiveId: "dm5-contra", runId: "run_contra" });
      capture.init({ project: "locaily", dataDir: eventsDir, sessionsRoot });

      capture.emitObjectiveCompleted({
        projectRoot: ROOT,
        objectiveId: "dm5-contra",
        runId: "run_contra",
        acceptedTaskCount: 1
      });
      capture.emitObjectiveBlocked({
        projectRoot: ROOT,
        objectiveId: "dm5-contra",
        runId: "run_contra",
        blocker: "Conflicting supervisor outcome",
        adapter: "controller"
      });
      await sleep(400);

      const closed = await sessionManager.closeSession({ sessionId: started.result.sessionId });
      assert.strictEqual(closed.ok, true);

      const manager = createDevelopmentCandidateManager({ eventsDir, sessionsRoot, candidatesRoot });
      const extracted = await manager.extractFromSession({ sessionId: closed.result.sessionId });
      assert.strictEqual(extracted.ok, true);
      assert.ok(extracted.result.contradictionCount >= 1);

      const listed = manager.listCandidates({ sessionId: closed.result.sessionId });
      const flagged = listed.result.candidates.filter((candidate) => candidate.contradictionStatus === "possible");
      assert.ok(flagged.length >= 2);

      rmSync(dir, { recursive: true, force: true });
    }],
    ["extractCandidatesFromSession links every candidate to evidence events", async () => {
      const { dir, eventsDir, sessionsRoot } = makeTempDirs();
      const { session } = await buildClosedSession({
        eventsDir,
        sessionsRoot,
        objectiveId: "dm5-evidence",
        runId: "run_evidence",
        emitFn: () => {
          capture.emitTaskRejected({
            projectRoot: ROOT,
            objectiveId: "dm5-evidence",
            taskId: "task-1",
            runId: "run_evidence",
            iteration: 0,
            reason: "Needs redesign"
          });
        }
      });

      const sessionManager = createDevelopmentSessionManager({ eventsDir, sessionsRoot });
      const events = await sessionManager.gatherSessionEvents(session);
      const candidates = extractCandidatesFromSession(session, events);

      assert.ok(candidates.length >= 1);
      for (const candidate of candidates) {
        assert.ok(candidate.evidenceEventIds.length >= 1);
        assert.ok(candidate.evidenceEventIds.every((eventId) => eventId.startsWith("evt_")));
      }

      rmSync(dir, { recursive: true, force: true });
    }],
    ["candidate store persists schema-valid records", async () => {
      const { dir, candidatesRoot } = makeTempDirs();
      const store = createDevelopmentCandidateStore({ rootDir: candidatesRoot });
      const candidate = {
        candidateId: "cand_test_schema_valid",
        schemaVersion: "1.0",
        candidateType: "lesson",
        proposedStatement: "Deterministic extraction works without Ollama.",
        confidence: 0.9,
        evidenceEventIds: ["evt_test_schema_valid"],
        targetProject: "locaily",
        suggestedVaultPath: "projects/locaily/LESSONS.md",
        suggestedOperation: "append",
        contradictionStatus: "none",
        reviewRisk: "medium",
        generatedBy: { method: "deterministic" },
        createdAt: new Date().toISOString()
      };

      const saved = store.saveCandidate(candidate);
      assert.strictEqual(saved.ok, true);
      assert.ok(store.readCandidate(candidate.candidateId));

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
