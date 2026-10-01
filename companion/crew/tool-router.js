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

  const handleOptions = resolvedModel
    ? { ...options, model: resolvedModel }
    : options;

  const output = await tool.handle({
    task,
    input: stepInput,
    runtime,
    options: handleOptions,
    meta
  });

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
      durationMs: Date.now() - stepStart
    }
  };
}

module.exports = {
  buildStepInput,
  executeToolStep
};
