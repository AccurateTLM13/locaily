const fs = require("node:fs/promises");
const path = require("node:path");
const { runSuite } = require("../benchmark-lab/engine/runners/suite-runner");
const { buildComparison } = require("../benchmark-lab/engine/compare-runs");
const { readJson } = require("../benchmark-lab/engine/fs-utils");

const ROOT = path.resolve(__dirname, "..");
const SUITE_PATH = path.join(ROOT, "benchmark-lab", "locaily", "tracks", "semantic-scorer-fixture", "suite.json");
const RUN_ID = "run-test-semantic-scorer-fixture";
const RUN_DIR = path.join(ROOT, "benchmark-lab", "results", "raw", RUN_ID);
const REPORT_DIR = path.join(ROOT, "benchmark-lab", "reports", "drafts", RUN_ID);

async function main() {
  await cleanup();

  try {
    const result = await runSuite({
      suitePath: SUITE_PATH,
      runId: RUN_ID,
      now: () => new Date("2026-08-02T00:00:00.000Z")
    });

    assert(result.summary.semanticScorer.id === "semantic-scorer-fixture-v1", "Expected scorer identity in summary.");
    assert(result.summary.semanticScorer.version === "1.0.0", "Expected scorer version in summary.");
    assert(result.summary.provenance.model.modelId === "mock-intent-classifier", "Expected model identity provenance.");
    assert(result.summary.provenance.model.manifestDigest.startsWith("sha256:"), "Expected manifest fingerprint provenance.");
    assert(result.summary.provenance.runtime.version === "mock-runtime-v1", "Expected runtime version provenance.");
    assert(result.summary.provenance.prompt.declared === true, "Expected declared prompt provenance.");
    assert(result.summary.provenance.cases.caseCount === 2, "Expected case-set provenance.");
    assert(result.summary.provenance.hardware.captured === false, "Expected hardware capture state provenance.");
    assert(result.summary.passed === 1, "Expected one semantically passing case.");
    assert(result.summary.failed === 1, "Expected one schema-valid semantic negative control to fail.");

    const negativeControl = result.summary.caseResults.find((caseResult) => caseResult.caseId === "semantic-fixture-002");
    const schemaCheck = negativeControl.checks.find((check) => check.validator === "json-schema");
    const semanticCheck = negativeControl.checks.find((check) => check.validator === "semantic-scorer");
    assert(schemaCheck.status === "pass", "Expected the negative control to remain schema-valid.");
    assert(semanticCheck.status === "fail", "Expected the negative control semantic check to fail.");
    assert(semanticCheck.code === "SEMANTIC_EXPECTATION_MISMATCH", "Expected actionable semantic failure code.");
    assert(semanticCheck.errors.length === 1, "Expected semantic scorer failure detail.");

    const provenanceMismatch = JSON.parse(JSON.stringify(result.summary));
    provenanceMismatch.runId = "run-test-semantic-scorer-provenance-mismatch";
    provenanceMismatch.provenance.prompt.version = "2.0.0";
    const comparison = buildComparison({
      comparisonId: "comparison-test-semantic-provenance",
      createdAt: "2026-08-02T00:00:00.000Z",
      left: result.summary,
      right: provenanceMismatch
    });
    assert(comparison.comparable === false, "Expected provenance mismatch to invalidate comparison.");
    assert(comparison.differences.some((difference) => difference.field === "provenance.prompt.version"), "Expected prompt provenance difference.");

    const modelChange = JSON.parse(JSON.stringify(result.summary));
    modelChange.runId = "run-test-semantic-scorer-model-change";
    modelChange.runtime.modelId = "mock-other-model";
    modelChange.runtime.runtimeModelName = "mock-other-model";
    modelChange.provenance.model.modelId = "mock-other-model";
    modelChange.provenance.model.runtimeModelName = "mock-other-model";
    modelChange.provenance.model.manifestDigest = "sha256:other-model-manifest";
    const modelComparison = buildComparison({
      comparisonId: "comparison-test-semantic-model-change",
      createdAt: "2026-08-02T00:00:00.000Z",
      left: result.summary,
      right: modelChange
    });
    assert(modelComparison.comparable === true, "Expected model identity changes to remain comparable.");

    const trackRunRecord = await readJson(path.join(RUN_DIR, "track-run-record.json"));
    assert(trackRunRecord.validation.validatorIds.includes("semantic-scorer"), "Expected semantic scorer provenance in Track Run Record.");

    console.log("ok benchmark-lab semantic scorer");
  } finally {
    await cleanup();
  }
}

async function cleanup() {
  await fs.rm(RUN_DIR, { recursive: true, force: true });
  await fs.rm(REPORT_DIR, { recursive: true, force: true });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
