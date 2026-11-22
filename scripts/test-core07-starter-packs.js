#!/usr/bin/env node
/**
 * Acceptance test suite for CORE-07:
 * Five Read-Only Starter Workflow Packs, Strict Read-Only Audit,
 * SDK CLI Parity, Expanded Task Intake Evaluation, Live HTTP Routes,
 * Companion Console Read-Only UI, and Queued SEC-01 Milestone.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const { createPermissionManager } = require("../companion/core/permissions");
const { createModelQualificationLoader } = require("../companion/core/model-qualification-loader");
const { createQualificationResolver } = require("../companion/core/qualification-resolver");
const { createToolRegistry } = require("../companion/tools/registry");
const {
  validateWorkflowPack,
  createWorkflowPackRegistry,
  evaluatePackPermissions,
  evaluatePackQualificationReadiness,
  reloadDefaultWorkflowPacks
} = require("../companion/packs");
const {
  evaluateLabeledDataset,
  buildRunPlan,
  executeRunPlan
} = require("../companion/orchestration");
const { createMockRuntime } = require("../companion/providers/router");

const ROOT = path.resolve(__dirname, "..");
const SDK_PATH = path.join(ROOT, "scripts", "workflow-pack-sdk.js");
const DATASET_PATH = path.join(ROOT, "companion", "schemas", "fixtures", "task-intake-labeled-dataset.json");

const EXPECTED_PACKS = [
  { id: "incident-triage-pack", workflowId: "incident_triage", fields: ["title", "severity", "service", "category", "summary", "markdown"] },
  { id: "pr-diff-review-pack", workflowId: "pr_diff_review", fields: ["title", "category", "files_changed", "sensitive_files", "top_risks", "review_checklist", "suggested_tests", "summary", "markdown"] },
  { id: "ci-failure-triage-pack", workflowId: "ci_failure_triage", fields: ["title", "category", "exit_code", "failing_tests", "error_signatures", "summary", "debug_steps", "markdown"] },
  { id: "issue-triage-pack", workflowId: "issue_triage", fields: ["title", "category", "suggested_priority", "has_repro_steps", "missing_info_questions", "summary", "next_actions", "markdown"] },
  { id: "meeting-notes-pack", workflowId: "meeting_action_plan", fields: ["title", "category", "attendees", "decisions", "action_items", "blockers", "open_questions", "summary", "markdown"] },
  { id: "release-notes-pack", workflowId: "release_notes", fields: ["title", "version", "release_type", "category", "breaking_changes", "highlights", "features", "fixes", "upgrade_notes", "summary", "markdown"] }
];

const NEW_PACKS = EXPECTED_PACKS.slice(1);

let passed = 0;
let failed = 0;

async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`PASS: ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL: ${name}\n  ${err.stack || err.message}`);
  }
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      srv.close(() => resolve(addr.port));
    });
  });
}

function httpJson(baseUrl, method, routePath, body = null) {
  return new Promise((resolve, reject) => {
    const target = new URL(routePath, baseUrl);
    const payload = body !== null ? JSON.stringify(body) : null;
    const req = http.request({
      method,
      hostname: target.hostname,
      port: target.port,
      path: target.pathname + target.search,
      headers: payload ? {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload)
      } : {}
    }, (res) => {
      let raw = "";
      res.on("data", (chunk) => { raw += chunk; });
      res.on("end", () => {
        let parsed = null;
        try { parsed = JSON.parse(raw); } catch {}
        resolve({ status: res.statusCode, body: parsed, raw });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth(baseUrl, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await httpJson(baseUrl, "GET", "/health");
      if (res.status === 200 && res.body && res.body.ok) return res.body;
    } catch {}
    await sleep(300);
  }
  throw new Error(`Timed out waiting for companion server at ${baseUrl}`);
}

async function main() {
  console.log("=== CORE-07 Starter Read-Only Workflow Packs Tests ===\n");

  reloadDefaultWorkflowPacks();
  const registry = createWorkflowPackRegistry();

  await check("AC1: All 6 official starter Workflow Packs load cleanly with zero errors", () => {
    const loadErrors = registry.getLoadErrors();
    assert.equal(loadErrors.length, 0, `Expected 0 pack load errors, got: ${JSON.stringify(loadErrors)}`);
    const packs = registry.listPacks();
    assert(packs.length >= 6, `Expected at least 6 packs, got ${packs.length}`);
    for (const expected of EXPECTED_PACKS) {
      const packDir = path.join(ROOT, "workflow-packs", expected.id);
      const pack = registry.getPack(expected.id);
      assert(pack, `Expected pack '${expected.id}' to load`);
      assert(pack.workflows.includes(expected.workflowId), `Expected workflow '${expected.workflowId}' in '${expected.id}'`);
      const validation = validateWorkflowPack(packDir);
      assert.equal(validation.ok, true, `Validation failed for ${expected.id}: ${validation.errors.join("; ")}`);
    }
  });

  await check("AC2: Strict read-only boundary holds across all 6 installed packs", () => {
    const permManager = createPermissionManager();
    const forbiddenSideEffectPerm = /^(file\.write|shell\.|network\.|credentials\.|memory\.writeback\.apply)/i;
    const forbiddenImportPattern = /\brequire\(\s*["'](?:node:)?(?:fs|fs\/promises|child_process|http|https|net|dgram|tls)["']\s*\)|\bfetch\s*\(/;

    for (const expected of EXPECTED_PACKS) {
      const packDir = path.join(ROOT, "workflow-packs", expected.id);
      const pack = registry.getPack(expected.id);
      assert(pack, `Missing pack '${expected.id}'`);

      const reqPerms = Array.isArray(pack.permissions?.required) ? pack.permissions.required : [];
      const optPerms = Array.isArray(pack.permissions?.optional) ? pack.permissions.optional : [];
      assert.deepEqual(reqPerms, ["model.run"], `${expected.id} required permissions must be strictly ["model.run"]`);
      assert.deepEqual(optPerms, [], `${expected.id} optional permissions must be empty`);

      for (const perm of [...reqPerms, ...optPerms]) {
        assert(!forbiddenSideEffectPerm.test(perm), `${expected.id} declares forbidden permission '${perm}'`);
      }

      const toolManifest = JSON.parse(fs.readFileSync(path.join(packDir, "tools", "tool.json"), "utf8"));
      for (const toolDesc of toolManifest.tools || []) {
        assert.deepEqual(toolDesc.permissions || [], [], `${expected.id} tool '${toolDesc.id}' must declare permissions: []`);
      }

      const toolCode = fs.readFileSync(path.join(packDir, "tools", "index.js"), "utf8");
      assert(!forbiddenImportPattern.test(toolCode), `${expected.id}/tools/index.js must remain pure in-memory without fs/child_process/network imports`);

      const permStatus = evaluatePackPermissions(pack, permManager);
      assert.equal(permStatus.ok, true, `${expected.id} permissions should evaluate ok under default manager`);
    }
  });

  await check("AC3: Every starter pack passes workflow-pack-sdk validate and workflow-pack-sdk test", () => {
    for (const expected of EXPECTED_PACKS) {
      const packDir = path.join(ROOT, "workflow-packs", expected.id);

      const valRun = spawnSync(process.execPath, [SDK_PATH, "validate", packDir], {
        cwd: ROOT,
        encoding: "utf8",
        shell: false
      });
      assert.equal(valRun.status, 0, `pack:validate failed for ${expected.id}: ${valRun.stderr || valRun.stdout}`);
      const valJson = JSON.parse(valRun.stdout);
      assert.equal(valJson.ok, true, `pack:validate returned ok=false for ${expected.id}`);

      const testRun = spawnSync(process.execPath, [SDK_PATH, "test", packDir], {
        cwd: ROOT,
        encoding: "utf8",
        shell: false
      });
      assert.equal(testRun.status, 0, `pack:test failed for ${expected.id}: ${testRun.stderr || testRun.stdout}`);
      const testJson = JSON.parse(testRun.stdout);
      assert.equal(testJson.ok, true, `pack:test returned ok=false for ${expected.id}`);
      assert(testJson.total >= 1 && testJson.passed === testJson.total, `Expected all fixtures to pass for ${expected.id}: ${testRun.stdout}`);
      for (const item of testJson.results) {
        assert.equal(item.schemaValid, true, `${expected.id} fixture '${item.fixture}' schemaValid must be true`);
        assert.deepEqual(item.missingFields, [], `${expected.id} fixture missing fields: ${item.missingFields.join(", ")}`);
      }
    }
  });

  const loader = createModelQualificationLoader();
  const latestCore = Math.max(
    ...loader.list()
      .filter((r) => r.generatedAt && Array.isArray(r.qualifiedFor) && r.qualifiedFor.some((q) => String(q.trackId || "").startsWith("core.")))
      .map((r) => Date.parse(r.generatedAt))
      .filter(Number.isFinite)
  );
  const freshResolver = createQualificationResolver({ loader, now: () => new Date(latestCore + 60_000) });

  await check("AC4: All 5 new packs meet qualification readiness and meeting_action_plan passes core.validate gate", async () => {
    reloadDefaultWorkflowPacks();
    for (const spec of NEW_PACKS) {
      const pack = registry.getPack(spec.id);
      const readiness = evaluatePackQualificationReadiness(pack, freshResolver);
      assert.equal(readiness.ready, true, `${spec.id} qualification readiness should be ready: ${JSON.stringify(readiness)}`);
    }

    const meetingFixture = JSON.parse(
      fs.readFileSync(path.join(ROOT, "workflow-packs", "meeting-notes-pack", "fixtures", "sample-meeting-notes.json"), "utf8")
    );
    const plan = buildRunPlan({ workflowId: "meeting_action_plan", input: meetingFixture.input });
    const exec = await executeRunPlan({
      plan,
      runtime: createMockRuntime(),
      toolRegistry: createToolRegistry(),
      recordOpts: { enabled: false }
    });
    assert.equal(exec.plan.status, "completed");
    assert(exec.result && exec.result.tracks && exec.result.tracks.validate, "Expected core.validate track output on meeting_action_plan");
    assert.equal(exec.result.tracks.validate.valid, true, "Expected core.validate valid=true on meeting_action_plan");
    assert(typeof exec.result.final.markdown === "string" && exec.result.final.markdown.length > 0);
  });

  await check("AC5: Expanded Task Intake labeled dataset (>= 40 cases) achieves >= 90% accuracy, 100% refusal recall, and 0 invented tracks", async () => {
    const dataset = JSON.parse(fs.readFileSync(DATASET_PATH, "utf8"));
    assert(dataset.cases.length >= 40, `Expected >= 40 dataset cases, got ${dataset.cases.length}`);
    const evalSummary = await evaluateLabeledDataset(dataset, {
      toolRegistry: createToolRegistry(),
      qualificationResolver: freshResolver
    });
    const failures = evalSummary.results.filter((r) => !r.passed);
    console.log(
      `  Expanded intake eval: ${evalSummary.correct}/${evalSummary.total} ` +
      `(accuracy=${(evalSummary.accuracy * 100).toFixed(1)}%, refusalRecall=${(evalSummary.refusalRecall * 100).toFixed(1)}%, invented=${evalSummary.inventedCount})`
    );
    assert(evalSummary.accuracy >= 0.90, `Accuracy ${evalSummary.accuracy} < 0.90. Failures: ${JSON.stringify(failures)}`);
    assert.equal(evalSummary.refusalRecall, 1, `Expected 100% refusal recall. Failures: ${JSON.stringify(failures)}`);
    assert.equal(evalSummary.inventedCount, 0, "Expected 0 invented tracks");
  });

  await check("AC6: Live companion server loads all 6 packs, routes all 5 new workflows via /intake/route, executes pr_diff_review & meeting_action_plan, and renders Console read-only pack controls", async () => {
    const port = await findFreePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    const child = spawn(process.execPath, [path.join(ROOT, "companion", "server.js")], {
      cwd: ROOT,
      env: {
        ...process.env,
        LOCAL_AI_HOST: "127.0.0.1",
        LOCAL_AI_PORT: String(port)
      },
      stdio: ["ignore", "pipe", "pipe"]
    });

    try {
      const health = await waitForHealth(baseUrl);
      assert(health.workflowPacks && health.workflowPacks.loaded >= 6, `Expected >= 6 packs in /health, got ${JSON.stringify(health.workflowPacks)}`);
      assert.equal(health.workflowPacks.failed, 0, `Expected 0 failed packs in /health, got ${JSON.stringify(health.workflowPacks)}`);

      const packsRes = await httpJson(baseUrl, "GET", "/packs");
      assert.equal(packsRes.status, 200);
      assert.equal(packsRes.body.ok, true);
      for (const expected of EXPECTED_PACKS) {
        assert(packsRes.body.packs.some((p) => p.id === expected.id), `GET /packs missing '${expected.id}'`);
      }

      const providerRes = await httpJson(baseUrl, "POST", "/providers/set", { provider: "mock" });
      assert.equal(providerRes.status, 200);

      const routingCases = [
        { request: "Review this pull request diff and check for sensitive patch changes", expectedWorkflow: "pr_diff_review" },
        { request: "Triage this CI failure from our GitHub Actions build log showing AssertionError", expectedWorkflow: "ci_failure_triage" },
        { request: "Triage this bug report from a GitHub issue ticket and check repro steps", expectedWorkflow: "issue_triage" },
        { request: "Turn our engineering standup meeting notes and transcript into an action plan", expectedWorkflow: "meeting_action_plan" },
        { request: "Generate release notes and write a changelog from these conventional commits", expectedWorkflow: "release_notes" }
      ];

      for (const tc of routingCases) {
        const routeRes = await httpJson(baseUrl, "POST", "/intake/route", { request: tc.request });
        assert.equal(routeRes.status, 200);
        assert.equal(routeRes.body.ok, true);
        assert.equal(routeRes.body.intake.decision, "selected", `Expected selected for '${tc.request}', got ${JSON.stringify(routeRes.body.intake)}`);
        assert.equal(routeRes.body.intake.selected_workflow.workflow_id, tc.expectedWorkflow);
      }

      const prFixture = JSON.parse(fs.readFileSync(path.join(ROOT, "workflow-packs", "pr-diff-review-pack", "fixtures", "sample-pr-diff.json"), "utf8"));
      const prExec = await httpJson(baseUrl, "POST", "/intake/route", {
        request: "Review this pull request diff for security risks",
        input: prFixture.input,
        options: { execute: true }
      });
      assert.equal(prExec.status, 200, `Expected 200 executing pr_diff_review: ${prExec.raw}`);
      assert.equal(prExec.body.ok, true);
      assert.equal(prExec.body.execution.ok, true);
      assert(typeof prExec.body.execution.result.final.markdown === "string" && prExec.body.execution.result.final.markdown.length > 0);

      const mtgFixture = JSON.parse(fs.readFileSync(path.join(ROOT, "workflow-packs", "meeting-notes-pack", "fixtures", "sample-meeting-notes.json"), "utf8"));
      const mtgExec = await httpJson(baseUrl, "POST", "/intake/route", {
        request: "Turn these meeting notes into a prioritized action plan",
        input: mtgFixture.input,
        options: { execute: true }
      });
      assert.equal(mtgExec.status, 200, `Expected 200 executing meeting_action_plan: ${mtgExec.raw}`);
      assert.equal(mtgExec.body.ok, true);
      assert.equal(mtgExec.body.execution.ok, true);
      assert.equal(mtgExec.body.execution.result.tracks.validate.valid, true);

      const consoleAppRes = await httpJson(baseUrl, "GET", "/console/app.js");
      assert.equal(consoleAppRes.status, 200);
      assert(consoleAppRes.raw.includes("mode: "), "Expected read-only mode chip in Console app.js");
      assert(consoleAppRes.raw.includes("data-pack-workflow"), "Expected Load in Runner button attribute in Console app.js");
    } finally {
      child.kill();
    }
  });

  await check("AC7: SEC-01 central execution-policy runtime gate milestone is registered in development/milestones and roadmap.json", () => {
    const sec01Path = path.join(ROOT, "development", "milestones", "sec-01-execution-policy-runtime-gate.json");
    assert(fs.existsSync(sec01Path), "Expected sec-01-execution-policy-runtime-gate.json to exist");
    const sec01 = JSON.parse(fs.readFileSync(sec01Path, "utf8"));
    assert.equal(sec01.schema, "locaily.development.milestone.v1");
    assert.equal(sec01.id, "sec-01-execution-policy-runtime-gate");
    assert(
      ["planned", "ready", "active", "validating", "ready-for-delivery", "delivered", "completed", "merged"].includes(sec01.status),
      `Expected valid sec-01 status, got '${sec01.status}'`
    );
    assert(Array.isArray(sec01.acceptanceCriteria) && sec01.acceptanceCriteria.length >= 4);

    const roadmap = JSON.parse(fs.readFileSync(path.join(ROOT, "development", "roadmap.json"), "utf8"));
    const localBrain = (roadmap.areas || []).find((a) => a.id === "local-brain");
    const secInit = localBrain && (localBrain.initiatives || []).find((i) => i.id === "central-execution-policy");
    assert(secInit && Array.isArray(secInit.milestoneIds) && secInit.milestoneIds.includes("sec-01-execution-policy-runtime-gate"));
    assert(
      roadmap.milestoneDependencies && Array.isArray(roadmap.milestoneDependencies["sec-01-execution-policy-runtime-gate"]),
      "Expected sec-01 dependency entry in roadmap.json"
    );
  });

  console.log(`\n========================================`);
  console.log(`Passed: ${passed}, Failed: ${failed}`);
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test suite crashed:", err);
  process.exit(1);
});
