const path = require("node:path");
const { createDevelopmentCandidateStore } = require("./candidate-store");
const { createDevelopmentCandidateReviewStore } = require("./candidate-review-store");
const { createDevelopmentEventStore } = require("./event-store");
const {
  resolveCandidateWritebackPolicy,
  isTerminalReviewStatus,
  normalizeReviewAction
} = require("./candidate-review-policy");
const { createCandidateWritebackProposal } = require("./candidate-proposal-bridge");

function createDevelopmentCandidateReviewInbox(options = {}) {
  const eventsDir = options.eventsDir || path.join(__dirname, "..", "..", "..", "data", "memory", "development-events");
  const candidatesRoot = options.candidatesRoot || path.join(__dirname, "..", "..", "..", "data", "memory", "development-candidates");
  const getVaultAdapter = options.getVaultAdapter || (() => options.vaultAdapter || null);

  const candidateStore = createDevelopmentCandidateStore({ rootDir: candidatesRoot });
  const reviewStore = createDevelopmentCandidateReviewStore({ rootDir: candidatesRoot });
  const eventStore = createDevelopmentEventStore({ dataDir: eventsDir });

  function getReviewState(candidate) {
    const review = reviewStore.readReview(candidate.candidateId);
    if (!review) {
      return {
        status: "pending",
        review: null
      };
    }

    return {
      status: review.status,
      review
    };
  }

  async function loadEvidenceSummaries(candidate) {
    const evidence = [];

    for (const eventId of candidate.evidenceEventIds || []) {
      const result = await eventStore.getEvent(eventId);
      evidence.push({
        eventId,
        found: result.ok,
        eventType: result.ok ? result.result.eventType : null,
        summary: result.ok ? result.result.summary : null,
        occurredAt: result.ok ? result.result.occurredAt : null
      });
    }

    return evidence;
  }

  function getInboxSummary(filters = {}) {
    const candidates = candidateStore.listCandidates(filters);
    const summary = {
      totalCandidates: candidates.length,
      pending: 0,
      deferred: 0,
      approved: 0,
      rejected: 0,
      merged: 0,
      byReviewRisk: { low: 0, medium: 0, high: 0 },
      byCandidateType: {}
    };

    for (const candidate of candidates) {
      const state = getReviewState(candidate);
      summary[state.status] = (summary[state.status] || 0) + 1;
      summary.byReviewRisk[candidate.reviewRisk] = (summary.byReviewRisk[candidate.reviewRisk] || 0) + 1;
      summary.byCandidateType[candidate.candidateType] = (summary.byCandidateType[candidate.candidateType] || 0) + 1;
    }

    return {
      ok: true,
      result: summary,
      warnings: []
    };
  }

  async function listInbox(filters = {}) {
    const statusFilter = filters.status || "pending";
    const candidates = candidateStore.listCandidates(filters);
    const items = [];

    for (const candidate of candidates) {
      const state = getReviewState(candidate);
      if (statusFilter !== "all" && state.status !== statusFilter) {
        continue;
      }

      items.push({
        candidateId: candidate.candidateId,
        candidateType: candidate.candidateType,
        proposedStatement: candidate.proposedStatement,
        reviewRisk: candidate.reviewRisk,
        contradictionStatus: candidate.contradictionStatus,
        suggestedVaultPath: candidate.suggestedVaultPath,
        suggestedOperation: candidate.suggestedOperation,
        evidenceEventIds: candidate.evidenceEventIds,
        reviewStatus: state.status,
        sessionId: candidate.sessionId || null,
        createdAt: candidate.createdAt
      });
    }

    return {
      ok: true,
      result: {
        count: items.length,
        statusFilter,
        items
      },
      warnings: []
    };
  }

  async function getReviewDetail(candidateId) {
    const candidate = candidateStore.readCandidate(candidateId);
    if (!candidate) {
      return {
        ok: false,
        error: {
          code: "CANDIDATE_NOT_FOUND",
          message: `Knowledge candidate '${candidateId}' was not found.`,
          nextStep: "Verify the candidate id or extract candidates from a closed session."
        },
        warnings: []
      };
    }

    const state = getReviewState(candidate);
    const vaultStatus = (() => {
      const adapter = getVaultAdapter();
      return adapter ? adapter.getStatus() : {};
    })();
    const policy = resolveCandidateWritebackPolicy(candidate, vaultStatus);
    const evidence = await loadEvidenceSummaries(candidate);

    return {
      ok: true,
      result: {
        candidate,
        review: state.review,
        reviewStatus: state.status,
        evidence,
        writebackPolicy: policy
      },
      warnings: []
    };
  }

  async function performAction({
    candidateId,
    action,
    reviewer = "human",
    editedStatement = null,
    mergeTargetId = null,
    notes = null
  }) {
    const normalizedAction = normalizeReviewAction(action);
    if (!normalizedAction) {
      return {
        ok: false,
        error: {
          code: "INVALID_REVIEW_ACTION",
          message: `Unsupported review action '${action}'.`,
          nextStep: "Use approve, edit_approve, reject, defer, or merge."
        },
        warnings: []
      };
    }

    const candidate = candidateStore.readCandidate(candidateId);
    if (!candidate) {
      return {
        ok: false,
        error: {
          code: "CANDIDATE_NOT_FOUND",
          message: `Knowledge candidate '${candidateId}' was not found.`,
          nextStep: "Verify the candidate id."
        },
        warnings: []
      };
    }

    const existingReview = reviewStore.readReview(candidateId)
      || reviewStore.createPendingReview(candidateId);

    if (isTerminalReviewStatus(existingReview.status)) {
      return {
        ok: false,
        error: {
          code: "REVIEW_ALREADY_FINAL",
          message: `Candidate '${candidateId}' already has final review status '${existingReview.status}'.`,
          nextStep: "Review records are immutable after approval, rejection, or merge."
        },
        warnings: []
      };
    }

    const vaultStatus = (() => {
      const adapter = getVaultAdapter();
      return adapter ? adapter.getStatus() : {};
    })();
    const policy = resolveCandidateWritebackPolicy(candidate, vaultStatus);
    const now = new Date().toISOString();
    const warnings = [];
    let proposalResult = null;

    if (normalizedAction === "merge") {
      if (!mergeTargetId) {
        return {
          ok: false,
          error: {
            code: "MERGE_TARGET_REQUIRED",
            message: "mergeTargetId is required for merge actions.",
            nextStep: "Pass mergeTargetId for the canonical candidate to keep."
          },
          warnings: []
        };
      }

      const mergeTarget = candidateStore.readCandidate(mergeTargetId);
      if (!mergeTarget) {
        return {
          ok: false,
          error: {
            code: "MERGE_TARGET_NOT_FOUND",
            message: `Merge target candidate '${mergeTargetId}' was not found.`,
            nextStep: "Verify mergeTargetId."
          },
          warnings: []
        };
      }
    }

    if (normalizedAction === "edit_approve" && !String(editedStatement || "").trim()) {
      return {
        ok: false,
        error: {
          code: "EDITED_STATEMENT_REQUIRED",
          message: "editedStatement is required for edit_approve actions.",
          nextStep: "Provide the edited statement text to approve."
        },
        warnings: []
      };
    }

    if (normalizedAction === "approve" || normalizedAction === "edit_approve") {
      const adapter = getVaultAdapter();
      if (!adapter) {
        warnings.push("Vault adapter unavailable; review approved without writeback proposal.");
      } else if (!vaultStatus.enabled || !vaultStatus.vaultPathConfigured) {
        warnings.push("Memory vault is not configured; review approved without writeback proposal.");
      } else if (policy.deliveryMode !== "proposal_only") {
        warnings.push("Unexpected delivery mode; proposal_only enforced for development memory candidates.");
      } else {
        proposalResult = createCandidateWritebackProposal(adapter, candidate, {
          editedStatement: normalizedAction === "edit_approve" ? editedStatement : null,
          policy
        });

        if (!proposalResult.ok) {
          return {
            ok: false,
            error: proposalResult.error,
            warnings
          };
        }
      }
    }

    const statusMap = {
      approve: "approved",
      edit_approve: "approved",
      reject: "rejected",
      defer: "deferred",
      merge: "merged"
    };

    const review = {
      ...existingReview,
      status: statusMap[normalizedAction],
      action: normalizedAction,
      reviewer,
      reviewedAt: now,
      editedStatement: normalizedAction === "edit_approve" ? editedStatement : null,
      mergeTargetId: normalizedAction === "merge" ? mergeTargetId : null,
      proposalId: proposalResult && proposalResult.ok ? proposalResult.result.proposalId : null,
      proposalPath: proposalResult && proposalResult.ok ? proposalResult.result.proposalPath : null,
      notes: notes || null,
      writebackDeliveryMode: policy.deliveryMode,
      updatedAt: now
    };

    const saved = reviewStore.saveReview(review);
    if (!saved.ok) {
      return saved;
    }

    return {
      ok: true,
      result: {
        candidateId,
        review: saved.result,
        proposal: proposalResult && proposalResult.ok ? proposalResult.result : null,
        writebackPolicy: policy
      },
      warnings
    };
  }

  return {
    getInboxSummary,
    listInbox,
    getReviewDetail,
    performAction
  };
}

module.exports = {
  createDevelopmentCandidateReviewInbox
};
