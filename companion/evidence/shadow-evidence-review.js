const { listAllRecords } = require("./track-run-record-store");
const { listReviews, buildQualitySummary } = require("./human-review-record-store");

function deduplicateByRecordId(records) {
  const seen = new Set();
  const result = [];
  for (const r of records) {
    const key = computeRecordKey(r);
    if (!key || !seen.has(key)) {
      if (key) seen.add(key);
      result.push(r);
    }
  }
  return result;
}

function computeRecordKey(record) {
  if (record.recordId) return record.recordId;
  if (record.parentRunId && record.stepId) return record.parentRunId + ":" + record.stepId;
  if (record.parentRunId && record.executorType) return record.parentRunId + ":" + record.executorType;
  return record.parentRunId || record.correlationId || null;
}

function extractShadowRecords(records) {
  const result = [];
  for (const record of records) {
    if (record.routing && record.routing.shadowRecommendation && record.routing.shadowRecommendation.enabled) {
      result.push(record);
    }
    if (record.childRuns && Array.isArray(record.childRuns)) {
      for (const child of record.childRuns) {
        if (child.routing && child.routing.shadowRecommendation && child.routing.shadowRecommendation.enabled) {
          result.push({
            ...child,
            trackId: child.trackId || record.trackId || "unknown",
            timestamps: child.timestamps || record.timestamps,
            execution: child.execution || record.execution
          });
        }
      }
    }
  }
  return deduplicateByRecordId(result);
}

function extractEnforcementRecords(records) {
  const result = [];
  for (const record of records) {
    if (record.routing && record.routing.enforcementDecision) {
      result.push(record);
    }
    if (record.childRuns && Array.isArray(record.childRuns)) {
      for (const child of record.childRuns) {
        if (child.routing && child.routing.enforcementDecision) {
          result.push({
            ...child,
            trackId: child.trackId || record.trackId || "unknown",
            timestamps: child.timestamps || record.timestamps,
            execution: child.execution || record.execution
          });
        }
      }
    }
  }
  return deduplicateByRecordId(result);
}

function classifyDisagreement(record) {
  const sr = record.routing && record.routing.shadowRecommendation;
  if (!sr || sr.comparison !== "disagree") return null;

  const selectedState = sr.selectedQualificationState || sr.state || "unknown";
  const recommendedQualState = sr.recommendedQualificationState || "unknown";
  const reason = (sr.reason || "").toLowerCase();

  if (selectedState === "expired" || selectedState === "stale") {
    return { classification: "qualification_stale", detail: `Selected model qualification is ${selectedState}.`, evidence: `currentState:${selectedState}` };
  }

  if (reason.includes("runtime") || reason.includes("unavailable") || reason.includes("not ready")) {
    return { classification: "runtime_unavailable", detail: "Shadow routing detected runtime unavailability.", evidence: `reason:${sr.reason}` };
  }

  if (selectedState === "qualified" && recommendedQualState === "qualified") {
    return { classification: "model_regression", detail: "Both models qualified but shadow recommends a different model, suggesting the current model may have regressed relative to the recommendation.", evidence: `selected:${sr.selectedCapabilityId} recommended:${sr.recommendedCapabilityId} selectedState:${selectedState} recommendedState:${recommendedQualState}` };
  }

  return { classification: "unexplainable", detail: `Disagreement with state: selected=${selectedState}, recommended=${recommendedQualState}. No clear classification matches.`, evidence: `selectedState:${selectedState} recommendedState:${recommendedQualState}` };
}

function detectDrift(records) {
  const shadowRecords = extractShadowRecords(records);
  if (shadowRecords.length < 4) return { driftDetected: false, reason: "Insufficient records for drift analysis (need 4+)." };

  const sorted = [...shadowRecords].sort((a, b) => {
    return (a.timestamps?.createdAt || "").localeCompare(b.timestamps?.createdAt || "");
  });

  const midpoint = Math.floor(sorted.length / 2);
  const early = sorted.slice(0, midpoint);
  const late = sorted.slice(midpoint);

  function computeRate(bucket) {
    let agree = 0;
    const byComparison = {};
    for (const r of bucket) {
      const sr = r.routing && r.routing.shadowRecommendation;
      const comp = sr ? sr.comparison : "unknown";
      byComparison[comp] = (byComparison[comp] || 0) + 1;
      if (comp === "agree") agree++;
    }
    return { total: bucket.length, agree, agreementRate: bucket.length > 0 ? Math.round((agree / bucket.length) * 10000) / 100 : 0, byComparison };
  }

  const earlyStats = computeRate(early);
  const lateStats = computeRate(late);
  const driftPoints = [];

  const rateDiff = lateStats.agreementRate - earlyStats.agreementRate;
  if (Math.abs(rateDiff) > 10) {
    driftPoints.push({
      metric: "agreement_rate",
      early: earlyStats.agreementRate,
      late: lateStats.agreementRate,
      change: rateDiff,
      direction: rateDiff > 0 ? "improving" : "degrading",
      severity: Math.abs(rateDiff) > 25 ? "high" : "medium"
    });
  }

  const earlyDisagree = earlyStats.byComparison.disagree || 0;
  const lateDisagree = lateStats.byComparison.disagree || 0;
  const earlyDisagreeRate = earlyStats.total > 0 ? (earlyDisagree / earlyStats.total) * 100 : 0;
  const lateDisagreeRate = lateStats.total > 0 ? (lateDisagree / lateStats.total) * 100 : 0;
  const disagreeDrift = lateDisagreeRate - earlyDisagreeRate;
  if (Math.abs(disagreeDrift) > 10) {
    driftPoints.push({
      metric: "disagreement_rate",
      early: Math.round(earlyDisagreeRate * 100) / 100,
      late: Math.round(lateDisagreeRate * 100) / 100,
      change: Math.round(disagreeDrift * 100) / 100,
      direction: disagreeDrift > 0 ? "increasing" : "decreasing",
      severity: Math.abs(disagreeDrift) > 25 ? "high" : "medium"
    });
  }

  return {
    driftDetected: driftPoints.length > 0,
    driftPoints,
    earlyPeriod: { start: early[0]?.timestamps?.createdAt, end: early[early.length - 1]?.timestamps?.createdAt, recordCount: early.length },
    latePeriod: { start: late[0]?.timestamps?.createdAt, end: late[late.length - 1]?.timestamps?.createdAt, recordCount: late.length },
    totalRecords: sorted.length,
    generatedAt: new Date().toISOString()
  };
}

function buildEvidenceReview(records) {
  const shadowRecords = extractShadowRecords(records);

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
      byTrack[trackId] = { total: 0, byComparison: {}, agreementRate: 0, disagreementClassification: {} };
    }
    byTrack[trackId].total++;
    byTrack[trackId].byComparison[comparison] = (byTrack[trackId].byComparison[comparison] || 0) + 1;

    if (comparison === "agree") agreeCount++;
    if (comparison === "disagree") {
      disagreeCount++;
      const cls = classifyDisagreement(record);
      if (cls) {
        const cat = cls.classification;
        if (!byTrack[trackId].disagreementClassification[cat]) {
          byTrack[trackId].disagreementClassification[cat] = 0;
        }
        byTrack[trackId].disagreementClassification[cat]++;
      }
    }
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
  const drift = detectDrift(records);
  const disagreementBreakdown = buildDisagreementBreakdown(shadowRecords);

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
    enforcement: enforcementMetrics,
    drift,
    disagreementBreakdown
  };
}

function buildDisagreementBreakdown(shadowRecords) {
  const classificationCounts = { model_regression: 0, qualification_stale: 0, runtime_unavailable: 0, unexplainable: 0 };
  const byTrack = {};
  let total = 0;

  for (const record of shadowRecords) {
    const cls = classifyDisagreement(record);
    if (!cls) continue;
    total++;
    classificationCounts[cls.classification] = (classificationCounts[cls.classification] || 0) + 1;
    const trackId = record.trackId || "unknown";
    if (!byTrack[trackId]) byTrack[trackId] = {};
    byTrack[trackId][cls.classification] = (byTrack[trackId][cls.classification] || 0) + 1;
  }

  return { totalClassifiedDisagreements: total, byClassification: classificationCounts, byTrack, generatedAt: new Date().toISOString() };
}

function buildDisagreementSummary(shadowRecords) {
  const disagreements = shadowRecords.filter(
    (r) => r.routing && r.routing.shadowRecommendation && r.routing.shadowRecommendation.comparison === "disagree"
  );
  return disagreements.map((r) => {
    const sr = r.routing.shadowRecommendation;
    const cls = classifyDisagreement(r);
    return {
      recordId: r.recordId,
      trackId: r.trackId,
      timestamp: r.timestamps?.createdAt,
      selectedCapabilityId: sr.selectedCapabilityId,
      recommendedCapabilityId: sr.recommendedCapabilityId,
      reason: sr.reason,
      score: sr.recommendedScore,
      classification: cls ? cls.classification : null,
      classificationDetail: cls ? cls.detail : null,
      classificationEvidence: cls ? cls.evidence : null
    };
  });
}

function buildLearningState(records) {
  const shadowRecords = extractShadowRecords(records);
  const totalRecords = records.length;
  const shadowCount = shadowRecords.length;

  const byTrack = {};
  for (const record of shadowRecords) {
    const trackId = record.trackId || "unknown";
    if (!byTrack[trackId]) {
      byTrack[trackId] = { recordCount: 0, agreementCount: 0, disagreementCount: 0, coverageCount: 0, byClassification: {}, lastQualification: null, lastComparison: null };
    }
    const td = byTrack[trackId];
    td.recordCount++;

    const sr = record.routing.shadowRecommendation;
    if (sr.comparison === "agree") td.agreementCount++;
    if (sr.comparison === "disagree") {
      td.disagreementCount++;
      const cls = classifyDisagreement(record);
      if (cls) td.byClassification[cls.classification] = (td.byClassification[cls.classification] || 0) + 1;
    }

    if (sr.recommendedQualificationState === "qualified" || sr.state === "qualified") {
      td.coverageCount++;
    }

    if (sr.qualificationRecordId) {
      td.lastQualification = sr.qualificationRecordId;
    }
    td.lastComparison = sr.comparison;
    td.lastTimestamp = record.timestamps?.createdAt;
  }

  const trackStates = {};
  for (const [trackId, td] of Object.entries(byTrack)) {
    const agreementPercent = td.recordCount > 0 ? Math.round((td.agreementCount / td.recordCount) * 10000) / 100 : 0;
    const coveragePercent = td.recordCount > 0 ? Math.round((td.coverageCount / td.recordCount) * 10000) / 100 : 0;
    trackStates[trackId] = {
      recordCount: td.recordCount,
      agreementPercent,
      disagreementCount: td.disagreementCount,
      disagreementBreakdown: td.byClassification,
      coveragePercent,
      lastQualification: td.lastQualification,
      lastComparison: td.lastComparison,
      lastUpdated: td.lastTimestamp
    };
  }

  return {
    totalRecords,
    shadowComparisonCount: shadowCount,
    trackStates,
    generatedAt: new Date().toISOString()
  };
}

function buildEnforcementMetrics(records) {
  const enforcementRecords = extractEnforcementRecords(records);

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
  const shadowRecords = extractShadowRecords(allRecords);
  const relevant = trackId
    ? shadowRecords.filter((r) => r.trackId === trackId)
    : shadowRecords;

  return buildDisagreementSummary(relevant);
}

async function getEnforcementDecisions(trackId) {
  const allRecords = await listAllRecords();
  const enfRecords = extractEnforcementRecords(allRecords);
  const relevant = trackId
    ? enfRecords.filter((r) => r.trackId === trackId)
    : enfRecords;

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

async function getShadowComparisons(trackId) {
  const allRecords = await listAllRecords();
  const shadowRecords = extractShadowRecords(allRecords);
  const relevant = trackId
    ? shadowRecords.filter((r) => r.trackId === trackId)
    : shadowRecords;

  return relevant.filter(
    (r) => r.routing && r.routing.shadowRecommendation
  ).map((r) => ({
    recordId: r.recordId,
    trackId: r.trackId,
    timestamp: r.timestamps?.createdAt,
    comparison: r.routing.shadowRecommendation.comparison,
    selectedCapabilityId: r.routing.shadowRecommendation.selectedCapabilityId,
    recommendedCapabilityId: r.routing.shadowRecommendation.recommendedCapabilityId,
    reason: r.routing.shadowRecommendation.reason,
    recommendedScore: r.routing.shadowRecommendation.recommendedScore
  }));
}

async function getLearningState() {
  const records = await listAllRecords();
  return buildLearningState(records);
}

async function getDrift() {
  const records = await listAllRecords();
  return detectDrift(records);
}

module.exports = {
  getEvidenceReview,
  getTrackReview,
  getDisagreements,
  getEnforcementDecisions,
  getShadowComparisons,
  getLearningState,
  getDrift,
  buildEvidenceReview,
  buildEnforcementMetrics,
  buildLearningState,
  buildDisagreementBreakdown,
  buildDisagreementSummary,
  classifyDisagreement,
  detectDrift,
  extractShadowRecords,
  extractEnforcementRecords
};
