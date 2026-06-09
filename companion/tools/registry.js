const { dealSniperTool } = require("./deal-sniper");
const { lighthouseHandoffTool } = require("./lighthouse-handoff");
const { standardTextTools } = require("./standard-text");

const AVAILABLE_TOOLS = [
  dealSniperTool,
  lighthouseHandoffTool,
  ...standardTextTools
];

function createToolRegistry(options = {}) {
  const enabled = Array.isArray(options.enabledTools) ? options.enabledTools : [];
  const enabledSet = new Set(enabled);
  const tools = new Map();

  for (const tool of AVAILABLE_TOOLS) {
    validateTool(tool);

    if (enabledSet.size === 0 || enabledSet.has(tool.id)) {
      tools.set(tool.id, tool);
    }
  }

  return {
    list() {
      return Array.from(tools.values());
    },
    listIds() {
      return Array.from(tools.keys());
    },
    listPublic() {
      return Array.from(tools.values()).map(toPublicToolMetadata);
    },
    get(toolId) {
      return tools.get(toolId) || null;
    },
    has(toolId) {
      return tools.has(toolId);
    },
    supportsTask(toolId, taskId) {
      const tool = tools.get(toolId);
      return Boolean(tool && tool.tasks.includes(taskId));
    }
  };
}

function toPublicToolMetadata(tool) {
  return {
    id: tool.id,
    name: tool.name,
    pack: tool.pack || "built-in",
    description: tool.description || "",
    tasks: tool.tasks,
    permissions: Array.isArray(tool.permissions) ? tool.permissions : [],
    model_role: tool.modelRole || null,
    runtime_required: tool.requiresRuntime !== false,
    input_schema: tool.inputSchema || null,
    output_schema: tool.outputSchema || null,
    input: tool.input || null,
    output: summarizeOutput(tool.output)
  };
}

function summarizeOutput(output) {
  if (!output || typeof output !== "object") {
    return null;
  }

  return {
    required: Array.isArray(output.required) ? output.required : [],
    type: output.type || "object"
  };
}

function validateTool(tool) {
  if (!tool || typeof tool !== "object") {
    throw new Error("Tool definition must be an object.");
  }

  if (!tool.id || typeof tool.id !== "string") {
    throw new Error("Tool definition is missing a string id.");
  }

  if (!tool.name || typeof tool.name !== "string") {
    throw new Error(`Tool '${tool.id}' is missing a string name.`);
  }

  if (!Array.isArray(tool.tasks) || tool.tasks.length === 0) {
    throw new Error(`Tool '${tool.id}' must define at least one task.`);
  }

  if (typeof tool.handle !== "function") {
    throw new Error(`Tool '${tool.id}' must define a handle function.`);
  }
}

module.exports = {
  createToolRegistry
};
