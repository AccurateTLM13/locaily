const fs = require("node:fs");
const path = require("node:path");
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
      switches: result.switches || []
    };
  }

  return {
    ok: true,
    role: role || "default_worker",
    model: "mock-local-model",
    switches: []
  };
}

function loadStepSchema(schemaPath) {
  const absolutePath = path.resolve(__dirname, "..", "..", schemaPath);
  return JSON.parse(fs.readFileSync(absolutePath, "utf8"));
}

async function executeModelStep({ step, context, runtime, options }) {
  const executor = step.executor;
  const role = executor.role || "default_worker";
  const modelResolution = resolveModel(role, options.resolveModelForRole);
  const schema = loadStepSchema(executor.schema);
  const prompt = buildPrompt(executor.prompt_template, context);
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
      profile_id: options.profile_id || null,
      suitability,
      switches: modelResolution.switches || [],
      durationMs: Date.now() - stepStart
    }
  };
}

module.exports = {
  resolveModel,
  executeModelStep
};
