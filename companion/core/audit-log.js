const { randomUUID } = require("node:crypto");
const { appendFile, mkdir, readFile } = require("node:fs/promises");
const { dirname } = require("node:path");

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function createAuditLog(options = {}) {
  const filePath = options.filePath;

  if (!filePath) {
    throw new Error("Audit log requires a filePath.");
  }

  return {
    async record(event) {
      const auditEvent = normalizeAuditEvent(event);
      await mkdir(dirname(filePath), { recursive: true });
      await appendFile(filePath, `${JSON.stringify(auditEvent)}\n`, "utf8");
      return auditEvent;
    },
    async list(filters = {}) {
      const events = await readEvents(filePath);
      return applyFilters(events, filters);
    }
  };
}

function normalizeAuditEvent(event) {
  return {
    event_id: event.event_id || createEventId(),
    run_id: event.run_id || null,
    trace_id: event.trace_id || null,
    timestamp: event.timestamp || new Date().toISOString(),
    source: summarizeSource(event.source),
    tool: event.tool || null,
    task: event.task || null,
    provider: event.provider || null,
    model: event.model || null,
    model_role: event.model_role || null,
    permissions_used: normalizeStringArray(event.permissions_used),
    input_summary: summarizeInput(event.input_summary),
    output_summary: summarizeOutput(event.output_summary),
    fallbacks_used: normalizeStringArray(event.fallbacks_used),
    model_switches: normalizeModelSwitches(event.model_switches),
    duration_ms: normalizeNumber(event.duration_ms),
    status: event.status === "success" ? "success" : "error",
    error_code: event.error_code || null
  };
}

function buildAuditEvent({
  identity,
  contextPacket = null,
  tool = null,
  provider = null,
  model = null,
  permissionsUsed = null,
  responseBody,
  statusCode,
  startedAt
}) {
  const body = responseBody || {};
  const toolDefinition = tool || {};
  const inputGateSummary = body.meta && body.meta.input_gate
    ? body.meta.input_gate.input_summary
    : null;

  return normalizeAuditEvent({
    run_id: body.run_id || identity.run_id,
    trace_id: body.trace_id || identity.trace_id,
    source: contextPacket ? contextPacket.source : null,
    tool: body.tool || (contextPacket && contextPacket.task.tool) || toolDefinition.id,
    task: body.task || (contextPacket && contextPacket.task.goal) || null,
    provider: body.provider || provider,
    model: body.model || model,
    model_role: body.model_role || (contextPacket && contextPacket.task.model_role) || toolDefinition.modelRole || null,
    permissions_used: permissionsUsed || toolDefinition.permissions || [],
    input_summary: inputGateSummary || (contextPacket ? summarizeContextInput(contextPacket.input) : null),
    output_summary: summarizeResponseOutput(body),
    fallbacks_used: body.fallbacks_used || [],
    model_switches: body.meta && body.meta.model_switches ? body.meta.model_switches : [],
    duration_ms: body.meta && typeof body.meta.duration_ms === "number"
      ? body.meta.duration_ms
      : Date.now() - startedAt,
    status: body.ok ? "success" : "error",
    error_code: body.ok ? null : body.code,
    status_code: statusCode
  });
}

async function readEvents(filePath) {
  let raw;

  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }

    throw error;
  }

  return raw
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map(parseJsonLine)
    .filter(Boolean);
}

function applyFilters(events, filters = {}) {
  const limit = normalizeLimit(filters.limit);
  let filtered = events;

  if (filters.run_id) {
    filtered = filtered.filter((event) => event.run_id === filters.run_id);
  }

  if (filters.tool) {
    filtered = filtered.filter((event) => event.tool === filters.tool);
  }

  if (filters.source) {
    filtered = filtered.filter((event) => event.source && event.source.app_id === filters.source);
  }

  return filtered.slice(-limit).reverse();
}

function parseJsonLine(line) {
  try {
    return JSON.parse(line);
  } catch (error) {
    return null;
  }
}

function summarizeSource(source) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return {
      app_id: "unknown-app",
      surface: "unknown-surface",
      user_action: "unknown-action",
      client_version: "unknown"
    };
  }

  return {
    app_id: stringOrNull(source.app_id),
    surface: stringOrNull(source.surface),
    user_action: stringOrNull(source.user_action),
    client_version: stringOrNull(source.client_version)
  };
}

function summarizeContextInput(input) {
  if (!input || typeof input !== "object") {
    return null;
  }

  return {
    type: input.type || "unknown",
    chars: estimateChars(input.content),
    attachments: Array.isArray(input.attachments) ? input.attachments.length : 0,
    risk_level: "unknown"
  };
}

function summarizeInput(summary) {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
    return null;
  }

  return {
    type: summary.type || "unknown",
    chars: normalizeNumber(summary.chars),
    attachments: normalizeNumber(summary.attachments),
    risk_level: summary.risk_level || summary.riskLevel || "unknown"
  };
}

function summarizeResponseOutput(body) {
  if (!body || !body.ok || !body.result || typeof body.result !== "object" || Array.isArray(body.result)) {
    return null;
  }

  return {
    type: "object",
    keys: Object.keys(body.result).slice(0, 20)
  };
}

function summarizeOutput(summary) {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
    return null;
  }

  return {
    type: summary.type || "object",
    keys: Array.isArray(summary.keys) ? summary.keys.slice(0, 20) : []
  };
}

function estimateChars(value) {
  if (typeof value === "string") {
    return value.length;
  }

  if (value === null || typeof value === "undefined") {
    return 0;
  }

  try {
    return JSON.stringify(value).length;
  } catch (error) {
    return String(value).length;
  }
}

function normalizeModelSwitches(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      action: stringOrNull(item.action),
      model: stringOrNull(item.model),
      role: stringOrNull(item.role),
      reason: stringOrNull(item.reason),
      timestamp: stringOrNull(item.timestamp)
    }));
}

function normalizeStringArray(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim())
    : [];
}

function normalizeNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizeLimit(value) {
  const limit = Number(value || DEFAULT_LIMIT);

  if (!Number.isInteger(limit) || limit <= 0) {
    return DEFAULT_LIMIT;
  }

  return Math.min(limit, MAX_LIMIT);
}

function stringOrNull(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function createEventId() {
  return `audit_${randomUUID().replace(/-/g, "")}`;
}

module.exports = {
  createAuditLog,
  buildAuditEvent,
  normalizeAuditEvent
};
