const crypto = require("node:crypto");

function buildRunProvenance({ suite, cases, modelManifest, runtimeContext, semanticScorer }) {
  const promptDeclaration = suite.prompt || null;
  const caseSet = cases.map((benchmarkCase) => ({
    caseId: benchmarkCase.caseId,
    difficulty: benchmarkCase.difficulty,
    tags: benchmarkCase.tags || [],
    input: benchmarkCase.input,
    expected: benchmarkCase.expected || null
  }));
  const difficultyStrata = [...new Set(cases.map((benchmarkCase) => benchmarkCase.difficulty))].sort();
  const hardwareProfileId = suite.runtime.hardwareProfileId || suite.hardwareProfileId || null;

  return {
    schemaVersion: "benchmark.provenance.v1",
    model: {
      modelId: modelManifest ? modelManifest.modelId : null,
      provider: modelManifest ? modelManifest.provider : suite.runtime.provider,
      runtimeModelName: modelManifest ? modelManifest.runtimeModelName : null,
      manifestDigest: modelManifest ? hashJson(modelManifest) : null,
      declaredModelDigest: modelManifest ? (modelManifest.digest || null) : null,
      runtimeModelDigest: runtimeContext.runtimeModelDigest || null
    },
    runtime: {
      provider: suite.runtime.provider,
      adapterId: runtimeContext.adapterId,
      adapterVersion: runtimeContext.adapterVersion,
      version: runtimeContext.runtimeVersion,
      versionSource: runtimeContext.runtimeVersionSource
    },
    suite: {
      suiteId: suite.suiteId,
      trackId: suite.trackId,
      contractId: suite.contractId,
      mode: suite.mode,
      configDigest: hashJson(withoutModelBinding(suite))
    },
    prompt: {
      id: promptDeclaration ? promptDeclaration.id : runtimeContext.promptId,
      version: promptDeclaration ? promptDeclaration.version : runtimeContext.promptVersion,
      declared: Boolean(promptDeclaration),
      inputDigest: hashJson(cases.map((benchmarkCase) => ({
        caseId: benchmarkCase.caseId,
        input: benchmarkCase.input
      })))
    },
    scorer: semanticScorer ? { ...semanticScorer.config } : null,
    cases: {
      caseCount: cases.length,
      caseSetDigest: hashJson(caseSet),
      caseIdsDigest: hashJson(cases.map((benchmarkCase) => benchmarkCase.caseId)),
      difficultyStrata,
      difficultyStrataCount: difficultyStrata.length,
      difficultyStrataDigest: hashJson(difficultyStrata)
    },
    hardware: {
      profileId: hardwareProfileId,
      captured: Boolean(hardwareProfileId),
      source: hardwareProfileId ? "suite-declared" : "not-captured"
    }
  };
}

function hashJson(value) {
  return `sha256:${crypto.createHash("sha256").update(stableStringify(value)).digest("hex")}`;
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }

  return JSON.stringify(value);
}

function withoutModelBinding(suite) {
  const copy = JSON.parse(JSON.stringify(suite));
  delete copy.name;
  if (copy.runtime) {
    delete copy.runtime.modelManifest;
    delete copy.runtime.responsesPath;
    delete copy.runtime.baseUrl;
  }
  return copy;
}

module.exports = {
  buildRunProvenance,
  hashJson,
  stableStringify
};
