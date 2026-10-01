const { buildStepInput } = require("./step-input");

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

  const role = tool.modelRole || executor.role || null;
  let resolvedModel = null;
  let qualification = null;

  if (role) {
    if (typeof options?.resolveModelForRole === "function") {
      const res = options.resolveModelForRole(role);
      resolvedModel = res && res.ok ? res.model : (typeof res === "string" ? res : null);
    }
    if (!resolvedModel && typeof options?.model === "string" && options.model.trim()) {
      resolvedModel = options.model.trim();
    }
    if (!resolvedModel && tool.requiresRuntime) {
      resolvedModel = "llama3.2-local";
    }

    if (resolvedModel && typeof options?.getModelQualificationEvidence === "function") {
      qualification = options.getModelQualificationEvidence({
        model: resolvedModel,
        role,
        trackId: options.track_id || null,
        contractId: executor.contract || null
      });
    }
  }

  let shadowRouting = null;
  if (role && typeof options?.shadowRouter === "function") {
    try {
      shadowRouting = options.shadowRouter({
        role,
        trackId: options.track_id || null,
        contractId: executor.contract || null,
        currentModelId: resolvedModel,
        currentQualification: qualification
      });
    } catch (shadowError) {
      console.warn("[Shadow Routing] Failed in tool-router:", shadowError.message);
    }
  }

  let fallbackModel = options?.fallbackModel || null;
  if (!fallbackModel && options?.enableFallback !== false && shadowRouting?.fallbackRecommendation) {
    fallbackModel = shadowRouting.fallbackRecommendation;
  }
  if (!fallbackModel && typeof options?.getFallbackModelForRole === "function") {
    fallbackModel = options.getFallbackModelForRole(role, resolvedModel);
  }

  const handleOptions = resolvedModel
    ? { ...options, model: resolvedModel }
    : options;

  let output;
  let fallbackUsed = false;
  let fallbackReason = null;
  let fallbackOriginalError = null;

  try {
    output = await tool.handle({
      task,
      input: stepInput,
      runtime,
      options: handleOptions,
      meta
    });
  } catch (toolErr) {
    if (fallbackModel && fallbackModel !== resolvedModel) {
      try {
        const fallbackHandleOptions = {
          ...options,
          model: fallbackModel
        };
        output = await tool.handle({
          task,
          input: stepInput,
          runtime,
          options: fallbackHandleOptions,
          meta
        });
        fallbackUsed = true;
        fallbackReason = `Primary model '${resolvedModel}' failed: ${toolErr.message}`;
        fallbackOriginalError = { message: toolErr.message, code: toolErr.code || "EXECUTION_ERROR" };
        resolvedModel = fallbackModel;
        if (typeof options?.getModelQualificationEvidence === "function") {
          qualification = options.getModelQualificationEvidence({
            model: fallbackModel,
            role,
            trackId: options.track_id || null,
            contractId: executor.contract || null
          });
        }
      } catch (fallbackErr) {
        throw toolErr;
      }
    } else {
      throw toolErr;
    }
  }

  return {
    output,
    meta: {
      step_id: step.id,
      executor_type: "tool",
      tool: toolId,
      task,
      role: role || null,
      model: resolvedModel || null,
      qualification,
      shadowRouting,
      fallback: fallbackUsed,
      fallbackUsed,
      fallbackReason,
      fallbackOriginalError,
      durationMs: Date.now() - stepStart
    }
  };
}

module.exports = {
  buildStepInput,
  executeToolStep
};
