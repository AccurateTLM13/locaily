const { randomUUID } = require("node:crypto");
const { loadTrack } = require("../crew/decomposer");
const { validateResult } = require("../core/result-validator");
const { getWorkflow } = require("./workflow-registry");
const { getTrackRegistryEntry, getWorkerTypeForStep } = require("./track-registry");

const workflowPlanSchema = require("../schemas/internal/workflow-plan.schema.json");
const workflowCompositionSchema = require("../schemas/internal/workflow-composition.schema.json");
const workflowCompositionPlanSchema = require("../schemas/internal/workflow-composition-plan.schema.json");

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

  if (Array.isArray(workflow.input_requirements)) {
    for (const requirement of workflow.input_requirements) {
      const value = input[requirement.field];

      if (requirement.required === true && (value === undefined || value === null)) {
        return {
          ok: false,
          code: "INVALID_INPUT",
          message: `Workflow input requires '${requirement.field}'.`,
          nextStep: requirement.help || `Send '${requirement.field}' in the workflow input.`
        };
      }

      if (value === undefined || value === null) {
        continue;
      }

      const matches = requirement.type === "integer"
        ? Number.isInteger(value)
        : requirement.type === "array"
          ? Array.isArray(value)
          : requirement.type === "object"
            ? (typeof value === "object" && !Array.isArray(value))
            : typeof value === requirement.type;

      if (!matches) {
        return {
          ok: false,
          code: "INVALID_INPUT",
          message: `Workflow input '${requirement.field}' must be of type ${requirement.type}.`,
          nextStep: requirement.help || `Send '${requirement.field}' as ${requirement.type}.`
        };
      }
    }

    return { ok: true };
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

  if (workflow.workflow_id === "operator_log_discovery") {
    if (!input.editorialBrief || typeof input.editorialBrief !== "string") {
      return {
        ok: false,
        code: "INVALID_INPUT",
        message: "Operator Log discovery requires editorialBrief string.",
        nextStep: "Describe the publication, voice, and opportunity criteria in editorialBrief."
      };
    }
  }

  if (workflow.workflow_id === "operator_log_draft") {
    if (!input.opportunity || typeof input.opportunity !== "object" || Array.isArray(input.opportunity)) {
      return {
        ok: false,
        code: "INVALID_INPUT",
        message: "Operator Log drafting requires a selected opportunity object.",
        nextStep: "Choose an opportunity from operator_log_discovery and send it as input.opportunity."
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

  if (Array.isArray(workflow.composition) && workflow.composition.length > 0) {
    return buildCompositionRunPlan({ workflow, input, options, taskId });
  }

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

function compositionError(code, message, nextStep, extra = {}) {
  const error = new Error(message);
  error.code = code;
  error.nextStep = nextStep;
  Object.assign(error, extra);
  return error;
}

function collectArtifactReferences(value) {
  const references = [];
  const pattern = /\$artifacts\.([a-z][a-z0-9_]*)/gi;
  const serialized = JSON.stringify(value || {});
  let match;

  while ((match = pattern.exec(serialized)) !== null) {
    references.push(match[1]);
  }

  return references;
}

function validateWorkflowComposition(composition) {
  const validation = validateResult(composition, workflowCompositionSchema, "composition");

  if (!validation.ok) {
    throw compositionError(
      "WORKFLOW_COMPOSITION_INVALID",
      `Workflow composition did not match workflow-composition.schema.json: ${validation.errors.join("; ")}`,
      "Fix the composition array in companion/orchestration/registry/workflows.json."
    );
  }
}

function topoSortComposition(entries) {
  const byAlias = new Map(entries.map((entry) => [entry.as, entry]));
  const indegree = new Map(entries.map((entry) => [entry.as, 0]));
  const edges = new Map(entries.map((entry) => [entry.as, new Set()]));

  const addEdge = (from, to) => {
    if (!edges.get(to).has(from)) {
      edges.get(to).add(from);
      indegree.set(to, indegree.get(to) + 1);
    }
  };

  for (const entry of entries) {
    for (const required of entry.requires || []) {
      if (!byAlias.has(required)) {
        throw compositionError(
          "WORKFLOW_COMPOSITION_INVALID",
          `Composition entry '${entry.as}' requires unknown alias '${required}'.`,
          "Only reference aliases defined earlier in the same composition."
        );
      }
      addEdge(required, entry.as);
    }

    for (const referenced of collectArtifactReferences(entry.input_map)) {
      if (referenced === entry.as) {
        throw compositionError(
          "WORKFLOW_COMPOSITION_INVALID",
          `Composition entry '${entry.as}' references its own artifact.`,
          "A track cannot consume its own output."
        );
      }
      if (!byAlias.has(referenced)) {
        throw compositionError(
          "WORKFLOW_COMPOSITION_INVALID",
          `Composition entry '${entry.as}' references unknown artifact alias '${referenced}'.`,
          "Reference only aliases produced earlier in the composition."
        );
      }
      addEdge(referenced, entry.as);
    }
  }

  const ordered = [];
  const queue = entries.filter((entry) => indegree.get(entry.as) === 0).map((entry) => entry.as);

  while (queue.length > 0) {
    const alias = queue.shift();
    ordered.push(byAlias.get(alias));

    for (const [target, sources] of edges.entries()) {
      if (sources.has(alias)) {
        sources.delete(alias);
        indegree.set(target, indegree.get(target) - 1);
        if (indegree.get(target) === 0) {
          queue.push(target);
        }
      }
    }
  }

  if (ordered.length !== entries.length) {
    const remaining = entries.map((entry) => entry.as).filter((alias) => !ordered.some((entry) => entry.as === alias));
    throw compositionError(
      "WORKFLOW_COMPOSITION_CYCLE",
      `Composition contains a dependency cycle among aliases: ${remaining.join(", ")}.`,
      "Remove or redirect the circular $artifacts references or requires edges."
    );
  }

  return ordered;
}

function buildCompositionRunPlan({ workflow, input, options = {}, taskId = null }) {
  const inputValidation = validateWorkflowInput(workflow, input);

  if (!inputValidation.ok) {
    throw compositionError(inputValidation.code, inputValidation.message, inputValidation.nextStep);
  }

  validateWorkflowComposition(workflow.composition);

  const aliases = new Set();
  for (const entry of workflow.composition) {
    if (aliases.has(entry.as)) {
      throw compositionError(
        "WORKFLOW_COMPOSITION_INVALID",
        `Duplicate composition alias '${entry.as}'.`,
        "Each composition entry needs a unique alias."
      );
    }
    aliases.add(entry.as);
  }

  const ordered = topoSortComposition(workflow.composition);
  const tracks = [];

  for (const entry of ordered) {
    const track = loadTrack(entry.track_id);
    getTrackRegistryEntry(entry.track_id);

    tracks.push({
      as: entry.as,
      track_id: entry.track_id,
      requires: [...(entry.requires || []), ...new Set(collectArtifactReferences(entry.input_map))].filter((alias) => alias !== entry.as),
      ...(entry.input_map ? { input_map: entry.input_map } : {}),
      on_failure: entry.on_failure || "abort",
      status: "pending",
      steps: track.steps.map((step) => ({
        step_id: step.id,
        global_id: `${entry.as}/${step.id}`,
        track_id: track.track_id,
        required_input: describeRequiredInput(step),
        expected_output: describeExpectedOutput(step),
        worker_type: getWorkerTypeForStep(step),
        status: "pending"
      }))
    });
  }

  const finalAlias = workflow.output_alias && ordered.some((entry) => entry.as === workflow.output_alias)
    ? workflow.output_alias
    : ordered[ordered.length - 1].as;

  const plan = {
    plan_id: createPlanId(),
    task_id: createTaskId(taskId),
    workflow_id: workflow.workflow_id,
    plan_version: 2,
    status: "pending",
    created_at: new Date().toISOString(),
    input,
    options,
    final_alias: finalAlias,
    execution_order: ordered.map((entry) => entry.as),
    tracks
  };

  const validation = validateResult(plan, workflowCompositionPlanSchema, "composition-plan");

  if (!validation.ok) {
    throw compositionError(
      "WORKFLOW_COMPOSITION_PLAN_INVALID",
      `Built composition plan did not match workflow-composition-plan.schema.json: ${validation.errors.join("; ")}`,
      "Fix the composition builder or the composition plan schema."
    );
  }

  return plan;
}

module.exports = {
  buildRunPlan,
  buildCompositionRunPlan,
  validateBuiltRunPlan,
  validateWorkflowComposition,
  validateWorkflowInput,
  describeRequiredInput,
  describeExpectedOutput
};
