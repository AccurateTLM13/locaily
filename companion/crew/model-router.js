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

  let shadowRouting = null;
  if (typeof options.shadowRouter === "function") {
    try {
      shadowRouting = options.shadowRouter({
        role: modelResolution.role,
        trackId: options.track_id || null,
        contractId: executor.contract || executor.contract_id || null,
        currentModelId: modelResolution.model,
        currentQualification: qualification
      });
    } catch (shadowError) {
      console.warn("[Shadow Routing] Failed to compute recommendation:", shadowError.message);
    }
  }

  let enforcementDecision = null;
  const originalModel = modelResolution.model;
  let fallbackExecution = false;

  if (options.enforcementPolicy && shadowRouting && modelResolution.model) {
    try {
      enforcementDecision = await evaluateEnforcement({
        enforcementPolicy: options.enforcementPolicy,
        trackId: options.track_id || null,
        role: modelResolution.role,
        contractId: executor.contract || executor.contract_id || null,
        recommendedCapabilityId: shadowRouting.recommendedCapabilityId,
        recommendedRuntimeModelName: shadowRouting.recommendedRuntimeModelName,
        score: shadowRouting.recommendedScore,
        qualificationState: shadowRouting.recommendedQualificationState || shadowRouting.state,
        selectedQualificationState: shadowRouting.selectedQualificationState || shadowRouting.state,
        recommendedQualificationState: shadowRouting.recommendedQualificationState,
        comparisonState: shadowRouting.comparison,
        currentModelId: originalModel,
        shadowRecommendation: shadowRouting
      });
    } catch (enfError) {
      console.warn("[Enforcement] Failed to evaluate enforcement:", enfError.message);
    }
  }

  if (enforcementDecision && enforcementDecision.applied) {
    modelResolution.model = shadowRouting.recommendedRuntimeModelName || enforcementDecision.recommendedCapabilityId;
    modelResolution.source = "enforcement";
  }

  if (!qualificationPolicy.ok) {
    const error = new Error(qualificationPolicy.message);
    error.code = qualificationPolicy.code;
    error.nextStep = qualificationPolicy.nextStep;
    error.qualification = qualification;
    error.shadowRouting = shadowRouting;
    error.enforcementDecision = enforcementDecision;
    throw error;
  }

  let output;
  let executionError = null;
  let fallbackCapabilityId = null;
  let fallbackSucceeded = false;

  try {
    output = await runtime.generateJson(prompt, schema, {
      ...options,
      model: modelResolution.model,
      temperature: 0.2
    });
  } catch (execErr) {
    if (enforcementDecision && enforcementDecision.applied && originalModel !== modelResolution.model) {
      executionError = execErr;
      fallbackCapabilityId = originalModel;
      try {
        output = await runtime.generateJson(prompt, schema, {
          ...options,
          model: originalModel,
          temperature: 0.2
        });
        fallbackSucceeded = true;
        if (enforcementDecision) {
          enforcementDecision.fallbackTriggered = true;
          enforcementDecision.fallbackCapabilityId = fallbackCapabilityId;
          enforcementDecision.fallbackSucceeded = true;
          enforcementDecision.originalError = {
            message: execErr.message,
            code: execErr.code || "EXECUTION_ERROR"
          };
        }
        modelResolution.model = originalModel;
        modelResolution.source = "fallback";
      } catch (fallbackErr) {
        if (enforcementDecision) {
          enforcementDecision.fallbackTriggered = true;
          enforcementDecision.fallbackCapabilityId = fallbackCapabilityId;
          enforcementDecision.fallbackSucceeded = false;
          enforcementDecision.originalError = {
            message: execErr.message,
            code: execErr.code || "EXECUTION_ERROR"
          };
        }
        throw execErr;
      }
    } else {
      throw execErr;
    }
  }

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
      shadowRouting,
      enforcementDecision,
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

async function evaluateEnforcement({
  enforcementPolicy,
  trackId,
  role,
  contractId,
  recommendedCapabilityId,
  recommendedRuntimeModelName,
  score,
  qualificationState,
  selectedQualificationState,
  recommendedQualificationState,
  comparisonState,
  currentModelId,
  shadowRecommendation
}) {
  const decision = {
    attempted: false,
    eligible: false,
    applied: false,
    state: "shadow",
    reason: "Enforcement not evaluated",
    failedConditions: [],
    overrideApplied: false,
    fallbackCapabilityId: currentModelId,
    fallbackTriggered: false,
    fallbackSucceeded: false,
    originalError: null,
    selectedCapabilityId: currentModelId,
    recommendedCapabilityId: recommendedCapabilityId || null,
    executedCapabilityId: currentModelId,
    selectedQualificationState: selectedQualificationState || "untested",
    recommendedQualificationState: recommendedQualificationState || null,
    qualificationRecordId: (shadowRecommendation && shadowRecommendation.qualificationRecordId) || null
  };

  if (!trackId || !recommendedCapabilityId) {
    decision.reason = "No recommendation available for enforcement";
    return decision;
  }

  const trackState = enforcementPolicy.getTrackState ? enforcementPolicy.getTrackState(trackId) : "shadow";
  decision.state = trackState;

  if (trackState !== "enforced") {
    decision.reason = `Track '${trackId}' is in '${trackState}' state. Only 'enforced' permits routing changes.`;
    decision.failedConditions.push({ condition: "track_state", detail: `State is '${trackState}', requires 'enforced'` });
    return decision;
  }

  if (!enforcementPolicy.isTrackApproved || !enforcementPolicy.isTrackApproved(trackId)) {
    decision.reason = `Track '${trackId}' is not approved for enforcement.`;
    decision.failedConditions.push({ condition: "track_approved", detail: "Track not in approved list" });
    return decision;
  }

  const eligibility = await enforcementPolicy.evaluateEligibility({
    trackId,
    role,
    recommendedCapabilityId,
    recommendedRuntimeModelName,
    contractId: contractId || undefined,
    score: score != null ? score : null,
    qualificationState: qualificationState || "untested",
    comparisonState: comparisonState || "recommendation-unavailable",
    selectedQualificationState: selectedQualificationState || "untested",
    recommendedQualificationState: recommendedQualificationState || null
  });

  decision.attempted = true;
  decision.eligible = eligibility.eligible || false;
  decision.reason = eligibility.reason || "Enforcement evaluation completed";
  decision.failedConditions = (eligibility.blocks || []).map((b) => ({ condition: "policy_block", detail: b }));
  decision.checks = eligibility.checks || [];

  if (eligibility.canEnforce && eligibility.eligible) {
    decision.applied = true;
    decision.executedCapabilityId = recommendedCapabilityId;
    decision.reason = "All enforcement gates passed";
  } else {
    decision.applied = false;
    if (eligibility.blocks && eligibility.blocks.length > 0) {
      decision.reason = `Enforcement blocked: ${eligibility.blocks[0]}`;
    } else {
      decision.reason = "Enforcement eligibility not met";
    }
  }

  return decision;
}

module.exports = {
  resolveModel,
  resolveStepModel,
  buildModelStepInput,
  executeModelStep,
  evaluateQualificationPolicy,
  evaluateEnforcement
};
