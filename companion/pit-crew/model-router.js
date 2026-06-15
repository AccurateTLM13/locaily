const fs = require("node:fs");
const path = require("node:path");
const { buildModelStepInput } = require("./step-input");
const { buildPrompt } = require("./prompts");

function resolveModel(role, resolveModelForRole) {
  const resolver = typeof resolveModelForRole === "function"
    ? resolveModelForRole
    : () => ({ ok: true, model: "mock-local-model" });

  const result = resolver(role || "default_worker");

  if (result && result.ok && result.model) {
    return {
      ok: true,
      role: role || "default_worker",
      model: result.model,
      source: "role_resolution"
    };
  }

  return {
    ok: true,
    role: role || "default_worker",
    model: "mock-local-model",
    source: "role_resolution"
  };
}

function resolveStepModel(role, options = {}) {
  const explicitModel = typeof options.model === "string" ? options.model.trim() : "";

  if (explicitModel) {
    return {
      ok: true,
      role: role || "default_worker",
      model: explicitModel,
      source: "request_override"
    };
  }

  return resolveModel(role, options.resolveModelForRole);
}

function loadStepSchema(schemaPath) {
  const absolutePath = path.resolve(__dirname, "..", "..", schemaPath);
  return JSON.parse(fs.readFileSync(absolutePath, "utf8"));
}

async function executeModelStep({ step, context, runtime, options }) {
  const executor = step.executor;
  const role = executor.role || "default_worker";
  const modelResolution = resolveStepModel(role, options);
  const schema = loadStepSchema(executor.schema);
  const stepInput = buildModelStepInput(step, context);
  const prompt = buildPrompt(executor.prompt_template, context, stepInput);
  const stepStart = Date.now();

  const output = await runtime.generateJson(prompt, schema, {
    ...options,
    model: modelResolution.model,
    temperature: 0.2
  });

  const suitability = typeof options.getRoleSuitability === "function"
    ? options.getRoleSuitability(modelResolution.role)
    : null;

  return {
    output,
    meta: {
      step_id: step.id,
      executor_type: "model",
      model: modelResolution.model,
      role: modelResolution.role,
      model_source: modelResolution.source || "role_resolution",
      profile_id: options.profile_id || null,
      suitability,
      durationMs: Date.now() - stepStart
    }
  };
}

module.exports = {
  resolveModel,
  resolveStepModel,
  buildModelStepInput,
  executeModelStep
};
