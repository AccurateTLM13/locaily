function normalizeStatement(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function candidateFingerprint(candidate) {
  return `${candidate.candidateType}|${normalizeStatement(candidate.proposedStatement)}`;
}

function findDuplicates(candidates, existingCandidates = []) {
  const duplicates = [];
  const seen = new Map();

  for (const candidate of existingCandidates) {
    seen.set(candidateFingerprint(candidate), candidate.candidateId);
  }

  for (const candidate of candidates) {
    const fingerprint = candidateFingerprint(candidate);
    const existingId = seen.get(fingerprint);

    if (existingId) {
      duplicates.push({
        candidateId: candidate.candidateId,
        duplicateOf: existingId,
        reason: "matching candidateType and proposedStatement"
      });
      continue;
    }

    seen.set(fingerprint, candidate.candidateId);
  }

  return duplicates;
}

function objectiveIdFromCandidate(candidate, eventsById) {
  for (const eventId of candidate.evidenceEventIds) {
    const event = eventsById.get(eventId);
    if (event && event.correlation && event.correlation.objectiveId) {
      return event.correlation.objectiveId;
    }
  }
  return null;
}

function findContradictions(candidates, events) {
  const contradictions = [];
  const eventsById = new Map(events.map((event) => [event.eventId, event]));

  const completedByObjective = new Map();
  const blockedByObjective = new Map();

  for (const candidate of candidates) {
    const objectiveId = objectiveIdFromCandidate(candidate, eventsById);
    if (!objectiveId) {
      continue;
    }

    if (candidate.candidateType === "completed_capability") {
      completedByObjective.set(objectiveId, candidate.candidateId);
    }

    if (candidate.candidateType === "blocker") {
      blockedByObjective.set(objectiveId, candidate.candidateId);
    }
  }

  for (const [objectiveId, completedId] of completedByObjective.entries()) {
    const blockedId = blockedByObjective.get(objectiveId);
    if (!blockedId) {
      continue;
    }

    contradictions.push({
      candidateIds: [completedId, blockedId],
      objectiveId,
      reason: "Objective has both completion and blocker evidence in the same session.",
      status: "possible"
    });
  }

  const marked = new Set();
  for (const entry of contradictions) {
    for (const candidate of candidates) {
      if (entry.candidateIds.includes(candidate.candidateId)) {
        candidate.contradictionStatus = "possible";
        marked.add(candidate.candidateId);
      }
    }
  }

  return {
    contradictions,
    markedCount: marked.size
  };
}

function partitionCandidatesForSave(candidates, existingCandidates = []) {
  const duplicates = findDuplicates(candidates, existingCandidates);
  const duplicateIds = new Set(duplicates.map((entry) => entry.candidateId));

  return {
    toSave: candidates.filter((candidate) => !duplicateIds.has(candidate.candidateId)),
    duplicates
  };
}

module.exports = {
  normalizeStatement,
  candidateFingerprint,
  findDuplicates,
  findContradictions,
  partitionCandidatesForSave
};
