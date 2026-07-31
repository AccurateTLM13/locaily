function buildStatusHandoff({ event }) {
  const payload = event.payload;

  return {
    project_id: payload.project_id,
    previous_status: payload.previous_status,
    current_status: payload.current_status,
    summary: payload.summary,
    next_action: "Review the recorded status and continue from its evidence."
  };
}

function createHandlerRegistry(options = {}) {
  const rules = new Map([
    ["status-handoff-rule-v1", buildStatusHandoff],
    ...Object.entries(options.rules || {})
  ]);
  const scripts = new Map(Object.entries(options.scripts || {}));
  const toolRegistry = options.toolRegistry || null;

  function has(handlerType, handlerId) {
    if (handlerType === "rule") {
      return rules.has(handlerId);
    }

    if (handlerType === "script") {
      return scripts.has(handlerId);
    }

    if (handlerType === "tool") {
      const descriptor = parseToolHandlerId(handlerId);
      return Boolean(
        toolRegistry
        && typeof toolRegistry.has === "function"
        && toolRegistry.has(descriptor.toolId)
        && (
          typeof toolRegistry.supportsTask !== "function"
          || toolRegistry.supportsTask(descriptor.toolId, descriptor.task)
        )
      );
    }

    return false;
  }

  async function execute(handlerType, handlerId, context) {
    if (handlerType === "rule") {
      return rules.get(handlerId)(context);
    }

    if (handlerType === "script") {
      return scripts.get(handlerId)(context);
    }

    if (handlerType === "tool") {
      const descriptor = parseToolHandlerId(handlerId);
      const tool = toolRegistry.get(descriptor.toolId);
      return tool.handle({
        task: descriptor.task,
        input: context.input,
        runtime: null,
        options: {
          local_only: true,
          cloud_fallback: false
        },
        meta: context.meta
      });
    }

    const error = new Error(
      handlerType === "model"
        ? "Model execution is not enabled in CTK-01 and no cloud fallback is available."
        : `Handler type '${handlerType}' is unavailable in CTK-01.`
    );
    error.code = handlerType === "model"
      ? "MODEL_HANDLER_UNAVAILABLE"
      : "HANDLER_UNAVAILABLE";
    throw error;
  }

  return {
    has,
    execute
  };
}

function parseToolHandlerId(handlerId) {
  const separator = handlerId.lastIndexOf("#");

  if (separator === -1) {
    return {
      toolId: handlerId,
      task: "run"
    };
  }

  return {
    toolId: handlerId.slice(0, separator),
    task: handlerId.slice(separator + 1) || "run"
  };
}

module.exports = {
  buildStatusHandoff,
  createHandlerRegistry,
  parseToolHandlerId
};
