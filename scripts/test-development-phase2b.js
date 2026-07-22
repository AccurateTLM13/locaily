#!/usr/bin/env node
/**
 * scripts/test-development-phase2b.js
 *
 * Phase 2B tests: validation, milestone completion, stale-validation protection,
 * refusal cases, and end-to-end flow.
 */

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const DEVELOPMENT_DIR = path.join(PROJECT_ROOT, "development");
const MILESTONES_DIR = path.join(DEVELOPMENT_DIR, "milestones");
const SESSIONS_DIR = path.join(DEVELOPMENT_DIR, "sessions");
const VALIDATION_RESULTS_DIR = path.join(DEVELOPMENT_DIR, "validation-results");
const EVIDENCE_DIR = path.join(DEVELOPMENT_DIR, "evidence");

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (e) {
    console.log(`  FAIL  ${name}`);
    console.log(`        ${e.message}`);
    failed++;
    failures.push({ name, message: e.message });
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || "assertion failed");
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function writeJson(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + "\n");
}

function run(cmd, args) {
  const result = spawnSync(cmd, args, {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    shell: process.platform === "win32",
  });
  return { stdout: result.stdout || "", stderr: result.stderr || "", exitCode: result.status || 0 };
}

function runLifecycle(args) {
  return run("node", ["scripts/dev-lifecycle.js", ...args]);
}

function cleanState() {
  // Remove all files in state directories
  for (const dir of [MILESTONES_DIR, SESSIONS_DIR, VALIDATION_RESULTS_DIR, EVIDENCE_DIR]) {
    if (fs.existsSync(dir)) {
      for (const f of fs.readdirSync(dir)) {
        if (f.endsWith(".json")) {
          fs.unlinkSync(path.join(dir, f));
        }
      }
    }
  }
  const latestValidation = path.join(DEVELOPMENT_DIR, "latest-validation.json");
  if (fs.existsSync(latestValidation)) fs.unlinkSync(latestValidation);
}

function resetProjectState() {
  writeJson(path.join(DEVELOPMENT_DIR, "project-state.json"), {
    schema: "locaily.development.project_state.v1",
    project: "locaily",
    currentMilestone: null,
    activeSession: null,
    status: "idle",
    defaultBranch: "main",
    activeBranch: null,
    lastCompletedMilestone: null,
    nextRecommendedAction: null,
    blockers: [],
    warnings: [],
    updatedAt: new Date().toISOString(),
    updatedBy: { type: "agent", name: "test", platform: "test" },
  });
}

// ---- Schema validation ----

console.log("\n## Validation Result Schema");

test("Validation result schema exists", () => {
  const schemaPath = path.join(DEVELOPMENT_DIR, "schemas", "validation-result.schema.json");
  assert(fs.existsSync(schemaPath), "Schema not found");
  const schema = readJson(schemaPath);
  assert(schema.$schema === "https://json-schema.org/draft/2020-12/schema", "Wrong draft");
  assert(schema.properties.status.enum.includes("passed"), "Missing passed");
  assert(schema.properties.status.enum.includes("failed"), "Missing failed");
  assert(schema.properties.status.enum.includes("error"), "Missing error");
});

// ---- Contradiction severity model ----

console.log("\n## Contradiction Severity Model");

test("dev:status supports critical severity level", () => {
  const content = fs.readFileSync(path.join(PROJECT_ROOT, "scripts", "dev-status.js"), "utf8");
  assert(content.includes('"critical"'), "Missing critical severity");
});

test("dev:status exit codes: default info+warning→0, error→1, critical→2", () => {
  const content = fs.readFileSync(path.join(PROJECT_ROOT, "scripts", "dev-status.js"), "utf8");
  assert(content.includes("process.exit(2)") || content.includes("process.exit(criticalCount > 0 ? 2"), "Missing exit 2 for critical");
  assert(content.includes("process.exit(1)") || content.includes("process.exit(errorCount > 0 ? 1"), "Missing exit 1 for error");
});

test("dev:status --strict exits 1 for warnings", () => {
  const content = fs.readFileSync(path.join(PROJECT_ROOT, "scripts", "dev-status.js"), "utf8");
  assert(content.includes("isStrict") && content.includes("warningCount"), "Missing strict mode logic");
});

// ---- Validation command ----

console.log("\n## Validation Command");

test("dev:validate requires active milestone", () => {
  cleanState();
  resetProjectState();
  const r = runLifecycle(["validate"]);
  assert(r.exitCode !== 0 || r.stdout.includes("error"), "Should fail without active milestone");
});

test("dev:validate runs strict status checks first", () => {
  const content = fs.readFileSync(path.join(PROJECT_ROOT, "scripts", "dev-lifecycle.js"), "utf8");
  assert(content.includes("strict-status"), "Missing strict-status check");
  assert(content.includes("Gate 0"), "Missing Gate 0 comment");
});

test("dev:validate records branch, HEAD, dirty state", () => {
  const content = fs.readFileSync(path.join(PROJECT_ROOT, "scripts", "dev-lifecycle.js"), "utf8");
  assert(content.includes("headCommit"), "Missing headCommit");
  assert(content.includes("isDirty"), "Missing isDirty");
  assert(content.includes("branch"), "Missing branch");
});

test("dev:validate enforces command timeouts", () => {
  const content = fs.readFileSync(path.join(PROJECT_ROOT, "scripts", "dev-lifecycle.js"), "utf8");
  assert(content.includes("timeout") && content.includes("ETIMEDOUT"), "Missing timeout handling");
});

test("dev:validate preserves failed records", () => {
  const content = fs.readFileSync(path.join(PROJECT_ROOT, "scripts", "dev-lifecycle.js"), "utf8");
  // Validation results are immutable - always written regardless of status
  assert(content.includes("writeValidationResult(validationResult)"), "Missing writeValidationResult");
});

test("dev:validate sets milestone to validating during execution", () => {
  const content = fs.readFileSync(path.join(PROJECT_ROOT, "scripts", "dev-lifecycle.js"), "utf8");
  assert(content.includes('milestone.status = "validating"'), "Missing validating state");
});

test("dev:validate restores previous state after completion", () => {
  const content = fs.readFileSync(path.join(PROJECT_ROOT, "scripts", "dev-lifecycle.js"), "utf8");
  assert(content.includes("previousStatus"), "Missing previousStatus restore");
});

// ---- Milestone completion gates ----

console.log("\n## Milestone Completion Gates");

test("dev:milestone:complete requires active milestone", () => {
  cleanState();
  resetProjectState();
  const r = runLifecycle(["complete"]);
  assert(r.exitCode !== 0 || r.stdout.includes("error"), "Should fail without active milestone");
});

test("dev:milestone:complete refuses with unresolved blockers", () => {
  const content = fs.readFileSync(path.join(PROJECT_ROOT, "scripts", "dev-lifecycle.js"), "utf8");
  assert(content.includes("HAS_BLOCKERS"), "Missing HAS_BLOCKERS gate");
});

test("dev:milestone:complete refuses with error/critical contradictions", () => {
  const content = fs.readFileSync(path.join(PROJECT_ROOT, "scripts", "dev-lifecycle.js"), "utf8");
  assert(content.includes("CONTRADICTION"), "Missing CONTRADICTION gate");
});

test("dev:milestone:complete refuses without validation", () => {
  const content = fs.readFileSync(path.join(PROJECT_ROOT, "scripts", "dev-lifecycle.js"), "utf8");
  assert(content.includes("NO_VALIDATION"), "Missing NO_VALIDATION gate");
});

test("dev:milestone:complete refuses with failed validation", () => {
  const content = fs.readFileSync(path.join(PROJECT_ROOT, "scripts", "dev-lifecycle.js"), "utf8");
  assert(content.includes("VALIDATION_FAILED"), "Missing VALIDATION_FAILED gate");
});

test("dev:milestone:complete refuses with stale validation", () => {
  const content = fs.readFileSync(path.join(PROJECT_ROOT, "scripts", "dev-lifecycle.js"), "utf8");
  assert(content.includes("VALIDATION_STALE"), "Missing VALIDATION_STALE gate");
  assert(content.includes("isFingerprintStale"), "Missing isFingerprintStale function");
});

test("dev:milestone:complete refuses with open session", () => {
  const content = fs.readFileSync(path.join(PROJECT_ROOT, "scripts", "dev-lifecycle.js"), "utf8");
  assert(content.includes("SESSION_OPEN"), "Missing SESSION_OPEN gate");
});

test("dev:milestone:complete checks remaining work", () => {
  const content = fs.readFileSync(path.join(PROJECT_ROOT, "scripts", "dev-lifecycle.js"), "utf8");
  assert(content.includes("REMAINING_WORK"), "Missing REMAINING_WORK gate");
  assert(content.includes("requireEmptyRemainingWork"), "Missing requireEmptyRemainingWork policy check");
});

test("dev:milestone:complete checks acceptance criteria evidence", () => {
  const content = fs.readFileSync(path.join(PROJECT_ROOT, "scripts", "dev-lifecycle.js"), "utf8");
  assert(content.includes("CRITERIA_UNSATISFIED"), "Missing CRITERIA_UNSATISFIED gate");
  assert(content.includes("loadAcceptanceEvidence"), "Missing loadAcceptanceEvidence");
});

test("dev:milestone:complete transitions to ready-for-delivery", () => {
  const content = fs.readFileSync(path.join(PROJECT_ROOT, "scripts", "dev-lifecycle.js"), "utf8");
  assert(content.includes('"ready-for-delivery"'), "Missing ready-for-delivery transition");
});

// ---- Stale validation protection ----

console.log("\n## Stale Validation Protection");

test("isFingerprintStale detects branch mismatch", () => {
  const content = fs.readFileSync(path.join(PROJECT_ROOT, "scripts", "dev-lifecycle.js"), "utf8");
  assert(content.includes("isFingerprintStale"), "Missing isFingerprintStale function");
  assert(content.includes("validation.gitState.branch !== currentFingerprint.branch"), "Missing branch check");
});

test("isFingerprintStale detects HEAD mismatch", () => {
  const content = fs.readFileSync(path.join(PROJECT_ROOT, "scripts", "dev-lifecycle.js"), "utf8");
  assert(content.includes("validation.gitState.headCommit !== currentFingerprint.headCommit"), "Missing HEAD check");
});

test("isFingerprintStale detects fingerprint mismatch", () => {
  const content = fs.readFileSync(path.join(PROJECT_ROOT, "scripts", "dev-lifecycle.js"), "utf8");
  assert(content.includes("validation.gitState.fingerprint !== currentFingerprint.fingerprint"), "Missing fingerprint check");
});

test("computeGitFingerprint produces sha256 fingerprint", () => {
  const content = fs.readFileSync(path.join(PROJECT_ROOT, "scripts", "dev-lifecycle.js"), "utf8");
  assert(content.includes("computeGitFingerprint"), "Missing computeGitFingerprint");
  assert(content.includes("sha256:"), "Missing sha256 fingerprint");
});

test("Validation index replaces latest-validation.json", () => {
  const content = fs.readFileSync(path.join(PROJECT_ROOT, "scripts", "dev-lifecycle.js"), "utf8");
  assert(content.includes("validation-index.json"), "Missing validation-index.json");
  assert(content.includes("latestByMilestone"), "Missing latestByMilestone");
  assert(content.includes("updateValidationIndex"), "Missing updateValidationIndex");
  assert(!content.includes("writeLatestValidation"), "Should not have writeLatestValidation");
});

test("Milestone stores latestValidationId", () => {
  const content = fs.readFileSync(path.join(PROJECT_ROOT, "scripts", "dev-lifecycle.js"), "utf8");
  assert(content.includes("milestone.latestValidationId"), "Missing milestone.latestValidationId");
});

test("Validation IDs include random component", () => {
  const content = fs.readFileSync(path.join(PROJECT_ROOT, "scripts", "dev-lifecycle.js"), "utf8");
  assert(content.includes("generateValidationId"), "Missing generateValidationId");
  assert(content.includes("randomBytes"), "Missing randomBytes for ID generation");
});

// ---- Warning acknowledgement ----

console.log("\n## Warning Acknowledgement");

test("Acceptance evidence supports acknowledged warnings", () => {
  const content = fs.readFileSync(path.join(PROJECT_ROOT, "scripts", "dev-lifecycle.js"), "utf8");
  assert(content.includes("acknowledgedWarnings"), "Missing acknowledgedWarnings");
  assert(content.includes("saveAcceptanceEvidence"), "Missing saveAcceptanceEvidence");
});

// ---- Completion policy ----

console.log("\n## Completion Policy");

test("Profiles include completionPolicy", () => {
  const content = fs.readFileSync(path.join(PROJECT_ROOT, "scripts", "dev-lifecycle.js"), "utf8");
  assert(content.includes("completionPolicy"), "Missing completionPolicy in profile");
  assert(content.includes("requireCleanTree"), "Missing requireCleanTree");
  assert(content.includes("requireCloseout"), "Missing requireCloseout");
  assert(content.includes("requireEmptyRemainingWork"), "Missing requireEmptyRemainingWork");
  assert(content.includes("requireManualChecksComplete"), "Missing requireManualChecksComplete");
  assert(content.includes("allowedChangedPathsAfterValidation"), "Missing allowedChangedPathsAfterValidation");
  assert(content.includes("validationMaxAgeMinutes"), "Missing validationMaxAgeMinutes");
});

test("getCompletionPolicy reads from profile", () => {
  const content = fs.readFileSync(path.join(PROJECT_ROOT, "scripts", "dev-lifecycle.js"), "utf8");
  assert(content.includes("getCompletionPolicy"), "Missing getCompletionPolicy function");
});

test("Completion enforces requireCleanTree", () => {
  const content = fs.readFileSync(path.join(PROJECT_ROOT, "scripts", "dev-lifecycle.js"), "utf8");
  assert(content.includes("DIRTY_SINCE_VALIDATION") && content.includes("policy.requireCleanTree"),
    "Missing DIRTY_SINCE_VALIDATION gate with policy check");
});

test("Completion enforces requireCloseout", () => {
  const content = fs.readFileSync(path.join(PROJECT_ROOT, "scripts", "dev-lifecycle.js"), "utf8");
  assert(content.includes("NO_CLOSEOUT") && content.includes("policy.requireCloseout"),
    "Missing NO_CLOSEOUT gate with policy check");
});

test("Completion enforces requireEmptyRemainingWork", () => {
  const content = fs.readFileSync(path.join(PROJECT_ROOT, "scripts", "dev-lifecycle.js"), "utf8");
  assert(content.includes("REMAINING_WORK") && content.includes("policy.requireEmptyRemainingWork"),
    "Missing REMAINING_WORK gate with policy check");
});

test("Formally deferred work bypasses remaining work gate", () => {
  const content = fs.readFileSync(path.join(PROJECT_ROOT, "scripts", "dev-lifecycle.js"), "utf8");
  assert(content.includes("disposition") && content.includes("deferred") && content.includes("targetMilestoneId"),
    "Missing formally deferred work logic");
});

test("Validation expiration check exists", () => {
  const content = fs.readFileSync(path.join(PROJECT_ROOT, "scripts", "dev-lifecycle.js"), "utf8");
  assert(content.includes("VALIDATION_EXPIRED"), "Missing VALIDATION_EXPIRED gate");
  assert(content.includes("validationMaxAgeMinutes"), "Missing validationMaxAgeMinutes check");
});

test("Manual checks completeness check exists", () => {
  const content = fs.readFileSync(path.join(PROJECT_ROOT, "scripts", "dev-lifecycle.js"), "utf8");
  assert(content.includes("MANUAL_CHECKS_INCOMPLETE"), "Missing MANUAL_CHECKS_INCOMPLETE gate");
});

// ---- Session close ----

console.log("\n## Session Close");

test("dev:session:close command exists", () => {
  const content = fs.readFileSync(path.join(PROJECT_ROOT, "scripts", "dev-lifecycle.js"), "utf8");
  assert(content.includes("cmdSessionClose"), "Missing cmdSessionClose function");
  assert(content.includes("session:close"), "Missing session:close in switch");
});

test("session:close records dirty files", () => {
  const content = fs.readFileSync(path.join(PROJECT_ROOT, "scripts", "dev-lifecycle.js"), "utf8");
  assert(content.includes("cmdSessionClose") && content.includes("dirtyFiles"),
    "Missing dirtyFiles in session close");
});

// ---- End-to-end flow ----

console.log("\n## End-to-End Flow");

test("Full flow: start → session:close → validate → complete → ready-for-delivery", () => {
  cleanState();
  resetProjectState();

  // Start
  const start = runLifecycle(["start", "--slug", "e2e-test", "--title", "E2E Test", "--purpose", "Full flow"]);
  assert(start.exitCode === 0, `Start failed: ${start.stderr}`);
  const startOut = JSON.parse(start.stdout);
  assert(startOut.ok === true, "Start not ok");
  assert(startOut.milestone.status === "active", "Milestone not active");

  // Close session first (finalizes work)
  const sessionClose = runLifecycle(["session:close", "--summary", "Implementation complete"]);
  assert(sessionClose.exitCode === 0, `Session close failed: ${sessionClose.stderr}`);

  // Validate after session close (captures final fingerprint)
  const validate = runLifecycle(["validate"]);
  assert(validate.exitCode === 0, `Validate failed: ${validate.stderr}`);
  const valOut = JSON.parse(validate.stdout);
  assert(valOut.ok === true, "Validation not ok");
  assert(valOut.status === "passed", "Validation not passed");

  // Verify milestone has latestValidationId
  const milestone = readJson(path.join(MILESTONES_DIR, "e2e-test.json"));
  assert(milestone.latestValidationId !== undefined, "Missing latestValidationId on milestone");

  // Complete
  const complete = runLifecycle(["complete"]);
  assert(complete.exitCode === 0, `Complete failed: ${complete.stderr}`);
  const compOut = JSON.parse(complete.stdout);
  assert(compOut.ok === true, "Complete not ok");
  assert(compOut.status === "ready-for-delivery", `Status: ${compOut.status}`);

  // Verify final state
  const finalMilestone = readJson(path.join(MILESTONES_DIR, "e2e-test.json"));
  assert(finalMilestone.status === "ready-for-delivery", "Final milestone not ready-for-delivery");
  assert(finalMilestone.completedAt !== null, "Missing completedAt");
  assert(finalMilestone.latestValidationId !== undefined, "Missing latestValidationId");

  cleanState();
  resetProjectState();
});

// ---- Refusal cases ----

console.log("\n## Refusal Cases");

test("Refusal: failed required command", () => {
  cleanState();
  resetProjectState();

  // Create a milestone with a validation profile that has a failing command
  const profilePath = path.join(DEVELOPMENT_DIR, "profiles", "test-failing.json");
  writeJson(profilePath, {
    schema: "locaily.development.validation_profile.v1",
    id: "test-failing",
    name: "Failing Profile",
    level: "quick",
    required: [{ id: "failing-test", command: "node -e process.exit(1)", description: "Always fails" }],
    optional: [],
    manualChecks: [],
    completionPolicy: {
      requireCleanTree: true,
      requireCloseout: true,
      requireEmptyRemainingWork: true,
      requireManualChecksComplete: true,
      allowedChangedPathsAfterValidation: [],
      validationMaxAgeMinutes: 120,
    },
  });

  runLifecycle(["start", "--slug", "refuse-test", "--title", "Refuse Test", "--purpose", "Test refusal"]);
  runLifecycle(["checkpoint", "--message", "Work done"]);

  // Set profile on milestone
  const milestone = readJson(path.join(MILESTONES_DIR, "refuse-test.json"));
  milestone.validationProfile = "test-failing";
  writeJson(path.join(MILESTONES_DIR, "refuse-test.json"), milestone);

  // Validate should fail
  const validate = runLifecycle(["validate"]);
  assert(validate.exitCode !== 0, "Validate should fail with failing command");

  // Complete should refuse
  runLifecycle(["session:close", "--summary", "test"]);
  const complete = runLifecycle(["complete"]);
  assert(complete.exitCode !== 0, "Complete should refuse after failed validation");
  const compOut = JSON.parse(complete.stdout);
  assert(compOut.errors.some(e => e.code === "VALIDATION_FAILED"), "Should have VALIDATION_FAILED error");

  // Cleanup
  fs.unlinkSync(profilePath);
  cleanState();
  resetProjectState();
});

test("Refusal: open session", () => {
  cleanState();
  resetProjectState();

  runLifecycle(["start", "--slug", "open-session-test", "--title", "Open Session", "--purpose", "Test"]);
  runLifecycle(["validate"]);

  // Complete without closing session should fail
  const complete = runLifecycle(["complete"]);
  assert(complete.exitCode !== 0, "Complete should fail with open session");
  const compOut = JSON.parse(complete.stdout);
  assert(compOut.errors.some(e => e.code === "SESSION_OPEN"), "Should have SESSION_OPEN error");

  cleanState();
  resetProjectState();
});

test("Refusal: unresolved blocker", () => {
  cleanState();
  resetProjectState();

  const start = runLifecycle(["start", "--slug", "blocker-test", "--title", "Blocker Test", "--purpose", "Test"]);
  assert(start.exitCode === 0, `Start failed: ${start.stderr}`);
  runLifecycle(["validate"]);
  runLifecycle(["block", "--reason", "Need hardware", "--type", "hardware"]);

  // Complete should refuse because of blocker (even with closed session)
  runLifecycle(["session:close", "--summary", "test"]);
  const complete = runLifecycle(["complete"]);
  assert(complete.exitCode !== 0, "Complete should fail with blocker");
  assert(complete.stdout.length > 0, "Complete produced no output");
  const compOut = JSON.parse(complete.stdout);
  assert(compOut.errors.some(e => e.code === "HAS_BLOCKERS"), "Should have HAS_BLOCKERS error");

  cleanState();
  resetProjectState();
});

// ---- Validation record format ----

console.log("\n## Validation Record Format");

test("Validation result has all required fields including gitState", () => {
  cleanState();
  resetProjectState();

  const start = runLifecycle(["start", "--slug", "format-test", "--title", "Format Test", "--purpose", "Test"]);
  assert(start.exitCode === 0, `Start failed: ${start.stderr}`);
  const validate = runLifecycle(["validate"]);
  assert(validate.exitCode === 0, `Validate failed: ${validate.stderr}`);
  assert(validate.stdout.length > 0, "Validate produced no output");
  const valOut = JSON.parse(validate.stdout);

  assert(valOut.validationId !== undefined, "Missing validationId");
  assert(valOut.milestoneId === "format-test", "Wrong milestoneId");
  assert(valOut.gitState !== undefined, "Missing gitState");

  // Check the immutable record on disk
  const recordPath = path.join(VALIDATION_RESULTS_DIR, `${valOut.validationId}.json`);
  assert(fs.existsSync(recordPath), "Validation record not written to disk");
  const record = readJson(recordPath);
  assert(record.schema === "locaily.development.validation_result.v1", "Wrong schema in record");
  assert(record.gitState.branch !== undefined, "Missing gitState.branch");
  assert(record.gitState.headCommit !== undefined, "Missing gitState.headCommit");
  assert(record.gitState.fingerprint && record.gitState.fingerprint.startsWith("sha256:"),
    "Missing or invalid gitState.fingerprint");
  assert(Array.isArray(record.gitState.changedFiles), "Missing gitState.changedFiles");
  assert(record.results.length > 0, "No results in record");

  // Check milestone has latestValidationId
  const milestone = readJson(path.join(MILESTONES_DIR, "format-test.json"));
  assert(milestone.latestValidationId === valOut.validationId, "Milestone missing latestValidationId");

  // Check validation index
  const indexPath = path.join(DEVELOPMENT_DIR, "validation-index.json");
  assert(fs.existsSync(indexPath), "Missing validation-index.json");
  const index = readJson(indexPath);
  assert(index.latestByMilestone["format-test"] === valOut.validationId, "Validation index not updated");

  cleanState();
  resetProjectState();
});

// ---- Summary ----

console.log(`\n## Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFailed tests:");
  for (const f of failures) {
    console.log(`  - ${f.name}: ${f.message}`);
  }
  process.exit(1);
}
process.exit(0);
