const assert = require("node:assert/strict");
const { createMockRuntime } = require("../companion/providers/router");
const { createToolRegistry } = require("../companion/tools/registry");
const {
  listTrackRegistry,
  listWorkflows,
  buildRunPlan,
  executeRunPlan
} = require("../companion/orchestration");

const LIGHTHOUSE_INPUT = {
  url: "https://example.com",
  scores: {
    performance: 72,
    accessibility: 96,
    bestPractices: 100,
    seo: 92
  },
  opportunities: [{ title: "Reduce render-blocking resources" }],
  diagnostics: []
};

function checkTrackRegistryShape() {
  const tracks = listTrackRegistry();
  assert(Array.isArray(tracks), "Expected track registry array.");
  assert(tracks.length >= 2, "Expected at least two registered tracks.");

  const lighthouse = tracks.find((track) => track.track_id === "website_audit.lighthouse_handoff");
  assert(lighthouse, "Expected lighthouse track registry entry.");
  assert.equal(lighthouse.input_type, "lighthouse_report");
  assert.equal(lighthouse.output_type, "developer_handoff");
  assert.equal(lighthouse.requires_model, true);
  assert.equal(lighthouse.preferred_worker_type, "priority_helper");
  assert(Array.isArray(lighthouse.steps), "Expected registry step summaries.");
}

function checkWorkflowRegistry() {
  const workflows = listWorkflows();
  const lighthouse = workflows.find((workflow) => workflow.workflow_id === "lighthouse_handoff");
  assert(lighthouse, "Expected lighthouse_handoff workflow.");
  assert.equal(lighthouse.track_id, "website_audit.lighthouse_handoff");
}

function checkRunPlanBuilder() {
  const plan = buildRunPlan({
    workflowId: "lighthouse_handoff",
    input: LIGHTHOUSE_INPUT,
    taskId: "task_test"
  });

  assert.equal(plan.workflow_id, "lighthouse_handoff");
  assert.equal(plan.track_id, "website_audit.lighthouse_handoff");
  assert.equal(plan.task_id, "task_test");
  assert.equal(plan.status, "pending");
  assert.equal(plan.steps.length, 7, "Expected seven lighthouse plan steps.");

  for (const step of plan.steps) {
    assert.equal(step.track_id, plan.track_id);
    assert.equal(step.status, "pending");
    assert(step.required_input, "Expected required_input on plan step.");
    assert(step.expected_output, "Expected expected_output on plan step.");
    assert(step.worker_type, "Expected worker_type on plan step.");
  }

  const prioritize = plan.steps.find((step) => step.step_id === "prioritize_fixes");
  assert(prioritize, "Expected prioritize_fixes plan step.");
  assert.equal(prioritize.worker_type.type, "model");
  assert.equal(prioritize.worker_type.role, "priority_helper");
}

async function checkRunPlanExecution() {
  const runtime = createMockRuntime();
  const toolRegistry = createToolRegistry();

  const plan = buildRunPlan({
    workflowId: "lighthouse_handoff",
    input: LIGHTHOUSE_INPUT,
    taskId: "task_exec_test"
  });

  const execution = await executeRunPlan({
    plan,
    runtime,
    toolRegistry,
    options: { model: "mock-model" },
    meta: { requestId: "req_test", run_id: "run_test", trace_id: "trace_test" }
  });

  assert.equal(execution.plan.status, "completed");
  assert.equal(execution.plan.steps.every((step) => step.status === "completed"), true);
  assert(typeof execution.result.markdown === "string", "Expected markdown in workflow result.");
  assert(Array.isArray(execution.result.priorityFixes), "Expected priorityFixes in workflow result.");
  assert(execution.schemaValid, "Expected schema-valid workflow result.");
  assert(typeof execution.durationMs === "number", "Expected durationMs.");
}

async function main() {
  checkTrackRegistryShape();
  checkWorkflowRegistry();
  checkRunPlanBuilder();
  await checkRunPlanExecution();
  console.log("Orchestration unit tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
