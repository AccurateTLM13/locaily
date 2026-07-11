const fs = require("node:fs");
const path = require("node:path");
const { dealSniperTool } = require("./deal-sniper");
const { lighthouseHandoffTool } = require("./lighthouse-handoff");
const { validateResult } = require("../core/result-validator");

const toolPackManifestToolSchema = require("../schemas/internal/tool-pack-manifest-tool.schema.json");
const toolPackManifestSchema = {
  ...require("../schemas/internal/tool-pack-manifest.schema.json"),
  $defs: {
    manifestTool: toolPackManifestToolSchema
  }
};
const internalToolRegistryEntrySchema = require("../schemas/internal/internal-tool-registry-entry.schema.json");

const trackPlannerTool = require("./track-planner");

// Built-in compatibility tools
const BUILT_IN_TOOLS = [
  dealSniperTool,
  lighthouseHandoffTool,
  trackPlannerTool
];

function createToolRegistry(options = {}) {
  const enabled = Array.isArray(options.enabledTools) ? options.enabledTools : [];
  const enabledSet = new Set(enabled);
  const tools = new Map();

  // 1. Load built-in tools
  for (const tool of BUILT_IN_TOOLS) {
    if (enabledSet.size === 0 || enabledSet.has(tool.id)) {
      registerTool(tools, tool);
    }
  }

  // 2. Discover and load dynamic tool packs
  const toolPacksDir = path.resolve(__dirname, "../../tool-packs");
  if (fs.existsSync(toolPacksDir)) {
    try {
      const entries = fs.readdirSync(toolPacksDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const packDir = path.join(toolPacksDir, entry.name);
          const manifestPath = path.join(packDir, "tool.json");

          if (fs.existsSync(manifestPath)) {
            loadToolPack(packDir, manifestPath, tools, enabledSet);
          }
        }
      }
    } catch (err) {
      console.warn(`[Registry Loader] Warning: Failed to read tool-packs directory: ${err.message}`);
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

function parseToolPackManifest(manifestPath) {
  let manifest;

  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (err) {
    const error = new Error(`Failed to parse tool pack manifest '${manifestPath}': ${err.message}`);
    error.code = "TOOL_PACK_MANIFEST_PARSE_INVALID";
    error.manifestPath = manifestPath;
    error.nextStep = "Fix JSON syntax in the tool pack manifest file.";
    throw error;
  }

  return manifest;
}

function validateLoadedToolPackManifest(manifest, manifestPath) {
  const validation = validateResult(manifest, toolPackManifestSchema, "manifest");

  if (validation.ok) {
    return validation;
  }

  const packId = manifest && typeof manifest.id === "string" ? manifest.id : undefined;
  const error = new Error(`Tool pack manifest '${manifestPath}' did not match tool-pack-manifest.schema.json.`);
  error.code = "TOOL_PACK_MANIFEST_INVALID";
  error.manifestPath = manifestPath;
  if (packId) {
    error.packId = packId;
  }
  error.nextStep = "Fix the tool pack manifest or update the matching manifest schema.";
  error.validation = validation;
  throw error;
}

function loadToolPack(packDir, manifestPath, toolsMap, enabledSet) {
  const manifest = parseToolPackManifest(manifestPath);
  validateLoadedToolPackManifest(manifest, manifestPath);

  // Load implementation file if it exists
  let packImpl = {};
  const implPath = path.join(packDir, "index.js");
  if (fs.existsSync(implPath)) {
    try {
      packImpl = require(implPath);
    } catch (err) {
      console.warn(`[Registry Loader] Warning: Failed to load implementation code at '${implPath}': ${err.message}`);
      return;
    }
  }

  // Build root relative paths for schema refs
  const rootDir = path.resolve(__dirname, "../..");

  // Register each tool in the manifest
  for (const toolDef of manifest.tools) {
    const toolId = toolDef.id.trim();

    // If enabledTools constraint is specified, check if this tool is enabled
    if (enabledSet.size > 0 && !enabledSet.has(toolId)) {
      continue;
    }

    const impl = packImpl[toolId] || {};

    // Determine output schema
    let outputSchema = {};
    let outputSchemaPath = null;
    if (typeof toolDef.output_schema === "string" && toolDef.output_schema.trim()) {
      const absoluteOutputSchemaPath = path.join(packDir, toolDef.output_schema.trim());
      outputSchemaPath = path.relative(rootDir, absoluteOutputSchemaPath).replace(/\\/g, "/");
      try {
        outputSchema = JSON.parse(fs.readFileSync(absoluteOutputSchemaPath, "utf8"));
      } catch (err) {
        console.warn(`[Registry Loader] Warning: Failed to load output schema for tool '${toolId}': ${err.message}`);
        continue;
      }
    } else {
      console.warn(`[Registry Loader] Warning: Tool '${toolId}' is missing 'output_schema'.`);
      continue;
    }

    // Determine input schema
    let inputSchemaPath = null;
    let inputMetadata = null;
    if (typeof toolDef.input_schema === "string" && toolDef.input_schema.trim()) {
      const absoluteInputSchemaPath = path.join(packDir, toolDef.input_schema.trim());
      inputSchemaPath = path.relative(rootDir, absoluteInputSchemaPath).replace(/\\/g, "/");
      try {
        const inputSchemaJson = JSON.parse(fs.readFileSync(absoluteInputSchemaPath, "utf8"));
        const required = inputSchemaJson.required || [];
        const properties = Object.keys(inputSchemaJson.properties || {});
        const optional = properties.filter(p => !required.includes(p));
        inputMetadata = { required, optional };
      } catch (err) {
        console.warn(`[Registry Loader] Warning: Failed to load input schema for tool '${toolId}': ${err.message}`);
        continue;
      }
    }

    // Determine tasks
    const tasks = Array.isArray(toolDef.tasks) && toolDef.tasks.length > 0
      ? toolDef.tasks
      : ["run"];

    // Determine permissions
    const permissions = Array.isArray(toolDef.permissions)
      ? toolDef.permissions
      : Array.isArray(manifest.permissions)
        ? manifest.permissions
        : [];

    // Determine requiresRuntime
    const requiresRuntime = permissions.includes("model.run");

    // Default validator function based on input metadata
    let validateInput = impl.validateInput;
    if (!validateInput && inputMetadata) {
      validateInput = generateDefaultValidator(inputMetadata.required);
    }

    // Determine handler
    let handle = impl.handle;
    if (!handle && typeof impl.buildPrompt === "function") {
      handle = async ({ input, runtime, options }) => {
        const prompt = impl.buildPrompt(input);
        const result = await runtime.generateJson(prompt, outputSchema, {
          temperature: 0.2,
          ...options
        });
        return result;
      };
    }

    if (typeof handle !== "function") {
      console.warn(`[Registry Loader] Warning: Tool '${toolId}' has no executable handler.`);
      continue;
    }

    const tool = {
      id: toolId,
      name: toolDef.name || formatToolName(toolId),
      pack: manifest.id,
      trust: manifest.trust,
      packVersion: manifest.version,
      description: toolDef.description || "",
      tasks,
      permissions,
      modelRole: toolDef.model_role || null,
      requiresRuntime,
      inputSchema: inputSchemaPath,
      outputSchema: outputSchemaPath,
      input: inputMetadata,
      output: outputSchema,
      validateInput,
      handle
    };

    registerTool(toolsMap, tool);
  }
}

function formatToolName(id) {
  return id
    .split(/[._-]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function generateDefaultValidator(requiredFields) {
  return (input) => {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return {
        code: "INVALID_INPUT",
        message: "Tool input must be an object.",
        nextStep: `Send the required fields: ${requiredFields.join(", ")}.`
      };
    }

    for (const key of requiredFields) {
      if (key === "text") {
        if (typeof input.text !== "string" || input.text.trim().length === 0) {
          return {
            code: "INVALID_INPUT",
            message: "Tool input requires non-empty text.",
            nextStep: "Include text as a non-empty string."
          };
        }
      } else if (!Object.prototype.hasOwnProperty.call(input, key)) {
        return {
          code: "INVALID_INPUT",
          message: `Tool input requires '${key}'.`,
          nextStep: `Include '${key}' in the input object.`
        };
      }
    }

    return null;
  };
}

function toInternalToolRegistryMetadata(tool) {
  const metadata = {
    id: tool.id,
    name: tool.name,
    description: typeof tool.description === "string" ? tool.description : "",
    tasks: tool.tasks,
    permissions: Array.isArray(tool.permissions) ? tool.permissions : [],
    modelRole: tool.modelRole ?? null,
    requiresRuntime: tool.requiresRuntime === true,
    inputSchema: tool.inputSchema ?? null,
    outputSchema: tool.outputSchema ?? null,
    input: tool.input ?? null,
    output: tool.output ?? null
  };

  if (typeof tool.pack === "string") {
    metadata.pack = tool.pack;
  }

  if (typeof tool.trust === "string") {
    metadata.trust = tool.trust;
  }

  if (typeof tool.packVersion === "string") {
    metadata.packVersion = tool.packVersion;
  }

  if (typeof tool.prompt === "string") {
    metadata.prompt = tool.prompt;
  }

  return metadata;
}

function validateInternalToolRegistryEntry(tool) {
  const validation = validateResult(
    toInternalToolRegistryMetadata(tool),
    internalToolRegistryEntrySchema,
    "tool"
  );

  if (validation.ok) {
    return validation;
  }

  const error = new Error(`Registered tool '${tool.id}' did not match internal-tool-registry-entry.schema.json.`);
  error.code = "INTERNAL_TOOL_REGISTRY_ENTRY_INVALID";
  error.toolId = tool.id;
  if (typeof tool.pack === "string") {
    error.packId = tool.pack;
  }
  error.nextStep = "Fix tool registry normalization or update the internal registry schema.";
  error.validation = validation;
  throw error;
}

function registerTool(toolsMap, tool) {
  validateTool(tool);
  validateInternalToolRegistryEntry(tool);
  toolsMap.set(tool.id, tool);
}

function toPublicToolMetadata(tool) {
  return {
    id: tool.id,
    name: tool.name,
    pack: tool.pack || "built-in",
    pack_trust: tool.trust || "official",
    pack_version: tool.packVersion || "0.1.0",
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
  createToolRegistry,
  loadToolPack,
  parseToolPackManifest,
  validateLoadedToolPackManifest,
  toInternalToolRegistryMetadata,
  validateInternalToolRegistryEntry,
  registerTool
};
