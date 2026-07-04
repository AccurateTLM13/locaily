const { createHash } = require("node:crypto");
const { readFileSync, mkdirSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { createOllamaRuntime } = require("../companion/runtime/ollama");
const { createVaultAdapter } = require("../companion/memory/vault-adapter");
const { WIKI_ALLOWED_PATHS, DEFAULT_BLOCKED_PATHS } = require("../companion/memory/allowlist-presets");
const {
  extractNarrowSignals,
  validateNarrowSignal,
  calculateDuplicateRate
} = require("../companion/editorial/narrow-extractor");

const DEFAULT_MODEL = "hf.co/mradermacher/VibeThinker-3B-GGUF:Q4_K_M";
const FIXTURE_PATH = join(
  __dirname,
  "..",
  "docs",
  "04-validation",
  "fixtures",
  "operator-log-narrow-extraction-v0.1.json"
);
const EDITORIAL_BRIEF = "Find concrete Operator Log story evidence: a demonstrated problem, an observed change, and a genuinely unexpected observation.";

async function main() {
  const vaultPath = process.argv[2] || process.env.LOCAL_MEMORY_VAULT_PATH;
  const model = process.argv[3] || process.env.OPERATOR_LOG_MODEL || DEFAULT_MODEL;

  if (!vaultPath) {
    throw new Error("Usage: node scripts/operator-log-narrow-extraction-evaluation.js <vault-path> [model]");
  }

  const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));
  const adapter = createVaultAdapter({
    enabled: true,
    vaultPath,
    readPolicy: "allowlist",
    allowedPaths: WIKI_ALLOWED_PATHS,
    blockedPaths: DEFAULT_BLOCKED_PATHS,
    rawAccess: false,
    writebackMode: "proposal_only"
  });
  const status = adapter.getStatus();

  if (!status.readable) {
    throw new Error(`Vault is not readable: ${status.warnings.join(" ")}`);
  }

  const runtime = createOllamaRuntime({ model });
  const records = [];
  const frozenFiles = [];
  const benchmarkStartedAt = Date.now();
  const benchmarkStartedIso = new Date(benchmarkStartedAt).toISOString();

  for (const fixtureFile of fixture.files) {
    const read = adapter.readMarkdownFile(fixtureFile.path);

    if (!read.ok) {
      throw new Error(`Fixture source is unavailable: ${fixtureFile.path}: ${read.error.message}`);
    }

    frozenFiles.push({
      path: fixtureFile.path,
      fixtureRole: fixtureFile.fixture_role,
      sha256: createHash("sha256").update(read.content).digest("hex"),
      bytes: Buffer.byteLength(read.content, "utf8")
    });

    for (let repetition = 1; repetition <= fixture.runs_per_file; repetition += 1) {
      const startedAt = Date.now();
      const extraction = await extractNarrowSignals({
        runtime,
        model,
        sourcePath: fixtureFile.path,
        content: read.content,
        editorialBrief: EDITORIAL_BRIEF,
        timeoutMs: 120000
      });
      const validations = extraction.signals.map((signal) => validateNarrowSignal(signal, {
        sourcePath: fixtureFile.path,
        content: read.content,
        editorialBrief: EDITORIAL_BRIEF
      }));

      records.push({
        sourcePath: fixtureFile.path,
        fixtureRole: fixtureFile.fixture_role,
        repetition,
        durationMs: Date.now() - startedAt,
        parseable: extraction.ok,
        attempts: extraction.attempts,
        error: extraction.error || null,
        signals: extraction.signals,
        validations,
        humanUsefulness: null
      });
    }
  }

  const metrics = calculateMetrics(records);
  const criteria = evaluateCriteria(metrics, fixture.pass_criteria);
  const finishedAt = new Date().toISOString();
  const artifact = {
    fixtureId: fixture.fixture_id,
    experimental: true,
    model,
    startedAt: benchmarkStartedIso,
    finishedAt,
    durationMs: Date.now() - benchmarkStartedAt,
    privacy: {
      rawAccess: false,
      absoluteVaultPathRecorded: false,
      privateContentArtifact: true
    },
    frozenInventory: frozenFiles,
    metrics,
    criteria,
    humanReviewStatus: "pending",
    records
  };
  const outputDir = join(__dirname, "..", "data", "validation");
  mkdirSync(outputDir, { recursive: true });
  const stamp = finishedAt.replace(/[-:.]/g, "");
  const outputPath = join(outputDir, `operator-log-narrow-extraction_${stamp}.local.json`);
  writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({
    fixtureId: fixture.fixture_id,
    model,
    durationMs: artifact.durationMs,
    metrics,
    criteria,
    humanReviewStatus: artifact.humanReviewStatus,
    outputPath
  }, null, 2));
}

function calculateMetrics(records) {
  const calls = records.length;
  const parseableCalls = records.filter((record) => record.parseable).length;
  const retriedCalls = records.filter((record) => record.attempts > 1).length;
  const signals = records.flatMap((record) => record.signals);
  const validations = records.flatMap((record) => record.validations);
  const validSignals = signals.filter((_signal, index) => validations[index] && validations[index].valid);
  const sourcePathValid = validations.filter((validation) => validation.sourcePathValid).length;
  const excerptsFound = validations.filter((validation) => validation.excerptFound).length;
  const rawCitations = validations.filter((validation) => validation.rawCitation).length;
  const promptEchoes = validations.filter((validation) => validation.promptEcho).length;
  const unsupportedClaims = validations.filter((validation) => validation.supportedElementCount < 2).length;
  const inferenceDurations = records.map((record) => record.durationMs);

  return {
    callCount: calls,
    signalCount: signals.length,
    validSignalCount: validSignals.length,
    parseableJsonRateAfterRetry: ratio(parseableCalls, calls),
    retryRate: ratio(retriedCalls, calls),
    sourcePathPrecision: ratio(sourcePathValid, signals.length),
    excerptVerificationRate: ratio(excerptsFound, signals.length),
    rawCitationCount: rawCitations,
    promptEchoCount: promptEchoes,
    unsupportedClaimCount: unsupportedClaims,
    usefulSignalYieldPerCall: ratio(validSignals.length, calls),
    duplicateSignalRate: calculateDuplicateRate(validSignals),
    averageInferenceMs: average(inferenceDurations),
    minimumInferenceMs: inferenceDurations.length ? Math.min(...inferenceDurations) : 0,
    maximumInferenceMs: inferenceDurations.length ? Math.max(...inferenceDurations) : 0,
    humanUsefulnessAverage: null
  };
}

function evaluateCriteria(metrics, passCriteria) {
  const checks = {
    parseableJson: metrics.parseableJsonRateAfterRetry >= passCriteria.parseable_json_after_retry,
    sourcePaths: metrics.sourcePathPrecision >= passCriteria.source_path_precision,
    excerpts: metrics.excerptVerificationRate >= passCriteria.excerpt_verification_rate,
    rawCitations: metrics.rawCitationCount === passCriteria.raw_citation_count,
    promptEchoes: metrics.promptEchoCount === passCriteria.prompt_echo_count,
    duplicateRate: metrics.duplicateSignalRate <= passCriteria.maximum_duplicate_signal_rate,
    humanUsefulness: null
  };

  return {
    checks,
    automatedPass: Object.entries(checks)
      .filter(([key]) => key !== "humanUsefulness")
      .every(([, passed]) => passed === true),
    finalPass: null,
    note: "finalPass remains null until the local signals receive 1-5 human usefulness ratings."
  };
}

function ratio(numerator, denominator) {
  return denominator === 0 ? 1 : Number((numerator / denominator).toFixed(4));
}

function average(values) {
  if (values.length === 0) {
    return 0;
  }

  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
