const path = require("node:path");
const { loadTrack } = require("./decomposer");
const { executeModelStep } = require("./model-router");
const { executeToolStep } = require("./tool-router");
const { formatHandoffMarkdown } = require("./markdown");
const { validateResult } = require("../core/result-validator");

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
  meta = {}
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

  for (const step of track.steps) {
    const stepResult = await executeStep({
      step,
      context,
      runtime,
      options: {
        ...options,
        track_id: track.track_id
      },
      toolRegistry,
      meta
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
      durationMs: stepResult.meta.durationMs,
      output: stepResult.output
    });
  }

  const { result, schemaValid } = assembleTrackResult(track, context, input, outputSchema);

  return {
    track_id: track.track_id,
    result,
    steps: stepsRun,
    durationMs: Date.now() - startTrack,
    schemaValid,
    fallbacks_used: []
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
