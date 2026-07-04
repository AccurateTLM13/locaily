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
  const suitability = typeof options.getRoleSuitability === "function"
    ? options.getRoleSuitability(modelResolution.role)
    : null;
  const qualification = typeof options.getModelQualificationEvidence === "function"
    ? options.getModelQualificationEvidence({
      model: modelResolution.model,
      role: modelResolution.role,
      trackId: options.track_id || null,
      contractId: executor.contract || executor.contract_id || null
    })
    : null;
  const qualificationPolicy = evaluateQualificationPolicy({
    policy: options.qualification_policy || options.qualificationPolicy || "advisory",
    qualification,
    model: modelResolution.model,
    role: modelResolution.role,
    trackId: options.track_id || null
  });

  if (!qualificationPolicy.ok) {
    const error = new Error(qualificationPolicy.message);
    error.code = qualificationPolicy.code;
    error.nextStep = qualificationPolicy.nextStep;
    error.qualification = qualification;
    throw error;
  }

  const output = await runtime.generateJson(prompt, schema, {
    ...options,
    model: modelResolution.model,
    temperature: 0.2
  });

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
      qualification,
      durationMs: Date.now() - stepStart
    }
  };
}

function evaluateQualificationPolicy({
  policy = "advisory",
  qualification = null,
  model,
  role,
  trackId
}) {
  const normalizedPolicy = normalizePolicy(policy);
  const status = qualification && typeof qualification.status === "string"
    ? qualification.status
    : null;

  if (normalizedPolicy === "advisory") {
    return { ok: true };
  }

  if (normalizedPolicy === "reject_rejected") {
    if (status === "rejected" || status === "revalidation_required") {
      return buildPolicyFailure({
        model,
        role,
        trackId,
        code: "MODEL_QUALIFICATION_REJECTED",
        message: `Model '${model}' is not allowed for role '${role}' because benchmark qualification status is '${status}'.`,
        nextStep: "Choose another model or regenerate qualification evidence after fixing the failure."
      });
    }

    return { ok: true };
  }

  if (normalizedPolicy === "require_qualified") {
    if (status === "qualified") {
      return { ok: true };
    }

    return buildPolicyFailure({
      model,
      role,
      trackId,
      code: "MODEL_NOT_QUALIFIED",
      message: `Model '${model}' requires qualified Benchmark Lab evidence for role '${role}'.`,
      nextStep: "Run Benchmark Lab, promote evidence, and generate a qualified record before using this policy."
    });
  }

  if (normalizedPolicy === "require_qualified_or_conditional") {
    if (status === "qualified" || status === "conditional") {
      return { ok: true };
    }

    return buildPolicyFailure({
      model,
      role,
      trackId,
      code: "MODEL_NOT_QUALIFIED",
      message: `Model '${model}' requires qualified or conditional Benchmark Lab evidence for role '${role}'.`,
      nextStep: "Run Benchmark Lab, promote evidence, and generate a qualified or conditional record before using this policy."
    });
  }

  return {
    ok: false,
    code: "QUALIFICATION_POLICY_INVALID",
    message: `Unknown qualification policy '${policy}'.`,
    nextStep: "Use advisory, reject_rejected, require_qualified, or require_qualified_or_conditional."
  };
}

function buildPolicyFailure({ code, message, nextStep }) {
  return {
    ok: false,
    code,
    message,
    nextStep
  };
}

function normalizePolicy(policy) {
  return typeof policy === "string" ? policy.trim() : "advisory";
}

module.exports = {
  resolveModel,
  resolveStepModel,
  buildModelStepInput,
  executeModelStep,
  evaluateQualificationPolicy
};
