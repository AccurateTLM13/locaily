const { listAllRecords } = require("./track-run-record-store");

function buildEvidenceReview(records) {
  const shadowRecords = records.filter(
    (r) => r.routing && r.routing.shadowRecommendation && r.routing.shadowRecommendation.enabled
  );

  const total = shadowRecords.length;
  const byComparison = {};
  const byTrack = {};
  const byRole = {};
  let agreeCount = 0;
  let disagreeCount = 0;
  let unqualifiedCount = 0;
  let coverageMissing = 0;

  for (const record of shadowRecords) {
    const sr = record.routing.shadowRecommendation;
    const comparison = sr.comparison || "unknown";
    byComparison[comparison] = (byComparison[comparison] || 0) + 1;

    const trackId = record.trackId || "unknown";
    if (!byTrack[trackId]) {
      byTrack[trackId] = { total: 0, byComparison: {}, agreementRate: 0 };
    }
    byTrack[trackId].total++;
    byTrack[trackId].byComparison[comparison] = (byTrack[trackId].byComparison[comparison] || 0) + 1;

    if (comparison === "agree") agreeCount++;
    if (comparison === "disagree") disagreeCount++;
    if (comparison === "current-selection-unqualified") unqualifiedCount++;
    if (comparison === "recommendation-unavailable" || comparison === "no-qualified-capability") {
      coverageMissing++;
    }

    if (sr.role) {
      if (!byRole[sr.role]) {
        byRole[sr.role] = { total: 0, byComparison: {} };
      }
      byRole[sr.role].total++;
      byRole[sr.role].byComparison[comparison] = (byRole[sr.role].byComparison[comparison] || 0) + 1;
    }
  }

  for (const trackId of Object.keys(byTrack)) {
    const trackData = byTrack[trackId];
    trackData.agreementRate = trackData.total > 0
      ? Math.round(((trackData.byComparison.agree || 0) / trackData.total) * 10000) / 100
      : 0;
  }

  const agreementRate = total > 0
    ? Math.round((agreeCount / total) * 10000) / 100
    : 0;
  const coverageRate = total > 0
    ? Math.round(((total - coverageMissing) / total) * 10000) / 100
    : 0;

  const enforcementMetrics = buildEnforcementMetrics(records);

  return {
    totalShadowComparisons: total,
    agreementRate,
    agree: agreeCount,
    disagree: disagreeCount,
    currentSelectionUnqualified: unqualifiedCount,
    coverageMissing,
    coverageRate,
    byComparison,
    byTrack,
    byRole,
    hasReviews: total > 0,
    generatedAt: new Date().toISOString(),
    enforcement: enforcementMetrics
  };
}

function buildEnforcementMetrics(records) {
  const enforcementRecords = records.filter(
    (r) => r.routing && r.routing.enforcementDecision
  );

  const totalEnforcementDecisions = enforcementRecords.length;
  let appliedCount = 0;
  let blockedCount = 0;
  let fallbackCount = 0;
  let enforcedSuccessCount = 0;
  let enforcedFailCount = 0;
  let currentDefaultSuccessCount = 0;
  let currentDefaultFailCount = 0;
  const byTrack = {};
  const byCapability = {};
  const byQualificationRecord = {};
  const byFailedCondition = {};

  for (const record of enforcementRecords) {
    const ed = record.routing.enforcementDecision;
    const trackId = record.trackId || "unknown";
    const executedId = ed.executedCapabilityId || "unknown";
    const qualId = ed.qualificationRecordId || "unknown";
    const status = record.execution?.status;

    if (!byTrack[trackId]) {
      byTrack[trackId] = { total: 0, applied: 0, blocked: 0, fallback: 0, enforcedSuccess: 0, enforcedFail: 0, currentDefaultSuccess: 0, currentDefaultFail: 0 };
    }
    byTrack[trackId].total++;

    if (!byCapability[executedId]) {
      byCapability[executedId] = { total: 0, enforcedSuccess: 0, enforcedFail: 0, currentDefaultSuccess: 0, currentDefaultFail: 0 };
    }
    byCapability[executedId].total++;

    if (!byQualificationRecord[qualId]) {
      byQualificationRecord[qualId] = { total: 0, applied: 0, blocked: 0 };
    }
    byQualificationRecord[qualId].total++;

    if (ed.applied) {
      appliedCount++;
      byTrack[trackId].applied++;
      byQualificationRecord[qualId].applied++;

      if (ed.fallbackTriggered) {
        fallbackCount++;
        byTrack[trackId].fallback++;
      }

      if (status === "success" || status === "passed") {
        enforcedSuccessCount++;
        byTrack[trackId].enforcedSuccess++;
        byCapability[executedId].enforcedSuccess++;
      } else {
        enforcedFailCount++;
        byTrack[trackId].enforcedFail++;
        byCapability[executedId].enforcedFail++;
      }
    } else {
      blockedCount++;
      byTrack[trackId].blocked++;
      byQualificationRecord[qualId].blocked++;

      if (ed.failedConditions && Array.isArray(ed.failedConditions)) {
        for (const fc of ed.failedConditions) {
          const cond = fc.condition || "unknown";
          byFailedCondition[cond] = (byFailedCondition[cond] || 0) + 1;
        }
      }

      if (status === "success" || status === "passed") {
        currentDefaultSuccessCount++;
        byTrack[trackId].currentDefaultSuccess++;
        byCapability[executedId].currentDefaultSuccess++;
      } else {
        currentDefaultFailCount++;
        byTrack[trackId].currentDefaultFail++;
        byCapability[executedId].currentDefaultFail++;
      }
    }
  }

  for (const trackId of Object.keys(byTrack)) {
    const td = byTrack[trackId];
    td.enforcedSuccessRate = td.applied > 0
      ? Math.round((td.enforcedSuccess / (td.enforcedSuccess + td.enforcedFail)) * 10000) / 100
      : null;
    td.currentDefaultSuccessRate = (td.total - td.applied) > 0
      ? Math.round((td.currentDefaultSuccess / (td.currentDefaultSuccess + td.currentDefaultFail)) * 10000) / 100
      : null;
  }

  for (const capId of Object.keys(byCapability)) {
    const cd = byCapability[capId];
    cd.enforcedSuccessRate = (cd.enforcedSuccess + cd.enforcedFail) > 0
      ? Math.round((cd.enforcedSuccess / (cd.enforcedSuccess + cd.enforcedFail)) * 10000) / 100
      : null;
    cd.currentDefaultSuccessRate = (cd.currentDefaultSuccess + cd.currentDefaultFail) > 0
      ? Math.round((cd.currentDefaultSuccess / (cd.currentDefaultSuccess + cd.currentDefaultFail)) * 10000) / 100
      : null;
  }

  const enforcedExecutionSuccessRate = (enforcedSuccessCount + enforcedFailCount) > 0
    ? Math.round((enforcedSuccessCount / (enforcedSuccessCount + enforcedFailCount)) * 10000) / 100
    : null;
  const currentDefaultExecutionSuccessRate = (currentDefaultSuccessCount + currentDefaultFailCount) > 0
    ? Math.round((currentDefaultSuccessCount / (currentDefaultSuccessCount + currentDefaultFailCount)) * 10000) / 100
    : null;

  return {
    totalEnforcementDecisions,
    appliedCount,
    blockedCount,
    fallbackCount,
    enforcedExecutionSuccessRate,
    currentDefaultExecutionSuccessRate,
    enforcedSuccessCount,
    enforcedFailCount,
    currentDefaultSuccessCount,
    currentDefaultFailCount,
    byTrack,
    byCapability,
    byQualificationRecord,
    byFailedCondition,
    hasEnforcement: totalEnforcementDecisions > 0
  };
}

async function getEvidenceReview() {
  const records = await listAllRecords();
  return buildEvidenceReview(records);
}

async function getTrackReview(trackId) {
  const allRecords = await listAllRecords();
  const filtered = allRecords.filter((r) => r.trackId === trackId);
  const review = buildEvidenceReview(filtered);
  return {
    trackId,
    ...review
  };
}

async function getDisagreements(trackId) {
  const allRecords = await listAllRecords();
  const relevant = trackId
    ? allRecords.filter((r) => r.trackId === trackId)
    : allRecords;

  return relevant
    .filter(
      (r) =>
        r.routing &&
        r.routing.shadowRecommendation &&
        r.routing.shadowRecommendation.comparison === "disagree"
    )
    .map((r) => ({
      recordId: r.recordId,
      trackId: r.trackId,
      timestamp: r.timestamps?.createdAt,
      selectedCapability: r.routing.shadowRecommendation.selectedCapabilityId,
      recommendedCapability: r.routing.shadowRecommendation.recommendedCapabilityId,
      reason: r.routing.shadowRecommendation.reason,
      score: r.routing.shadowRecommendation.recommendedScore
    }));
}

async function getEnforcementDecisions(trackId) {
  const allRecords = await listAllRecords();
  const relevant = trackId
    ? allRecords.filter((r) => r.trackId === trackId)
    : allRecords;

  return relevant
    .filter((r) => r.routing && r.routing.enforcementDecision)
    .map((r) => ({
      recordId: r.recordId,
      trackId: r.trackId,
      timestamp: r.timestamps?.createdAt,
      state: r.routing.enforcementDecision.state,
      eligible: r.routing.enforcementDecision.eligible,
      attempted: r.routing.enforcementDecision.attempted,
      applied: r.routing.enforcementDecision.applied,
      reason: r.routing.enforcementDecision.reason,
      selectedCapabilityId: r.routing.enforcementDecision.selectedCapabilityId,
      recommendedCapabilityId: r.routing.enforcementDecision.recommendedCapabilityId,
      executedCapabilityId: r.routing.enforcementDecision.executedCapabilityId,
      fallbackTriggered: r.routing.enforcementDecision.fallbackTriggered,
      fallbackSucceeded: r.routing.enforcementDecision.fallbackSucceeded
    }));
}

module.exports = {
  getEvidenceReview,
  getTrackReview,
  getDisagreements,
  getEnforcementDecisions,
  buildEvidenceReview,
  buildEnforcementMetrics
};