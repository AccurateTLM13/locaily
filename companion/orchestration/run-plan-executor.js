const { loadTrack } = require("../crew/decomposer");
const {
  executeStep,
  assembleTrackResult,
  createTrackContext,
  loadOutputSchema
} = require("../crew/orchestrator");
const { formatHandoffMarkdown } = require("../crew/markdown");
const { validateStepOutput, validateWorkflowResult } = require("./run-plan-validator");
const { recordWorkflowRun } = require("../crew/runtime-track-run-recorder");
const { computeDependencyGraph, groupByLevel } = require("../core/dag-graph");
const { executeStepViaRelayIfNeeded } = require("../relay/router");

function describeWorkerUsed(stepResult, trackStep) {
  if (trackStep.executor.type === "model") {
    return {
      type: "model",
      role: stepResult.meta.role || trackStep.executor.role || "default_worker",
      model: stepResult.meta.model || null,
      profile_id: stepResult.meta.profile_id || null,
      qualification: stepResult.meta.qualification || null,
      node_id: stepResult.meta.nodeId || null,
      routed_via: stepResult.meta.relay ? "relay" : "local"
    };
  }

  return {
    type: "tool",
    tool: stepResult.meta.tool || trackStep.executor.tool,
    task: stepResult.meta.task || trackStep.executor.task,
    node_id: stepResult.meta.nodeId || null,
    routed_via: stepResult.meta.relay ? "relay" : "local"
  };
}

function markStepFailed(plan, stepIndex, error) {
  const planStep = plan.steps[stepIndex];
  planStep.status = "failed";
  planStep.error = {
    code: error.code || "STEP_EXECUTION_FAILED",
    message: error.message || "Step execution failed."
  };
  plan.status = "failed";
}

async function runSinglePlanStep({
  plan,
  planStep,
  trackStep,
  track,
  context,
  runtime,
  options,
  toolRegistry,
  meta
}) {
  const index = plan.steps.findIndex((s) => s.step_id === planStep.step_id);
  planStep.status = "running";
  const stepStartedAt = Date.now();

  try {
    const stepResult = await executeStepViaRelayIfNeeded({
      step: trackStep,
      context,
      runtime,
      options: {
        ...options,
        track_id: track.track_id
      },
      toolRegistry,
      meta,
      stepId: trackStep.id,
      localExecute: () => executeStep({
        step: trackStep,
        context,
        runtime,
        options: {
          ...options,
          track_id: track.track_id
        },
        toolRegistry,
        meta
      })
    });

    context.artifacts[trackStep.id] = stepResult.output;

    if (trackStep.id === "write_handoff" && stepResult.output && typeof stepResult.output === "object") {
      context.artifacts[trackStep.id] = {
        ...stepResult.output,
        markdown: formatHandoffMarkdown({
          ...stepResult.output,
          url: plan.input.url
        })
      };
    }

    const stepValidation = validateStepOutput(planStep, stepResult.output, trackStep, track);

    if (!stepValidation.ok) {
      const error = new Error(stepValidation.message);
      error.code = stepValidation.code;
      error.validationErrors = stepValidation.errors;

      if (stepValidation.stepId) {
        error.stepId = stepValidation.stepId;
      }

      if (stepValidation.toolId) {
        error.toolId = stepValidation.toolId;
      }

      if (stepValidation.nextStep) {
        error.nextStep = stepValidation.nextStep;
      }

      if (stepValidation.validation) {
        error.validation = stepValidation.validation;
      }

      planStep.duration_ms = Date.now() - stepStartedAt;
      planStep.worker_used = describeWorkerUsed(stepResult, trackStep);
      markStepFailed(plan, index, error);
      throw error;
    }

    planStep.status = "completed";
    planStep.output = stepResult.output;
    planStep.duration_ms = Date.now() - stepStartedAt;
    planStep.worker_used = describeWorkerUsed(stepResult, trackStep);
  } catch (error) {
    if (planStep.status !== "failed") {
      planStep.duration_ms = Date.now() - stepStartedAt;
      markStepFailed(plan, index, error);
    }

    throw error;
  }
}

async function executeRunPlan({
  plan,
  runtime,
  options = {},
  toolRegistry,
  meta = {},
  recordOpts = null
}) {
  if (!toolRegistry || typeof toolRegistry.get !== "function") {
    const error = new Error("Tool registry is required for run plan execution.");
    error.code = "TOOL_REGISTRY_MISSING";
    error.nextStep = "Start the companion server with a loaded tool registry.";
    throw error;
  }

  const track = loadTrack(plan.track_id);
  const trackStepById = new Map(track.steps.map((step) => [step.id, step]));
  const context = createTrackContext(plan.input);
  const outputSchema = loadOutputSchema(track);
  const startedAt = Date.now();
  plan.status = "running";

  const stepIndexById = new Map();
  plan.steps.forEach((planStep, idx) => stepIndexById.set(planStep.step_id, idx));

  const useDag = options.useDag !== false;
  const graph = useDag ? computeDependencyGraph(track) : null;
  const levels = graph && graph.edges.length > 0 ? groupByLevel(graph.stepIds, graph.edges) : null;

  if (!levels) {
    for (let index = 0; index < plan.steps.length; index += 1) {
      const planStep = plan.steps[index];
      const trackStep = trackStepById.get(planStep.step_id);

      if (!trackStep) {
        const error = new Error(`Run plan step '${planStep.step_id}' is not defined in track '${plan.track_id}'.`);
        error.code = "RUN_PLAN_INVALID";
        markStepFailed(plan, index, error);
        throw error;
      }

      await runSinglePlanStep({
        plan,
        planStep,
        trackStep,
        track,
        context,
        runtime,
        options,
        toolRegistry,
        meta
      });
    }
  } else {
    const levelKeys = Object.keys(levels).sort((a, b) => Number(a) - Number(b));
    const abortOnError = options.abortOnError !== false;

    for (const level of levelKeys) {
      if (abortOnError && plan.steps.some(s => s.status === "failed")) break;

      const batch = [];
      for (const stepId of levels[level]) {
        const planStep = plan.steps[stepIndexById.get(stepId)];
        const trackStep = trackStepById.get(stepId);
        if (!planStep || !trackStep) continue;

        batch.push(
          runSinglePlanStep({
            plan,
            planStep,
            trackStep,
            track,
            context,
            runtime,
            options,
            toolRegistry,
            meta
          }).then(() => null)
        );
      }

      await Promise.all(batch);
    }
  }

  const { result, schemaValid } = assembleTrackResult(track, context, plan.input, outputSchema);
  const workflowValidation = validateWorkflowResult(plan.track_id, result);
  const finalStatus = workflowValidation.ok && schemaValid !== false ? "completed" : "failed";

  plan.status = finalStatus;
  plan.completed_at = new Date().toISOString();
  plan.duration_ms = Date.now() - startedAt;

  let evidence = null;
  if (recordOpts && recordOpts.enabled !== false) {
    try {
      evidence = await recordWorkflowRun({
        workflowId: plan.workflow_id,
        trackId: plan.track_id,
        input: plan.input,
        planSteps: plan.steps,
        planResult: plan,
        durationMs: plan.duration_ms,
        schemaValid: workflowValidation.ok && schemaValid !== false,
        error: null,
        correlationId: meta.run_id || meta.requestId || null,
        auditRecordId: recordOpts.auditRecordId || null,
        options: {
          provider: recordOpts.provider || options.provider || null
        }
      });
    } catch (recError) {
      console.error("Failed to emit workflow Track Run Record:", recError.message);
      evidence = {
        parentRecordId: null,
        error: recError.message,
        warning: "Record emission failed"
      };
    }
  }

  return {
    plan,
    result,
    schemaValid: workflowValidation.ok && schemaValid !== false,
    validation: workflowValidation,
    durationMs: plan.duration_ms,
    evidence
  };
}

module.exports = {
  executeRunPlan
};
