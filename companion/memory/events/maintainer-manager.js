const path = require("node:path");
const { createDevelopmentCandidateStore } = require("./candidate-store");
const { createDevelopmentCandidateReviewStore } = require("./candidate-review-store");
const { createDevelopmentMaintainerStore } = require("./maintainer-store");
const {
  buildMaintainerPlan,
  buildStableRollbackId,
  renderSectionUpdate
} = require("./maintainer-planner");

function createDevelopmentMaintainerManager(options = {}) {
  const candidatesRoot = options.candidatesRoot || path.join(__dirname, "..", "..", "..", "data", "memory", "development-candidates");
  const maintainerRoot = options.maintainerRoot || path.join(__dirname, "..", "..", "..", "data", "memory", "development-maintainer");
  const getVaultAdapter = options.getVaultAdapter || (() => options.vaultAdapter || null);

  const candidateStore = createDevelopmentCandidateStore({ rootDir: candidatesRoot });
  const reviewStore = createDevelopmentCandidateReviewStore({ rootDir: candidatesRoot });
  const maintainerStore = createDevelopmentMaintainerStore({ rootDir: maintainerRoot });

  function listApprovedCandidates(project) {
    const approved = [];

    for (const candidate of candidateStore.listCandidates({ project })) {
      const review = reviewStore.readReview(candidate.candidateId);
      if (!review || review.status !== "approved") {
        continue;
      }

      approved.push({ candidate, review });
    }

    return approved;
  }

  function planRun({ project = "locaily", autoApplyLowRisk = false, autoApplyHighRisk = false } = {}) {
    const approvedEntries = listApprovedCandidates(project);

    if (approvedEntries.length === 0) {
      return {
        ok: false,
        error: {
          code: "NO_APPROVED_CANDIDATES",
          message: `No approved candidates found for project '${project}'.`,
          nextStep: "Approve candidates in the review inbox before running the maintainer."
        },
        warnings: []
      };
    }

    const vaultAdapter = getVaultAdapter();
    const plan = buildMaintainerPlan({
      project,
      approvedEntries,
      vaultAdapter,
      autoApplyLowRisk,
      autoApplyHighRisk
    });

    const saved = maintainerStore.saveRun(plan);
    if (!saved.ok) {
      return saved;
    }

    return {
      ok: true,
      result: plan,
      warnings: []
    };
  }

  function getStatus({ project = null } = {}) {
    const runs = maintainerStore.listRuns(project || undefined);
    const latest = runs[0] || null;
    let approvedCount = 0;

    for (const candidate of candidateStore.listCandidates(project ? { project } : {})) {
      const review = reviewStore.readReview(candidate.candidateId);
      if (review && review.status === "approved") {
        approvedCount += 1;
      }
    }

    return {
      ok: true,
      result: {
        maintainerRoot: maintainerStore.getRootDir(),
        runCount: runs.length,
        latestRunId: latest ? latest.runId : null,
        latestRunStatus: latest ? latest.status : null,
        approvedCandidatesReady: approvedCount
      },
      warnings: []
    };
  }

  function listRuns({ project = null } = {}) {
    const runs = maintainerStore.listRuns(project || undefined);
    return {
      ok: true,
      result: {
        count: runs.length,
        runs
      },
      warnings: []
    };
  }

  function getRun(runId) {
    const run = maintainerStore.readRun(runId);
    if (!run) {
      return {
        ok: false,
        error: {
          code: "MAINTAINER_RUN_NOT_FOUND",
          message: `Maintainer run '${runId}' was not found.`,
          nextStep: "Run memory:maintainer:plan or verify the run id."
        },
        warnings: []
      };
    }

    return {
      ok: true,
      result: run,
      warnings: []
    };
  }

  function canApplyItem(item, { allowApplyLowRisk = false, allowApplyHighRisk = false } = {}) {
    if (item.plannedAction === "skip_duplicate" || item.plannedAction === "review_required") {
      return false;
    }

    if (!item.applyAllowed) {
      return false;
    }

    if (item.reviewRisk === "high") {
      return allowApplyHighRisk;
    }

    if (item.reviewRisk === "medium") {
      return false;
    }

    return allowApplyLowRisk;
  }

  function applyRun({
    runId,
    allowApplyLowRisk = false,
    allowApplyHighRisk = false
  }) {
    const runResult = getRun(runId);
    if (!runResult.ok) {
      return runResult;
    }

    const run = runResult.result;
    if (run.status === "applied") {
      return {
        ok: false,
        error: {
          code: "MAINTAINER_RUN_ALREADY_APPLIED",
          message: `Maintainer run '${runId}' was already applied.`,
          nextStep: "Plan a new maintainer run for additional updates."
        },
        warnings: []
      };
    }

    const vaultAdapter = getVaultAdapter();
    if (!vaultAdapter) {
      return {
        ok: false,
        error: {
          code: "VAULT_NOT_AVAILABLE",
          message: "Vault adapter is not available for maintainer apply.",
          nextStep: "Configure memoryBridge.vaultPath before applying maintainer updates."
        },
        warnings: []
      };
    }

    const vaultStatus = vaultAdapter.getStatus();
    if (!vaultStatus.enabled || !vaultStatus.vaultPathConfigured) {
      return {
        ok: false,
        error: {
          code: "VAULT_NOT_CONFIGURED",
          message: "Memory vault is not configured.",
          nextStep: "Configure memoryBridge.vaultPath before applying maintainer updates."
        },
        warnings: []
      };
    }

    const rollbackId = buildStableRollbackId(runId);
    const snapshots = [];
    const updatedItems = [];
    let appliedCount = 0;

    for (const item of run.items) {
      const itemCopy = { ...item };

      if (!canApplyItem(item, { allowApplyLowRisk, allowApplyHighRisk })) {
        updatedItems.push(itemCopy);
        continue;
      }

      const readResult = vaultAdapter.readMarkdownFile(item.targetVaultPath);
      snapshots.push({
        path: item.targetVaultPath,
        previousExists: readResult.ok,
        previousContent: readResult.ok ? readResult.content : null
      });

      const candidateLike = {
        candidateId: item.candidateId,
        evidenceEventIds: item.evidenceEventIds
      };
      const content = item.plannedAction === "create_file" && !readResult.ok
        ? `# ${path.basename(item.targetVaultPath, ".md")}\n${renderSectionUpdate(candidateLike, item.proposedStatement)}`
        : `${readResult.ok ? readResult.content : ""}${renderSectionUpdate(candidateLike, item.proposedStatement)}`;

      const applyResult = vaultAdapter.applyWriteback({
        targetPath: item.targetVaultPath,
        content
      });

      if (!applyResult.ok) {
        return {
          ok: false,
          error: applyResult.error,
          warnings: [`Failed while applying ${item.targetVaultPath}. Rollback manifest '${rollbackId}' was not finalized.`]
        };
      }

      itemCopy.applied = true;
      itemCopy.rollbackId = rollbackId;
      appliedCount += 1;
      updatedItems.push(itemCopy);
    }

    if (appliedCount === 0) {
      return {
        ok: false,
        error: {
          code: "NO_APPLICABLE_ITEMS",
          message: "No maintainer items were eligible to apply with the current flags.",
          nextStep: "Use --allow-apply-low-risk for low-risk items or review_required items manually."
        },
        warnings: []
      };
    }

    const rollback = {
      rollbackId,
      runId,
      project: run.project,
      createdAt: new Date().toISOString(),
      snapshots
    };
    maintainerStore.saveRollback(rollback);

    const updatedRun = {
      ...run,
      status: appliedCount === updatedItems.filter((item) => item.plannedAction !== "skip_duplicate").length ? "applied" : "partial",
      items: updatedItems,
      summary: {
        ...run.summary,
        appliedUpdates: appliedCount
      },
      rollbackIds: [...(run.rollbackIds || []), rollbackId],
      appliedAt: new Date().toISOString()
    };

    const saved = maintainerStore.saveRun(updatedRun);
    if (!saved.ok) {
      return saved;
    }

    return {
      ok: true,
      result: {
        run: updatedRun,
        rollback
      },
      warnings: []
    };
  }

  return {
    planRun,
    getStatus,
    listRuns,
    getRun,
    applyRun,
    listApprovedCandidates
  };
}

module.exports = {
  createDevelopmentMaintainerManager
};
