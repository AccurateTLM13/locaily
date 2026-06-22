function validateResult(result, schema, path = "result") {
  const errors = [];
  validateValue(result, schema, path, errors, schema);

  return {
    ok: errors.length === 0,
    errors
  };
}

function resolveSchemaReference(schema, rootSchema) {
  if (!schema || typeof schema !== "object" || !schema.$ref || !rootSchema) {
    return schema;
  }

  if (!schema.$ref.startsWith("#/")) {
    return schema;
  }

  const parts = schema.$ref.slice(2).split("/");
  let node = rootSchema;

  for (const part of parts) {
    if (!node || typeof node !== "object") {
      return schema;
    }

    node = node[part];
  }

  return node || schema;
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

function validateValue(value, schema, path, errors, rootSchema) {
  if (!schema || typeof schema !== "object") {
    return;
  }

  const resolvedSchema = resolveSchemaReference(schema, rootSchema);

  if (resolvedSchema !== schema) {
    validateValue(value, resolvedSchema, path, errors, rootSchema);
    return;
  }

  if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
    validateOneOf(value, schema, path, errors, rootSchema);
    return;
  }

  if (Object.prototype.hasOwnProperty.call(schema, "const") && value !== schema.const) {
    errors.push(`${path} must be ${JSON.stringify(schema.const)}.`);
  }

  if (schema.type) {
    validateType(value, schema, path, errors);
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path} must be one of: ${schema.enum.join(", ")}.`);
  }

  if (typeof value === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength) {
      errors.push(`${path} must be at least ${schema.minLength} characters.`);
    }
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
    validateObject(value, schema, path, errors, rootSchema);
  }

  if (schema.type === "array" && Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) {
      errors.push(`${path} must contain at least ${schema.minItems} item(s).`);
    }

    if (schema.items) {
      const itemSchema = resolveSchemaReference(schema.items, rootSchema);
      value.forEach((item, index) => validateValue(item, itemSchema, `${path}[${index}]`, errors, rootSchema));
    }
  }
}

function validateObject(value, schema, path, errors, rootSchema) {
  const required = Array.isArray(schema.required) ? schema.required : [];

  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      errors.push(`${path}.${key} is required.`);
    }
  }

  const properties = schema.properties || {};

  for (const [key, propertySchema] of Object.entries(properties)) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      validateValue(value[key], propertySchema, `${path}.${key}`, errors, rootSchema);
    }
  }

  if (schema.additionalProperties === false) {
    const allowedKeys = new Set([
      ...required,
      ...Object.keys(properties)
    ]);

    for (const key of Object.keys(value)) {
      if (!allowedKeys.has(key)) {
        errors.push(`${path}.${key} is not allowed.`);
      }
    }
  }
}

function validateOneOf(value, schema, path, errors, rootSchema) {
  const passing = [];

  for (const option of schema.oneOf) {
    const branchErrors = [];
    validateValue(value, option, path, branchErrors, rootSchema);

    if (branchErrors.length === 0) {
      passing.push(option);
    }
  }

  if (passing.length === 1) {
    return;
  }

  if (passing.length === 0) {
    errors.push(`${path} must match one of the allowed shapes defined in the schema.`);

    const sampleErrors = [];
    validateValue(value, schema.oneOf[0], path, sampleErrors, rootSchema);
    sampleErrors.slice(0, 3).forEach((message) => errors.push(message));
    return;
  }

  errors.push(`${path} is ambiguous: it matches more than one allowed schema shape.`);
}

function validateType(value, schema, path, errors) {
  if (Array.isArray(schema.type)) {
    if (!schema.type.some((typeName) => matchesJsonType(value, typeName))) {
      errors.push(`${path} must be ${schema.type.join(" or ")}.`);
    }

    return;
  }

  if (schema.type === "null") {
    if (value !== null) {
      errors.push(`${path} must be null.`);
    }

    return;
  }

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

function matchesJsonType(value, typeName) {
  if (typeName === "null") {
    return value === null;
  }

  if (typeName === "array") {
    return Array.isArray(value);
  }

  if (typeName === "integer") {
    return Number.isInteger(value);
  }

  if (typeName === "object") {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  return typeof value === typeName;
}

module.exports = {
  validateResult,
  runToolWithValidation
};
