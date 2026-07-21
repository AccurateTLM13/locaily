const { loadRecordsByParent, loadRecord } = require("./track-run-record-store");
const { loadReview } = require("./human-review-record-store");

function compareOutputs(original, retry) {
  const originalOk = original && (original.execution?.status === "success" || original.execution?.status === "passed");
  const retryOk = retry && (retry.execution?.status === "success" || retry.execution?.status === "passed");

  const changes = [];
  if (originalOk !== retryOk) {
    changes.push({ field: "execution.status", from: original?.execution?.status, to: retry?.execution?.status });
  }

  const originalModel = original?.execution?.modelInfo?.modelId || original?.routing?.capabilityId;
  const retryModel = retry?.execution?.modelInfo?.modelId || retry?.routing?.capabilityId;
  if (originalModel && retryModel && originalModel !== retryModel) {
    changes.push({ field: "execution.model", from: originalModel, to: retryModel });
  }

  const originalDuration = original?.execution?.durationMs;
  const retryDuration = retry?.execution?.durationMs;
  if (originalDuration != null && retryDuration != null) {
    const diff = retryDuration - originalDuration;
    if (Math.abs(diff) > 100) {
      changes.push({ field: "execution.durationMs", from: originalDuration, to: retryDuration, delta: diff });
    }
  }

  const originalSteps = original?.childRuns?.length || 0;
  const retrySteps = retry?.childRuns?.length || 0;
  if (originalSteps !== retrySteps) {
    changes.push({ field: "childRuns.count", from: originalSteps, to: retrySteps });
  }

  const originalError = original?.error?.type;
  const retryError = retry?.error?.type;
  if (originalError !== retryError) {
    changes.push({ field: "error.type", from: originalError, to: retryError });
  }

  return {
    originalRecordId: original?.recordId || null,
    retryRecordId: retry?.recordId || null,
    originalStatus: original?.execution?.status || null,
    retryStatus: retry?.execution?.status || null,
    originalOk,
    retryOk,
    improved: !originalOk && retryOk,
    regressed: originalOk && !retryOk,
    unchanged: originalOk === retryOk,
    changes
  };
}

async function buildRetryComparison(retryRecordId) {
  const retryRecord = await loadRecord(retryRecordId);
  if (!retryRecord) return null;

  let originalRecord = null;
  if (retryRecord.parentRunId) {
    originalRecord = await loadRecord(retryRecord.parentRunId);
  }

  if (!originalRecord && retryRecord.correlationId) {
    const siblings = await loadRecordsByParent(retryRecord.parentRunId || retryRecord.correlationId);
    originalRecord = siblings.find((r) => r.recordId !== retryRecordId) || null;
  }

  if (!originalRecord) {
    return { retryRecordId, comparison: null, reason: "No original record found for comparison." };
  }

  return {
    retryRecordId,
    comparison: compareOutputs(originalRecord, retryRecord),
    originalSummary: { recordId: originalRecord.recordId, status: originalRecord.execution?.status, createdAt: originalRecord.timestamps?.createdAt },
    retrySummary: { recordId: retryRecord.recordId, status: retryRecord.execution?.status, createdAt: retryRecord.timestamps?.createdAt }
  };
}

async function buildCorrectionComparison(originalRecordId) {
  const originalRecord = await loadRecord(originalRecordId);
  if (!originalRecord) return null;

  const review = await loadReview(originalRecordId);
  if (!review) return { originalRecordId, comparison: null, reason: "No human review found for original record." };

  return {
    originalRecordId,
    review: { verdict: review.verdict, correctionRequired: review.correctionRequired, correctionText: review.correctionText },
    comparison: {
      originalRecordId,
      reviewed: true,
      correctionRequired: review.correctionRequired,
      verdict: review.verdict
    }
  };
}

module.exports = {
  buildRetryComparison,
  buildCorrectionComparison,
  compareOutputs
};
