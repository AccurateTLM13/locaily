const path = require("node:path");
const { createDevelopmentEventStore } = require("./event-store");
const { createDevelopmentSessionStore } = require("./session-store");
const { buildStableEventId } = require("./capture/event-id");
const {
  buildMetricsFromEvents,
  buildDeterministicSummary
} = require("./session-summary");

function createDevelopmentSessionManager(options = {}) {
  const project = options.project || "locaily";
  const eventsDir = options.eventsDir || path.join(__dirname, "..", "..", "..", "data", "memory", "development-events");
  const sessionsRoot = options.sessionsRoot || path.join(__dirname, "..", "..", "..", "data", "memory", "development-sessions");

  const eventStore = createDevelopmentEventStore({ dataDir: eventsDir });
  const sessionStore = createDevelopmentSessionStore({ rootDir: sessionsRoot });

  function buildSessionId({ objectiveId, runId, startedAt }) {
    const hash = buildStableEventId([
      project,
      objectiveId || "manual",
      runId || "manual",
      startedAt
    ]).replace(/^evt_/, "");
    return `sess_${hash}`;
  }

  function buildSessionMarkerEventId(sessionId) {
    return buildStableEventId(["session_marker", sessionId]);
  }

  function buildSessionMarkerEvent(session) {
    const eventId = buildSessionMarkerEventId(session.sessionId);
    const timestamp = session.startedAt;

    return {
      eventId,
      schemaVersion: "1.0",
      project: session.project,
      eventType: "human_note",
      occurredAt: timestamp,
      capturedAt: timestamp,
      source: {
        adapter: "memory"
      },
      summary: `Development session opened (${session.sessionId}).`,
      artifacts: [],
      validation: {
        sourceVerified: true,
        status: "accepted"
      },
      sensitivity: "internal",
      correlation: {
        runId: session.correlation && session.correlation.runId ? session.correlation.runId : null,
        objectiveId: session.correlation && session.correlation.objectiveId ? session.correlation.objectiveId : null,
        taskId: null,
        sessionId: session.sessionId
      }
    };
  }

  function appendSessionMarker(session) {
    return eventStore.appendEventSync(buildSessionMarkerEvent(session));
  }

  function eventBelongsToSession(event, session) {
    if (!event || !session) {
      return false;
    }

    if (event.project !== session.project) {
      return false;
    }

    if (event.correlation && event.correlation.sessionId === session.sessionId) {
      return true;
    }

    const correlation = session.correlation || {};
    const hasScope = Boolean(correlation.objectiveId || correlation.runId);

    if (!hasScope) {
      return false;
    }

    const occurredMs = Date.parse(event.occurredAt);
    const startMs = Date.parse(session.startedAt);
    const endMs = session.endedAt ? Date.parse(session.endedAt) : Date.now();

    if (!Number.isFinite(occurredMs) || !Number.isFinite(startMs)) {
      return false;
    }

    if (occurredMs < startMs || occurredMs > endMs) {
      return false;
    }

    if (correlation.runId) {
      if (event.correlation && event.correlation.runId === correlation.runId) {
        return true;
      }
      return false;
    }

    if (correlation.objectiveId) {
      if (event.correlation && event.correlation.objectiveId === correlation.objectiveId) {
        return true;
      }
      return false;
    }

    return false;
  }

  async function gatherSessionEvents(session) {
    const query = await eventStore.queryEvents({
      project: session.project,
      from: session.startedAt,
      to: session.endedAt || undefined,
      limit: 1000
    });

    const events = (query.result.events || []).filter((event) => eventBelongsToSession(event, session));
    events.sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt));
    return events;
  }

  function buildManifestFromEvents(session, events) {
    const metrics = buildMetricsFromEvents(events);
    const summary = buildDeterministicSummary(events, metrics);

    return {
      ...session,
      eventIds: events.map((event) => event.eventId),
      metrics,
      summary
    };
  }

  function markInterruptedIfNeeded() {
    const active = sessionStore.readActiveSessionPointer();
    if (!active || !active.sessionId) {
      return null;
    }

    const existing = sessionStore.readManifest(active.sessionId);
    if (!existing || existing.status !== "open") {
      sessionStore.clearActiveSessionPointer();
      return null;
    }

    const now = new Date().toISOString();
    const interrupted = {
      ...existing,
      status: "interrupted",
      endedAt: now,
      closedAt: now
    };
    sessionStore.saveManifest(interrupted);
    sessionStore.clearActiveSessionPointer();
    return interrupted;
  }

  function startSession({ objectiveId = null, runId = null, branch = null, label = null } = {}) {
    markInterruptedIfNeeded();

    const startedAt = new Date().toISOString();
    const sessionId = buildSessionId({ objectiveId, runId, startedAt });
    const markerEventId = buildSessionMarkerEventId(sessionId);
    const manifest = {
      sessionId,
      schemaVersion: "1.0",
      project,
      status: "open",
      startedAt,
      endedAt: null,
      eventIds: [markerEventId],
      summary: {
        text: label
          ? `Session opened: ${label}.`
          : `Session opened for ${objectiveId || "manual work"}.`,
        linkedEventIds: [markerEventId]
      },
      metrics: {
        objectivesAttempted: objectiveId ? [objectiveId] : [],
        tasksCompleted: 0,
        commitsProduced: 0,
        testsExecuted: 0,
        filesAffected: [],
        blockers: [],
        unresolvedWork: []
      },
      correlation: {
        objectiveId,
        runId,
        branch
      },
      createdAt: startedAt,
      closedAt: null
    };

    const markerResult = appendSessionMarker(manifest);
    if (!markerResult.ok) {
      return markerResult;
    }

    const saved = sessionStore.saveManifest(manifest);
    if (!saved.ok) {
      return saved;
    }

    sessionStore.writeActiveSessionPointer({
      sessionId,
      project,
      startedAt,
      objectiveId,
      runId
    });

    return { ok: true, result: manifest, warnings: [] };
  }

  function getActiveSessionId() {
    const active = sessionStore.readActiveSessionPointer();
    return active && active.sessionId ? active.sessionId : null;
  }

  async function getStatus() {
    const active = sessionStore.readActiveSessionPointer();
    const openSessions = [];

    for (const file of sessionStore.listManifests()) {
      const manifest = sessionStore.readManifest(file.replace(/\.json$/, ""));
      if (manifest && manifest.status === "open") {
        openSessions.push(manifest);
      }
    }

    let activeManifest = null;
    if (active && active.sessionId) {
      activeManifest = sessionStore.readManifest(active.sessionId);
      if (activeManifest) {
        const events = await gatherSessionEvents(activeManifest);
        activeManifest = buildManifestFromEvents(activeManifest, events);
      }
    }

    return {
      ok: true,
      result: {
        activeSessionId: active && active.sessionId ? active.sessionId : null,
        activeSession: activeManifest,
        openSessionCount: openSessions.length,
        openSessions
      },
      warnings: []
    };
  }

  async function closeSession({ sessionId = null, interrupted = false } = {}) {
    const targetId = sessionId || getActiveSessionId();
    if (!targetId) {
      return {
        ok: false,
        error: {
          code: "SESSION_NOT_FOUND",
          message: "No active development session found to close.",
          nextStep: "Run memory:session:start first or pass --session-id."
        },
        warnings: []
      };
    }

    const existing = sessionStore.readManifest(targetId);
    if (!existing) {
      return {
        ok: false,
        error: {
          code: "SESSION_NOT_FOUND",
          message: `Session '${targetId}' was not found.`,
          nextStep: "Verify the session id or run memory:session:status."
        },
        warnings: []
      };
    }

    const now = new Date().toISOString();
    const draft = {
      ...existing,
      endedAt: now,
      closedAt: now,
      status: interrupted ? "interrupted" : "closed"
    };

    const events = await gatherSessionEvents(draft);
    const manifest = buildManifestFromEvents(draft, events);

    const saved = sessionStore.saveManifest(manifest);
    if (!saved.ok) {
      return saved;
    }

    if (getActiveSessionId() === targetId) {
      sessionStore.clearActiveSessionPointer();
    }

    return { ok: true, result: manifest, warnings: [] };
  }

  async function rebuildSession({ sessionId }) {
    if (!sessionId) {
      return {
        ok: false,
        error: {
          code: "SESSION_ID_REQUIRED",
          message: "sessionId is required to rebuild a session manifest.",
          nextStep: "Pass --session-id or use the active session."
        },
        warnings: []
      };
    }

    const existing = sessionStore.readManifest(sessionId);
    if (!existing) {
      return {
        ok: false,
        error: {
          code: "SESSION_NOT_FOUND",
          message: `Session '${sessionId}' was not found.`,
          nextStep: "Verify the session id."
        },
        warnings: []
      };
    }

    const events = await gatherSessionEvents(existing);
    const manifest = buildManifestFromEvents(existing, events);
    const saved = sessionStore.saveManifest(manifest);
    if (!saved.ok) {
      return saved;
    }

    return { ok: true, result: manifest, warnings: [] };
  }

  async function recoverInterruptedSessions() {
    const recovered = [];

    for (const file of sessionStore.listManifests()) {
      const sessionId = file.replace(/\.json$/, "");
      const manifest = sessionStore.readManifest(sessionId);
      if (!manifest || manifest.status !== "open") {
        continue;
      }

      const active = sessionStore.readActiveSessionPointer();
      if (active && active.sessionId === sessionId) {
        continue;
      }

      const closed = await closeSession({ sessionId, interrupted: true });
      if (closed.ok) {
        recovered.push(closed.result.sessionId);
      }
    }

    return { ok: true, result: { recovered }, warnings: [] };
  }

  return {
    startSession,
    getStatus,
    closeSession,
    rebuildSession,
    recoverInterruptedSessions,
    getActiveSessionId,
    gatherSessionEvents,
    eventBelongsToSession,
    getSessionsRoot: () => sessionsRoot,
    getEventsDir: () => eventsDir
  };
}

module.exports = {
  createDevelopmentSessionManager
};
