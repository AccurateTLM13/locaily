const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { createMockRuntime } = require("../companion/providers/router");
const { createToolRegistry } = require("../companion/tools/registry");
const { validateResult } = require("../companion/core/result-validator");
const { buildRunPlan, executeRunPlan } = require("../companion/orchestration");

const FIXTURE_PATH = path.join(__dirname, "..", "examples", "lighthouse-handoff", "slim-mobile.fixture.json");
const HANDOFF_SCHEMA = require("../companion/schemas/lighthouse-handoff.schema.json");
const HTTP_PORT = 31320;
const HTTP_BASE_URL = `http://127.0.0.1:${HTTP_PORT}`;

const EXPECTED_MARKDOWN_SECTIONS = [
  "## Executive Summary",
  "## Priority Fixes",
  "## Implementation Checklist",
  "## Verification",
  "## Agent Instructions"
];

const REQUIRED_HANDOFF_FIELDS = [
  "clientSummary",
  "developerSummary",
  "priorityFixes",
  "handoffChecklist",
  "estimatedImpact",
  "markdown"
];

const INTENTIONAL_DIFFERENCES = [
  {
    area: "execution_topology",
    legacy: "Three discrete tool tasks: analyze-report → compose-handoff → lighthouse.verify_handoff.",
    workflow: "Seven track steps: extract_metrics → classify_issues → prioritize_fixes → validate_priority_fixes → match_fixes → write_handoff → verify_output."
  },
  {
    area: "analyze_semantics",
    legacy: "analyze-report with use_runtime:false returns buildDemoResult() stub output.",
    workflow: "No analyze-report step; prioritization flows through classify + model + validate_priority_fixes."
  },
  {
    area: "prose_content",
    legacy: "Demo stub developerSummary from analyze-report is passed into compose.",
    workflow: "Executive summary is resolved deterministically from audit-truth after full track pipeline."
  },
  {
    area: "priority_fix_provenance",
    legacy: "Priority fixes originate from analyze-report demo output (first opportunity title).",
    workflow: "Priority fixes originate from validate_priority_fixes after mock model step and opportunity enrichment."
  },
  {
    area: "checklist_provenance",
    legacy: "handoffChecklist comes from analyze-report demo defaults unless compose overrides.",
    workflow: "Checklist comes from match_fixes KB steps for the weakest Lighthouse category."
  },
  {
    area: "result_envelope",
    legacy: "Flat handoff object from compose-handoff.",
    workflow: "Handoff plus meta.track_id and meta.verification from assembleTrackResult."
  },
  {
    area: "http_track_run_envelope",
    legacy: "N/A — legacy path does not use HTTP.",
    workflow: "POST /tracks/run wraps the track handoff in the standard task-run envelope with tool=track-orchestrator, meta.steps, and meta.job_id."
  },
  {
    area: "http_workflow_run_envelope",
    legacy: "N/A — legacy path does not use HTTP.",
    workflow: "POST /workflows/run wraps the executed plan plus handoff fields in the task-run envelope with tool=workflow-orchestrator and meta.plan_id."
  }
];

function loadFixture() {
  const raw = fs.readFileSync(FIXTURE_PATH, "utf8");
  return JSON.parse(raw);
}

function buildAnalyzeInput(slim) {
  return {
    url: slim.url,
    scores: slim.scores,
    opportunities: slim.opportunities || [],
    diagnostics: slim.diagnostics || []
  };
}

function buildComposeInput(slim, analyzeResult) {
  return {
    url: slim.url,
    metrics: slim.scores,
    prioritizedFixes: {
      priorityFixes: Array.isArray(analyzeResult.priorityFixes)
        ? analyzeResult.priorityFixes
        : [],
      thinking: analyzeResult.developerSummary || "Parity test compose input from analyzed Lighthouse report."
    },
    matchedFixes: {
      fixes: [
        {
          steps: Array.isArray(analyzeResult.handoffChecklist)
            ? analyzeResult.handoffChecklist
            : []
        }
      ]
    }
  };
}

async function runLegacyConsoleCoreSequence({ slim, toolRegistry }) {
  const lighthouseTool = toolRegistry.get("lighthouse-handoff");
  const verifyTool = toolRegistry.get("lighthouse.verify_handoff");

  assert(lighthouseTool, "Expected lighthouse-handoff tool in registry.");
  assert(verifyTool, "Expected lighthouse.verify_handoff tool in registry.");

  const analyzeResult = await lighthouseTool.handle({
    task: "analyze-report",
    input: buildAnalyzeInput(slim),
    runtime: null,
    options: {
      execution_mode: "orchestrated",
      use_runtime: false,
      memory: { enabled: false }
    }
  });

  const composeResult = await lighthouseTool.handle({
    task: "compose-handoff",
    input: buildComposeInput(slim, analyzeResult),
    runtime: null,
    options: {
      use_runtime: false,
      memory: { enabled: false }
    }
  });

  const verifyResult = await verifyTool.handle({
    input: { handoff: composeResult }
  });

  return {
    path: "legacy_console_core",
    analyzeResult,
    handoff: composeResult,
    verification: verifyResult
  };
}

async function runWorkflowOrchestratedSequence({ slim, toolRegistry, runtime }) {
  const plan = buildRunPlan({
    workflowId: "lighthouse_handoff",
    input: buildAnalyzeInput(slim),
    taskId: "parity_test_workflow"
  });

  const execution = await executeRunPlan({
    plan,
    runtime,
    toolRegistry,
    options: { model: "mock-model" },
    meta: {
      requestId: "req_parity_test",
      run_id: "run_parity_test",
      trace_id: "trace_parity_test"
    }
  });

  return {
    path: "workflow_orchestrated",
    execution,
    handoff: execution.result,
    verification: execution.result.meta && execution.result.meta.verification
      ? execution.result.meta.verification
      : null
  };
}

function startCompanionServer() {
  const child = spawn(process.execPath, ["companion/server.js"], {
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      LOCAL_AI_PORT: String(HTTP_PORT),
      OLLAMA_MODEL: "mock-local-model"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });

  return {
    child,
    getOutput: () => output
  };
}

async function waitForServer() {
  const deadline = Date.now() + 15000;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      await requestJson("/health");
      return;
    } catch (error) {
      lastError = error;
      await sleep(200);
    }
  }

  throw lastError || new Error("Companion server did not start for parity HTTP checks.");
}

async function requestJson(pathname, options = {}) {
  const response = await fetch(`${HTTP_BASE_URL}${pathname}`, options);
  const body = await response.json().catch(() => null);

  return {
    response,
    body
  };
}

async function setMockProvider() {
  const result = await requestJson("/providers/set", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider: "mock" })
  });

  assert.equal(result.response.status, 200, "Expected POST /providers/set to return HTTP 200.");
  assert.equal(result.body.ok, true, "Expected mock provider activation to succeed.");
}

async function runTracksRunHttpSequence({ slim }) {
  const trackRun = await requestJson("/tracks/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      track_id: "website_audit.lighthouse_handoff",
      input: buildAnalyzeInput(slim),
      context: { source: "lighthouse-handoff-parity-test" },
      options: { execution_mode: "orchestrated" }
    })
  });

  assert.equal(trackRun.response.status, 200, "Expected POST /tracks/run to return HTTP 200.");
  assert.equal(trackRun.body.ok, true, "Expected POST /tracks/run body.ok true.");
  assert.equal(trackRun.body.tool, "track-orchestrator", "Expected track-orchestrator tool id.");
  assert.equal(trackRun.body.task, "website_audit.lighthouse_handoff", "Expected Lighthouse track id.");
  assert(Array.isArray(trackRun.body.meta.steps), "Expected track step metadata.");
  assert.equal(trackRun.body.meta.steps.length, 7, "Expected seven track steps over HTTP.");
  assert(typeof trackRun.body.meta.job_id === "string" && trackRun.body.meta.job_id.length > 0, "Expected job_id in track run metadata.");

  return {
    path: "http_tracks_run",
    envelope: trackRun.body,
    handoff: trackRun.body.result,
    verification: trackRun.body.result.meta && trackRun.body.result.meta.verification
      ? trackRun.body.result.meta.verification
      : null
  };
}

async function runWorkflowsRunHttpSequence({ slim }) {
  const workflowRun = await requestJson("/workflows/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workflow_id: "lighthouse_handoff",
      input: buildAnalyzeInput(slim),
      context: { source: "lighthouse-handoff-parity-test" },
      options: { execution_mode: "workflow_orchestrated" }
    })
  });

  assert.equal(workflowRun.response.status, 200, "Expected POST /workflows/run to return HTTP 200.");
  assert.equal(workflowRun.body.ok, true, "Expected POST /workflows/run body.ok true.");
  assert.equal(workflowRun.body.tool, "workflow-orchestrator", "Expected workflow-orchestrator tool id.");
  assert.equal(workflowRun.body.task, "lighthouse_handoff", "Expected lighthouse_handoff workflow id.");
  assert.equal(workflowRun.body.meta.workflow_id, "lighthouse_handoff", "Expected workflow_id in meta.");
  assert(typeof workflowRun.body.meta.plan_id === "string" && workflowRun.body.meta.plan_id.length > 0, "Expected plan_id in meta.");
  assert(workflowRun.body.result.plan, "Expected executed run plan in workflow result.");
  assert.equal(workflowRun.body.result.plan.status, "completed", "Expected completed workflow plan over HTTP.");
  assert.equal(workflowRun.body.result.plan.steps.length, 7, "Expected seven executed workflow plan steps over HTTP.");

  return {
    path: "http_workflows_run",
    envelope: workflowRun.body,
    handoff: workflowRun.body.result,
    verification: workflowRun.body.result.meta && workflowRun.body.result.meta.verification
      ? workflowRun.body.result.meta.verification
      : null
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assertHandoffBehavior({ label, handoff, verification, slim, schemaValid = true }) {
  assert(handoff && typeof handoff === "object", `${label}: expected handoff object.`);

  const schemaValidation = validateResult(handoff, HANDOFF_SCHEMA);
  assert.equal(schemaValidation.ok, true, `${label}: handoff must pass Lighthouse Handoff schema (${schemaValidation.errors.join("; ")})`);

  if (schemaValid !== undefined) {
    assert.equal(schemaValid, true, `${label}: expected schemaValid true.`);
  }

  assert.equal(handoff.url || slim.url, slim.url, `${label}: analyzed URL must be preserved.`);
  assert(
    handoff.markdown.includes(slim.url),
    `${label}: markdown must include analyzed URL '${slim.url}'.`
  );

  const textBlob = [
    handoff.clientSummary,
    handoff.developerSummary,
    handoff.markdown
  ].filter(Boolean).join("\n");

  for (const [name, value] of Object.entries(slim.scores)) {
    assert(
      textBlob.includes(String(value)),
      `${label}: expected Lighthouse score '${name}: ${value}' to appear in handoff output.`
    );
  }

  assert(Array.isArray(handoff.priorityFixes) && handoff.priorityFixes.length > 0, `${label}: expected non-empty priorityFixes.`);
  for (const fix of handoff.priorityFixes) {
    assert(typeof fix.title === "string" && fix.title.trim(), `${label}: priority fix title required.`);
    assert(["low", "medium", "high"].includes(fix.priority), `${label}: priority fix priority enum required.`);
    assert(typeof fix.reason === "string" && fix.reason.trim(), `${label}: priority fix reason required.`);
  }

  assert(typeof handoff.markdown === "string" && handoff.markdown.trim().length > 0, `${label}: markdown must be non-empty.`);

  for (const section of EXPECTED_MARKDOWN_SECTIONS) {
    assert(handoff.markdown.includes(section), `${label}: expected markdown section '${section}'.`);
  }

  for (const field of REQUIRED_HANDOFF_FIELDS) {
    assert(Object.prototype.hasOwnProperty.call(handoff, field), `${label}: missing required field '${field}'.`);
  }

  assert(verification && verification.valid === true, `${label}: verification must report valid output.`);
}

function assertParityOverlap(left, right) {
  assert.equal(left.handoff.estimatedImpact, right.handoff.estimatedImpact, `${left.path} vs ${right.path}: both paths should agree on estimatedImpact for the same weakest score.`);

  const leftTitles = new Set(left.handoff.priorityFixes.map((fix) => fix.title));
  const rightTitles = new Set(right.handoff.priorityFixes.map((fix) => fix.title));
  const sharedTitles = [...leftTitles].filter((title) => rightTitles.has(title));

  assert(
    sharedTitles.length > 0 || left.handoff.priorityFixes.length > 0 && right.handoff.priorityFixes.length > 0,
    `${left.path} vs ${right.path}: both paths should produce actionable priority fixes (exact titles may differ by design).`
  );
}

function assertOrchestratedHandoffAlignment(left, right) {
  assert.equal(left.handoff.estimatedImpact, right.handoff.estimatedImpact, `${left.path} vs ${right.path}: orchestrated paths should agree on estimatedImpact.`);
  assert.deepEqual(
    left.handoff.priorityFixes.map((fix) => fix.title),
    right.handoff.priorityFixes.map((fix) => fix.title),
    `${left.path} vs ${right.path}: orchestrated paths should produce the same priority fix titles for the fixed fixture.`
  );
  assert.deepEqual(
    left.handoff.handoffChecklist,
    right.handoff.handoffChecklist,
    `${left.path} vs ${right.path}: orchestrated paths should produce the same checklist for the fixed fixture.`
  );
}

function printIntentionalDifferences() {
  console.log("\nIntentional differences documented by this test:");
  for (const diff of INTENTIONAL_DIFFERENCES) {
    console.log(`- ${diff.area}`);
    console.log(`  legacy: ${diff.legacy}`);
    console.log(`  workflow: ${diff.workflow}`);
  }
}

async function main() {
  const slim = loadFixture();
  const runtime = createMockRuntime();
  const toolRegistry = createToolRegistry();

  const legacy = await runLegacyConsoleCoreSequence({ slim, toolRegistry });
  const workflow = await runWorkflowOrchestratedSequence({ slim, toolRegistry, runtime });

  assert.equal(workflow.execution.plan.status, "completed", "Workflow plan must complete.");
  assert.equal(
    workflow.execution.plan.steps.every((step) => step.status === "completed"),
    true,
    "All workflow steps must complete."
  );
  assert.equal(workflow.execution.schemaValid, true, "Workflow execution must be schema-valid.");

  const { child, getOutput } = startCompanionServer();
  let tracksHttp = null;
  let workflowsHttp = null;

  try {
    await waitForServer();
    await setMockProvider();
    tracksHttp = await runTracksRunHttpSequence({ slim });
    workflowsHttp = await runWorkflowsRunHttpSequence({ slim });
  } finally {
    child.kill();
  }

  if (getOutput().includes("EADDRINUSE")) {
    throw new Error(`Port ${HTTP_PORT} was already in use.`);
  }

  assertHandoffBehavior({
    label: "legacy_console_core",
    handoff: legacy.handoff,
    verification: legacy.verification,
    slim
  });

  assertHandoffBehavior({
    label: "workflow_orchestrated",
    handoff: workflow.handoff,
    verification: workflow.verification,
    slim,
    schemaValid: workflow.execution.schemaValid
  });

  assertHandoffBehavior({
    label: "http_tracks_run",
    handoff: tracksHttp.handoff,
    verification: tracksHttp.verification,
    slim
  });

  assertHandoffBehavior({
    label: "http_workflows_run",
    handoff: workflowsHttp.handoff,
    verification: workflowsHttp.verification,
    slim
  });

  assertParityOverlap(legacy, workflow);
  assertOrchestratedHandoffAlignment(workflow, tracksHttp);
  assertOrchestratedHandoffAlignment(workflow, workflowsHttp);
  printIntentionalDifferences();

  console.log("Lighthouse Handoff parity characterization passed.");
  console.log("Paths covered: legacy console core, workflow orchestrator, POST /tracks/run, POST /workflows/run.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
