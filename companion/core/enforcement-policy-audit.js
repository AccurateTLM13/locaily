const { randomUUID } = require("node:crypto");
const { appendFile, mkdir, readFile } = require("node:fs/promises");
const { dirname, join } = require("node:path");
const { validateResult } = require("./result-validator");
const auditEventSchema = require("../schemas/internal/enforcement-policy-audit-event.schema.json");

const AUDIT_FILE = "enforcement-policy-audit.jsonl";

function createEnforcementPolicyAudit(options = {}) {
  const dataDir = options.dataDir || join(__dirname, "..", "..", "data");
  const filePath = join(dataDir, AUDIT_FILE);

  return {
    async record(event) {
      return appendAuditEvent(filePath, event);
    }
  };
}

async function appendAuditEvent(filePath, event) {
  const auditEvent = normalizeAuditEvent(event);
  validateAuditEvent(auditEvent);

  try {
    await mkdir(dirname(filePath), { recursive: true });
    await appendFile(filePath, `${JSON.stringify(auditEvent)}\n`, "utf8");
  } catch (error) {
    const writeError = new Error(`Failed to write enforcement policy audit event.`);
    writeError.code = "ENFORCEMENT_POLICY_AUDIT_WRITE_FAILED";
    writeError.cause = error;
    throw writeError;
  }

  return auditEvent;
}

function validateAuditEvent(event) {
  const validation = validateResult(event, auditEventSchema, "enforcement-policy-audit");

  if (validation.ok) {
    return validation;
  }

  const error = new Error("Enforcement policy audit event did not match enforcement-policy-audit-event.schema.json.");
  error.code = "ENFORCEMENT_POLICY_AUDIT_INVALID";
  error.validation = validation;
  throw error;
}

function normalizeAuditEvent(event) {
  return {
    eventId: event.eventId || `enf_audit_${randomUUID().replace(/-/g, "")}`,
    timestamp: event.timestamp || new Date().toISOString(),
    actor: event.actor || "system",
    action: event.action || "policy.initialized",
    trackId: event.trackId || null,
    overrideId: event.overrideId || null,
    previousRevision: event.previousRevision != null ? event.previousRevision : null,
    committedRevision: event.committedRevision != null ? event.committedRevision : null,
    before: event.before || null,
    after: event.after || null,
    reason: event.reason || null,
    result: event.result || "success",
    errorCode: event.errorCode || null,
    errorMessage: event.errorMessage || null
  };
}

module.exports = {
  createEnforcementPolicyAudit,
  appendAuditEvent,
  normalizeAuditEvent,
  validateAuditEvent
};
