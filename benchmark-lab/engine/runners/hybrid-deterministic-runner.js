const path = require("node:path");
const fs = require("node:fs/promises");
const { ToolEvalRuntime } = require("../adapters/tool-eval-runtime");
const { registerTransformer, getTransformer, transform } = require("../transforms/transform-registry");
const { gateModelForSuite } = require("../probes/probe-gating");
const { validateSchema } = require("../schema-validator");
const { buildTrackRunRecord, createRecordId } = require("../../../companion/evidence/track-run-record-builder");

const LAB_ROOT = path.resolve(__dirname, "..", "..");
const SUMMARY_SCHEMA_PATH = path.join(LAB_ROOT, "schemas", "benchmark-run-summary.schema.json");

// Auto-register known transformers
const TRANSFORMER_MODULES = {
  "weather-tool-result-to-report": { module: "../transforms/weather-tool-result-to-report", version: "1.0.0" }
};
for (const [id, config] of Object.entries(TRANSFORMER_MODULES)) {
  try { registerTransformer(id, path.resolve(__dirname, config.module) + ".js", config.version); } catch {}
}

async function runHybridWorkflow({
  modelManifestId, scenarios, systemPrompt, trackPolicy, mockHandler, toolDefinitions, suiteConfig,
  trials = 3, runId = createRunId(), now = () => new Date(), probeOptions = {}
}) {
  const startedAt = now().toISOString();
  const summarySchema = await readJson(SUMMARY_SCHEMA_PATH);
  const envInfo = await collectEnvInfo();

  // Probe gate
  const gate = await gateModelForSuite(modelManifestId, suiteConfig, probeOptions);
  if (!gate.eligible) {
    const skippedRun = {
      schemaVersion: "benchmark.run_summary.v1", runId,
      suiteId: suiteConfig.suiteId || "unknown", trackId: suiteConfig.trackId || "unknown",
      contractId: suiteConfig.contractId || "unknown",
      runtime: { provider: "tool-eval", modelId: modelManifestId, runtimeModelName: gate.manifest?.runtimeModelName || "unknown" },
      startedAt, completedAt: now().toISOString(),
      caseCount: 0, passed: 0, partial: 0, failed: 0, errors: 0, timeouts: 0, malformed: 0,
      caseResults: [], status: "SKIPPED_INCOMPATIBLE",
      modelId: modelManifestId, probeId: gate.probeId,
      missingCapabilities: gate.missingCapabilities || [], reason: gate.reason
    };
    return { runId, skipped: true, summary: skippedRun, gate, manifest: gate.manifest };
  }

  const manifest = gate.manifest;
  const allowlist = buildToolAllowlist(toolDefinitions);
  const runtime = new ToolEvalRuntime({
    model: manifest.runtimeModelName, baseUrl: "http://127.0.0.1:11434",
    timeoutMs: 120000, temperature: 0, numPredict: 2048, maxTurns: 8
  });

  const rawCaseResults = []; const summaryCaseResults = [];

  for (const scenario of scenarios) {
    const trialResults = [];
    for (let trial = 1; trial <= trials; trial++) {
      const result = await executeHybridTrial({ runtime, scenario, systemPrompt, trackPolicy, mockHandler, toolDefinitions, allowlist, trial, trials, suiteConfig, gate });
      trialResults.push(result);
    }
    const agg = aggregateHybrid(trialResults);
    rawCaseResults.push({ scenarioId: scenario.id, title: scenario.title, category: scenario.category, trialResults, aggregate: agg });
    summaryCaseResults.push({ caseId: scenario.id, verdict: agg.verdict, checks: agg.checks });
  }

  const passed = summaryCaseResults.filter(r => r.verdict === "PASS" || r.verdict === "PASS_WITH_RESTRAINT").length;
  const partial = summaryCaseResults.filter(r => r.verdict === "PARTIAL").length;
  const failed = summaryCaseResults.filter(r => r.verdict === "FAIL").length;
  const errors = summaryCaseResults.filter(r => r.verdict === "RUNTIME_ERROR").length;
  const timeouts = summaryCaseResults.filter(r => r.verdict === "TIMEOUT").length;
  const completedAt = now().toISOString();

  const summary = {
    schemaVersion: "benchmark.run_summary.v1", runId,
    suiteId: suiteConfig.suiteId || "hybrid-weather-v1", trackId: suiteConfig.trackId || "hybrid-weather",
    contractId: suiteConfig.contractId || "hybrid-weather-v1",
    runtime: { provider: "tool-eval", modelId: manifest.modelId, runtimeModelName: manifest.runtimeModelName },
    startedAt, completedAt, caseCount: scenarios.length, passed, partial, failed, errors, timeouts, malformed: 0,
    caseResults: summaryCaseResults
  };

  assertValid(validateSchema(summary, summarySchema, "summary"), "Run summary is invalid.");

  const rawRunDir = path.join(LAB_ROOT, "results", "raw", runId);
  const draftReportDir = path.join(LAB_ROOT, "reports", "drafts", runId);
  await fs.mkdir(rawRunDir, { recursive: true }); await fs.mkdir(draftReportDir, { recursive: true });
  await writeJson(path.join(rawRunDir, "run.json"), {
    schemaVersion: "benchmark.hybrid_raw_run.v1", runId, modelManifest: manifest,
    gate: { probeId: gate.probeId, probed: gate.probed, cached: !!gate.cached, verifiedCapabilities: gate.verifiedCapabilities },
    trials, scenarioIds: scenarios.map(s => s.id), startedAt, completedAt, envInfo, caseResults: rawCaseResults
  });
  await writeJson(path.join(draftReportDir, "summary.json"), summary);

  // Build canonical Track Run Records (parent + children)
  const parentRecordId = `hybrid-${runId}`;
  const childRecords = [];
  for (const scenarioResult of rawCaseResults) {
    const scenarioLabel = scenarioResult.scenarioId || scenarioResult.title || "scenario";
    for (const trialResult of (scenarioResult.trialResults || [])) {
      const se = trialResult.stageEvidence || {};
      const trialPrefix = `${scenarioLabel}-t${trialResult.trial}`;

      if (se.model && se.model.latencyMs != null) {
        childRecords.push(buildTrackRunRecord({
          recordId: createRecordId(`child-${trialPrefix}-model`),
          trackId: suiteConfig.trackId || "hybrid-weather",
          parentRunId: parentRecordId,
          correlationId: runId,
          startedAt: new Date(startedAt).getTime(),
          completedAt: new Date(startedAt).getTime() + (se.model.latencyMs || 0),
          executorType: "model",
          capabilityId: manifest ? manifest.modelId : null,
          provider: "ollama",
          status: se.model.rawResponse && se.model.rawResponse.ok !== false ? "success" : "error",
          durationMs: se.model.latencyMs,
          modelInfo: manifest ? { modelId: manifest.modelId, runtimeModelName: manifest.runtimeModelName } : null,
          output: {
            outputFormat: "json",
            outputSummary: se.model.toolSelected ? `selected tool: get_weather` : `no tool selected`
          },
          validation: {
            status: se.model.toolSelected ? "passed" : "failed",
            validatorIds: ["model-stage"]
          },
          performance: { totalDurationMs: se.model.latencyMs }
        }));
      }

      if (se.tool && se.tool.latencyMs != null) {
        childRecords.push(buildTrackRunRecord({
          recordId: createRecordId(`child-${trialPrefix}-tool`),
          trackId: suiteConfig.trackId || "hybrid-weather",
          parentRunId: parentRecordId,
          correlationId: runId,
          executorType: "tool",
          capabilityId: "get_weather",
          provider: "mock-handler",
          status: se.tool.valid ? "success" : "failure",
          durationMs: se.tool.latencyMs,
          toolInfo: { toolId: "get_weather", task: "weather-lookup" },
          output: { outputSummary: se.tool.valid ? "weather data received" : "tool failed" },
          validation: { status: se.tool.valid ? "passed" : "failed", validatorIds: ["tool-stage"] }
        }));
      }

      if (se.transformer && se.transformer.latencyMs != null) {
        childRecords.push(buildTrackRunRecord({
          recordId: createRecordId(`child-${trialPrefix}-transform`),
          trackId: suiteConfig.trackId || "hybrid-weather",
          parentRunId: parentRecordId,
          correlationId: runId,
          executorType: "transform",
          capabilityId: se.transformer.transformerId || "weather-tool-result-to-report",
          provider: "transform-registry",
          qualificationRecordId: se.transformer.checksum ? `checksum-${se.transformer.transformerId}` : null,
          status: se.transformer.outputValid ? "success" : "failure",
          durationMs: se.transformer.latencyMs,
          transformInfo: se.transformer.transformerId ? {
            transformerId: se.transformer.transformerId,
            version: se.transformer.version,
            checksum: se.transformer.checksum,
            inputValid: se.transformer.inputValid,
            outputValid: se.transformer.outputValid,
            sourceFaithful: se.transformer.sourceFaithful
          } : null,
          output: { outputSummary: se.transformer.outputValid ? "transform complete" : "transform failed" },
          validation: {
            status: se.transformer.outputValid ? "passed" : "failed",
            validatorIds: ["transformer-stage"],
            score: se.transformer.outputValid ? 1 : 0
          },
          performance: { totalDurationMs: se.transformer.latencyMs }
        }));
      }
    }
  }

  const parentRecord = buildTrackRunRecord({
    recordId: parentRecordId,
    trackId: suiteConfig.trackId || "hybrid-weather",
    workflowId: suiteConfig.suiteId || "hybrid-weather-v1",
    correlationId: runId,
    startedAt,
    completedAt,
    executorType: "hybrid",
    capabilityId: manifest ? manifest.modelId : null,
    provider: "tool-eval",
    qualificationRecordId: gate && gate.probeId ? gate.probeId : null,
    routingReason: "model tool selection + deterministic transform",
    status: summary.caseResults.every(r => r.verdict === "PASS" || r.verdict === "PASS_WITH_RESTRAINT") ? "success" : "partial",
    durationMs: Date.parse(completedAt) - Date.parse(startedAt),
    output: {
      outputFormat: "json",
      outputSummary: `${summary.passed}/${summary.caseCount} scenarios passed`
    },
    validation: {
      status: summary.caseResults.every(r => r.verdict === "PASS" || r.verdict === "PASS_WITH_RESTRAINT") ? "passed" : "partial",
      validatorIds: [...new Set(summary.caseResults.flatMap(r => r.checks.map(c => c.validator)))],
      score: summary.caseCount > 0 ? summary.passed / summary.caseCount : 0
    },
    performance: {
      totalDurationMs: Date.parse(completedAt) - Date.parse(startedAt)
    }
  });
  parentRecord.childRuns = childRecords;
  await writeJson(path.join(rawRunDir, "track-run-record.json"), parentRecord);

  return { runId, rawRunDir, draftSummaryPath: path.join(draftReportDir, "summary.json"), summary, manifest, gate, trackRunRecord: parentRecord };
}

async function executeHybridTrial({ runtime, scenario, systemPrompt, trackPolicy, mockHandler, toolDefinitions, allowlist, trial, trials, suiteConfig, gate }) {
  const startedAt = Date.now();
  const refDate = scenario.referenceDate || "2026-03-20";
  const effectivePrompt = (systemPrompt || "") + "\n\n" + (trackPolicy || "") + `\n\nThe current date is ${refDate} (Friday).`;
  const messages = [{ role: "system", content: effectivePrompt }, { role: "user", content: scenario.userMessage }];

  const stageEvidence = { model: {}, tool: {}, transformer: {}, combined: {} };
  const state = { toolCalls: [], assistantMessages: [], rejectedTools: [] };
  let errorCode = null;

  // Stage 1: Model tool selection
  const toolDefs = scenario.toolDefinitions || toolDefinitions;
  const chatResult = await runtime.chat({ messages, tools: toolDefs, toolChoice: "auto" });
  stageEvidence.model.latencyMs = chatResult.durationMs || (Date.now() - startedAt);
  stageEvidence.model.rawResponse = chatResult;

  if (!chatResult.ok) {
    errorCode = chatResult.errorCode;
    stageEvidence.model.verdict = errorCode === "TIMEOUT" ? "TIMEOUT" : "RUNTIME_ERROR";
  } else {
    const assistantContent = chatResult.content || "";
    if (assistantContent) state.assistantMessages.push(assistantContent);

    const allowedCalls = (chatResult.toolCalls || []).filter(tc => allowlist.has(tc.name));
    const rejectedCalls = (chatResult.toolCalls || []).filter(tc => !allowlist.has(tc.name));
    for (const rc of rejectedCalls) state.rejectedTools.push(rc.name);

    stageEvidence.model.toolCalls = allowedCalls.map(tc => ({ name: tc.name, args: tc.arguments }));
    stageEvidence.model.rejectedCalls = rejectedCalls.map(rc => ({ name: rc.name, args: rc.arguments }));
    stageEvidence.model.hallucinatedTools = rejectedCalls.map(rc => rc.name);

    const toolCall = allowedCalls.find(tc => tc.name === "get_weather");
    stageEvidence.model.toolSelected = !!toolCall;
    stageEvidence.model.correctLocation = toolCall?.arguments?.location ? String(toolCall.arguments.location).toLowerCase().includes("tokyo") : false;

    if (allowedCalls.length > 0) {
      for (const tc of allowedCalls) {
        state.toolCalls.push(tc);
        // Tool stage
        const handlerResult = mockHandler(state, tc);
        stageEvidence.tool.payload = handlerResult;
        stageEvidence.tool.sourceData = handlerResult?.data || null;
        stageEvidence.tool.valid = !!handlerResult?.data;
        stageEvidence.tool.latencyMs = 0;
      }
    }

    // Transformer stage
    const transformerId = scenario.transformerId || "weather-tool-result-to-report";
    try {
      const entry = getTransformer(transformerId);
      stageEvidence.transformer.transformerId = transformerId;
      stageEvidence.transformer.version = entry.version;
      stageEvidence.transformer.checksum = entry.checksum;

      const sourceData = stageEvidence.tool.sourceData || {};
      const t0 = Date.now();
      const transResult = transform(transformerId, sourceData);
      stageEvidence.transformer.latencyMs = Date.now() - t0;

      if (transResult.ok && transResult.output) {
        stageEvidence.transformer.inputValid = transResult.diagnostics.inputValid;
        stageEvidence.transformer.outputValid = transResult.diagnostics.outputValid;
        stageEvidence.transformer.output = transResult.output;
        stageEvidence.transformer.sourceFaithful = transResult.output.temperature_celsius === (sourceData.temperature_celsius || 18);
        stageEvidence.transformer.diagnostics = transResult.diagnostics;
        stageEvidence.transformer.schemaValid = transResult.diagnostics.outputValid;
      } else {
        stageEvidence.transformer.inputValid = transResult.diagnostics.inputValid;
        stageEvidence.transformer.outputValid = false;
        stageEvidence.transformer.diagnostics = transResult.diagnostics;
        stageEvidence.transformer.error = transResult.diagnostics.error || "transformation_failed";
      }
    } catch (e) {
      stageEvidence.transformer.error = e.message;
      stageEvidence.transformer.outputValid = false;
    }
  }

  const durationMs = Date.now() - startedAt;
  const verdict = determineHybridVerdict(stageEvidence, errorCode);
  stageEvidence.combined.verdict = verdict;
  stageEvidence.combined.totalLatencyMs = durationMs;

  const checks = [
    { validator: "model-stage", status: stageEvidence.model.toolSelected === true ? "pass" : "fail", summary: stageEvidence.model.toolSelected ? "tool selected" : "no tool call" },
    { validator: "transformer-stage", status: stageEvidence.transformer.outputValid === true ? "pass" : "fail", summary: stageEvidence.transformer.outputValid ? "transformed" : (stageEvidence.transformer.error || "failed") },
    { validator: "capability-allowlist", status: stageEvidence.model.hallucinatedTools?.length === 0 ? "pass" : "fail" },
    { validator: "runtime", status: errorCode ? "fail" : "pass", message: errorCode || "ok" }
  ];
  if (verdict === "PASS" && gate) {
    checks.push({ validator: "probe", status: "pass", message: `probe: ${gate.probeId}` });
  }

  return {
    trial, verdict, points: verdict === "PASS" ? 2 : verdict === "PARTIAL" ? 1 : 0,
    summary: stageEvidence.combined.verdict,
    checks, stageEvidence, durationMs, turnCount: 1
  };
}

function determineHybridVerdict(stage, errorCode) {
  if (errorCode === "TIMEOUT") return "TIMEOUT";
  if (errorCode === "RUNTIME_ERROR") return "RUNTIME_ERROR";
  if (!stage.model.toolSelected) return "FAIL";
  if (stage.model.hallucinatedTools?.length > 0) return "PARTIAL";
  if (stage.transformer.outputValid && stage.transformer.sourceFaithful) return "PASS";
  if (stage.transformer.outputValid && !stage.transformer.sourceFaithful) return "PARTIAL";
  if (stage.transformer.error) return "FAIL";
  return "FAIL";
}

function aggregateHybrid(trialResults) {
  const total = trialResults.length;
  const passCount = trialResults.filter(t => t.verdict === "PASS").length;
  const partialCount = trialResults.filter(t => t.verdict === "PARTIAL").length;
  const failCount = trialResults.filter(t => t.verdict === "FAIL").length;
  const agg = passCount === total ? "PASS" : (passCount + partialCount === total ? "PARTIAL" : "FAIL");
  return { trialCount: total, passCount, partialCount, failCount, verdict: agg, reliability: total > 0 ? Math.round(passCount / total * 10000) / 100 : 0, checks: [{ validator: "aggregate", status: agg === "PASS" ? "pass" : "fail", message: `${passCount}/${total} passed` }] };
}

function buildToolAllowlist(tds) { const s = new Set(); for (const t of (tds||[])) if (t.function?.name) s.add(t.function.name); return s; }
async function readJson(p) { return JSON.parse(await fs.readFile(p, "utf8")); }
async function writeJson(p, v) { await fs.mkdir(path.dirname(p), { recursive: true }); await fs.writeFile(p, JSON.stringify(v, null, 2) + "\n", "utf8"); }
function createRunId() { return `hybrid-${new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z")}`; }
function assertValid(v, m) { if (!v.ok) { const e = new Error(m + " " + v.errors.join(" ")); e.validation = v; throw e; } }
async function collectEnvInfo() { try { const os = require("node:os"); return { platform: os.platform(), release: os.release(), hostname: os.hostname(), nodeVersion: process.version }; } catch { return { nodeVersion: process.version }; } }

module.exports = { runHybridWorkflow };
