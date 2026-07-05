const { createQualificationResolver } = require("./qualification-resolver");

function createCapabilityRegistry(options = {}) {
  const resolver = options.resolver || createQualificationResolver({
    loader: options.loader,
    ttlMs: options.ttlMs
  });

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
    return resolver.getDryRunRecommendation({ modelId, role, trackId, contractId, policy });
  }

  return {
    listCapabilities,
    getCapability,
    getCapabilitySummary,
    dryRunRecommendation
  };
}

module.exports = { createCapabilityRegistry };
