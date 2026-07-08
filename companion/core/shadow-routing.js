function createShadowRouter({ resolver }) {
  if (!resolver) {
    throw new Error("Shadow router requires a qualification resolver.");
  }

  function computeShadowRecommendation({ role, trackId, contractId, currentModelId, currentQualification }) {
    const allCaps = resolver.resolveAllCapabilities();
    const relevantCaps = allCaps.filter(
      (c) => c.role === role && c.trackId === trackId && (!contractId || c.contractId === contractId)
    );

    const qualifiedCaps = relevantCaps
      .filter((c) => c.state === "qualified")
      .sort((a, b) => (b.score || 0) - (a.score || 0));

    const currentCap = relevantCaps.find((c) => c.modelId === currentModelId || c.runtimeModelName === currentModelId);
    const currentState = currentCap ? currentCap.state : "untested";

    let comparison;
    let recommendedCapabilityId = null;
    let recommendedScore = null;
    let recommendedQualificationState = null;
    let recommendedRuntimeModelName = null;
    let recommendedRecordId = null;
    let reason;
    let fallbackRecommendation = null;

    if (qualifiedCaps.length > 0) {
      const best = qualifiedCaps[0];
      recommendedQualificationState = best.state;
      recommendedRuntimeModelName = best.runtimeModelName || null;
      recommendedRecordId = best.recordId;

      if (best.modelId === currentModelId) {
        comparison = "agree";
        recommendedCapabilityId = currentModelId;
        recommendedScore = best.score;
        reason = `Current model '${currentModelId}' is the best qualified capability (score: ${best.score || "N/A"}).`;
      } else {
        comparison = "disagree";
        recommendedCapabilityId = best.modelId;
        recommendedScore = best.score;
        reason = `Qualification recommends '${best.modelId}' (score: ${best.score || "N/A"}) over current '${currentModelId}' (state: ${currentState}).`;

        if (qualifiedCaps.length > 1) {
          fallbackRecommendation = qualifiedCaps[1].modelId;
        }
      }

      if (currentState === "unqualified") {
        reason = reason + ` Current model '${currentModelId}' is unqualified for this role/track.`;
      }
    } else if (relevantCaps.length > 0) {
      const hasAnyQualifiedOrUnqualified = relevantCaps.some(
        (c) => c.state === "qualified" || c.state === "unqualified"
      );

      if (!hasAnyQualifiedOrUnqualified) {
        comparison = "insufficient-evidence";
        reason = `Models exist with non-definitive status (${relevantCaps.map((c) => `${c.modelId}:${c.state}`).join(", ")}) for role '${role}', track '${trackId}'. No model has sufficient qualification evidence.`;
      } else {
        const unqualifiedCurrent = relevantCaps.find((c) => c.state === "unqualified" && c.modelId === currentModelId);
        if (unqualifiedCurrent) {
          comparison = "current-selection-unqualified";
          reason = `Current model '${currentModelId}' is unqualified for role '${role}', track '${trackId}'. No qualified alternative available.`;
        } else {
          comparison = "no-qualified-capability";
          reason = `No model has qualified status for role '${role}', track '${trackId}'. ${relevantCaps.length} model(s) evaluated, none qualified.`;
        }
      }

      const bestByScore = relevantCaps
        .filter((c) => c.state !== "invalid")
        .sort((a, b) => (b.score || 0) - (a.score || 0));

      if (bestByScore.length > 0) {
        fallbackRecommendation = bestByScore[0].modelId;
        const fallbackCap = bestByScore[0];
        recommendedQualificationState = fallbackCap.state;
        recommendedRuntimeModelName = fallbackCap.runtimeModelName || null;
        recommendedRecordId = fallbackCap.recordId;
      }
    } else {
      comparison = "recommendation-unavailable";
      reason = `No qualification records found for role '${role}', track '${trackId}'. Cannot compute routing recommendation.`;
    }

    return {
      enabled: true,
      enforced: false,
      selectedCapabilityId: currentModelId,
      recommendedCapabilityId,
      recommendedRuntimeModelName,
      recommendedScore,
      state: currentState,
      selectedQualificationState: currentState,
      recommendedQualificationState,
      comparison,
      reason,
      notEnforcedReason: "Shadow mode: qualification recommendations do not affect routing decisions.",
      qualificationRecordId: currentQualification && currentQualification.recordId
        ? currentQualification.recordId
        : (recommendedRecordId || null),
      fallbackRecommendation
    };
  }

  return {
    computeShadowRecommendation
  };
}

module.exports = { createShadowRouter };
