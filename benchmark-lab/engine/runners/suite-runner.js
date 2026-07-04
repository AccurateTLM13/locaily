const fs = require("node:fs/promises");
const path = require("node:path");
const { MockRuntimeAdapter } = require("../adapters/mock-runtime");
const { OllamaRuntimeAdapter } = require("../adapters/ollama-runtime");
const { readJson, writeJson, toPosixPath } = require("../fs-utils");
const { validateSchema } = require("../schema-validator");

const LAB_ROOT = path.resolve(__dirname, "..", "..");
const SUITE_SCHEMA_PATH = path.join(LAB_ROOT, "schemas", "benchmark-suite.schema.json");
const CASE_SCHEMA_PATH = path.join(LAB_ROOT, "schemas", "benchmark-case.schema.json");
const SUMMARY_SCHEMA_PATH = path.join(LAB_ROOT, "schemas", "benchmark-run-summary.schema.json");
const MODEL_MANIFEST_SCHEMA_PATH = path.join(LAB_ROOT, "schemas", "model-manifest.schema.json");

async function runSuite({ suitePath, modelManifest = null, runId = createRunId(), now = () => new Date() }) {
  const suiteFile = path.resolve(suitePath);
  const suiteDir = path.dirname(suiteFile);
  const startedAt = now().toISOString();
  const suiteSchema = await readJson(SUITE_SCHEMA_PATH);
  const caseSchema = await readJson(CASE_SCHEMA_PATH);
  const summarySchema = await readJson(SUMMARY_SCHEMA_PATH);
  const suite = await readJson(suiteFile);

  if (modelManifest) {
    suite.runtime = {
      ...suite.runtime,
      modelManifest
    };
  }

  assertValid(validateSchema(suite, suiteSchema, "suite"), "Suite config is invalid.");

  const cases = await loadCases({ suite, suiteDir, caseSchema });
  const runtimeContext = await createRuntime({ suite, suiteDir });
  const runtime = runtimeContext.runtime;
  const rawCaseResults = [];
  const summaryCaseResults = [];

  for (const benchmarkCase of cases) {
    const rawCaseResult = await executeCase({ suite, benchmarkCase, runtime });
    rawCaseResults.push(rawCaseResult);
    summaryCaseResults.push(toSummaryCase(rawCaseResult));
  }

  const completedAt = now().toISOString();
  const summary = buildSummary({
    runId,
    suite,
    runtimeContext,
    startedAt,
    completedAt,
    caseResults: summaryCaseResults
  });

  assertValid(validateSchema(summary, summarySchema, "summary"), "Run summary is invalid.");

  const rawRunDir = path.join(LAB_ROOT, "results", "raw", runId);
  const draftReportDir = path.join(LAB_ROOT, "reports", "drafts", runId);

  await fs.mkdir(rawRunDir, { recursive: true });
  await fs.mkdir(draftReportDir, { recursive: true });
  await writeJson(path.join(rawRunDir, "run.json"), {
    schemaVersion: "benchmark.raw_run.v1",
    runId,
    suitePath: toPosixPath(path.relative(LAB_ROOT, suiteFile)),
    suite,
    modelManifest: runtimeContext.modelManifest || null,
    startedAt,
    completedAt,
    caseResults: rawCaseResults
  });
  await writeJson(path.join(draftReportDir, "summary.json"), summary);

  return {
    runId,
    rawRunDir,
    draftSummaryPath: path.join(draftReportDir, "summary.json"),
    summary
  };
}

async function loadCases({ suite, suiteDir, caseSchema }) {
  const cases = [];

  for (const caseFile of suite.caseFiles) {
    const fileCases = await readJson(path.resolve(suiteDir, caseFile));
    if (!Array.isArray(fileCases)) {
      throw new Error(`Case file must contain an array: ${caseFile}`);
    }

    for (const benchmarkCase of fileCases) {
      assertValid(validateSchema(benchmarkCase, caseSchema, `case:${benchmarkCase.caseId || "unknown"}`), "Benchmark case is invalid.");
      cases.push(benchmarkCase);
    }
  }

  return cases;
}

async function createRuntime({ suite, suiteDir }) {
  const modelManifest = await loadModelManifest(suite.runtime.modelManifest);

  if (suite.runtime.provider === "mock") {
    const responses = await readJson(path.resolve(suiteDir, suite.runtime.responsesPath));
    return {
      runtime: new MockRuntimeAdapter({ responsesByCaseId: responses }),
      modelManifest
    };
  }

  if (suite.runtime.provider === "ollama") {
    if (!modelManifest) {
      throw new Error("Ollama suites require runtime.modelManifest.");
    }

    return {
      runtime: new OllamaRuntimeAdapter({
        baseUrl: suite.runtime.baseUrl,
        model: modelManifest.runtimeModelName,
        outputSchema: suite.outputSchema,
        timeoutMs: suite.runtime.timeoutMs,
        temperature: suite.runtime.temperature,
        numPredict: suite.runtime.numPredict
      }),
      modelManifest
    };
  }

  throw new Error(`Unsupported runtime provider: ${suite.runtime.provider}`);
}

async function loadModelManifest(modelManifestId) {
  if (!modelManifestId) {
    return null;
  }

  const manifestSchema = await readJson(MODEL_MANIFEST_SCHEMA_PATH);
  const manifest = await readJson(path.join(LAB_ROOT, "models", "manifests", `${modelManifestId}.json`));
  assertValid(validateSchema(manifest, manifestSchema, "modelManifest"), "Model manifest is invalid.");
  return manifest;
}

async function executeCase({ suite, benchmarkCase, runtime }) {
  const generated = await runtime.generate({ caseId: benchmarkCase.caseId, input: benchmarkCase.input });
  const checks = [];
  let parsed = null;
  let verdict = "PASS";

  if (!generated.ok) {
    verdict = generated.errorCode === "TIMEOUT" ? "TIMEOUT" : "RUNTIME_ERROR";
    checks.push({
      validator: "runtime",
      status: "fail",
      message: generated.errorCode
    });
  } else {
    try {
      parsed = JSON.parse(generated.rawText);
      checks.push({
        validator: "json-parse",
        status: "pass"
      });
    } catch (error) {
      verdict = "MALFORMED_OUTPUT";
      checks.push({
        validator: "json-parse",
        status: "fail",
        message: error.message
      });
    }
  }

  if (parsed) {
    const schemaValidation = validateSchema(parsed, suite.outputSchema, "output");
    checks.push({
      validator: "json-schema",
      status: schemaValidation.ok ? "pass" : "fail",
      errors: schemaValidation.errors
    });

    if (!schemaValidation.ok && verdict === "PASS") {
      verdict = "FAIL";
    }

    const labelMatches = parsed.label === benchmarkCase.expected.label;
    checks.push({
      validator: "expected-label",
      status: labelMatches ? "pass" : "fail",
      expected: benchmarkCase.expected.label,
      actual: parsed.label
    });

    if (!labelMatches && verdict === "PASS") {
      verdict = "FAIL";
    }
  }

  return {
    caseId: benchmarkCase.caseId,
    input: benchmarkCase.input,
    expected: benchmarkCase.expected,
    rawText: generated.rawText,
    parsed,
    durationMs: generated.durationMs,
    verdict,
    checks
  };
}

function toSummaryCase(rawCaseResult) {
  return {
    caseId: rawCaseResult.caseId,
    verdict: rawCaseResult.verdict,
    checks: rawCaseResult.checks
  };
}

function buildSummary({ runId, suite, runtimeContext, startedAt, completedAt, caseResults }) {
  const modelManifest = runtimeContext.modelManifest;
  const runtime = {
    provider: suite.runtime.provider
  };

  if (modelManifest) {
    runtime.modelId = modelManifest.modelId;
    runtime.runtimeModelName = modelManifest.runtimeModelName;
  }

  return {
    schemaVersion: "benchmark.run_summary.v1",
    runId,
    suiteId: suite.suiteId,
    trackId: suite.trackId,
    contractId: suite.contractId,
    runtime,
    startedAt,
    completedAt,
    caseCount: caseResults.length,
    passed: caseResults.filter((result) => result.verdict === "PASS").length,
    failed: caseResults.filter((result) => result.verdict === "FAIL").length,
    errors: caseResults.filter((result) => result.verdict === "RUNTIME_ERROR").length,
    timeouts: caseResults.filter((result) => result.verdict === "TIMEOUT").length,
    malformed: caseResults.filter((result) => result.verdict === "MALFORMED_OUTPUT").length,
    caseResults
  };
}

function assertValid(validation, message) {
  if (!validation.ok) {
    const error = new Error(`${message} ${validation.errors.join(" ")}`);
    error.validation = validation;
    throw error;
  }
}

function createRunId() {
  const compactTimestamp = new Date().toISOString()
    .replace(/[-:]/g, "")
    .replace(/\..+$/, "Z");
  return `run-${compactTimestamp}`;
}

module.exports = {
  runSuite,
  createRunId
};
