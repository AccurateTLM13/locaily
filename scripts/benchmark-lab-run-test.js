const fs = require("node:fs/promises");
const path = require("node:path");
const { runSuite } = require("../benchmark-lab/engine/runners/suite-runner");
const { reviewRun, promoteRun } = require("../benchmark-lab/engine/review-run");
const { compareRuns } = require("../benchmark-lab/engine/compare-runs");
const { runMatrix } = require("../benchmark-lab/engine/matrix-runner");
const { generateModelCard } = require("../benchmark-lab/engine/model-card");
const { generateQualification } = require("../benchmark-lab/engine/qualification");
const { generateBenchmarkReport } = require("../benchmark-lab/engine/report");
const { verifyChecksumRecord } = require("../benchmark-lab/engine/checksums");
const { OllamaRuntimeAdapter } = require("../benchmark-lab/engine/adapters/ollama-runtime");
const { createModelQualificationLoader } = require("../companion/core/model-qualification-loader");
const { readJson } = require("../benchmark-lab/engine/fs-utils");

const ROOT = path.resolve(__dirname, "..");
const SUITE_PATH = path.join(ROOT, "benchmark-lab", "locaily", "tracks", "intent-classification", "suite.json");
const IMPROVED_SUITE_PATH = path.join(ROOT, "benchmark-lab", "locaily", "tracks", "intent-classification", "suite-improved.json");

async function main() {
  await cleanupTestPromotionArtifacts();
  await cleanupTestModelCardArtifacts();
  await cleanupTestQualificationArtifacts();
  await cleanupTestReportArtifacts();
  await cleanupTestMatrixArtifacts();

  const fixedNow = () => new Date("2026-06-23T00:00:00.000Z");
  const first = await runSuite({
    suitePath: SUITE_PATH,
    runId: "run-test-intent-classification-a",
    now: fixedNow
  });
  const second = await runSuite({
    suitePath: SUITE_PATH,
    runId: "run-test-intent-classification-b",
    now: fixedNow
  });
  const improved = await runSuite({
    suitePath: IMPROVED_SUITE_PATH,
    runId: "run-test-intent-classification-improved",
    now: fixedNow
  });
  const manifestOverride = await runSuite({
    suitePath: SUITE_PATH,
    modelManifest: "mock-intent-classifier",
    runId: "run-test-intent-classification-manifest-override",
    now: fixedNow
  });

  const firstComparable = withoutRunId(first.summary);
  const secondComparable = withoutRunId(second.summary);

  assert(
    JSON.stringify(firstComparable) === JSON.stringify(secondComparable),
    "Expected deterministic mock suite summaries to match across repeated runs."
  );

  assert(first.summary.caseCount === 7, "Expected seven benchmark cases.");
  assert(first.summary.passed === 3, "Expected three passing cases.");
  assert(first.summary.failed === 1, "Expected one deterministic failed label case.");
  assert(first.summary.malformed === 1, "Expected one malformed-output case.");
  assert(first.summary.timeouts === 1, "Expected one timeout case.");
  assert(first.summary.errors === 1, "Expected one runtime-error case.");
  assert(first.summary.runtime.modelId === "mock-intent-classifier", "Expected run summary to include model manifest id.");
  assert(first.summary.runtime.runtimeModelName === "mock-intent-classifier", "Expected run summary to include runtime model name.");
  assert(manifestOverride.summary.runtime.modelId === "mock-intent-classifier", "Expected model manifest override to apply.");
  assert(improved.summary.passed === 7, "Expected improved mock suite to pass all cases.");

  const malformed = first.summary.caseResults.find((result) => result.caseId === "intent-005");
  assert(malformed.verdict === "MALFORMED_OUTPUT", "Expected malformed response to be recorded without crashing.");

  const runtimeError = first.summary.caseResults.find((result) => result.caseId === "intent-007");
  assert(runtimeError.verdict === "RUNTIME_ERROR", "Expected simulated runtime failure to be isolated to its case.");

  const rawRun = await readJson(path.join(first.rawRunDir, "run.json"));
  assert(rawRun.caseResults.some((result) => result.rawText), "Expected raw outputs in ignored raw run storage.");

  const draftSummary = await readJson(first.draftSummaryPath);
  assert(!JSON.stringify(draftSummary).includes("Pull the title"), "Draft summary must not include prompts.");
  assert(!JSON.stringify(draftSummary).includes("rawText"), "Draft summary must not include raw responses.");

  await assertPathMissing(path.join(ROOT, "benchmark-lab", "evidence", "summaries", "evidence-test-intent-classification.json"));
  await assertPathMissing(path.join(ROOT, "benchmark-lab", "evidence", "approved", "evidence-test-intent-classification.json"));

  const review = await reviewRun({
    runId: first.runId,
    now: fixedNow
  });
  assert(review.review.promotion.eligible === false, "Expected mixed-result run to require manual review before promotion.");
  assert(review.review.notableCases.length === 4, "Expected review to list four notable non-pass cases.");

  const promoted = await promoteRun({
    runId: first.runId,
    evidenceId: "evidence-test-intent-classification",
    approvedBy: "benchmark-lab-test",
    notes: ["Test-only promoted evidence."],
    now: fixedNow
  });
  const promotedEvidence = await readJson(promoted.promotedPath);
  const approvedSummary = await readJson(promoted.approvedPath);
  await assertChecksumOk(promoted.checksumPaths[0]);
  await assertChecksumOk(promoted.checksumPaths[1]);

  assert(promotedEvidence.schemaVersion === "benchmark.promoted_evidence.v1", "Expected promoted evidence artifact.");
  assert(approvedSummary.schemaVersion === "benchmark.approved_evidence_summary.v1", "Expected approved evidence summary.");
  assert(!JSON.stringify(promotedEvidence).includes("Pull the title"), "Promoted evidence must not include prompts.");
  assert(!JSON.stringify(promotedEvidence).includes("rawText"), "Promoted evidence must not include raw responses.");
  await assertPathMissing(path.join(ROOT, "benchmark-lab", "qualifications", "models", "evidence-test-intent-classification.json"));

  const modelCard = await generateModelCard({
    modelId: "mock-intent-classifier",
    evidenceIds: ["evidence-test-intent-classification"],
    now: fixedNow
  });
  assert(modelCard.sourceData.modelId === "mock-intent-classifier", "Expected model-card source data for fixture model.");
  assert(modelCard.sourceData.trackQualifications[0].status === "screening", "Draft model card must not claim qualification.");
  assert(modelCard.markdown.includes("# Mock Intent Classifier"), "Expected Markdown model-card title.");
  assert(modelCard.markdown.includes("evidence-test-intent-classification"), "Expected Markdown model card to cite evidence.");
  assert(!modelCard.markdown.includes("Pull the title"), "Model card must not include prompts.");
  assert(!modelCard.markdown.includes("rawText"), "Model card must not include raw responses.");
  await assertChecksumOk(modelCard.checksumPaths[0]);
  await assertChecksumOk(modelCard.checksumPaths[1]);

  const qualification = await generateQualification({
    modelId: "mock-intent-classifier",
    evidenceId: "evidence-test-intent-classification",
    role: "fast_worker",
    status: "candidate",
    roleStatus: "conditional",
    notes: ["Test-only qualification generation."],
    now: fixedNow
  });
  assert(qualification.record.status === "candidate", "Expected candidate qualification record.");
  assert(qualification.record.qualifiedFor[0].role === "fast_worker", "Expected role qualification entry.");
  assert(qualification.record.qualifiedFor[0].status === "conditional", "Expected conditional role status.");
  assert(qualification.record.qualifiedFor[0].score === 0.4286, "Expected pass-rate score from promoted evidence.");
  assert(!JSON.stringify(qualification.record).includes("Pull the title"), "Qualification must not include prompts.");
  assert(!JSON.stringify(qualification.record).includes("rawText"), "Qualification must not include raw responses.");
  await assertChecksumOk(qualification.checksumPath);

  const report = await generateBenchmarkReport({
    reportId: "report-test-intent-classification",
    title: "Intent Classification Test Report",
    evidenceIds: ["evidence-test-intent-classification"],
    now: fixedNow
  });
  assert(report.source.schemaVersion === "benchmark.report_source.v1", "Expected report source data.");
  assert(report.source.summaries[0].passRate === 0.4286, "Expected report pass-rate summary.");
  assert(report.markdown.includes("# Intent Classification Test Report"), "Expected report Markdown title.");
  assert(report.markdown.includes("evidence-test-intent-classification"), "Expected report to cite evidence.");
  assert(!report.markdown.includes("Pull the title"), "Report must not include prompts.");
  assert(!report.markdown.includes("rawText"), "Report must not include raw responses.");
  await assertChecksumOk(report.checksumPaths[0]);
  await assertChecksumOk(report.checksumPaths[1]);

  const loader = createModelQualificationLoader({
    qualificationDir: path.join(ROOT, "benchmark-lab", "qualifications", "models")
  });
  const modelRecords = loader.findByModel("mock-intent-classifier");
  const roleMatches = loader.findForRole({
    modelId: "mock-intent-classifier",
    role: "fast_worker",
    trackId: "intent-classification",
    contractId: "intent-classifier-worker-v1"
  });
  assert(modelRecords.some((record) => record.recordId === qualification.record.recordId), "Expected loader to find generated model record.");
  assert(roleMatches.some((match) => match.status === "conditional"), "Expected loader to find conditional role match.");

  await testOllamaAdapter();

  const comparison = await compareRuns({
    leftRunId: first.runId,
    rightRunId: improved.runId,
    comparisonId: "comparison-test-intent-classification",
    now: fixedNow
  });
  assert(comparison.comparison.comparable === true, "Expected controlled summaries to be comparable.");
  assert(comparison.comparison.metrics.delta.passed === 4, "Expected improved run to add four passing cases.");
  assert(comparison.comparison.metrics.delta.failed === -1, "Expected improved run to remove one failed case.");
  assert(comparison.comparison.metrics.delta.errors === -1, "Expected improved run to remove one runtime error.");
  assert(comparison.comparison.metrics.delta.timeouts === -1, "Expected improved run to remove one timeout.");
  assert(comparison.comparison.metrics.delta.malformed === -1, "Expected improved run to remove one malformed output.");
  assert(comparison.comparison.caseDeltas.filter((delta) => delta.changed).length === 4, "Expected four changed case verdicts.");
  assert(!JSON.stringify(comparison.comparison).includes("Pull the title"), "Comparison must not include prompts.");
  assert(!JSON.stringify(comparison.comparison).includes("rawText"), "Comparison must not include raw responses.");

  const matrix = await runMatrix({
    suitePath: SUITE_PATH,
    modelManifests: ["mock-intent-classifier"],
    matrixId: "matrix-test-intent-classification",
    now: fixedNow
  });
  assert(matrix.matrix.models.length === 1, "Expected matrix to include selected model.");
  assert(matrix.matrix.models[0].modelId === "mock-intent-classifier", "Expected matrix model id.");
  assert(matrix.matrix.models[0].passed === 3, "Expected matrix to include run metrics.");
  assert(matrix.matrix.rankings[0].modelId === "mock-intent-classifier", "Expected matrix ranking.");
  assert(matrix.matrix.caseMatrix.length === 7, "Expected matrix case rows.");
  assert(matrix.markdown.includes("# matrix-test-intent-classification"), "Expected matrix Markdown title.");
  assert(!JSON.stringify(matrix.matrix).includes("Pull the title"), "Matrix must not include prompts.");
  assert(!matrix.markdown.includes("rawText"), "Matrix Markdown must not include raw responses.");

  await assertNoCompanionBenchmarkEngineImport();
  await cleanupTestPromotionArtifacts();
  await cleanupTestModelCardArtifacts();
  await cleanupTestQualificationArtifacts();
  await cleanupTestReportArtifacts();
  await cleanupTestMatrixArtifacts();

  console.log("ok benchmark-lab run loop");
}

async function testOllamaAdapter() {
  let captured = null;
  const adapter = new OllamaRuntimeAdapter({
    baseUrl: "http://127.0.0.1:11434/",
    model: "llama3.2",
    outputSchema: {
      type: "object",
      required: ["track", "label", "confidence"],
      properties: {}
    },
    timeoutMs: 1000,
    temperature: 0,
    numPredict: 128,
    fetchImpl: async (url, request) => {
      captured = {
        url,
        request,
        body: JSON.parse(request.body)
      };

      return {
        ok: true,
        json: async () => ({
          response: JSON.stringify({
            track: "classification",
            label: "extract",
            confidence: "high"
          })
        })
      };
    }
  });

  const result = await adapter.generate({
    caseId: "intent-ollama-001",
    input: {
      text: "Extract the price."
    }
  });

  assert(result.ok === true, "Expected fake Ollama adapter response to succeed.");
  assert(captured.url === "http://127.0.0.1:11434/api/generate", "Expected normalized Ollama generate URL.");
  assert(captured.body.model === "llama3.2", "Expected configured Ollama model.");
  assert(captured.body.stream === false, "Expected non-streaming Ollama request.");
  assert(captured.body.format.type === "object", "Expected schema format in Ollama request.");
  assert(captured.body.prompt.includes("intent-ollama-001"), "Expected case id in prompt.");

  const failingAdapter = new OllamaRuntimeAdapter({
    model: "llama3.2",
    outputSchema: {
      type: "object"
    },
    fetchImpl: async () => ({
      ok: false,
      status: 500,
      json: async () => ({})
    })
  });
  const failed = await failingAdapter.generate({
    caseId: "intent-ollama-002",
    input: {
      text: "Classify this."
    }
  });

  assert(failed.ok === false, "Expected failed Ollama request to be captured as case failure.");
  assert(failed.errorCode === "RUNTIME_ERROR", "Expected failed Ollama request to be runtime error.");
}

function withoutRunId(summary) {
  return {
    ...summary,
    runId: "normalized"
  };
}

async function assertNoCompanionBenchmarkEngineImport() {
  const companionDir = path.join(ROOT, "companion");
  const files = await listFiles(companionDir);

  for (const file of files.filter((candidate) => candidate.endsWith(".js"))) {
    const content = await fs.readFile(file, "utf8");
    assert(
      !content.includes("benchmark-lab/engine") && !content.includes("benchmark-lab\\engine"),
      `Companion runtime must not import Benchmark Lab engine modules: ${file}`
    );
  }
}

async function assertPathMissing(filePath) {
  try {
    await fs.access(filePath);
  } catch (error) {
    if (error.code === "ENOENT") {
      return;
    }
    throw error;
  }

  throw new Error(`Expected path not to exist: ${filePath}`);
}

async function assertChecksumOk(checksumPath) {
  const result = await verifyChecksumRecord(checksumPath);
  assert(result.ok === true, `Expected checksum verification to pass for ${checksumPath}`);
}

async function cleanupTestPromotionArtifacts() {
  await removeIfExists(path.join(ROOT, "benchmark-lab", "evidence", "summaries", "evidence-test-intent-classification.json"));
  await removeIfExists(path.join(ROOT, "benchmark-lab", "evidence", "approved", "evidence-test-intent-classification.json"));
  await removeIfExists(path.join(ROOT, "benchmark-lab", "evidence", "checksums", "evidence-test-intent-classification-promoted-evidence.json"));
  await removeIfExists(path.join(ROOT, "benchmark-lab", "evidence", "checksums", "evidence-test-intent-classification-approved-summary.json"));
}

async function cleanupTestModelCardArtifacts() {
  await removeIfExists(path.join(ROOT, "benchmark-lab", "model-cards", "published", "mock-intent-classifier.source.json"));
  await removeIfExists(path.join(ROOT, "benchmark-lab", "model-cards", "published", "mock-intent-classifier.md"));
  await removeIfExists(path.join(ROOT, "benchmark-lab", "evidence", "checksums", "mock-intent-classifier-model-card-source.json"));
  await removeIfExists(path.join(ROOT, "benchmark-lab", "evidence", "checksums", "mock-intent-classifier-model-card-markdown.json"));
}

async function cleanupTestQualificationArtifacts() {
  await removeIfExists(path.join(ROOT, "benchmark-lab", "qualifications", "models", "mock-intent-classifier-evidence-test-intent-classification.json"));
  await removeIfExists(path.join(ROOT, "benchmark-lab", "evidence", "checksums", "mock-intent-classifier-evidence-test-intent-classification-qualification.json"));
}

async function cleanupTestReportArtifacts() {
  await removeIfExists(path.join(ROOT, "benchmark-lab", "reports", "published", "report-test-intent-classification.source.json"));
  await removeIfExists(path.join(ROOT, "benchmark-lab", "reports", "published", "report-test-intent-classification.md"));
  await removeIfExists(path.join(ROOT, "benchmark-lab", "evidence", "checksums", "report-test-intent-classification-report-source.json"));
  await removeIfExists(path.join(ROOT, "benchmark-lab", "evidence", "checksums", "report-test-intent-classification-report-markdown.json"));
}

async function cleanupTestMatrixArtifacts() {
  await removeIfExists(path.join(ROOT, "benchmark-lab", "reports", "drafts", "matrices", "matrix-test-intent-classification.json"));
  await removeIfExists(path.join(ROOT, "benchmark-lab", "reports", "drafts", "matrices", "matrix-test-intent-classification.md"));
}

async function removeIfExists(filePath) {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

async function listFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }

  return files;
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
