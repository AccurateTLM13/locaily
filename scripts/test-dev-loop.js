#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  classifyRunState,
  dependencyProblems,
  eligibility,
  parseCliArgs,
  selectMilestone,
} = require("./dev-loop");
const {
  parseArgs: parseSequencerArgs,
  renderDevelopmentObjective,
} = require("../.opencode/agents/controller/sequencer");
const { validateResult } = require("../companion/core/result-validator");

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`PASS: ${name}`);
}

function milestone(id, status, extra = {}) {
  return {
    schema: "locaily.development.milestone.v1",
    id,
    title: id,
    status,
    priority: "medium",
    type: "infrastructure",
    purpose: `Build ${id}`,
    scope: { included: ["one"], excluded: ["two"] },
    acceptanceCriteria: [{ id: "ac", description: "Works", status: "pending", evidence: [] }],
    dependencies: [],
    blockers: [],
    createdAt: "2026-07-30T00:00:00.000Z",
    ...extra,
  };
}

test("active milestone is selected before ready work", () => {
  const selected = selectMilestone([milestone("ready-one", "ready"), milestone("active-one", "active")]);
  assert.equal(selected.ok, true);
  assert.equal(selected.milestone.id, "active-one");
});

test("multiple active milestones stop the runner", () => {
  const selected = selectMilestone([milestone("active-a", "active"), milestone("active-b", "active")]);
  assert.equal(selected.ok, false);
  assert.equal(selected.stopReason, "multiple_active");
});

test("ready milestones are ordered by priority then creation", () => {
  const selected = selectMilestone([
    milestone("low", "ready", { priority: "low" }),
    milestone("critical-new", "ready", { priority: "critical", createdAt: "2026-07-31T00:00:00.000Z" }),
    milestone("critical-old", "ready", { priority: "critical", createdAt: "2026-07-29T00:00:00.000Z" }),
  ]);
  assert.equal(selected.milestone.id, "critical-old");
});

test("planned CTK-02 and DBVT work are not runnable", () => {
  const selected = selectMilestone([
    milestone("ctk-02-node-roles-capability-capsules", "planned", { priority: "critical" }),
    milestone("dbvt-seo-audit", "planned", { priority: "critical" }),
  ]);
  assert.equal(selected.ok, false);
  assert.equal(selected.stopReason, "no_eligible_work");
});

test("blocked ready milestone is not runnable", () => {
  const selected = selectMilestone([
    milestone("blocked", "ready", {
      blockers: [{ id: "b", type: "decision-required", description: "Wait", resolutionCondition: "Approve" }],
    }),
  ]);
  assert.equal(selected.ok, false);
  assert.equal(selected.stopReason, "no_eligible_work");
});

test("invalid active milestone stops before execution", () => {
  const invalid = milestone("invalid", "active");
  delete invalid.scope;
  const selected = selectMilestone([invalid]);
  assert.equal(selected.ok, false);
  assert.equal(selected.stopReason, "invalid_manifest");
});

test("incomplete dependency blocks selection", () => {
  const dependency = milestone("dependency", "paused");
  const candidate = milestone("candidate", "ready", { dependencies: ["dependency"] });
  const selected = selectMilestone([dependency, candidate], "candidate");
  assert.equal(selected.ok, false);
  assert.equal(selected.stopReason, "dependencies");
  assert.equal(selected.dependencyIssues[0].reason, "status:paused");
});

test("merged dependency satisfies eligibility", () => {
  const dependency = milestone("dependency", "merged");
  const candidate = milestone("candidate", "ready", { dependencies: ["dependency"] });
  const byId = new Map([[dependency.id, dependency], [candidate.id, candidate]]);
  assert.equal(dependencyProblems(candidate, byId).length, 0);
  assert.equal(eligibility(candidate, byId).eligible, true);
});

test("completed supervisor state stops at delivery approval", () => {
  assert.deepEqual(classifyRunState({ status: "complete", objective_complete: true }), {
    complete: true,
    stopReason: "approval_required",
  });
});

test("failure and held states stop without advancing", () => {
  assert.equal(classifyRunState({ status: "failed", blocker: "tests" }).stopReason, "failed");
  assert.equal(classifyRunState({ status: "held" }).stopReason, "held");
  assert.equal(classifyRunState({ status: "budget_exhausted" }).stopReason, "budget_exhausted");
});

test("CLI parsers preserve explicit milestone selection", () => {
  assert.deepEqual(parseCliArgs(["--dry-run", "--slug", "dev-loop-01"]), {
    dryRun: true,
    slug: "dev-loop-01",
  });
  assert.deepEqual(parseSequencerArgs(["--milestone", "dev-loop-01", "--stay-on-worker"]), {
    milestoneId: "dev-loop-01",
    stayOnWorker: true,
  });
});

test("canonical milestone renders into existing objective contract", () => {
  const rendered = renderDevelopmentObjective(milestone("canonical", "active"));
  assert.match(rendered, /Objective ID: canonical/);
  assert.match(rendered, /## Acceptance Criteria/);
  assert.match(rendered, /Do not push, merge, or broaden scope/);
});

test("sequencer has no tracked reset or forced branch deletion", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", ".opencode", "agents", "controller", "sequencer.js"), "utf8");
  assert.doesNotMatch(source, /checkout["'],\s*["']--["'],\s*["']\.["']/);
  assert.doesNotMatch(source, /branch["'],\s*["']-D["']/);
  assert.doesNotMatch(source, /rmSync/);
  assert.match(source, /collectDevelopmentEntries/);
  assert.match(source, /if \(!complete\) break/);
});

test("dev loop creates local branches but never publishes or merges", () => {
  const source = fs.readFileSync(path.join(__dirname, "dev-loop.js"), "utf8");
  assert.match(source, /switch", "-c"/);
  assert.doesNotMatch(source, /\["push"/);
  assert.doesNotMatch(source, /pull.?request/i);
  assert.doesNotMatch(source, /\["merge"/);
});

test("completed runs preserve closeout and lifecycle gates before approval", () => {
  const source = fs.readFileSync(path.join(__dirname, "dev-loop.js"), "utf8");
  for (const required of [
    "writeCloseout",
    "\"checkpoint\"",
    "\"session:close\"",
    "\"agent-review.js\"",
    "\"prepare\"",
    "\"validate\"",
    "\"complete\"",
    "Commit completion evidence",
    "\"--stay-on-worker\"",
    "approval_required",
  ]) {
    assert.match(source, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("delivery accepts only control-plane commits after validated source HEAD", () => {
  const source = fs.readFileSync(path.join(__dirname, "deliver-milestone.js"), "utf8");
  assert.match(source, /isControlPlaneOnlyAdvance/);
  assert.match(source, /file\.startsWith\("development\/"\)/);
  assert.match(source, /file\.startsWith\("\.opencode\/"\)/);
  assert.doesNotMatch(source, /fp\.update\(treeHash\)/);
});

test("package exposes the safe runner and includes its regression suite", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json")));
  assert.equal(pkg.scripts["dev:loop"], "node scripts/dev-loop.js");
  assert.equal(pkg.scripts["test:dev-loop"], "node scripts/test-dev-loop.js");
  assert.match(pkg.scripts["test:full"], /test:dev-loop/);
});

test("modified canonical development records match their schemas", () => {
  const root = path.join(__dirname, "..");
  const milestoneSchema = JSON.parse(fs.readFileSync(path.join(root, "development", "schemas", "milestone.schema.json")));
  for (const name of [
    "ctk-01-capability-trigger-kernel.json",
    "px6-external-validation-program.json",
    "dev-loop-01-canonical-queue-safe-runner.json",
  ]) {
    const record = JSON.parse(fs.readFileSync(path.join(root, "development", "milestones", name)));
    assert.deepEqual(validateResult(record, milestoneSchema).errors, [], `${name} is not schema-valid`);
  }
  const projectSchema = JSON.parse(fs.readFileSync(path.join(root, "development", "schemas", "project-state.schema.json")));
  const projectState = JSON.parse(fs.readFileSync(path.join(root, "development", "project-state.json")));
  assert.deepEqual(validateResult(projectState, projectSchema).errors, [], "project-state is not schema-valid");
});

console.log(`\nDEV-LOOP-01 tests: ${passed} passed, 0 failed`);
