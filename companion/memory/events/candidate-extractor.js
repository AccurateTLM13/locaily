const { buildStableEventId } = require("./capture/event-id");

const VAULT_TARGETS = {
  status_update: { path: "STATUS.md", operation: "update_section", risk: "low" },
  decision: { path: "DECISIONS.md", operation: "append", risk: "high" },
  blocker: { path: "BLOCKERS.md", operation: "append", risk: "medium" },
  lesson: { path: "LESSONS.md", operation: "append", risk: "medium" },
  architecture_change: { path: "ARCHITECTURE.md", operation: "update_section", risk: "high" },
  operating_rule: { path: "OPERATING-RULES.md", operation: "append", risk: "high" },
  workflow_observation: { path: "LESSONS.md", operation: "append", risk: "low" },
  completed_capability: { path: "STATUS.md", operation: "update_section", risk: "low" },
  open_question: { path: "RESUME.md", operation: "append", risk: "medium" },
  resume_instruction: { path: "RESUME.md", operation: "update_section", risk: "medium" },
  documentation_drift: { path: "PROJECT.md", operation: "update_section", risk: "medium" }
};

function buildStableCandidateId(parts) {
  return buildStableEventId(parts).replace(/^evt_/, "cand_");
}

function buildVaultPath(project, candidateType) {
  const target = VAULT_TARGETS[candidateType] || VAULT_TARGETS.status_update;
  return `projects/${project}/${target.path}`;
}

function buildSuggestedOperation(candidateType) {
  const target = VAULT_TARGETS[candidateType] || VAULT_TARGETS.status_update;
  return target.operation;
}

function buildReviewRisk(candidateType) {
  const target = VAULT_TARGETS[candidateType] || VAULT_TARGETS.status_update;
  return target.risk;
}

function buildCandidateBase({
  candidateType,
  proposedStatement,
  confidence,
  evidenceEventIds,
  targetProject,
  sessionId = null
}) {
  const createdAt = new Date().toISOString();
  const candidateId = buildStableCandidateId([
    sessionId || targetProject,
    candidateType,
    ...[...evidenceEventIds].sort()
  ]);

  return {
    candidateId,
    schemaVersion: "1.0",
    candidateType,
    proposedStatement: proposedStatement.slice(0, 4000),
    confidence,
    evidenceEventIds: [...evidenceEventIds],
    targetProject,
    suggestedVaultPath: buildVaultPath(targetProject, candidateType),
    suggestedOperation: buildSuggestedOperation(candidateType),
    contradictionStatus: "none",
    reviewRisk: buildReviewRisk(candidateType),
    generatedBy: sessionId
      ? { method: "deterministic", sessionId }
      : { method: "deterministic" },
    createdAt,
    ...(sessionId ? { sessionId } : {})
  };
}

function isFailedTestEvent(event) {
  if (event.eventType !== "test_completed") {
    return false;
  }

  return /failed|fail/i.test(event.summary);
}

function extractArchitectureChange(event, project) {
  const files = (event.artifacts || [])
    .filter((artifact) => artifact.kind === "file_path")
    .map((artifact) => artifact.ref);

  const architecturePaths = files.filter((filePath) => {
    return /^docs\//.test(filePath)
      || /^companion\/schemas\//.test(filePath)
      || /architecture|decision-log/i.test(filePath);
  });

  if (architecturePaths.length === 0) {
    return null;
  }

  return buildCandidateBase({
    candidateType: "architecture_change",
    proposedStatement: `Architecture/docs updated: ${architecturePaths.slice(0, 5).join(", ")}.`,
    confidence: 0.82,
    evidenceEventIds: [event.eventId],
    targetProject: project,
    sessionId: event.correlation && event.correlation.sessionId ? event.correlation.sessionId : null
  });
}

function extractFromEvent(event, project) {
  const sessionId = event.correlation && event.correlation.sessionId ? event.correlation.sessionId : null;
  const candidates = [];

  switch (event.eventType) {
    case "decision_recorded":
      candidates.push(buildCandidateBase({
        candidateType: "decision",
        proposedStatement: event.summary,
        confidence: 0.95,
        evidenceEventIds: [event.eventId],
        targetProject: project,
        sessionId
      }));
      break;
    case "blocker_recorded":
    case "objective_blocked":
      candidates.push(buildCandidateBase({
        candidateType: "blocker",
        proposedStatement: event.summary,
        confidence: 0.9,
        evidenceEventIds: [event.eventId],
        targetProject: project,
        sessionId
      }));
      break;
    case "objective_completed":
      candidates.push(buildCandidateBase({
        candidateType: "completed_capability",
        proposedStatement: event.summary,
        confidence: 0.9,
        evidenceEventIds: [event.eventId],
        targetProject: project,
        sessionId
      }));
      break;
    case "objective_started":
      candidates.push(buildCandidateBase({
        candidateType: "status_update",
        proposedStatement: event.summary,
        confidence: 0.85,
        evidenceEventIds: [event.eventId],
        targetProject: project,
        sessionId
      }));
      break;
    case "task_rejected":
      candidates.push(buildCandidateBase({
        candidateType: "open_question",
        proposedStatement: event.summary,
        confidence: 0.8,
        evidenceEventIds: [event.eventId],
        targetProject: project,
        sessionId
      }));
      break;
    case "test_completed":
      if (isFailedTestEvent(event)) {
        candidates.push(buildCandidateBase({
          candidateType: "workflow_observation",
          proposedStatement: event.summary,
          confidence: 0.78,
          evidenceEventIds: [event.eventId],
          targetProject: project,
          sessionId
        }));
      }
      break;
    case "commit_created": {
      const architectureCandidate = extractArchitectureChange(event, project);
      if (architectureCandidate) {
        candidates.push(architectureCandidate);
      } else {
        candidates.push(buildCandidateBase({
          candidateType: "status_update",
          proposedStatement: event.summary,
          confidence: 0.75,
          evidenceEventIds: [event.eventId],
          targetProject: project,
          sessionId
        }));
      }
      break;
    }
    default:
      break;
  }

  return candidates;
}

function extractSessionLevelCandidates(session, events) {
  const candidates = [];
  const project = session.project;
  const linkedEventIds = events.map((event) => event.eventId);
  const markerOnly = linkedEventIds.length <= 1;

  if (markerOnly) {
    return candidates;
  }

  if (session.status === "interrupted") {
    candidates.push(buildCandidateBase({
      candidateType: "resume_instruction",
      proposedStatement: `Resume interrupted session ${session.sessionId} for ${session.correlation && session.correlation.objectiveId ? session.correlation.objectiveId : "manual work"}.`,
      confidence: 0.88,
      evidenceEventIds: linkedEventIds.slice(0, Math.min(linkedEventIds.length, 5)),
      targetProject: project,
      sessionId: session.sessionId
    }));
  }

  const metrics = session.metrics || {};
  const unresolved = Array.isArray(metrics.unresolvedWork) ? metrics.unresolvedWork : [];

  for (const item of unresolved.slice(0, 5)) {
    candidates.push(buildCandidateBase({
      candidateType: "resume_instruction",
      proposedStatement: `Unresolved work: ${item}`,
      confidence: 0.84,
      evidenceEventIds: linkedEventIds.slice(0, Math.min(linkedEventIds.length, 3)),
      targetProject: project,
      sessionId: session.sessionId
    }));
  }

  if (session.summary && session.summary.text && session.status === "closed") {
    candidates.push(buildCandidateBase({
      candidateType: "status_update",
      proposedStatement: session.summary.text.slice(0, 4000),
      confidence: 0.8,
      evidenceEventIds: session.summary.linkedEventIds && session.summary.linkedEventIds.length > 0
        ? session.summary.linkedEventIds
        : linkedEventIds.slice(0, Math.min(linkedEventIds.length, 10)),
      targetProject: project,
      sessionId: session.sessionId
    }));
  }

  return candidates;
}

function extractCandidatesFromSession(session, events) {
  const project = session.project;
  const byId = new Map();

  for (const event of events) {
    if (event.eventType === "human_note" && /session opened/i.test(event.summary || "")) {
      continue;
    }

    for (const candidate of extractFromEvent(event, project)) {
      byId.set(candidate.candidateId, candidate);
    }
  }

  for (const candidate of extractSessionLevelCandidates(session, events)) {
    byId.set(candidate.candidateId, candidate);
  }

  return [...byId.values()];
}

module.exports = {
  VAULT_TARGETS,
  buildStableCandidateId,
  buildVaultPath,
  extractCandidatesFromSession,
  extractFromEvent
};
