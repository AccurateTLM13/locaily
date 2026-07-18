const fs = require("node:fs");
const path = require("node:path");
const { createDevelopmentSessionManager } = require("../session-manager");
const { createDevelopmentSessionStore } = require("../session-store");
const { createDevelopmentCandidateManager } = require("../candidate-manager");
const { createDevelopmentCandidateStore } = require("../candidate-store");
const { createDevelopmentCandidateReviewStore } = require("../candidate-review-store");
const { createDevelopmentMaintainerStore } = require("../maintainer-store");
const { createDevelopmentEventStore } = require("../event-store");
const { createDevelopmentCaptureProcessorStore } = require("./capture-processor-store");
const {
  configureCaptureGate,
  getCaptureGateState,
  setCapturePaused
} = require("./capture-gate");
const { resolveCaptureEnabled } = require("./capture-policy-loader");

const DEFAULT_IDLE_CLOSE_MS = 30 * 60 * 1000;

function createDevelopmentCaptureProcessor(options = {}) {
  const projectRegistry = options.projectRegistry || null;
  const defaultProject = options.project || process.env.DEVELOPMENT_MEMORY_PROJECT || "locaily";
  const defaultPaths = {
    eventsDir: options.eventsDir
      || path.join(__dirname, "..", "..", "..", "..", "data", "memory", "development-events"),
    sessionsRoot: options.sessionsRoot
      || path.join(__dirname, "..", "..", "..", "..", "data", "memory", "development-sessions"),
    candidatesRoot: options.candidatesRoot
      || path.join(__dirname, "..", "..", "..", "..", "data", "memory", "development-candidates"),
    maintainerRoot: options.maintainerRoot
      || path.join(__dirname, "..", "..", "..", "..", "data", "memory", "development-maintainer"),
    processorRoot: options.processorRoot
      || path.join(__dirname, "..", "..", "..", "..", "data", "memory", "development-capture")
  };
  const idleSessionCloseMs = Number.isFinite(options.idleSessionCloseMs)
    ? options.idleSessionCloseMs
    : DEFAULT_IDLE_CLOSE_MS;

  function resolveContext() {
    if (projectRegistry) {
      const active = projectRegistry.getActiveProject();
      const paths = projectRegistry.resolveMemoryPaths(active.slug);
      return {
        project: active.slug,
        eventsDir: paths.eventsDir,
        sessionsRoot: paths.sessionsRoot,
        candidatesRoot: paths.candidatesRoot,
        maintainerRoot: paths.maintainerRoot,
        processorRoot: paths.processorRoot,
        vaultPath: active.vaultPath || options.vaultPath || null,
        policyPath: active.capturePolicyPath || path.join(paths.processorRoot, "capture-policy.json"),
        processorStore: createDevelopmentCaptureProcessorStore({ rootDir: paths.processorRoot })
      };
    }

    return {
      project: defaultProject,
      ...defaultPaths,
      vaultPath: options.vaultPath || null,
      policyPath: options.policyPath || path.join(defaultPaths.processorRoot, "capture-policy.json"),
      processorStore: options.processorStore
        || createDevelopmentCaptureProcessorStore({ rootDir: defaultPaths.processorRoot })
    };
  }

  function createManagers(context) {
    return {
      sessionManager: createDevelopmentSessionManager({
        project: context.project,
        eventsDir: context.eventsDir,
        sessionsRoot: context.sessionsRoot
      }),
      sessionStore: createDevelopmentSessionStore({ rootDir: context.sessionsRoot }),
      candidateManager: createDevelopmentCandidateManager({
        project: context.project,
        eventsDir: context.eventsDir,
        sessionsRoot: context.sessionsRoot,
        candidatesRoot: context.candidatesRoot
      }),
      candidateStore: createDevelopmentCandidateStore({ rootDir: context.candidatesRoot }),
      reviewStore: createDevelopmentCandidateReviewStore({ rootDir: context.candidatesRoot }),
      maintainerStore: createDevelopmentMaintainerStore({ rootDir: context.maintainerRoot }),
      eventStore: createDevelopmentEventStore({ dataDir: context.eventsDir })
    };
  }

  function refreshGate(context, extra = {}) {
    const state = context.processorStore.readState();
    return configureCaptureGate({
      project: context.project,
      vaultPath: extra.vaultPath || context.vaultPath || options.vaultPath || null,
      policyPath: extra.policyPath || context.policyPath,
      paused: state.paused
    });
  }

  function countCaptureFailures(eventsDir) {
    const failureLogPath = path.join(eventsDir, "capture-failures.jsonl");

    try {
      const content = fs.readFileSync(failureLogPath, "utf8").trim();
      if (!content) {
        return 0;
      }
      return content.split("\n").filter(Boolean).length;
    } catch (error) {
      if (error.code === "ENOENT") {
        return 0;
      }
      return 0;
    }
  }

  async function computeEventBacklog(managers) {
    const { sessionStore, eventStore } = managers;
    const manifests = sessionStore.listManifests();
    const referenced = new Set();

    for (const file of manifests) {
      const manifest = sessionStore.readManifest(file.replace(/\.json$/, ""));
      for (const eventId of manifest?.eventIds || []) {
        referenced.add(eventId);
      }
    }

    const files = await eventStore.listEventFiles();
    let lastEventAt = null;
    let unprocessedEvents = 0;

    for (const file of files) {
      const eventId = file.replace(/\.json$/, "");
      const result = await eventStore.getEvent(eventId);
      if (!result.ok) {
        continue;
      }

      const capturedAt = result.result.capturedAt || result.result.occurredAt;
      if (!lastEventAt || Date.parse(capturedAt) > Date.parse(lastEventAt)) {
        lastEventAt = capturedAt;
      }

      if (!referenced.has(eventId)) {
        unprocessedEvents += 1;
      }
    }

    return { lastEventAt, unprocessedEvents };
  }

  function resolveLastSuccessfulWritebackAt(managers, project) {
    const runs = managers.maintainerStore.listRuns(project);
    const appliedRun = runs.find((run) => run.status === "applied" && run.appliedAt);
    return appliedRun ? appliedRun.appliedAt : null;
  }

  function countPendingCandidates(managers, project) {
    const candidates = managers.candidateStore.listCandidates({ project });
    let pending = 0;

    for (const candidate of candidates) {
      const review = managers.reviewStore.readReview(candidate.candidateId);
      if (!review || review.status === "pending") {
        pending += 1;
      }
    }

    return pending;
  }

  function countPendingHumanReview(managers, project) {
    const candidates = managers.candidateStore.listCandidates({ project });
    let pending = 0;

    for (const candidate of candidates) {
      const review = managers.reviewStore.readReview(candidate.candidateId);
      if (!review || review.status === "pending" || review.status === "deferred") {
        pending += 1;
      }
    }

    return pending;
  }

  function hasExtractionReport(managers, sessionId) {
    return managers.candidateStore.listExtractionReports(sessionId).length > 0;
  }

  function listClosedSessionsPendingExtraction(managers, state) {
    const pending = [];

    for (const file of managers.sessionStore.listManifests()) {
      const sessionId = file.replace(/\.json$/, "");
      const manifest = managers.sessionStore.readManifest(sessionId);

      if (!manifest || manifest.status === "open") {
        continue;
      }

      if (state.extractedSessionIds.includes(sessionId) || hasExtractionReport(managers, sessionId)) {
        continue;
      }

      pending.push(manifest);
    }

    pending.sort((left, right) => Date.parse(left.closedAt || left.endedAt || left.startedAt)
      - Date.parse(right.closedAt || right.endedAt || right.startedAt));

    return pending;
  }

  async function closeIdleOpenSessions(managers) {
    const closed = [];
    const active = managers.sessionStore.readActiveSessionPointer();
    const nowMs = Date.now();

    for (const file of managers.sessionStore.listManifests()) {
      const sessionId = file.replace(/\.json$/, "");
      const manifest = managers.sessionStore.readManifest(sessionId);

      if (!manifest || manifest.status !== "open") {
        continue;
      }

      if (active && active.sessionId === sessionId) {
        const events = await managers.sessionManager.gatherSessionEvents(manifest);
        const lastEvent = events[events.length - 1];
        const lastMs = lastEvent ? Date.parse(lastEvent.occurredAt) : Date.parse(manifest.startedAt);

        if (Number.isFinite(lastMs) && nowMs - lastMs >= idleSessionCloseMs) {
          const result = await managers.sessionManager.closeSession({ sessionId, interrupted: true });
          if (result.ok) {
            closed.push(sessionId);
          }
        }
      }
    }

    return closed;
  }

  async function processOnce() {
    const context = resolveContext();
    const managers = createManagers(context);
    const startedAt = new Date().toISOString();
    const warnings = [];
    const gate = refreshGate(context);
    const state = context.processorStore.readState();

    if (state.paused) {
      return {
        ok: true,
        skipped: true,
        reason: "capture_paused",
        result: {
          startedAt,
          finishedAt: new Date().toISOString(),
          recoveredSessions: [],
          closedIdleSessions: [],
          extractedSessions: [],
          rebuiltSessions: []
        },
        warnings: ["Capture processor is paused."]
      };
    }

    if (!resolveCaptureEnabled(gate.policy)) {
      return {
        ok: true,
        skipped: true,
        reason: "capture_disabled",
        result: {
          startedAt,
          finishedAt: new Date().toISOString(),
          recoveredSessions: [],
          closedIdleSessions: [],
          extractedSessions: [],
          rebuiltSessions: []
        },
        warnings: ["Capture is disabled by policy or environment."]
      };
    }

    const recoveredSessions = [];
    const extractedSessions = [];
    const rebuiltSessions = [];

    try {
      const recovery = await managers.sessionManager.recoverInterruptedSessions();
      recoveredSessions.push(...(recovery.result.recovered || []));
    } catch (error) {
      warnings.push(`Session recovery failed: ${error.message}`);
    }

    let closedIdleSessions = [];
    try {
      closedIdleSessions = await closeIdleOpenSessions(managers);
    } catch (error) {
      warnings.push(`Idle session close failed: ${error.message}`);
    }

    const latestState = context.processorStore.readState();
    const pendingExtraction = listClosedSessionsPendingExtraction(managers, latestState);

    for (const manifest of pendingExtraction.slice(0, 3)) {
      try {
        const rebuilt = await managers.sessionManager.rebuildSession({ sessionId: manifest.sessionId });
        if (rebuilt.ok) {
          rebuiltSessions.push(manifest.sessionId);
        }

        const extracted = await managers.candidateManager.extractFromSession({ sessionId: manifest.sessionId });
        if (extracted.ok) {
          extractedSessions.push({
            sessionId: manifest.sessionId,
            savedCount: extracted.result.savedCount,
            duplicateCount: extracted.result.duplicateCount
          });
          context.processorStore.markSessionProcessed(manifest.sessionId, { extracted: true });
        } else if (extracted.result && extracted.result.savedCount === 0 && extracted.result.duplicateCount > 0) {
          context.processorStore.markSessionProcessed(manifest.sessionId, { extracted: true });
          extractedSessions.push({
            sessionId: manifest.sessionId,
            savedCount: 0,
            duplicateCount: extracted.result.duplicateCount,
            idempotent: true
          });
        } else {
          warnings.push(extracted.error?.message || `Candidate extraction failed for ${manifest.sessionId}.`);
          context.processorStore.markSessionProcessed(manifest.sessionId, { extracted: false });
        }
      } catch (error) {
        warnings.push(`Processing failed for ${manifest.sessionId}: ${error.message}`);
      }
    }

    const backlog = await computeEventBacklog(managers);
    const finishedAt = new Date().toISOString();
    const runStatus = warnings.length > 0 ? "completed_with_warnings" : "completed";

    context.processorStore.updateState({
      lastRunAt: finishedAt,
      lastRunStatus: runStatus,
      lastProcessedAt: finishedAt,
      lastEventAt: backlog.lastEventAt,
      unprocessedEvents: backlog.unprocessedEvents,
      warnings: warnings.slice(-20)
    });

    return {
      ok: true,
      result: {
        startedAt,
        finishedAt,
        recoveredSessions,
        closedIdleSessions,
        rebuiltSessions,
        extractedSessions
      },
      warnings
    };
  }

  async function getStatus() {
    const context = resolveContext();
    const managers = createManagers(context);
    refreshGate(context);
    const gate = getCaptureGateState();
    const state = context.processorStore.readState();
    const sessionStatus = await managers.sessionManager.getStatus();
    const candidateStatus = await managers.candidateManager.getStatus({ project: context.project });
    const reviewSummary = {
      pendingHumanReview: countPendingHumanReview(managers, context.project),
      pendingCandidates: countPendingCandidates(managers, context.project)
    };
    const backlog = await computeEventBacklog(managers);
    const captureFailureCount = countCaptureFailures(context.eventsDir);

    const warnings = [
      ...gate.warnings,
      ...(state.warnings || [])
    ];

    if (captureFailureCount > 0) {
      warnings.push(`${captureFailureCount} capture failure(s) logged.`);
    }

    if (backlog.unprocessedEvents > 0) {
      warnings.push(`${backlog.unprocessedEvents} event(s) are not yet referenced by a session manifest.`);
    }

    const pendingExtraction = listClosedSessionsPendingExtraction(managers, state);

    if (pendingExtraction.length > 0) {
      warnings.push(`${pendingExtraction.length} closed session(s) await candidate extraction.`);
    }

    return {
      ok: true,
      result: {
        captureEnabled: gate.captureEnabled && !state.paused,
        capturePaused: state.paused,
        retrievalEnabled: true,
        policyEnabled: Boolean(gate.policy && gate.policy.enabled),
        policyPath: gate.policyPath,
        project: context.project,
        lastEventAt: backlog.lastEventAt || state.lastEventAt,
        unprocessedEvents: backlog.unprocessedEvents,
        openSessions: sessionStatus.result.openSessionCount,
        pendingCandidates: reviewSummary.pendingCandidates,
        pendingHumanReview: reviewSummary.pendingHumanReview,
        pendingSessionExtractions: pendingExtraction.length,
        lastSuccessfulWritebackAt: resolveLastSuccessfulWritebackAt(managers, context.project),
        lastProcessedAt: state.lastProcessedAt,
        lastRunAt: state.lastRunAt,
        lastRunStatus: state.lastRunStatus,
        totalCandidates: candidateStatus.result.totalCandidates,
        captureFailureCount,
        worker: typeof options.getWorkerStatus === "function" ? options.getWorkerStatus() : null,
        warnings: [...new Set(warnings.filter(Boolean))]
      },
      warnings
    };
  }

  function pauseCapture() {
    const context = resolveContext();
    context.processorStore.setPaused(true);
    setCapturePaused(true);
    return getStatus();
  }

  function resumeCapture() {
    const context = resolveContext();
    context.processorStore.setPaused(false);
    setCapturePaused(false);
    return getStatus();
  }

  return {
    processOnce,
    getStatus,
    pauseCapture,
    resumeCapture,
    refreshGate: () => refreshGate(resolveContext()),
    getProcessorStore: () => resolveContext().processorStore
  };
}

module.exports = {
  createDevelopmentCaptureProcessor,
  DEFAULT_IDLE_CLOSE_MS
};
