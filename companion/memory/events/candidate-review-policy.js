const HIGH_RISK_TYPES = new Set([
  "decision",
  "architecture_change",
  "operating_rule",
  "documentation_drift"
]);

const REVIEW_REQUIRED_TYPES = new Set([
  "decision",
  "architecture_change",
  "operating_rule",
  "blocker",
  "resume_instruction",
  "documentation_drift"
]);

function resolveCandidateWritebackPolicy(candidate, vaultStatus = {}) {
  const vaultWritebackMode = vaultStatus.writebackMode || "proposal_only";
  const vaultAllowApply = Boolean(vaultStatus.allowApply) || vaultWritebackMode === "apply";

  return {
    deliveryMode: "proposal_only",
    autoApplyAllowed: false,
    vaultWritebackMode,
    vaultAllowApply,
    requiresHumanReview: requiresHumanReviewBeforeApply(candidate),
    policyNote: vaultAllowApply
      ? "Vault apply may be enabled globally, but development memory candidates still require inbox review and deliver proposal_only writeback."
      : "Development memory candidates always deliver proposal_only writeback through the review inbox."
  };
}

function requiresHumanReviewBeforeApply(candidate) {
  if (!candidate) {
    return true;
  }

  if (candidate.reviewRisk === "high" || candidate.reviewRisk === "medium") {
    return true;
  }

  if (candidate.contradictionStatus && candidate.contradictionStatus !== "none") {
    return true;
  }

  if (REVIEW_REQUIRED_TYPES.has(candidate.candidateType)) {
    return true;
  }

  return HIGH_RISK_TYPES.has(candidate.candidateType);
}

function isTerminalReviewStatus(status) {
  return status === "approved" || status === "rejected" || status === "merged";
}

function normalizeReviewAction(action) {
  const normalized = String(action || "").trim().toLowerCase();
  const aliases = {
    approve: "approve",
    "edit+approve": "edit_approve",
    edit_approve: "edit_approve",
    reject: "reject",
    defer: "defer",
    merge: "merge"
  };

  return aliases[normalized] || null;
}

module.exports = {
  resolveCandidateWritebackPolicy,
  requiresHumanReviewBeforeApply,
  isTerminalReviewStatus,
  normalizeReviewAction
};
