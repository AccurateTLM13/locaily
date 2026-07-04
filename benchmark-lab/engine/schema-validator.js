function validateSchema(value, schema, path = "value") {
  const errors = [];
  validateValue(value, schema, path, errors);
  return {
    ok: errors.length === 0,
    errors
  };
}

function validateValue(value, schema, path, errors) {
  if (!schema || typeof schema !== "object") {
    return;
  }

  if (Object.prototype.hasOwnProperty.call(schema, "const") && value !== schema.const) {
    errors.push(`${path} must equal ${JSON.stringify(schema.const)}.`);
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path} must be one of: ${schema.enum.join(", ")}.`);
  }

  if (schema.type) {
    validateType(value, schema.type, path, errors);
  }

  if (typeof value === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength) {
      errors.push(`${path} must be at least ${schema.minLength} characters.`);
    }

    if (schema.format === "date-time" && Number.isNaN(Date.parse(value))) {
      errors.push(`${path} must be a date-time string.`);
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

  if (schema.type === "object" && isPlainObject(value)) {
    validateObject(value, schema, path, errors);
  }

  if (schema.type === "array" && Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) {
      errors.push(`${path} must contain at least ${schema.minItems} item(s).`);
    }

    if (schema.items) {
      value.forEach((item, index) => validateValue(item, schema.items, `${path}[${index}]`, errors));
    }
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

  if (schema.additionalProperties === false) {
    for (const key of Object.keys(value)) {
      if (!Object.prototype.hasOwnProperty.call(properties, key)) {
        errors.push(`${path}.${key} is not allowed.`);
      }
    }
  }
}

function validateType(value, type, path, errors) {
  if (type === "array") {
    if (!Array.isArray(value)) {
      errors.push(`${path} must be an array.`);
    }
    return;
  }

  if (type === "integer") {
    if (!Number.isInteger(value)) {
      errors.push(`${path} must be an integer.`);
    }
    return;
  }

  if (type === "object") {
    if (!isPlainObject(value)) {
      errors.push(`${path} must be an object.`);
    }
    return;
  }

  if (type && typeof value !== type) {
    errors.push(`${path} must be a ${type}.`);
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

module.exports = {
  validateSchema
};
