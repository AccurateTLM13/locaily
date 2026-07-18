const SECRET_FIELD_NAMES = new Set([
  "password",
  "secret",
  "apiKey",
  "api_key",
  "token",
  "accessToken",
  "refreshToken",
  "authorization",
  "credential",
  "privateKey"
]);

const SECRET_VALUE_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._-]{8,}\b/i,
  /\bghp_[A-Za-z0-9]{20,}\b/,
  /\bgho_[A-Za-z0-9]{20,}\b/,
  /\bsk-[A-Za-z0-9]{20,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bapi[_-]?key\s*[:=]\s*\S+/i,
  /\bpassword\s*[:=]\s*\S+/i,
  /\btoken\s*[:=]\s*\S+/i
];

function containsSecretText(value) {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === "string") {
    return SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value));
  }

  if (Array.isArray(value)) {
    return value.some((item) => containsSecretText(item));
  }

  if (typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      if (SECRET_FIELD_NAMES.has(key)) {
        return true;
      }
      if (containsSecretText(nested)) {
        return true;
      }
    }
  }

  return false;
}

function redactStringSecrets(text) {
  if (typeof text !== "string") {
    return text;
  }

  let redacted = text;
  for (const pattern of SECRET_VALUE_PATTERNS) {
    redacted = redacted.replace(pattern, "[REDACTED]");
  }
  return redacted;
}

function redactEventForPersistence(event) {
  const clone = JSON.parse(JSON.stringify(event));

  clone.summary = redactStringSecrets(clone.summary);

  if (clone.validation && typeof clone.validation.notes === "string") {
    clone.validation.notes = redactStringSecrets(clone.validation.notes);
  }

  if (Array.isArray(clone.artifacts)) {
    clone.artifacts = clone.artifacts.map((artifact) => ({
      ...artifact,
      ref: redactStringSecrets(artifact.ref),
      label: artifact.label ? redactStringSecrets(artifact.label) : artifact.label
    }));
  }

  return clone;
}

function validateEventHasNoSecrets(event) {
  if (containsSecretText(event)) {
    return {
      ok: false,
      code: "SECRET_CONTENT_REJECTED",
      message: "Event content appears to contain secrets or credentials.",
      nextStep: "Remove secrets from the event summary, artifacts, and source metadata before recording."
    };
  }

  return { ok: true };
}

module.exports = {
  SECRET_FIELD_NAMES,
  SECRET_VALUE_PATTERNS,
  containsSecretText,
  redactStringSecrets,
  redactEventForPersistence,
  validateEventHasNoSecrets
};
