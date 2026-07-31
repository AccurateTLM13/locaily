const { createHash } = require("node:crypto");

const SECRET_KEY_PATTERN = /(^|_)(authorization|credential|password|secret|token|api[_-]?key)($|_)/i;

function canonicalJson(value) {
  return JSON.stringify(sortValue(value));
}

function sortValue(value) {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const sorted = {};

  for (const key of Object.keys(value).sort()) {
    if (value[key] !== undefined) {
      sorted[key] = sortValue(value[key]);
    }
  }

  return sorted;
}

function hashCanonical(value) {
  return `sha256:${createHash("sha256").update(canonicalJson(value), "utf8").digest("hex")}`;
}

function sanitizeForRecord(value, key = "") {
  if (SECRET_KEY_PATTERN.test(key)) {
    return "[REDACTED]";
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForRecord(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const result = {};

  for (const [childKey, childValue] of Object.entries(value)) {
    result[childKey] = sanitizeForRecord(childValue, childKey);
  }

  return result;
}

function normalizeEventSnapshot(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return sanitizeForRecord(value);
  }

  return {
    malformed_input_type: Array.isArray(value) ? "array" : typeof value,
    value: sanitizeForRecord(value)
  };
}

module.exports = {
  canonicalJson,
  hashCanonical,
  sanitizeForRecord,
  normalizeEventSnapshot
};
