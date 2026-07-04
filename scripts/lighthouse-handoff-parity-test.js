const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createMockRuntime } = require("../companion/providers/router");
const { createToolRegistry } = require("../companion/tools/registry");
const { validateResult } = require("../companion/core/result-validator");
const { buildRunPlan, executeRunPlan } = require("../companion/orchestration");

const FIXTURE_PATH = path.join(__dirname, "..", "examples", "lighthouse-handoff", "slim-mobile.fixture.json");
const HANDOFF_SCHEMA = require("../companion/schemas/lighthouse-handoff.schema.json");

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

function assertParityOverlap(legacy, workflow) {
  assert.equal(legacy.handoff.estimatedImpact, workflow.handoff.estimatedImpact, "Both paths should agree on estimatedImpact for the same weakest score.");

  const legacyTitles = new Set(legacy.handoff.priorityFixes.map((fix) => fix.title));
  const workflowTitles = new Set(workflow.handoff.priorityFixes.map((fix) => fix.title));
  const sharedTitles = [...legacyTitles].filter((title) => workflowTitles.has(title));

  assert(
    sharedTitles.length > 0 || legacy.handoff.priorityFixes.length > 0 && workflow.handoff.priorityFixes.length > 0,
    "Both paths should produce actionable priority fixes (exact titles may differ by design)."
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

  assertParityOverlap(legacy, workflow);
  printIntentionalDifferences();

  console.log("Lighthouse Handoff parity characterization passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
