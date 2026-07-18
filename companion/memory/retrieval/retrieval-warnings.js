function buildRetrievalWarnings(filesUsed, evidenceIndex) {
  const warnings = [];
  const staleWarnings = [];
  const contradictionWarnings = [];

  if (!evidenceIndex || !evidenceIndex.byVaultPath) {
    return { warnings, staleWarnings, contradictionWarnings };
  }

  for (const vaultPath of filesUsed) {
    const entry = evidenceIndex.byVaultPath.get(vaultPath);

    if (!entry) {
      continue;
    }

    if (entry.pendingCandidateIds.length > 0) {
      const message = `Stale context: ${vaultPath} has ${entry.pendingCandidateIds.length} pending candidate(s) not yet reviewed (${entry.pendingCandidateIds.join(", ")}).`;
      warnings.push(message);
      staleWarnings.push({
        vaultPath,
        candidateIds: [...entry.pendingCandidateIds],
        reason: "pending_review"
      });
    }

    if (entry.contradictionCandidateIds.length > 0) {
      const message = `Contradiction risk: ${vaultPath} has candidate(s) with contradiction status (${entry.contradictionCandidateIds.join(", ")}).`;
      warnings.push(message);
      contradictionWarnings.push({
        vaultPath,
        candidateIds: [...entry.contradictionCandidateIds],
        reason: "contradiction_status"
      });
    }

    const driftRuns = (entry.maintainerRuns || []).filter(
      (run) => run.driftStatus === "content_drift" || run.driftStatus === "missing_target"
    );

    if (driftRuns.length > 0) {
      const runIds = driftRuns.map((run) => run.runId);
      const message = `Content drift detected for ${vaultPath} in maintainer run(s): ${runIds.join(", ")}.`;
      warnings.push(message);
      staleWarnings.push({
        vaultPath,
        runIds,
        reason: "maintainer_drift"
      });
    }
  }

  return { warnings, staleWarnings, contradictionWarnings };
}

function buildEvidenceReferences(filesUsed, evidenceIndex) {
  const references = [];

  if (!evidenceIndex || !evidenceIndex.byVaultPath) {
    return references;
  }

  for (const vaultPath of filesUsed) {
    const entry = evidenceIndex.byVaultPath.get(vaultPath);

    if (!entry) {
      continue;
    }

    for (const candidate of entry.candidates) {
      if (candidate.reviewStatus !== "approved" && candidate.reviewStatus !== "pending") {
        continue;
      }

      references.push({
        source: "candidate",
        vaultPath,
        candidateId: candidate.candidateId,
        reviewStatus: candidate.reviewStatus,
        eventIds: candidate.evidenceEventIds || []
      });
    }

    for (const run of entry.maintainerRuns || []) {
      references.push({
        source: "maintainer_run",
        vaultPath,
        runId: run.runId,
        driftStatus: run.driftStatus,
        applied: run.applied,
        candidateId: run.candidateId || null,
        eventIds: []
      });
    }
  }

  return references;
}

module.exports = {
  buildRetrievalWarnings,
  buildEvidenceReferences
};
