const path = require("node:path");
const { validateResult } = require("../core/result-validator");
const { getTrackRegistryEntry } = require("./track-registry");

function loadSchema(schemaPath) {
  if (!schemaPath) {
    return null;
  }

  const resolved = path.resolve(__dirname, "..", "..", schemaPath);
  return require(resolved);
}

function validateStepOutput(planStep, output, trackStep) {
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
    const schema = loadSchema(trackStep.executor.schema);
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

  if (planStep.step_id === "verify_output" || planStep.step_id === "validate_analysis") {
    if (typeof output.valid !== "boolean") {
      return {
        ok: false,
        code: "STEP_OUTPUT_INVALID",
        message: `Verification step '${planStep.step_id}' must return valid boolean.`,
        errors: ["valid boolean is required"]
      };
    }

    if (output.valid === false) {
      return {
        ok: false,
        code: "STEP_VERIFICATION_FAILED",
        message: `Verification step '${planStep.step_id}' reported invalid output.`,
        errors: Array.isArray(output.errors) ? output.errors : ["verification failed"]
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
    const schema = loadSchema(expectations.output_schema);
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
  validateStepOutput,
  validateWorkflowResult
};
