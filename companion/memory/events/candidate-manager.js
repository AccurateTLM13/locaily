const path = require("node:path");
const { createDevelopmentSessionManager } = require("./session-manager");
const { createDevelopmentSessionStore } = require("./session-store");
const { createDevelopmentCandidateStore } = require("./candidate-store");
const { extractCandidatesFromSession } = require("./candidate-extractor");
const {
  findContradictions,
  partitionCandidatesForSave
} = require("./candidate-analysis");

function createDevelopmentCandidateManager(options = {}) {
  const project = options.project || "locaily";
  const eventsDir = options.eventsDir || path.join(__dirname, "..", "..", "..", "data", "memory", "development-events");
  const sessionsRoot = options.sessionsRoot || path.join(__dirname, "..", "..", "..", "data", "memory", "development-sessions");
  const candidatesRoot = options.candidatesRoot || path.join(__dirname, "..", "..", "..", "data", "memory", "development-candidates");

  const sessionManager = createDevelopmentSessionManager({ project, eventsDir, sessionsRoot });
  const sessionStore = createDevelopmentSessionStore({ rootDir: sessionsRoot });
  const candidateStore = createDevelopmentCandidateStore({ rootDir: candidatesRoot });

  async function extractFromSession({ sessionId }) {
    if (!sessionId) {
      return {
        ok: false,
        error: {
          code: "SESSION_ID_REQUIRED",
          message: "sessionId is required to extract knowledge candidates.",
          nextStep: "Pass --session-id from a closed session manifest."
        },
        warnings: []
      };
    }

    const session = sessionStore.readManifest(sessionId);
    if (!session) {
      return {
        ok: false,
        error: {
          code: "SESSION_NOT_FOUND",
          message: `Session '${sessionId}' was not found.`,
          nextStep: "Verify the session id or run memory:session:status."
        },
        warnings: []
      };
    }

    if (session.status === "open") {
      return {
        ok: false,
        error: {
          code: "SESSION_NOT_CLOSED",
          message: "Knowledge candidate extraction requires a closed or interrupted session.",
          nextStep: "Run memory:session:close before extracting candidates."
        },
        warnings: []
      };
    }

    const events = await sessionManager.gatherSessionEvents(session);
    const extracted = extractCandidatesFromSession(session, events);
    const existing = candidateStore.listCandidates({ project: session.project });
    const { toSave, duplicates } = partitionCandidatesForSave(extracted, existing);
    const contradictionResult = findContradictions(toSave, events);

    const saved = [];
    const saveErrors = [];

    for (const candidate of toSave) {
      const result = candidateStore.saveCandidate(candidate);
      if (result.ok) {
        saved.push(result.result);
      } else {
        saveErrors.push(result.error);
      }
    }

    const report = {
      sessionId,
      project: session.project,
      extractedCount: extracted.length,
      savedCount: saved.length,
      duplicateCount: duplicates.length,
      contradictionCount: contradictionResult.contradictions.length,
      candidates: saved.map((candidate) => candidate.candidateId),
      duplicates,
      contradictions: contradictionResult.contradictions,
      createdAt: new Date().toISOString()
    };

    candidateStore.saveExtractionReport(report);

    if (saveErrors.length > 0) {
      return {
        ok: false,
        error: saveErrors[0],
        result: report,
        warnings: saveErrors.slice(1).map((error) => error.message)
      };
    }

    return {
      ok: true,
      result: report,
      warnings: []
    };
  }

  async function getStatus({ project: projectFilter = null } = {}) {
    const candidates = candidateStore.listCandidates(
      projectFilter ? { project: projectFilter } : {}
    );

    const byType = {};
    const byContradiction = { none: 0, possible: 0, confirmed: 0 };

    for (const candidate of candidates) {
      byType[candidate.candidateType] = (byType[candidate.candidateType] || 0) + 1;
      byContradiction[candidate.contradictionStatus] = (byContradiction[candidate.contradictionStatus] || 0) + 1;
    }

    return {
      ok: true,
      result: {
        totalCandidates: candidates.length,
        byType,
        byContradiction,
        candidatesRoot: candidateStore.getRootDir()
      },
      warnings: []
    };
  }

  function listCandidates(filters = {}) {
    const candidates = candidateStore.listCandidates(filters);
    return {
      ok: true,
      result: {
        count: candidates.length,
        candidates
      },
      warnings: []
    };
  }

  return {
    extractFromSession,
    getStatus,
    listCandidates,
    getCandidatesRoot: () => candidatesRoot
  };
}

module.exports = {
  createDevelopmentCandidateManager
};
