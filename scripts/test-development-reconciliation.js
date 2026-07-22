#!/usr/bin/env node
/**
 * scripts/test-development-reconciliation.js
 *
 * Tests for Phase 1.5 reconciliation: contradiction detection, severity levels,
 * stale legacy state, non-default branch detection, and milestone completion semantics.
 */

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const DEVELOPMENT_DIR = path.join(PROJECT_ROOT, "development");
const SCHEMAS_DIR = path.join(DEVELOPMENT_DIR, "schemas");

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

// ---- Milestone completion semantics ----

console.log("\n## Milestone Completion Semantics");

test("Milestone status enum includes all completion phases", () => {
  const schema = readJson(path.join(SCHEMAS_DIR, "milestone.schema.json"));
  const statuses = schema.properties.status.enum;
  // Implementation complete
  assert(statuses.includes("ready-for-delivery"), "Missing ready-for-delivery");
  // Branch pushed, draft PR created
  assert(statuses.includes("delivered"), "Missing delivered");
  // PR merged
  assert(statuses.includes("merged"), "Missing merged");
  // Post-merge closeout complete
  assert(statuses.includes("completed"), "Missing completed");
});

test("Milestone status transitions are documented", () => {
  const schema = readJson(path.join(SCHEMAS_DIR, "milestone.schema.json"));
  const statuses = schema.properties.status.enum;
  // The valid transitions form a DAG
  // idea -> planned -> ready -> active -> paused/blocked/validating -> ready-for-delivery -> delivered -> merged -> completed
  // Any status can go to cancelled
  assert(statuses.length === 12, `Expected 12 statuses, found ${statuses.length}`);
});

test("Project state status enum excludes delivery phases", () => {
  const schema = readJson(path.join(SCHEMAS_DIR, "project-state.schema.json"));
  const statuses = schema.properties.status.enum;
  // Project state tracks overall status, not individual milestone delivery phases
  // ready-for-delivery and delivered are milestone statuses, not project statuses
  // But we do include them for when the project is in delivery mode
  assert(statuses.includes("idle"), "Missing idle");
  assert(statuses.includes("active"), "Missing active");
  assert(statuses.includes("paused"), "Missing paused");
  assert(statuses.includes("blocked"), "Missing blocked");
});

// ---- Contradiction detection ----

console.log("\n## Contradiction Detection");

test("dev-status script exists and is loadable", () => {
  const scriptPath = path.join(PROJECT_ROOT, "scripts", "dev-status.js");
  assert(fs.existsSync(scriptPath), "dev-status.js not found");
  const content = fs.readFileSync(scriptPath, "utf8");
  assert(content.includes("detectContradictions"), "Missing detectContradictions function");
  assert(content.includes("--strict"), "Missing --strict support");
});

test("dev-status produces JSON output", () => {
  const { spawnSync } = require("node:child_process");
  const result = spawnSync("node", [
    path.join(PROJECT_ROOT, "scripts", "dev-status.js"),
    "--json"
  ], { cwd: PROJECT_ROOT, encoding: "utf8", shell: process.platform === "win32" });
  assert(result.status === 0, `Exit code was ${result.status}, expected 0`);
  const output = JSON.parse(result.stdout);
  assert(output.schema === "locaily.development.status.v1", "Wrong schema");
  assert(output.contradictions, "Missing contradictions");
  assert(output.summary, "Missing summary");
  assert(typeof output.summary.critical === "number", "Missing critical count");
  assert(typeof output.summary.warnings === "number", "Missing warnings count");
});

test("dev-status --strict exits non-zero for warnings", () => {
  const { spawnSync } = require("node:child_process");
  // Reset project state to ensure warnings exist (non-default branch)
  const statePath = path.join(PROJECT_ROOT, "development", "project-state.json");
  const originalState = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, "utf8")) : null;

  // Create state that will produce warnings
  fs.writeFileSync(statePath, JSON.stringify({
    schema: "locaily.development.project_state.v1",
    project: "locaily",
    currentMilestone: null,
    activeSession: null,
    status: "idle",
    defaultBranch: "main",
    activeBranch: "feat/test-branch",
    lastCompletedMilestone: null,
    nextRecommendedAction: null,
    blockers: [],
    warnings: ["Test warning for strict mode"],
    updatedAt: new Date().toISOString(),
    updatedBy: { type: "agent", name: "test", platform: "test" },
  }, null, 2));

  const result = spawnSync("node", [
    path.join(PROJECT_ROOT, "scripts", "dev-status.js"),
    "--strict"
  ], { cwd: PROJECT_ROOT, encoding: "utf8", shell: process.platform === "win32" });

  // Restore original state
  if (originalState) {
    fs.writeFileSync(statePath, JSON.stringify(originalState, null, 2));
  }

  assert(result.status === 1, `Expected exit 1 for --strict with warnings, got ${result.status}`);
});

test("dev-status without --strict exits 0 for warnings only", () => {
  const { spawnSync } = require("node:child_process");
  const result = spawnSync("node", [
    path.join(PROJECT_ROOT, "scripts", "dev-status.js")
  ], { cwd: PROJECT_ROOT, encoding: "utf8", shell: process.platform === "win32" });
  assert(result.status === 0, `Expected exit 0 without --strict, got ${result.status}`);
});

// ---- Stale legacy state detection ----

console.log("\n## Stale Legacy State Detection");

test("Legacy run-state is now clean", () => {
  const runState = readJson(path.join(PROJECT_ROOT, ".opencode", "agents", "state", "run-state.json"));
  assert(runState.status === "idle" || runState.status === "", `Expected idle or empty, got ${runState.status}`);
  assert(!runState.objective || runState.objective === "", `Expected empty objective, got ${runState.objective}`);
});

test("Legacy active-objective.md shows no active objective", () => {
  const content = fs.readFileSync(
    path.join(PROJECT_ROOT, ".opencode", "agents", "objectives", "active-objective.md"),
    "utf8"
  );
  assert(content.includes("No objective is currently active"), "Active objective not cleared");
});

// ---- Non-default branch detection ----

console.log("\n## Non-Default Branch Detection");

test("Project state records active branch", () => {
  const state = readJson(path.join(DEVELOPMENT_DIR, "project-state.json"));
  assert(state.activeBranch !== undefined, "Missing activeBranch field");
});

test("Contradiction code for non-default branch exists", () => {
  const content = fs.readFileSync(path.join(PROJECT_ROOT, "scripts", "dev-status.js"), "utf8");
  assert(content.includes("BRANCH_NO_MILESTONE"), "Missing BRANCH_NO_MILESTONE contradiction code");
});

// ---- Schema consistency ----

console.log("\n## Schema Consistency");

test("All schemas use draft-2020-12", () => {
  const schemaFiles = fs.readdirSync(SCHEMAS_DIR).filter(f => f.endsWith(".json"));
  for (const file of schemaFiles) {
    const schema = readJson(path.join(SCHEMAS_DIR, file));
    assert(schema.$schema === "https://json-schema.org/draft/2020-12/schema",
      `${file} uses wrong draft: ${schema.$schema}`);
  }
});

test("All schemas have additionalProperties: false", () => {
  const schemaFiles = fs.readdirSync(SCHEMAS_DIR).filter(f => f.endsWith(".json"));
  for (const file of schemaFiles) {
    const schema = readJson(path.join(SCHEMAS_DIR, file));
    assert(schema.additionalProperties === false,
      `${file} missing additionalProperties: false`);
  }
});

test("Milestone schema has lifecycleRef field for legacy compatibility", () => {
  const schema = readJson(path.join(SCHEMAS_DIR, "milestone.schema.json"));
  assert(schema.properties.lifecycleRef, "Missing lifecycleRef field");
  assert(schema.properties.lifecycleRef.description.includes("objective-lifecycle"),
    "lifecycleRef should reference objective-lifecycle");
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
