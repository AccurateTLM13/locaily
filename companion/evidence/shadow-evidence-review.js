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
    generatedAt: new Date().toISOString()
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

module.exports = {
  getEvidenceReview,
  getTrackReview,
  getDisagreements,
  buildEvidenceReview
};
