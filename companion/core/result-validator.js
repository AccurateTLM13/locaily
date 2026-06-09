function validateResult(result, schema, path = "result") {
  const errors = [];
  validateValue(result, schema, path, errors);

  return {
    ok: errors.length === 0,
    errors
  };
}

async function runToolWithValidation({
  tool,
  runOnce,
  fallbackPolicy = {},
  allowRetry = true
}) {
  const fallbacksUsed = [];
  const firstResult = await runOnce();
  const firstValidation = validateResult(firstResult, tool.output);

  if (firstValidation.ok) {
    return {
      ok: true,
      result: firstResult,
      validation: firstValidation,
      fallbacks_used: fallbacksUsed
    };
  }

  const shouldRetry = allowRetry
    && tool.requiresRuntime !== false
    && fallbackPolicy.on_schema_fail === "retry_same_model_once";

  if (shouldRetry) {
    fallbacksUsed.push("retry_same_model_once");

    const retryResult = await runOnce({
      retry_reason: "schema_validation_failed",
      validation_errors: firstValidation.errors
    });
    const retryValidation = validateResult(retryResult, tool.output);

    if (retryValidation.ok) {
      return {
        ok: true,
        result: retryResult,
        validation: retryValidation,
        fallbacks_used: fallbacksUsed
      };
    }

    return buildSchemaFailure(retryValidation, fallbacksUsed);
  }

  return buildSchemaFailure(firstValidation, fallbacksUsed);
}

function buildSchemaFailure(validation, fallbacksUsed) {
  const error = new Error("Tool result did not match the output schema.");
  error.code = "SCHEMA_VALIDATION_FAILED";
  error.nextStep = "Update the tool handler or model prompt so the result matches the tool output schema.";
  error.validation = validation;
  error.fallbacks_used = fallbacksUsed;
  throw error;
}

function validateValue(value, schema, path, errors) {
  if (!schema || typeof schema !== "object") {
    return;
  }

  if (schema.type) {
    validateType(value, schema, path, errors);
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path} must be one of: ${schema.enum.join(", ")}.`);
  }

  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) {
      errors.push(`${path} must be at least ${schema.minimum}.`);
    }

    if (typeof schema.maximum === "number" && value > schema.maximum) {
      errors.push(`${path} must be at most ${schema.maximum}.`);
    }
  }

  if (schema.type === "object" && value && typeof value === "object" && !Array.isArray(value)) {
    validateObject(value, schema, path, errors);
  }

  if (schema.type === "array" && Array.isArray(value) && schema.items) {
    value.forEach((item, index) => validateValue(item, schema.items, `${path}[${index}]`, errors));
  }
}

function validateObject(value, schema, path, errors) {
  const required = Array.isArray(schema.required) ? schema.required : [];

  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      errors.push(`${path}.${key} is required.`);
    }
  }

  const properties = schema.properties || {};

  for (const [key, propertySchema] of Object.entries(properties)) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      validateValue(value[key], propertySchema, `${path}.${key}`, errors);
    }
  }
}

function validateType(value, schema, path, errors) {
  if (schema.type === "array") {
    if (!Array.isArray(value)) {
      errors.push(`${path} must be an array.`);
    }

    return;
  }

  if (schema.type === "integer") {
    if (!Number.isInteger(value)) {
      errors.push(`${path} must be an integer.`);
    }

    return;
  }

  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      errors.push(`${path} must be an object.`);
    }

    return;
  }

  if (schema.type && typeof value !== schema.type) {
    errors.push(`${path} must be a ${schema.type}.`);
  }
}

module.exports = {
  validateResult,
  runToolWithValidation
};
