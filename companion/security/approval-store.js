const { randomBytes } = require("node:crypto");
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");
const { ALWAYS_DENIED_ACTIONS } = require("./policy-loader");

const DEFAULT_APPROVALS_PATH = path.resolve(__dirname, "..", "..", "data", "security", "approvals.json");
const DEFAULT_APPROVAL_TTL_MS = 30 * 60 * 1000;

function createApprovalId() {
  return `appr_${randomBytes(6).toString("hex")}`;
}

function normalizeRecord(raw) {
  if (!raw || typeof raw !== "object" || typeof raw.id !== "string" || !raw.actionRequest) {
    return null;
  }

  return {
    id: raw.id,
    status: raw.status || "pending",
    actionRequest: raw.actionRequest,
    policyDecision: raw.policyDecision || null,
    runId: raw.runId || null,
    traceId: raw.traceId || null,
    metadata: raw.metadata || null,
    createdAt: raw.createdAt || new Date().toISOString(),
    expiresAt: raw.expiresAt || new Date(Date.now() + DEFAULT_APPROVAL_TTL_MS).toISOString(),
    resolvedAt: raw.resolvedAt || null,
    resolvedBy: raw.resolvedBy || null,
    resolutionReason: raw.resolutionReason || null,
    constraints: raw.constraints || null
  };
}

/**
 * Durable approval queue store for `require_approval` policy decisions.
 */
function createApprovalStore(options = {}) {
  const filePath = options.filePath ? path.resolve(options.filePath) : DEFAULT_APPROVALS_PATH;
  const ttlMs = typeof options.ttlMs === "number" && options.ttlMs > 0
    ? options.ttlMs
    : DEFAULT_APPROVAL_TTL_MS;
  const records = new Map();

  function loadInitial() {
    if (!existsSync(filePath)) {
      return;
    }

    try {
      const parsed = JSON.parse(readFileSync(filePath, "utf8"));
      const items = Array.isArray(parsed)
        ? parsed
        : (parsed && Array.isArray(parsed.approvals) ? parsed.approvals : []);
      for (const item of items) {
        const rec = normalizeRecord(item);
        if (rec) {
          records.set(rec.id, rec);
        }
      }
    } catch {
      // Corrupt or empty file starts cleanly without auto-approving anything.
    }
  }

  function persist() {
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(
      filePath,
      JSON.stringify({ approvals: Array.from(records.values()) }, null, 2),
      "utf8"
    );
  }

  function refreshExpiration(rec) {
    if (!rec) return null;
    if (rec.status === "pending" || rec.status === "approved") {
      const expMs = Date.parse(rec.expiresAt);
      if (Number.isFinite(expMs) && Date.now() > expMs) {
        rec.status = "expired";
        persist();
      }
    }
    return rec;
  }

  loadInitial();

  return {
    filePath,
    createPending({ actionRequest, policyDecision, runId = null, traceId = null, metadata = null }) {
      const actionName = actionRequest && typeof actionRequest.action === "string"
        ? actionRequest.action.trim()
        : "";
      if (ALWAYS_DENIED_ACTIONS.has(actionName)) {
        const err = new Error(`Action '${actionName}' is permanently denied and cannot be queued for approval.`);
        err.code = "APPROVAL_FORBIDDEN";
        err.statusCode = 403;
        throw err;
      }

      const now = Date.now();
      const rec = normalizeRecord({
        id: createApprovalId(),
        status: "pending",
        actionRequest,
        policyDecision,
        runId,
        traceId,
        metadata,
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(now + ttlMs).toISOString()
      });

      records.set(rec.id, rec);
      persist();
      return { ...rec };
    },

    get(approvalId) {
      if (typeof approvalId !== "string" || !approvalId.trim()) {
        return null;
      }
      const rec = records.get(approvalId.trim());
      if (!rec) {
        return null;
      }
      refreshExpiration(rec);
      return { ...rec };
    },

    list({ status = null, action = null, limit = 50 } = {}) {
      const items = [];
      for (const rec of records.values()) {
        refreshExpiration(rec);
        if (status && rec.status !== status) continue;
        if (action && rec.actionRequest?.action !== action) continue;
        items.push({ ...rec });
      }
      items.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
      const max = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 500) : 50;
      return items.slice(0, max);
    },

    approve(approvalId, { operator = "local-operator", reason = "Approved by local operator", constraints = null } = {}) {
      const key = typeof approvalId === "string" ? approvalId.trim() : "";
      const rec = key ? records.get(key) : null;
      if (!rec) {
        return {
          ok: false,
          code: "APPROVAL_NOT_FOUND",
          statusCode: 404,
          message: `Approval request '${String(approvalId)}' was not found.`
        };
      }

      if (ALWAYS_DENIED_ACTIONS.has(rec.actionRequest?.action)) {
        return {
          ok: false,
          code: "APPROVAL_FORBIDDEN",
          statusCode: 403,
          message: `Action '${rec.actionRequest?.action}' is permanently denied and cannot be approved.`
        };
      }

      refreshExpiration(rec);
      if (rec.status === "expired") {
        return {
          ok: false,
          code: "APPROVAL_EXPIRED",
          statusCode: 409,
          message: `Approval request '${rec.id}' has expired.`
        };
      }

      if (rec.status !== "pending") {
        return {
          ok: false,
          code: "APPROVAL_ALREADY_RESOLVED",
          statusCode: 409,
          message: `Approval request '${rec.id}' is already '${rec.status}'.`
        };
      }

      if (constraints !== null && (typeof constraints !== "object" || Array.isArray(constraints))) {
        return {
          ok: false,
          code: "INVALID_CONSTRAINTS",
          statusCode: 400,
          message: "Approval constraints must be a JSON object when provided."
        };
      }

      rec.status = "approved";
      rec.resolvedAt = new Date().toISOString();
      rec.resolvedBy = typeof operator === "string" && operator.trim() ? operator.trim() : "local-operator";
      rec.resolutionReason = typeof reason === "string" && reason.trim() ? reason.trim() : "Approved by local operator";
      rec.constraints = constraints || null;
      persist();

      return {
        ok: true,
        approval: { ...rec }
      };
    },

    deny(approvalId, { operator = "local-operator", reason = "Denied by local operator" } = {}) {
      const key = typeof approvalId === "string" ? approvalId.trim() : "";
      const rec = key ? records.get(key) : null;
      if (!rec) {
        return {
          ok: false,
          code: "APPROVAL_NOT_FOUND",
          statusCode: 404,
          message: `Approval request '${String(approvalId)}' was not found.`
        };
      }

      refreshExpiration(rec);
      if (rec.status !== "pending") {
        return {
          ok: false,
          code: "APPROVAL_ALREADY_RESOLVED",
          statusCode: 409,
          message: `Approval request '${rec.id}' is already '${rec.status}'.`
        };
      }

      rec.status = "denied";
      rec.resolvedAt = new Date().toISOString();
      rec.resolvedBy = typeof operator === "string" && operator.trim() ? operator.trim() : "local-operator";
      rec.resolutionReason = typeof reason === "string" && reason.trim() ? reason.trim() : "Denied by local operator";
      persist();

      return {
        ok: true,
        approval: { ...rec }
      };
    },

    checkApproval(approvalId, actionRequest) {
      const key = typeof approvalId === "string" ? approvalId.trim() : "";
      if (!key) {
        return { valid: false, reason: "Missing approvalId." };
      }

      const rec = records.get(key);
      if (!rec) {
        return { valid: false, reason: `Approval '${key}' not found.` };
      }

      refreshExpiration(rec);
      if (rec.status !== "approved") {
        return { valid: false, reason: `Approval '${rec.id}' status is '${rec.status}', expected 'approved'.` };
      }

      if (ALWAYS_DENIED_ACTIONS.has(actionRequest?.action)) {
        return { valid: false, reason: `Action '${actionRequest.action}' cannot be approved.` };
      }

      if (rec.actionRequest?.action !== actionRequest?.action) {
        return {
          valid: false,
          reason: `Approval '${rec.id}' is bound to action '${rec.actionRequest?.action}', not '${actionRequest?.action}'.`
        };
      }

      if (rec.actionRequest?.target !== actionRequest?.target) {
        return {
          valid: false,
          reason: `Approval '${rec.id}' is bound to target '${rec.actionRequest?.target}', not '${actionRequest?.target}'.`
        };
      }

      return {
        valid: true,
        approval: { ...rec }
      };
    }
  };
}

module.exports = {
  DEFAULT_APPROVALS_PATH,
  DEFAULT_APPROVAL_TTL_MS,
  createApprovalStore
};
