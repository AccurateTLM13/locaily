const { resolveInputMap } = require("./input-map-resolver");

/**
 * @deprecated Legacy Lighthouse step-id mapping for tracks that do not declare input_map.
 * Remove once all track files use declarative input_map (see docs/02-track-system/step-input-mapping.md).
 */
function buildLegacyStepInput(step, context) {
  const input = context.input || {};
  const artifacts = context.artifacts || {};

  if (step.id === "extract_metrics") {
    return input;
  }

  if (step.id === "classify_issues") {
    return {
      opportunities: input.opportunities || []
    };
  }

  if (step.id === "validate_priority_fixes") {
    return {
      opportunities: input.opportunities || [],
      priorityFixes: artifacts.prioritize_fixes?.priorityFixes || [],
      thinking: artifacts.prioritize_fixes?.thinking || ""
    };
  }

  if (step.id === "match_fixes") {
    return {
      issues: artifacts.classify_issues?.issues || [],
      priorityFixes: artifacts.validate_priority_fixes?.priorityFixes || []
    };
  }

  if (step.id === "write_handoff") {
    return {
      url: input.url,
      metrics: artifacts.extract_metrics || {},
      classifiedIssues: artifacts.classify_issues || {},
      prioritizedFixes: artifacts.validate_priority_fixes || artifacts.prioritize_fixes || {},
      matchedFixes: artifacts.match_fixes || {},
      opportunities: input.opportunities || [],
      rankedOpportunities: artifacts.classify_issues?.rankedOpportunities
        || artifacts.extract_metrics?.rankedOpportunities
        || []
    };
  }

  if (step.id === "verify_output") {
    return {
      handoff: artifacts.write_handoff || {}
    };
  }

  return input;
}

function buildStepInput(step, context) {
  if (step.input_map !== undefined && step.input_map !== null) {
    return resolveInputMap(step.input_map, context);
  }

  return buildLegacyStepInput(step, context);
}

async function executeToolStep({ step, context, toolRegistry, runtime, options, meta }) {
  const executor = step.executor;
  const toolId = executor.tool;
  const task = executor.task || "run";
  const tool = toolRegistry.get(toolId);
  const stepStart = Date.now();

  if (!tool) {
    const error = new Error(`Tool '${toolId}' is not registered.`);
    error.code = "TOOL_NOT_FOUND";
    error.nextStep = "Use GET /tools to list available tools.";
    throw error;
  }

  if (!tool.tasks.includes(task)) {
    const error = new Error(`Task '${task}' is not supported by tool '${toolId}'.`);
    error.code = "UNKNOWN_TASK";
    error.nextStep = `Supported tasks: ${tool.tasks.join(", ")}`;
    throw error;
  }

  const stepInput = buildStepInput(step, context);
  const validationError = typeof tool.validateInput === "function" ? tool.validateInput(stepInput) : null;

  if (validationError) {
    const error = new Error(validationError.message);
    error.code = validationError.code || "INVALID_INPUT";
    error.nextStep = validationError.nextStep;
    throw error;
  }

  const output = await tool.handle({
    task,
    input: stepInput,
    runtime,
    options,
    meta
  });

  return {
    output,
    meta: {
      step_id: step.id,
      executor_type: "tool",
      tool: toolId,
      task,
      durationMs: Date.now() - stepStart
    }
  };
}

module.exports = {
  buildStepInput,
  buildLegacyStepInput,
  executeToolStep
};
