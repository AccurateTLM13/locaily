const fs = require("node:fs");
const path = require("node:path");
const { createDevelopmentEventStore } = require("../event-store");
const { buildStableEventId } = require("./event-id");
const { shouldCaptureEvent, getCaptureGateState, configureCaptureGate } = require("./capture-gate");

let store = null;
let sessionStore = null;
let enabled = true;
let project = "locaily";
let failureLogPath = null;

function init(options = {}) {
  enabled = options.enabled !== false;
  project = options.project || "locaily";

  if (options.dataDir) {
    store = createDevelopmentEventStore({ dataDir: options.dataDir });
  } else if (!store) {
    store = createDevelopmentEventStore();
  }

  if (options.sessionsRoot) {
    const { createDevelopmentSessionStore } = require("../session-store");
    sessionStore = createDevelopmentSessionStore({ rootDir: options.sessionsRoot });
  } else if (!sessionStore) {
    const { createDevelopmentSessionStore } = require("../session-store");
    sessionStore = createDevelopmentSessionStore();
  }

  failureLogPath = options.failureLogPath
    || path.join(store.getStorageDir(), "capture-failures.jsonl");

  configureCaptureGate({
    project: options.project,
    policyPath: options.policyPath,
    vaultPath: options.vaultPath,
    paused: options.paused,
    captureEnabled: options.captureEnabled !== false
  });
}

function resolveActiveSessionId(explicitSessionId) {
  if (explicitSessionId) {
    return explicitSessionId;
  }

  if (!sessionStore) {
    return null;
  }

  const active = sessionStore.readActiveSessionPointer();
  return active && active.sessionId ? active.sessionId : null;
}

function ensureInitialized() {
  if (!store) {
    init({});
  }
}

function buildBaseEvent({
  eventType,
  summary,
  source,
  correlation = {},
  artifacts = [],
  sensitivity = "internal"
}) {
  const now = new Date().toISOString();
  return {
    schemaVersion: "1.0",
    project,
    eventType,
    occurredAt: now,
    capturedAt: now,
    source,
    summary,
    artifacts,
    validation: {
      sourceVerified: true,
      status: "accepted"
    },
    sensitivity,
    correlation: {
      runId: correlation.runId ?? null,
      objectiveId: correlation.objectiveId ?? null,
      taskId: correlation.taskId ?? null,
      sessionId: resolveActiveSessionId(correlation.sessionId)
    }
  };
}

function logCaptureFailure(spec, error) {
  if (!failureLogPath) {
    return;
  }

  try {
    fs.mkdirSync(path.dirname(failureLogPath), { recursive: true });
    fs.appendFileSync(
      failureLogPath,
      `${JSON.stringify({
        at: new Date().toISOString(),
        eventType: spec.eventType,
        idParts: spec.idParts || null,
        error: error && error.message ? error.message : String(error)
      })}\n`,
      "utf8"
    );
  } catch {
    // Never block caller on failure logging.
  }
}

async function recordCaptureEvent(spec) {
  ensureInitialized();

  const gateDecision = shouldCaptureEvent(spec.eventType);
  if (!gateDecision.allowed) {
    return { ok: true, skipped: true, reason: gateDecision.reason };
  }

  if (!enabled) {
    return { ok: true, skipped: true, reason: "recorder_disabled" };
  }

  const event = {
    ...buildBaseEvent(spec),
    eventId: spec.eventId || buildStableEventId(spec.idParts || [project, spec.eventType, Date.now()])
  };

  const result = await store.appendEvent(event);
  if (!result.ok) {
    logCaptureFailure(spec, result.error || new Error("append_failed"));
  }
  return result;
}

function recordCaptureEventNonBlocking(spec) {
  void recordCaptureEvent(spec).catch((error) => {
    logCaptureFailure(spec, error);
  });
}

module.exports = {
  init,
  buildBaseEvent,
  buildStableEventId,
  recordCaptureEvent,
  recordCaptureEventNonBlocking,
  logCaptureFailure,
  getCaptureGateState
};
