#!/usr/bin/env node
/**
 * Acceptance test suite for CORE-06 (Part B):
 * Automatic Task Intake, Uncertainty & Refusal Policy, Anti-Invention Guard,
 * Human-Labeled Evaluation Benchmark, HTTP API, and Console/Shell UI integration.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");

const { validateResult } = require("../companion/core/result-validator");
const { createToolRegistry } = require("../companion/tools/registry");
const { createModelQualificationLoader } = require("../companion/core/model-qualification-loader");
const { createQualificationResolver } = require("../companion/core/qualification-resolver");
const { evaluateTaskIntake, evaluateLabeledDataset } = require("../companion/orchestration");

const ROOT = path.resolve(__dirname, "..");
const INTAKE_SCHEMA = require("../companion/schemas/task-intake-result.schema.json");
const DATASET = JSON.parse(
  fs.readFileSync(path.join(ROOT, "companion", "schemas", "fixtures", "task-intake-labeled-dataset.json"), "utf8")
);

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
  console.log("=== CORE-06 Automatic Task Intake & Track Selection Tests ===\n");

  const toolRegistry = createToolRegistry();
  const loader = createModelQualificationLoader();
  const latestCore = Math.max(
    ...loader.list()
      .filter((r) => r.generatedAt && Array.isArray(r.qualifiedFor) && r.qualifiedFor.some((q) => String(q.trackId || "").startsWith("core.")))
      .map((r) => Date.parse(r.generatedAt))
      .filter(Number.isFinite)
  );
  const freshResolver = createQualificationResolver({ loader, now: () => new Date(latestCore + 60_000) });

  await check("AC1: Deterministic task intake selects built-in and dynamic Workflow Pack workflows and conforms to schema", async () => {
    const rr = await evaluateTaskIntake({
      request: "Review this codebase repository for maintainability and oversized files",
      toolRegistry,
      qualificationResolver: freshResolver
    });
    assert.equal(validateResult(rr, INTAKE_SCHEMA, "intake").ok, true);
    assert.equal(rr.decision, "selected");
    assert.equal(rr.selected_workflow.workflow_id, "repo_review");
    assert.equal(rr.confirmation_required, false);
    assert(rr.selected_tracks.includes("core.classify"));
    assert.equal(rr.capability_check.tracks_resolved, true);

    const inc = await evaluateTaskIntake({
      request: "Triage this sev1 production outage on checkout-api returning 503",
      toolRegistry,
      qualificationResolver: freshResolver
    });
    assert.equal(validateResult(inc, INTAKE_SCHEMA, "intake").ok, true);
    assert.equal(inc.decision, "selected");
    assert.equal(inc.selected_workflow.workflow_id, "incident_triage");
    assert.equal(inc.selected_workflow.pack_id, "incident-triage-pack");
    assert(inc.selected_tracks.includes("incident_triage.parse"));
    assert.equal(inc.capability_check.tools_resolved, true);
  });

  await check("AC2: Ambiguous or moderate-confidence requests return confirm_required with uncertainty reasons", async () => {
    const res = await evaluateTaskIntake({
      request: "Review this markdown document and check its JSON schema",
      toolRegistry,
      qualificationResolver: freshResolver
    });
    assert.equal(validateResult(res, INTAKE_SCHEMA, "intake").ok, true);
    assert.equal(res.decision, "confirm_required");
    assert.equal(res.confirmation_required, true);
    assert(res.uncertainty_reasons.length > 0);
    assert(res.candidates.length >= 2);
  });

  await check("AC3: Unsupported requests are refused cleanly without inventing workflows or tracks", async () => {
    const res = await evaluateTaskIntake({
      request: "Book me a flight to Chicago and order sushi",
      toolRegistry,
      qualificationResolver: freshResolver
    });
    assert.equal(validateResult(res, INTAKE_SCHEMA, "intake").ok, true);
    assert.equal(res.decision, "refused");
    assert.equal(res.selected_workflow, null);
    assert.deepEqual(res.selected_tracks, []);
    assert.equal(res.confirmation_required, false);
  });

  await check("AC4: Optional small classifier is qualification-gated and rejects invented workflow IDs", async () => {
    const hallucinatingRuntime = {
      provider: "mock",
      model: "mock-classifier",
      async generateJson() {
        return { category: "hallucinated_super_track", confidence: 0.99, reason: "Made up track." };
      }
    };

    const antiInventRes = await evaluateTaskIntake({
      request: "Review this codebase repository for maintainability",
      options: { useModelClassifier: true },
      runtime: hallucinatingRuntime,
      toolRegistry,
      qualificationResolver: freshResolver
    });
    assert.equal(antiInventRes.classifier.used, true);
    assert.equal(antiInventRes.classifier.invented_rejected, true);
    assert.equal(antiInventRes.selected_workflow.workflow_id, "repo_review");

    // Stale/unqualified resolver must skip model classifier cleanly
    const staleResolver = createQualificationResolver({ loader, ttlMs: 1, now: () => new Date(latestCore + 60_000) });
    const skippedRes = await evaluateTaskIntake({
      request: "Review this codebase repository for maintainability",
      options: { useModelClassifier: true, requireQualifiedClassifier: true },
      runtime: hallucinatingRuntime,
      toolRegistry,
      qualificationResolver: staleResolver
    });
    assert.equal(skippedRes.classifier.used, false);
    assert.equal(skippedRes.classifier.mode, "skipped_unqualified");
  });

  await check("AC5: Human-labeled dataset (>= 20 cases) achieves >= 90% accuracy, 100% refusal recall, and 0 invented tracks", async () => {
    assert(DATASET.cases.length >= 20, `Expected >= 20 cases, got ${DATASET.cases.length}`);
    const evalSummary = await evaluateLabeledDataset(DATASET, {
      toolRegistry,
      qualificationResolver: freshResolver
    });
    console.log(
      `  Dataset eval: ${evalSummary.correct}/${evalSummary.total} ` +
      `(accuracy=${(evalSummary.accuracy * 100).toFixed(1)}%, refusalRecall=${(evalSummary.refusalRecall * 100).toFixed(1)}%, invented=${evalSummary.inventedCount})`
    );
    assert(evalSummary.accuracy >= 0.90, `Accuracy ${evalSummary.accuracy} < 0.90: ${JSON.stringify(evalSummary.results.filter((r) => !r.passed))}`);
    assert.equal(evalSummary.refusalRecall, 1);
    assert.equal(evalSummary.inventedCount, 0);
  });

  await check("AC6: Live server HTTP endpoints (/health, /packs, /packs/:id, /packs/validate, /intake/route, /workflows/intake) and UI assets work end-to-end", async () => {
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

    let serverStderr = "";
    child.stderr.on("data", (d) => { serverStderr += d.toString(); });
    try {
      const health = await waitForHealth(baseUrl);
      assert(health.workflowPacks && health.workflowPacks.loaded >= 1, "Health should report loaded workflowPacks");
      assert(health.workflowPacks.workflows.includes("incident_triage"));

      // Switch active provider to mock so execution route runs deterministically without live Ollama
      const setProv = await httpJson(baseUrl, "POST", "/providers/set", { provider: "mock" });
      assert.equal(setProv.status, 200);

      const packsRes = await httpJson(baseUrl, "GET", "/packs");
      assert.equal(packsRes.status, 200);
      assert.equal(packsRes.body.ok, true);
      assert(packsRes.body.packs.some((p) => p.id === "incident-triage-pack"));

      const packOne = await httpJson(baseUrl, "GET", "/packs/incident-triage-pack");
      assert.equal(packOne.status, 200);
      assert.equal(packOne.body.pack.permissionStatus.ok, true);

      const packMissing = await httpJson(baseUrl, "GET", "/packs/nonexistent-pack");
      assert.equal(packMissing.status, 404);
      assert.equal(packMissing.body.code, "PACK_NOT_FOUND");

      const valOk = await httpJson(baseUrl, "POST", "/packs/validate", {
        packDir: "workflow-packs/incident-triage-pack"
      });
      assert.equal(valOk.status, 200);
      assert.equal(valOk.body.ok, true);

      const valEscape = await httpJson(baseUrl, "POST", "/packs/validate", {
        packDir: "../companion"
      });
      assert.equal(valEscape.status, 400);
      assert.equal(valEscape.body.code, "WORKFLOW_PACK_PATH_ESCAPE");

      // Intake refused must NOT execute
      const refusedRes = await httpJson(baseUrl, "POST", "/intake/route", {
        request: "Book a flight to Tokyo",
        input: {},
        options: { execute: true }
      });
      assert.equal(refusedRes.status, 200);
      assert.equal(refusedRes.body.intake.decision, "refused");
      assert.equal(refusedRes.body.execution, null);

      // Intake confirm_required without confirmed=true must NOT execute
      const unconfirmedRes = await httpJson(baseUrl, "POST", "/workflows/intake", {
        request: "Review this markdown document and check its JSON schema",
        input: { text: "hello" },
        options: { execute: true }
      });
      assert.equal(unconfirmedRes.status, 200, `Unexpected status ${unconfirmedRes.status}: ${unconfirmedRes.raw}`);
      assert.equal(unconfirmedRes.body.intake.decision, "confirm_required");
      assert.equal(unconfirmedRes.body.execution, null);

      // Intake selected with ready input + execute=true executes incident_triage end-to-end
      const execRes = await httpJson(baseUrl, "POST", "/intake/route", {
        request: "Triage this sev1 production outage on checkout-api returning 503",
        input: {
          incident_text: "2026-11-18T19:42:10Z SEV1 alert: checkout-api returning HTTP 503",
          service: "checkout-api",
          environment: "production"
        },
        options: { execute: true }
      });
      assert.equal(execRes.status, 200, `Unexpected status ${execRes.status}: ${execRes.raw}\nSTDERR:\n${serverStderr}`);
      assert.equal(execRes.body.intake.decision, "selected");
      assert.equal(execRes.body.intake.selected_workflow.workflow_id, "incident_triage");
      assert.equal(execRes.body.execution.ok, true);
      assert.equal(execRes.body.execution.result.final.service, "checkout-api");

      // Console & Shell static assets include intake & packs UI
      const consoleHtml = fs.readFileSync(path.join(ROOT, "companion", "console", "index.html"), "utf8");
      const consoleJs = fs.readFileSync(path.join(ROOT, "companion", "console", "app.js"), "utf8");
      const shellJs = fs.readFileSync(path.join(ROOT, "companion", "shell", "app.js"), "utf8");
      assert(consoleHtml.includes('id="intakeForm"'));
      assert(consoleHtml.includes('id="workflowPacksList"'));
      assert(consoleJs.includes("evaluateTaskIntake"));
      assert(consoleJs.includes("loadWorkflowPacks"));
      assert(shellJs.includes("Pack ·"));
    } finally {
      if (!child.killed) {
        child.kill("SIGTERM");
        await sleep(300);
        if (!child.killed) child.kill("SIGKILL");
      }
    }
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
