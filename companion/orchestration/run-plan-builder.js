const { randomUUID } = require("node:crypto");
const { loadTrack } = require("../pit-crew/decomposer");
const { validateResult } = require("../core/result-validator");
const { getWorkflow } = require("./workflow-registry");
const { getTrackRegistryEntry, getWorkerTypeForStep } = require("./track-registry");

const workflowPlanSchema = require("../schemas/internal/workflow-plan.schema.json");

function createPlanId() {
  return `plan_${randomUUID().replace(/-/g, "")}`;
}

function createTaskId(taskId) {
  if (taskId && typeof taskId === "string" && taskId.trim()) {
    return taskId.trim();
  }

  return `task_${randomUUID().replace(/-/g, "")}`;
}

function describeRequiredInput(step) {
  if (step.input_map) {
    return {
      source: "input_map",
      map: step.input_map
    };
  }

  return {
    source: "track_input",
    note: "Uses workflow input object when no input_map is declared."
  };
}

function describeExpectedOutput(step) {
  if (step.executor.type === "model" && step.executor.schema) {
    return {
      type: "schema",
      path: step.executor.schema
    };
  }

  if (step.executor.type === "tool") {
    return {
      type: "tool_output",
      tool: step.executor.tool,
      task: step.executor.task
    };
  }

  return {
    type: "object"
  };
}

function validateWorkflowInput(workflow, input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      ok: false,
      code: "INVALID_INPUT",
      message: "Workflow request requires an input object.",
      nextStep: "Send structured workflow input."
    };
  }

  if (workflow.workflow_id === "lighthouse_handoff") {
    if (!input.url || typeof input.url !== "string") {
      return {
        ok: false,
        code: "INVALID_INPUT",
        message: "Lighthouse Handoff input requires url string.",
        nextStep: "Send url, scores, opportunities, and diagnostics."
      };
    }
  }

  if (workflow.workflow_id === "dealsniper") {
    if (!input.title || typeof input.title !== "string") {
      return {
        ok: false,
        code: "INVALID_INPUT",
        message: "DealSniper input requires title string.",
        nextStep: "Send title, price, description, and listing metadata."
      };
    }
  }

  return { ok: true };
}

function validateBuiltRunPlan(plan) {
  const validation = validateResult(plan, workflowPlanSchema, "plan");

  if (validation.ok) {
    return validation;
  }

  const error = new Error("Built workflow plan did not match workflow-plan.schema.json.");
  error.code = "WORKFLOW_PLAN_INVALID";
  error.nextStep = "Fix run plan builder output or update companion/schemas/internal/workflow-plan.schema.json.";
  error.validation = validation;
  throw error;
}

function buildRunPlan({ workflowId, input, options = {}, taskId = null }) {
  const workflow = getWorkflow(workflowId);
  const inputValidation = validateWorkflowInput(workflow, input);

  if (!inputValidation.ok) {
    const error = new Error(inputValidation.message);
    error.code = inputValidation.code;
    error.nextStep = inputValidation.nextStep;
    throw error;
  }

  const track = loadTrack(workflow.track_id);
  const registryEntry = getTrackRegistryEntry(workflow.track_id);

  const plan = {
    plan_id: createPlanId(),
    task_id: createTaskId(taskId),
    workflow_id: workflow.workflow_id,
    track_id: workflow.track_id,
    status: "pending",
    created_at: new Date().toISOString(),
    input,
    options,
    registry: {
      purpose: registryEntry.purpose,
      input_type: registryEntry.input_type,
      output_type: registryEntry.output_type,
      preferred_worker_type: registryEntry.preferred_worker_type,
      fallback_behavior: registryEntry.fallback_behavior,
      validation_expectations: registryEntry.validation_expectations
    },
    steps: track.steps.map((step) => ({
      step_id: step.id,
      track_id: track.track_id,
      required_input: describeRequiredInput(step),
      expected_output: describeExpectedOutput(step),
      worker_type: getWorkerTypeForStep(step),
      status: "pending"
    }))
  };

  validateBuiltRunPlan(plan);

  return plan;
}

module.exports = {
  buildRunPlan,
  validateBuiltRunPlan,
  validateWorkflowInput,
  describeRequiredInput,
  describeExpectedOutput
};
