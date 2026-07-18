const path = require("node:path");
const { createDevelopmentCandidateStore } = require("../events/candidate-store");
const { createDevelopmentCandidateReviewStore } = require("../events/candidate-review-store");
const { createDevelopmentMaintainerStore } = require("../events/maintainer-store");
const { normalizeProjectSlug } = require("./canonical-pages");

function createEvidenceIndexBuilder(options = {}) {
  const candidatesRoot = options.candidatesRoot
    || path.join(__dirname, "..", "..", "..", "data", "memory", "development-candidates");
  const maintainerRoot = options.maintainerRoot
    || path.join(__dirname, "..", "..", "..", "data", "memory", "development-maintainer");

  const candidateStore = createDevelopmentCandidateStore({ rootDir: candidatesRoot });
  const reviewStore = createDevelopmentCandidateReviewStore({ rootDir: candidatesRoot });
  const maintainerStore = createDevelopmentMaintainerStore({ rootDir: maintainerRoot });

  function buildEvidenceIndex(project) {
    const projectSlug = normalizeProjectSlug(project);
    const byVaultPath = new Map();

    const candidates = candidateStore.listCandidates({ project: projectSlug });
    const reviews = reviewStore.listReviews();
    const reviewByCandidateId = new Map(reviews.map((review) => [review.candidateId, review]));

    for (const candidate of candidates) {
      const vaultPath = candidate.suggestedVaultPath;
      const review = reviewByCandidateId.get(candidate.candidateId) || null;
      const reviewStatus = review ? review.status : "unreviewed";

      if (!byVaultPath.has(vaultPath)) {
        byVaultPath.set(vaultPath, {
          vaultPath,
          candidates: [],
          maintainerRuns: [],
          pendingCandidateIds: [],
          approvedCandidateIds: [],
          contradictionCandidateIds: [],
          staleCandidateIds: []
        });
      }

      const entry = byVaultPath.get(vaultPath);
      entry.candidates.push({
        candidateId: candidate.candidateId,
        reviewStatus,
        contradictionStatus: candidate.contradictionStatus,
        evidenceEventIds: candidate.evidenceEventIds || [],
        proposedStatement: candidate.proposedStatement
      });

      if (reviewStatus === "pending") {
        entry.pendingCandidateIds.push(candidate.candidateId);
        entry.staleCandidateIds.push(candidate.candidateId);
      }

      if (reviewStatus === "approved") {
        entry.approvedCandidateIds.push(candidate.candidateId);
      }

      if (candidate.contradictionStatus === "possible" || candidate.contradictionStatus === "confirmed") {
        entry.contradictionCandidateIds.push(candidate.candidateId);
      }
    }

    const maintainerRuns = maintainerStore.listRuns(projectSlug);

    for (const run of maintainerRuns) {
      for (const item of run.items || []) {
        const vaultPath = item.targetVaultPath;

        if (!vaultPath) {
          continue;
        }

        if (!byVaultPath.has(vaultPath)) {
          byVaultPath.set(vaultPath, {
            vaultPath,
            candidates: [],
            maintainerRuns: [],
            pendingCandidateIds: [],
            approvedCandidateIds: [],
            contradictionCandidateIds: [],
            staleCandidateIds: []
          });
        }

        byVaultPath.get(vaultPath).maintainerRuns.push({
          runId: run.runId,
          driftStatus: item.driftStatus,
          applied: run.status === "applied",
          candidateId: item.candidateId || null
        });
      }
    }

    return {
      projectSlug,
      byVaultPath
    };
  }

  return {
    buildEvidenceIndex
  };
}

module.exports = {
  createEvidenceIndexBuilder
};
