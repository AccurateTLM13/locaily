const ALLOWED_MEMORY_AUDIT_OUTPUT_FIELDS = new Set([
  "contextPackId",
  "project",
  "task",
  "filesUsed",
  "warnings",
  "used",
  "proposalId",
  "proposalPath",
  "requiresHumanReview",
  "enabled",
  "mode",
  "vaultPathConfigured",
  "readable",
  "readPolicy",
  "writebackMode",
  "rawAccess",
  "effectiveAllowedPaths",
  "effectiveBlockedPaths",
  "projectCount",
  "topicCount"
]);

const FORBIDDEN_AUDIT_PATTERNS = [
  /excerpts/i,
  /proposalBody/i,
  /vaultPath/i,
  /raw vault/i
];

function redactMemoryResultForAudit(result, endpoint = null) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return null;
  }

  if (endpoint === "memory/status") {
    return nullIfEmpty(pickAllowedFields(result, [
      "enabled",
      "mode",
      "vaultPathConfigured",
      "readable",
      "readPolicy",
      "writebackMode",
      "rawAccess",
      "effectiveAllowedPaths",
      "effectiveBlockedPaths",
      "projectCount",
      "topicCount",
      "warnings"
    ]));
  }

  if (endpoint === "memory/context-pack") {
    return nullIfEmpty(pickAllowedFields(result, [
      "contextPackId",
      "project",
      "task",
      "filesUsed",
      "warnings"
    ]));
  }

  if (endpoint === "memory/writeback/propose") {
    return nullIfEmpty(pickAllowedFields(result, [
      "proposalId",
      "proposalPath",
      "requiresHumanReview"
    ]));
  }

  if (result.contextPackId || result.filesUsed) {
    return nullIfEmpty(pickAllowedFields(result, [
      "contextPackId",
      "project",
      "task",
      "filesUsed",
      "warnings"
    ]));
  }

  return null;
}

function redactMemoryRequestForAudit(requestBody = {}, endpoint = null) {
  const safe = {
    type: "memory_request",
    endpoint: endpoint || "memory"
  };

  if (requestBody.project) {
    safe.project = String(requestBody.project);
  }

  if (requestBody.task) {
    safe.task = String(requestBody.task);
  }

  if (requestBody.taskId) {
    safe.taskId = String(requestBody.taskId);
  }

  if (typeof requestBody.maxFiles === "number") {
    safe.maxFiles = requestBody.maxFiles;
  }

  return safe;
}

function redactToolResultMemoryForAudit(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return null;
  }

  if (!result.memory || typeof result.memory !== "object") {
    return {
      type: "object",
      keys: Object.keys(result).slice(0, 20)
    };
  }

  return {
    type: "object",
    keys: Object.keys(result).slice(0, 20),
    memory: pickAllowedFields(result.memory, [
      "used",
      "contextPackId",
      "filesUsed",
      "warnings"
    ])
  };
}

function buildMemoryAuditEvent({
  identity,
  startedAt,
  endpoint,
  requestBody = {},
  responseBody = {},
  statusCode = 200
}) {
  const result = responseBody.result || {};
  const warnings = Array.isArray(responseBody.warnings) ? responseBody.warnings : [];

  return {
    run_id: identity.run_id,
    trace_id: identity.trace_id,
    tool: "memory-bridge",
    task: endpoint,
    provider: null,
    model: null,
    model_role: null,
    permissions_used: endpoint === "memory/writeback/propose"
      ? ["memory.writeback.propose"]
      : [],
    input_summary: redactMemoryRequestForAudit(requestBody, endpoint),
    output_summary: redactMemoryResultForAudit(result, endpoint) || {
      type: "memory_response",
      ok: Boolean(responseBody.ok),
      warnings
    },
    fallbacks_used: [],
    duration_ms: Date.now() - startedAt,
    status: responseBody.ok ? "success" : "error",
    error_code: responseBody.ok ? null : (responseBody.error && responseBody.error.code) || null,
    status_code: statusCode
  };
}

function auditPayloadContainsPrivateMemory(payload) {
  const serialized = JSON.stringify(payload);

  if (/"excerpts"\s*:/.test(serialized)) {
    return true;
  }

  if (/"summary"\s*:/.test(serialized) && /memory-bridge/.test(serialized)) {
    return true;
  }

  if (/"content"\s*:/.test(serialized) && /wiki\//.test(serialized)) {
    return true;
  }

  if (/"vaultPath"\s*:/.test(serialized)) {
    return true;
  }

  if (/"proposalBody"\s*:/.test(serialized)) {
    return true;
  }

  if (/"## Decisions/i.test(serialized) && /audit_/.test(serialized)) {
    return true;
  }

  return false;
}

function pickAllowedFields(source, fields) {
  const picked = {};

  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(source, field)) {
      picked[field] = source[field];
    }
  }

  return picked;
}

function nullIfEmpty(value) {
  return value && Object.keys(value).length > 0 ? value : null;
}

module.exports = {
  ALLOWED_MEMORY_AUDIT_OUTPUT_FIELDS,
  FORBIDDEN_AUDIT_PATTERNS,
  redactMemoryResultForAudit,
  redactMemoryRequestForAudit,
  redactToolResultMemoryForAudit,
  buildMemoryAuditEvent,
  auditPayloadContainsPrivateMemory
};
