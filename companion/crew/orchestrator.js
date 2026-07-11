const path = require("node:path");
const { loadTrack } = require("./decomposer");
const { executeModelStep } = require("./model-router");
const { executeToolStep } = require("./tool-router");
const { formatHandoffMarkdown } = require("./markdown");
const { validateResult } = require("../core/result-validator");
const { recordDirectTrackRun } = require("./runtime-track-run-recorder");
const { executeDag, validateDag, createDagContext } = require("../core/dag-executor");
const { executeStepViaRelayIfNeeded } = require("../relay/router");

function createTrackContext(input) {
  return {
    input: input || {},
    artifacts: {}
  };
}

function loadOutputSchema(track) {
  if (!track.output_schema) {
    return null;
  }

  const schemaPath = path.resolve(__dirname, "..", "..", track.output_schema);
  return require(schemaPath);
}

async function executeStep({ step, context, runtime, options, toolRegistry, meta }) {
  const executor = step.executor;

  if (executor.type === "model") {
    return executeModelStep({ step, context, runtime, options });
  }

  if (executor.type === "tool") {
    return executeToolStep({
      step,
      context,
      toolRegistry,
      runtime,
      options,
      meta
    });
  }

  const error = new Error(`Unsupported executor type '${executor.type}'.`);
  error.code = "UNSUPPORTED_EXECUTOR";
  error.nextStep = "Use model or tool executor types in the track config.";
  throw error;
}

async function runTrack({
  trackId,
  input,
  runtime,
  options = {},
  toolRegistry: toolRegistryParam,
  meta = {},
  recordOpts = null
}) {
  const toolRegistry = toolRegistryParam || options.toolRegistry;

  if (!toolRegistry || typeof toolRegistry.get !== "function") {
    const error = new Error("Tool registry is required for track execution.");
    error.code = "TOOL_REGISTRY_MISSING";
    error.nextStep = "Start the companion server with a loaded tool registry.";
    throw error;
  }

  const track = loadTrack(trackId);
  const context = createTrackContext(input);
  const stepsRun = [];
  const startTrack = Date.now();
  const outputSchema = loadOutputSchema(track);
  const useDag = options.useDag === true;

  if (useDag) {
    const dagValidation = validateDag(track);
    if (!dagValidation.valid) {
      const error = new Error("DAG validation failed: " + dagValidation.errors.map(e => e.message).join("; "));
      error.code = "DAG_VALIDATION_FAILED";
      error.dagErrors = dagValidation.errors;
      throw error;
    }

    const stepExecutor = async (step, dagCtx) => {
      const mergedCtx = { input: dagCtx.input, artifacts: dagCtx.artifacts };
      const stepOptions = { ...options, track_id: track.track_id };
      try {
        const result = await executeStepViaRelayIfNeeded({
          step,
          context: mergedCtx,
          runtime,
          options: stepOptions,
          toolRegistry,
          meta,
          stepId: step.id,
          localExecute: () => executeStep({
            step,
            context: mergedCtx,
            runtime,
            options: stepOptions,
            toolRegistry,
            meta
          })
        });
        dagCtx.artifacts[step.id] = result.output;
        return { ok: true, output: result.output, meta: result.meta };
      } catch (err) {
        return {
          ok: false,
          error: { code: err.code || "STEP_FAILED", message: err.message }
        };
      }
    };

    const dagResult = await executeDag({
      track,
      context: createDagContext(input),
      stepExecutor,
      options: { maxConcurrency: options.maxConcurrency || 4, abortOnError: options.abortOnError !== false }
    });

    if (!dagResult.ok) {
      const errorEntries = Object.entries(dagResult.errors || {});
      const detail = errorEntries.map(([id, err]) => `${id}: ${err.code || ""} ${err.message || ""} ${err.originalCode ? "(was:"+err.originalCode+")" : ""}`).join("; ");
      const error = new Error("DAG execution failed with " + dagResult.failed + " failed steps: " + detail);
      error.code = "DAG_EXECUTION_FAILED";
      error.dagErrors = dagResult.errors;
      throw error;
    }

    context.artifacts = dagResult.context.artifacts;

    for (const stepId of dagResult.stepOrder) {
      const step = track.steps.find(s => s.id === stepId);
      if (!step) continue;
      const stepResult = dagResult.context.results[stepId];
      if (!stepResult) continue;

      if (stepId === "write_handoff" && stepResult.output && typeof stepResult.output === "object") {
        context.artifacts[stepId] = {
          ...stepResult.output,
          markdown: formatHandoffMarkdown({
            ...stepResult.output,
            url: input.url
          })
        };
      }

      stepsRun.push({
        name: stepId,
        executor: step.executor.type,
        tool: stepResult.meta?.tool || null,
        task: stepResult.meta?.task || null,
        model: stepResult.meta?.model || stepResult.meta?.tool || "rule_based_checker",
        role: stepResult.meta?.role || step.executor.role || "tool",
        profile_id: stepResult.meta?.profile_id || options.profile_id || null,
        suitability: stepResult.meta?.suitability || null,
        qualification: stepResult.meta?.qualification || null,
        shadowRouting: stepResult.meta?.shadowRouting || null,
        enforcementDecision: stepResult.meta?.enforcementDecision || null,
        durationMs: stepResult.meta?.durationMs || 0,
        output: stepResult.output
      });
    }
  } else {
    for (const step of track.steps) {
      const stepOptions = {
        ...options,
        track_id: track.track_id
      };
      const stepResult = await executeStepViaRelayIfNeeded({
        step,
        context,
        runtime,
        options: stepOptions,
        toolRegistry,
        meta,
        stepId: step.id,
        localExecute: () => executeStep({
          step,
          context,
          runtime,
          options: stepOptions,
          toolRegistry,
          meta
        })
      });

      context.artifacts[step.id] = stepResult.output;

      if (step.id === "write_handoff" && stepResult.output && typeof stepResult.output === "object") {
        context.artifacts[step.id] = {
          ...stepResult.output,
          markdown: formatHandoffMarkdown({
            ...stepResult.output,
            url: input.url
          })
        };
      }

      stepsRun.push({
        name: step.id,
        executor: step.executor.type,
        tool: stepResult.meta.tool || null,
        task: stepResult.meta.task || null,
        model: stepResult.meta.model || stepResult.meta.tool || "rule_based_checker",
        role: stepResult.meta.role || step.executor.role || "tool",
        profile_id: stepResult.meta.profile_id || options.profile_id || null,
        suitability: stepResult.meta.suitability || null,
        qualification: stepResult.meta.qualification || null,
        shadowRouting: stepResult.meta.shadowRouting || null,
        enforcementDecision: stepResult.meta.enforcementDecision || null,
        durationMs: stepResult.meta.durationMs,
        output: stepResult.output
      });
    }
  }

  const { result, schemaValid } = assembleTrackResult(track, context, input, outputSchema);

  let evidence = null;
  if (recordOpts && recordOpts.enabled !== false) {
    try {
      evidence = await recordDirectTrackRun({
        trackId: track.track_id,
        input,
        result,
        steps: stepsRun,
        durationMs: Date.now() - startTrack,
        schemaValid,
        fallbacksUsed: [],
        error: null,
        correlationId: meta.run_id || meta.requestId || null,
        auditRecordId: recordOpts.auditRecordId || null,
        options: {
          provider: recordOpts.provider || options.provider || null
        }
      });
    } catch (recError) {
      console.error("Failed to emit Track Run Record:", recError.message);
      evidence = {
        parentRecordId: null,
        error: recError.message,
        warning: "Record emission failed"
      };
    }
  }

  return {
    track_id: track.track_id,
    result,
    steps: stepsRun,
    durationMs: Date.now() - startTrack,
    schemaValid,
    fallbacks_used: [],
    evidence
  };
}

function assembleTrackResult(track, context, input, outputSchema) {
  if (context.artifacts.write_handoff) {
    return assembleLighthouseTrackResult(track, context, input, outputSchema);
  }

  return assembleGenericTrackResult(track, context, outputSchema);
}

function assembleLighthouseTrackResult(track, context, input, outputSchema) {
  const handoff = context.artifacts.write_handoff || {};
  const verification = context.artifacts.verify_output || { valid: true, errors: [] };
  const markdown = formatHandoffMarkdown({
    ...handoff,
    url: input.url
  });

  const result = {
    ...handoff,
    markdown,
    meta: {
      track_id: track.track_id,
      verification
    }
  };

  let schemaValid = verification.valid !== false;

  if (outputSchema) {
    const validation = validateResult(handoff, outputSchema);
    schemaValid = validation.ok && schemaValid;
  }

  return { result, schemaValid };
}

function assembleGenericTrackResult(track, context, outputSchema) {
  const lastStepId = track.steps[track.steps.length - 1].id;
  const resultStepId = track.result_step || lastStepId;
  const verificationStepId = track.verification_step
    || (context.artifacts.verify_output ? "verify_output" : null)
    || (context.artifacts.validate_analysis ? "validate_analysis" : null);
  const primaryOutput = context.artifacts[resultStepId] || {};
  const verification = verificationStepId
    ? (context.artifacts[verificationStepId] || { valid: true, errors: [] })
    : { valid: true, errors: [] };

  const result = {
    ...primaryOutput,
    meta: {
      track_id: track.track_id,
      verification
    }
  };

  let schemaValid = verification.valid !== false;

  if (outputSchema) {
    const validation = validateResult(primaryOutput, outputSchema);
    schemaValid = validation.ok && schemaValid;
  }

  return { result, schemaValid };
}

module.exports = {
  runTrack,
  createTrackContext,
  executeStep,
  assembleTrackResult,
  loadOutputSchema
};
