const path = require("node:path");
const fs = require("node:fs/promises");
const { OllamaRuntimeAdapter } = require("../adapters/ollama-runtime");
const { MockRuntimeAdapter } = require("../adapters/mock-runtime");
const { readJson, writeJson, toPosixPath } = require("../fs-utils");
const { validateSchema } = require("../schema-validator");

const LAB_ROOT = path.resolve(__dirname, "..", "..");
const SUMMARY_SCHEMA_PATH = path.join(LAB_ROOT, "schemas", "benchmark-run-summary.schema.json");
const MODEL_MANIFEST_SCHEMA_PATH = path.join(LAB_ROOT, "schemas", "model-manifest.schema.json");

async function runLighthousePrioritySuite({
  modelManifestId = null,
  scenarios,
  suiteConfig,
  mockResponses = null,
  runId = createRunId(),
  now = () => new Date()
}) {
  const startedAt = now().toISOString();
  const summarySchema = await readJson(SUMMARY_SCHEMA_PATH);
  const outputSchema = suiteConfig.outputSchema
    ? await readJson(path.resolve(path.dirname(suiteConfig._suitePath || ""), suiteConfig.outputSchema))
    : null;

  const manifest = modelManifestId ? await loadModelManifest(modelManifestId) : null;

  let runtime;
  if (suiteConfig.runtime.provider === "mock" && mockResponses) {
    runtime = new MockRuntimeAdapter({ responsesByCaseId: mockResponses });
  } else if (suiteConfig.runtime.provider === "lighthouse-priority" || suiteConfig.runtime.provider === "ollama") {
    runtime = new OllamaRuntimeAdapter({
      baseUrl: suiteConfig.runtime.baseUrl || "http://127.0.0.1:11434",
      model: manifest ? manifest.runtimeModelName : "llama3.2",
      outputSchema: outputSchema || {},
      timeoutMs: suiteConfig.runtime.timeoutMs || 120000,
      temperature: suiteConfig.runtime.temperature != null ? suiteConfig.runtime.temperature : 0,
      numPredict: suiteConfig.runtime.numPredict || 4096
    });
  } else {
    throw new Error(`Unsupported runtime provider: ${suiteConfig.runtime.provider}`);
  }

  const rawCaseResults = [];
  const summaryCaseResults = [];

  const scenarioModule = suiteConfig._scenarioModule || null;

  for (const scenario of scenarios) {
    const promptText = (scenarioModule && scenarioModule.buildPrompt)
      ? scenarioModule.buildPrompt(scenario.data)
      : (scenario.prompt || "");

    const generated = await runtime.generate({
      caseId: scenario.id,
      input: { text: promptText }
    });

    let parsed = null;
    let verdict = "PASS";
    let checks = [];
    let evaluation = null;

    if (!generated.ok) {
      verdict = generated.errorCode === "TIMEOUT" ? "TIMEOUT" : "RUNTIME_ERROR";
      checks.push({ validator: "runtime", status: "fail", message: generated.errorCode || "RUNTIME_ERROR" });
    } else {
      try {
        parsed = JSON.parse(generated.rawText);
        checks.push({ validator: "json-parse", status: "pass" });
      } catch (error) {
        parsed = null;
        verdict = "MALFORMED_OUTPUT";
        checks.push({ validator: "json-parse", status: "fail", message: error.message });
      }
    }

    if (parsed && outputSchema) {
      const schemaValidation = validateSchema(parsed, outputSchema, "output");
      checks.push({
        validator: "json-schema",
        status: schemaValidation.ok ? "pass" : "fail",
        errors: schemaValidation.errors
      });
      if (!schemaValidation.ok && verdict === "PASS") {
        verdict = "FAIL";
      }
    }

    if (parsed && scenario.evaluate) {
      evaluation = scenario.evaluate(parsed, scenario.data);
      checks.push({
        validator: "lighthouse-priority",
        status: evaluation.verdict === "PASS" ? "pass" : (evaluation.verdict === "PARTIAL" ? "partial" : "fail"),
        score: evaluation.points,
        summary: evaluation.summary,
        details: evaluation.details
      });

      if (evaluation.verdict !== "PASS" && verdict === "PASS") {
        if (evaluation.verdict === "FAIL") {
          verdict = "FAIL";
        } else {
          verdict = "PARTIAL";
        }
      }
    }

    rawCaseResults.push({
      caseId: scenario.id,
      title: scenario.title,
      category: scenario.category,
      difficulty: scenario.difficulty,
      input: { text: promptText.substring(0, 200) + "..." },
      rawText: generated.rawText,
      parsed,
      evaluation,
      durationMs: generated.durationMs,
      verdict,
      checks
    });

    summaryCaseResults.push({
      caseId: scenario.id,
      verdict,
      checks
    });
  }

  const passed = summaryCaseResults.filter(r => r.verdict === "PASS").length;
  const partial = summaryCaseResults.filter(r => r.verdict === "PARTIAL").length;
  const failed = summaryCaseResults.filter(r => r.verdict === "FAIL").length;
  const errors = summaryCaseResults.filter(r => r.verdict === "RUNTIME_ERROR").length;
  const timeouts = summaryCaseResults.filter(r => r.verdict === "TIMEOUT").length;
  const malformed = summaryCaseResults.filter(r => r.verdict === "MALFORMED_OUTPUT").length;

  const completedAt = now().toISOString();
  const summary = {
    schemaVersion: "benchmark.run_summary.v1",
    runId,
    suiteId: suiteConfig.suiteId || "lighthouse-priority-helper-v1",
    trackId: suiteConfig.trackId || "website_audit.lighthouse_handoff",
    contractId: suiteConfig.contractId || "lighthouse-priority-helper-v1",
    runtime: {
      provider: suiteConfig.runtime.provider,
      modelId: manifest ? manifest.modelId : (modelManifestId || "unknown"),
      runtimeModelName: manifest ? manifest.runtimeModelName : "unknown"
    },
    startedAt,
    completedAt,
    caseCount: scenarios.length,
    passed,
    partial,
    failed,
    errors,
    timeouts,
    malformed,
    caseResults: summaryCaseResults
  };

  assertValid(validateSchema(summary, summarySchema, "summary"), "Run summary is invalid.");

  const rawRunDir = path.join(LAB_ROOT, "results", "raw", runId);
  const draftReportDir = path.join(LAB_ROOT, "reports", "drafts", runId);

  await fs.mkdir(rawRunDir, { recursive: true });
  await fs.mkdir(draftReportDir, { recursive: true });
  await writeJson(path.join(rawRunDir, "run.json"), {
    schemaVersion: "benchmark.lighthouse_priority_raw_run.v1",
    runId,
    suiteId: suiteConfig.suiteId || "lighthouse-priority-helper-v1",
    trackId: suiteConfig.trackId || "website_audit.lighthouse_handoff",
    modelManifest: manifest || null,
    scenarioCount: scenarios.length,
    startedAt,
    completedAt,
    caseResults: rawCaseResults
  });
  await writeJson(path.join(draftReportDir, "summary.json"), summary);

  return {
    runId,
    rawRunDir,
    draftSummaryPath: path.join(draftReportDir, "summary.json"),
    summary,
    manifest
  };
}

async function loadModelManifest(modelManifestId) {
  if (!modelManifestId) return null;
  const manifestSchema = await readJson(MODEL_MANIFEST_SCHEMA_PATH);
  const manifest = await readJson(path.join(LAB_ROOT, "models", "manifests", `${modelManifestId}.json`));
  assertValid(validateSchema(manifest, manifestSchema, "modelManifest"), "Model manifest is invalid.");
  return manifest;
}

function createRunId() {
  const ts = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
  return `run-lh-priority-${ts}`;
}

function assertValid(validation, message) {
  if (!validation.ok) {
    const error = new Error(`${message} ${validation.errors.join(" ")}`);
    error.validation = validation;
    throw error;
  }
}

module.exports = { runLighthousePrioritySuite, createRunId };
