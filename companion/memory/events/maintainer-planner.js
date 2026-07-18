const { buildStableEventId } = require("./capture/event-id");
const {
  detectVaultDrift,
  isApplyAllowedByDefault,
  resolvePlannedAction
} = require("./maintainer-drift");

function buildStableRunId(project, timestamp) {
  return buildStableEventId(["maintainer_run", project, timestamp]).replace(/^evt_/, "maint_");
}

function buildStableRollbackId(runId) {
  return buildStableEventId(["maintainer_rollback", runId, Date.now()]).replace(/^evt_/, "rb_");
}

function resolveStatement(candidate, review) {
  if (review && review.editedStatement) {
    return review.editedStatement;
  }
  return candidate.proposedStatement;
}

function renderSectionUpdate(candidate, statement) {
  const date = new Date().toISOString().slice(0, 10);
  const evidence = (candidate.evidenceEventIds || []).join(", ");
  return `\n\n## Maintainer update (${date})\n\n- ${statement}\n\n_Evidence: ${evidence}_\n`;
}

function buildPlanItem(candidate, review, vaultAdapter) {
  const statement = resolveStatement(candidate, review);
  const targetVaultPath = candidate.suggestedVaultPath;
  let vaultContent = "";
  let vaultReadable = false;

  if (vaultAdapter) {
    const readResult = vaultAdapter.readMarkdownFile(targetVaultPath);
    if (readResult.ok) {
      vaultReadable = true;
      vaultContent = readResult.content;
    }
  }

  const drift = detectVaultDrift({
    statement,
    vaultContent,
    vaultReadable,
    targetVaultPath
  });
  const plannedAction = resolvePlannedAction(drift.driftStatus, candidate);
  const applyAllowed = isApplyAllowedByDefault(candidate) && plannedAction !== "skip_duplicate";

  return {
    candidateId: candidate.candidateId,
    reviewId: review ? review.reviewId : null,
    targetVaultPath,
    suggestedOperation: candidate.suggestedOperation,
    proposedStatement: statement,
    driftStatus: drift.driftStatus,
    driftDetail: drift.driftDetail,
    plannedAction,
    applyAllowed,
    reviewRisk: candidate.reviewRisk,
    evidenceEventIds: [...(candidate.evidenceEventIds || [])],
    applied: false,
    rollbackId: null
  };
}

function buildMaintainerPlan({
  project,
  approvedEntries,
  vaultAdapter,
  autoApplyLowRisk = false,
  autoApplyHighRisk = false
}) {
  const createdAt = new Date().toISOString();
  const items = approvedEntries.map(({ candidate, review }) => buildPlanItem(candidate, review, vaultAdapter));

  const summary = {
    approvedCandidates: items.length,
    plannedUpdates: items.filter((item) => item.plannedAction === "append_section" || item.plannedAction === "create_file").length,
    skippedDuplicates: items.filter((item) => item.plannedAction === "skip_duplicate").length,
    driftDetected: items.filter((item) => item.driftStatus === "content_drift" || item.driftStatus === "missing_target").length,
    reviewRequired: items.filter((item) => item.plannedAction === "review_required").length,
    appliedUpdates: 0
  };

  return {
    runId: buildStableRunId(project, createdAt),
    schemaVersion: "1.0",
    project,
    status: "planned",
    autoApplyLowRisk,
    autoApplyHighRisk,
    items,
    summary,
    rollbackIds: [],
    createdAt,
    plannedAt: createdAt,
    appliedAt: null
  };
}

module.exports = {
  buildStableRunId,
  buildStableRollbackId,
  renderSectionUpdate,
  buildMaintainerPlan,
  buildPlanItem,
  resolveStatement
};
