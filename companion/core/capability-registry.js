const { createQualificationResolver } = require("./qualification-resolver");
const { createShadowRouter } = require("./shadow-routing");

function createCapabilityRegistry(options = {}) {
  const resolver = options.resolver || createQualificationResolver({
    loader: options.loader,
    ttlMs: options.ttlMs
  });
  const shadowRouter = options.shadowRouter || createShadowRouter({ resolver });

  function listCapabilities() {
    return resolver.resolveAllCapabilities();
  }

  function getCapability({ modelId, role, trackId, contractId }) {
    return resolver.resolveForCapability({ modelId, role, trackId, contractId });
  }

  function getCapabilitySummary() {
    return resolver.getAllSummary();
  }

  function dryRunRecommendation({ modelId, role, trackId, contractId, policy }) {
    const dryRun = resolver.getDryRunRecommendation({ modelId, role, trackId, contractId, policy });
    const shadow = shadowRouter.computeShadowRecommendation({
      role,
      trackId,
      contractId,
      currentModelId: modelId
    });

    return {
      ...dryRun,
      shadowRecommendation: shadow,
      recommendation: {
        action: shadow.comparison,
        modelId: shadow.recommendedCapabilityId ? shadow.recommendedCapabilityId.split(":")[0] : modelId,
        score: shadow.recommendedScore,
        confidence: shadow.confidence || "high",
        reason: shadow.reason,
        fallbackRecommendation: shadow.fallbackRecommendation
      }
    };
  }

  return {
    listCapabilities,
    getCapability,
    getCapabilitySummary,
    dryRunRecommendation
  };
}

module.exports = { createCapabilityRegistry };
