const { validateResult } = require("../core/result-validator");

const SCHEMAS = Object.freeze({
  "event-envelope.v1": require("../schemas/capability-kernel/event-envelope.schema.json"),
  "capability-manifest.v1": require("../schemas/capability-kernel/capability-manifest.schema.json"),
  "execution-plan.v1": require("../schemas/capability-kernel/execution-plan.schema.json"),
  "run-record.v1": require("../schemas/capability-kernel/run-record.schema.json"),
  "node-config.v1": require("../schemas/capability-kernel/node-config.schema.json"),
  "status-handoff-output.v1": require("../schemas/capability-kernel/status-handoff-output.schema.json")
});

function hasSchema(schemaId) {
  return Object.prototype.hasOwnProperty.call(SCHEMAS, schemaId);
}

function getSchema(schemaId) {
  return SCHEMAS[schemaId] || null;
}

function validateContract(value, schemaId, path = schemaId) {
  const schema = getSchema(schemaId);

  if (!schema) {
    return {
      ok: false,
      errors: [`Unknown schema '${schemaId}'.`]
    };
  }

  return validateResult(value, schema, path);
}

function assertContract(value, schemaId, code, path = schemaId) {
  const validation = validateContract(value, schemaId, path);

  if (validation.ok) {
    return validation;
  }

  const error = new Error(`${path} did not match ${schemaId}: ${validation.errors.join("; ")}`);
  error.code = code;
  error.validation = validation;
  throw error;
}

module.exports = {
  SCHEMAS,
  hasSchema,
  getSchema,
  validateContract,
  assertContract
};
