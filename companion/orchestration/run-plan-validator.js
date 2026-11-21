const fs = require("node:fs");
const path = require("node:path");
const { validateResult } = require("../core/result-validator");
const { getTrackRegistryEntry } = require("./track-registry");
const { resolvePackSchemaPath } = require("../packs");
const workflowVerificationResultSchema = require("../schemas/internal/workflow-verification-result.schema.json");

function loadSchema(schemaPath, trackId = null) {
  if (!schemaPath) {
    return null;
  }

  const resolved = resolvePackSchemaPath(schemaPath, trackId);
  return JSON.parse(fs.readFileSync(resolved, "utf8"));
}

function resolveVerificationStepId(track) {
  if (!track || typeof track !== "object") {
    return null;
  }

  if (typeof track.verification_step === "string" && track.verification_step.trim()) {
    return track.verification_step.trim();
  }

  const registryEntry = getTrackRegistryEntry(track.track_id);
  const designatedStep = registryEntry
    && registryEntry.validation_expectations
    && registryEntry.validation_expectations.verification_step;

  return typeof designatedStep === "string" && designatedStep.trim()
    ? designatedStep.trim()
    : null;
}

function isVerificationGateStep(planStep, track) {
  const verificationStepId = resolveVerificationStepId(track);

  if (!verificationStepId || !planStep || typeof planStep.step_id !== "string") {
    return false;
  }

  return planStep.step_id === verificationStepId;
}

function resolveVerificationToolId(trackStep) {
  if (!trackStep || !trackStep.executor || trackStep.executor.type !== "tool") {
    return null;
  }

  return typeof trackStep.executor.tool === "string" ? trackStep.executor.tool : null;
}

function validateWorkflowVerificationOutput(output) {
  return validateResult(output, workflowVerificationResultSchema, "verification");
}

function buildWorkflowVerificationResultInvalid(planStep, trackStep, schemaValidation) {
  return {
    ok: false,
    code: "WORKFLOW_VERIFICATION_RESULT_INVALID",
    message: `Verification step '${planStep.step_id}' returned an invalid verification result.`,
    errors: schemaValidation.errors,
    stepId: planStep.step_id,
    toolId: resolveVerificationToolId(trackStep),
    nextStep: "Fix the verification producer output or update workflow-verification-result.schema.json.",
    validation: schemaValidation
  };
}

function validateStepOutput(planStep, output, trackStep, track = null) {
  if (output === undefined || output === null) {
    return {
      ok: false,
      code: "STEP_OUTPUT_MISSING",
      message: `Step '${planStep.step_id}' returned no output.`,
      errors: ["output is missing"]
    };
  }

  if (typeof output !== "object" || Array.isArray(output)) {
    return {
      ok: false,
      code: "STEP_OUTPUT_INVALID",
      message: `Step '${planStep.step_id}' returned a non-object output.`,
      errors: ["expected object output"]
    };
  }

  if (trackStep.executor.type === "model" && trackStep.executor.schema) {
    const schema = loadSchema(trackStep.executor.schema, track ? track.track_id : null);
    const validation = validateResult(output, schema);

    return {
      ok: validation.ok,
      code: validation.ok ? null : "STEP_SCHEMA_INVALID",
      message: validation.ok
        ? null
        : `Step '${planStep.step_id}' output failed schema validation.`,
      errors: validation.errors
    };
  }

  if (isVerificationGateStep(planStep, track)) {
    const schemaValidation = validateWorkflowVerificationOutput(output);

    if (!schemaValidation.ok) {
      return buildWorkflowVerificationResultInvalid(planStep, trackStep, schemaValidation);
    }

    if (output.valid === false) {
      return {
        ok: false,
        code: "STEP_VERIFICATION_FAILED",
        message: `Verification step '${planStep.step_id}' reported invalid output.`,
        errors: output.errors
      };
    }
  }

  return { ok: true, errors: [] };
}

function validateWorkflowResult(trackId, result) {
  const registryEntry = getTrackRegistryEntry(trackId);
  const expectations = registryEntry.validation_expectations || {};
  const errors = [];

  if (Array.isArray(expectations.required_result_sections)) {
    for (const section of expectations.required_result_sections) {
      if (!(section in result)) {
        errors.push(`Missing required result section '${section}'.`);
      }
    }
  }

  if (expectations.output_schema) {
    const schema = loadSchema(expectations.output_schema, trackId);
    const schemaValidation = validateResult(result, schema);

    if (!schemaValidation.ok) {
      errors.push(...schemaValidation.errors);
    }
  }

  if (result.meta && result.meta.verification && result.meta.verification.valid === false) {
    errors.push("Final verification reported invalid output.");
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

module.exports = {
  resolveVerificationStepId,
  isVerificationGateStep,
  validateWorkflowVerificationOutput,
  validateStepOutput,
  validateWorkflowResult
};
