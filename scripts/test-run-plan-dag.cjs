const assert = require("node:assert");
const { createMockRuntime } = require("../companion/providers/router");
const { createToolRegistry } = require("../companion/tools/registry");
const { loadTrack } = require("../companion/crew/decomposer");
const { buildRunPlan, executeRunPlan } = require("../companion/orchestration");
const { computeDependencyGraph, groupByLevel } = require("../companion/core/dag-graph");

const LIGHTHOUSE_INPUT = {
  url: "https://example.com",
  scores: { performance: 80, accessibility: 70, seo: 90, "best-practices": 85 },
  opportunities: [],
  diagnostics: []
};

function checkDependencyLevels() {
  const track = loadTrack("website_audit.lighthouse_handoff");
  const graph = computeDependencyGraph(track);
  assert(graph.valid, "Expected Lighthouse track dependency graph to be valid (no cycles/missing).");

  const levels = groupByLevel(graph.stepIds, graph.edges);

  const levelKeys = Object.keys(levels).map(Number);
  const maxLevel = Math.max(...levelKeys);

  const extractLevel = Number(levelKeys.find((l) => levels[l].includes("extract_metrics")));
  const classifyLevel = Number(levelKeys.find((l) => levels[l].includes("classify_issues")));
  const handoffLevel = Number(levelKeys.find((l) => levels[l].includes("write_handoff")));

  assert(extractLevel === classifyLevel, "extract_metrics and classify_issues should run in the SAME level (parallel).");
  assert(handoffLevel > extractLevel, "write_handoff must run after the initial parallel steps.");
  assert(levels[maxLevel].includes("verify_output"), "verify_output should run in the final level.");
  assert(levelKeys.some((l) => levels[l].length > 1), "At least one level should contain parallel (independent) steps.");

  console.log(`PASS: Lighthouse DAG levels — extract/classify @ level ${extractLevel}, handoff @ level ${handoffLevel} (max ${maxLevel})`);
}

async function runPlan(useDag) {
  const runtime = createMockRuntime();
  const toolRegistry = createToolRegistry();

  const plan = buildRunPlan({
    workflowId: "lighthouse_handoff",
    input: LIGHTHOUSE_INPUT,
    taskId: `task_dag_${useDag ? "on" : "off"}`
  });

  const execution = await executeRunPlan({
    plan,
    runtime,
    toolRegistry,
    options: { model: "mock-model", useDag },
    meta: { requestId: "req_dag", run_id: "run_dag", trace_id: "trace_dag" }
  });

  assert.strictEqual(execution.plan.status, "completed", `Expected plan status 'completed' with useDag=${useDag}.`);
  assert(execution.plan.steps.every((s) => s.status === "completed"), `All steps should complete with useDag=${useDag}.`);
  assert(typeof execution.result.markdown === "string", "Expected markdown output.");
  assert(execution.schemaValid, "Expected schema-valid result.");

  return execution;
}

async function main() {
  checkDependencyLevels();

  await runPlan(true);
  console.log("PASS: Workflow run-plan executes with DAG (useDag=true).");

  await runPlan(false);
  console.log("PASS: Workflow run-plan executes sequentially (useDag=false, backward compatible).");

  console.log("\nAll workflow DAG execution tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
