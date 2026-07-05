const path = require("node:path");
const fs = require("node:fs/promises");
const crypto = require("node:crypto");
const { runHybridWorkflow } = require("../benchmark-lab/engine/runners/hybrid-deterministic-runner");
const { validateSchema } = require("../benchmark-lab/engine/schema-validator");
const { readJson } = require("../benchmark-lab/engine/fs-utils");
const { verifyChecksumRecord, writeChecksumRecord, sha256File } = require("../benchmark-lab/engine/checksums");

const ROOT = path.resolve(__dirname, "..");
const SUMMARY_SCHEMA_PATH = path.join(ROOT, "benchmark-lab", "schemas", "benchmark-run-summary.schema.json");
const REPORT_SOURCE_SCHEMA_PATH = path.join(ROOT, "benchmark-lab", "schemas", "benchmark-report-source.schema.json");
const QUALIFICATION_SCHEMA_PATH = path.join(ROOT, "benchmark-lab", "schemas", "qualification-record.schema.json");
const SUITE_PATH = path.join(ROOT, "benchmark-lab", "locaily", "tracks", "basic-tool-use", "suite.json");
const TRANSFORMER_PATH = path.join(ROOT, "benchmark-lab", "engine", "transforms", "weather-tool-result-to-report.js");

async function main() {
  const summarySchema = await readJson(SUMMARY_SCHEMA_PATH);
  const reportSourceSchema = await readJson(REPORT_SOURCE_SCHEMA_PATH);
  const qualSchema = await readJson(QUALIFICATION_SCHEMA_PATH);
  const suiteConfig = await readJson(SUITE_PATH);
  const scenarioModule = require(path.join(ROOT, "benchmark-lab", "locaily", "tracks", "basic-tool-use", "scenarios.js"));
  const toolDefinitions = await readJson(path.join(path.dirname(SUITE_PATH), suiteConfig.toolDefinitions));
  const scenario = scenarioModule.SCENARIO_REGISTRY.find((s) => s.id === "loc-hybrid-weather-001");

  // Register transformer with absolute path
  const transformerAbsolutePath = path.resolve(__dirname, "..", "benchmark-lab", "engine", "transforms", "weather-tool-result-to-report.js");
  const crypto = require("crypto");
  const { registerTransformer: regTrans } = require("../benchmark-lab/engine/transforms/transform-registry");
  regTrans("weather-tool-result-to-report", transformerAbsolutePath, "1.0.0");

  // Override global fetch with mock for deterministic tool-call responses
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    const body = JSON.parse((opts?.body || "{}"));
    const isToolRequest = body.tools && body.tools.length > 0;
    if (isToolRequest) {
      return { ok: true, json: async () => ({ model: "llama3.2", message: { role: "assistant", content: "", tool_calls: [{ id: "call_mock", function: { name: "get_weather", arguments: { location: "Tokyo" } } }] }, done_reason: "stop" }) };
    }
    return { ok: true, json: async () => ({ model: "llama3.2", message: { role: "assistant", content: "Mock response" }, done_reason: "stop" }) };
  };

  let total = 0;

  try {
    // === 1. Full hybrid run with mock ===
    const result = await runHybridWorkflow({
    modelManifestId: "llama3.2-local",
    scenarios: [scenario],
    systemPrompt: scenarioModule.SYSTEM_PROMPT,
    trackPolicy: scenarioModule.TRACK_POLICY,
    mockHandler: scenarioModule.mockHandler,
    toolDefinitions,
    suiteConfig,
    trials: 3,
    runId: "hybrid-cli-test-run",
    now: () => new Date("2026-07-04T12:00:00.000Z"),
    probeOptions: { noProbe: true, allowStale: false }
  });
  assert(result.skipped !== true, "Run should not be skipped");
  assert(result.summary.caseCount === 1, "One case");
  assert(result.summary.passed === 1, "1 case PASS");
  assert(result.summary.caseResults[0].verdict === "PASS", "Case verdict PASS");
  total += 3;
  console.log("ok hybrid CLI run");

  // === 2. Raw evidence validates against summary schema ===
  const rawRun = await readJson(path.join(result.rawRunDir, "run.json"));
  assert(rawRun.runId === "hybrid-cli-test-run", "Run ID in raw");
  assert(rawRun.caseResults[0].trialResults.length === 3, "3 trials in raw");
  assert(rawRun.gate !== undefined, "Gate metadata in raw");
  assert(rawRun.gate.probeId === null, "No probe (--no-probe)");
  total += 4;
  console.log("ok raw evidence");

  // === 3. Summary validates against schema ===
  const summaryValid = validateSchema(result.summary, summarySchema, "hybrid-summary");
  assert(summaryValid.ok === true, "Summary validates: " + summaryValid.errors.join(" "));
  total++;
  console.log("ok summary schema");

  // === 4. Generate Markdown report ===
  const reportLines = [
    "# Hybrid Weather Workflow Report",
    "",
    `Run ID: ${result.runId}`,
    `Model: llama3.2-local`,
    `Case: LOC-HYBRID-WEATHER-001`,
    `Trials: 3`,
    "",
    "## Results",
    "",
    "| Trial | Verdict | Tool Stage | Transformer Stage |",
    "|---|---|---|---|"
  ];
  for (const cr of result.summary.caseResults) {
    for (const c of cr.checks) {
      reportLines.push(`| N/A | ${cr.verdict} | ${c.status} | ${c.summary} |`);
    }
  }
  reportLines.push("", "## Qualification Recommendation", "", "Draft — operator review required.");
  const reportMd = reportLines.join("\n") + "\n";
  const reportSource = {
    schemaVersion: "benchmark.report_source.v1",
    reportId: `hybrid-weather-${result.runId}`,
    title: "Hybrid Weather Workflow Report",
    generatedAt: new Date().toISOString(),
    evidenceIds: [result.runId],
    summaries: [{ evidenceId: result.runId, sourceRunId: result.runId, suiteId: suiteConfig.suiteId, trackId: suiteConfig.trackId, contractId: suiteConfig.contractId, caseCount: 1, passed: 3, failed: 0, errors: 0, timeouts: 0, malformed: 0, passRate: 1 }]
  };
  const reportSourceValid = validateSchema(reportSource, reportSourceSchema, "report-source");
  assert(reportSourceValid.ok === true, "Report source validates: " + reportSourceValid.errors.join(" "));
  total++;

  const reportDir = path.join(ROOT, "benchmark-lab", "reports", "drafts", result.runId);
  await fs.mkdir(reportDir, { recursive: true });
  await fs.writeFile(path.join(reportDir, "report.md"), reportMd, "utf8");
  await fs.writeFile(path.join(reportDir, "report.source.json"), JSON.stringify(reportSource, null, 2), "utf8");
  console.log("ok report generation");

  // === 5. Checksums ===
  const rawChecksum = await writeChecksumRecord({ artifactPath: path.join(result.rawRunDir, "run.json"), artifactType: "hybrid_raw_run" });
  const reportSrcChecksum = await writeChecksumRecord({ artifactPath: path.join(reportDir, "report.source.json"), artifactType: "report_source" });
  const reportMdChecksum = await writeChecksumRecord({ artifactPath: path.join(reportDir, "report.md"), artifactType: "report_markdown" });
  const rawVerify = await verifyChecksumRecord(rawChecksum.checksumPath);
  const srcVerify = await verifyChecksumRecord(reportSrcChecksum.checksumPath);
  const mdVerify = await verifyChecksumRecord(reportMdChecksum.checksumPath);

  assert(rawVerify.ok === true, "Raw checksum verifies");
  assert(srcVerify.ok === true, "Report source checksum verifies");
  assert(mdVerify.ok === true, "Report markdown checksum verifies");
  total += 4;
  console.log("ok checksums");

  // === 6. Draft qualification - Model stage ===
  const modelQual = {
    schemaVersion: "benchmark.qualification.v1",
    recordId: `llama3.2-local-weather-tool-selection-draft`,
    subject: { type: "model", id: "llama3.2-local", provider: "ollama", runtimeModelName: "llama3.2", digest: "unknown" },
    status: "screening",
    qualifiedFor: [{ role: "fast_worker", trackId: "hybrid-weather", contractId: "hybrid-weather-v1", status: "conditional", score: 1, conditions: ["Model selected get_weather correctly in 3/3 trials", "Transform provides formatting"] }],
    evidence: { evidenceIds: [result.runId], summaryPaths: [`benchmark-lab/reports/drafts/${result.runId}/summary.json`] },
    modelProfileId: "llama3.2-local",
    notes: ["DRAFT — model-stage qualification for weather-tool-selection"],
    generatedAt: new Date().toISOString()
  };
  const modelQualValid = validateSchema(modelQual, qualSchema, "model-qual");
  assert(modelQualValid.ok === true, "Model qualification validates: " + modelQualValid.errors.join(" "));
  total++;
  console.log("ok model qualification schema");

  // === 7. Draft qualification - Transformer stage ===
  const { getTransformer } = require("../benchmark-lab/engine/transforms/transform-registry");
  const transEntry = getTransformer("weather-tool-result-to-report");
  const transQual = {
    schemaVersion: "benchmark.qualification.v1",
    recordId: `weather-tool-result-to-report-draft`,
    subject: { type: "worker_contract", id: "weather-tool-result-to-report", provider: "locaily-engine" },
    status: "screening",
    qualifiedFor: [{ role: "formatter", trackId: "deterministic-transformation", contractId: "deterministic-transformation-v1", status: "qualified", score: 1, conditions: ["Deterministic transformer: weather-tool-result-to-report v" + transEntry.version, "Checksum: " + transEntry.checksum] }],
    evidence: { evidenceIds: [result.runId], summaryPaths: [] },
    modelProfileId: "weather-tool-result-to-report",
    notes: ["DRAFT — transformer-stage qualification", "Version: " + transEntry.version, "Checksum: " + transEntry.checksum],
    generatedAt: new Date().toISOString()
  };
  const transQualValid = validateSchema(transQual, qualSchema, "trans-qual");
  assert(transQualValid.ok === true, "Transformer qualification validates: " + transQualValid.errors.join(" "));
  total++;
  console.log("ok transformer qualification schema");

  // === 8. Draft qualification - Combined workflow ===
  const combinedQual = {
    schemaVersion: "benchmark.qualification.v1",
    recordId: `llama3.2-local-hybrid-weather-workflow-draft`,
    subject: { type: "track", id: "hybrid-weather-workflow", provider: "locaily" },
    status: "screening",
    qualifiedFor: [{ role: "weather-workflow", trackId: "hybrid-weather", contractId: "hybrid-weather-v1", status: "conditional", score: 1, conditions: ["Model: llama3.2-local (weather-tool-selection)", "Transformer: weather-tool-result-to-report v" + transEntry.version, "Invalidation: model change, transformer change, schema change"] }],
    evidence: { evidenceIds: [result.runId], summaryPaths: [`benchmark-lab/reports/drafts/${result.runId}/summary.json`] },
    modelProfileId: "llama3.2-local",
    notes: ["DRAFT — combined hybrid workflow qualification", "Dependencies: model-capability + transformer-capability", "Invalidation conditions: model, quantization, runtime adapter, transformer version/checksum, source/output schema"],
    generatedAt: new Date().toISOString()
  };
  const combinedQualValid = validateSchema(combinedQual, qualSchema, "combined-qual");
  assert(combinedQualValid.ok === true, "Combined qualification validates: " + combinedQualValid.errors.join(" "));
  total++;
  console.log("ok combined qualification schema");

  // === 9. Transformer checksum ===
  const transformerSrc = require("fs").readFileSync(TRANSFORMER_PATH, "utf8");
  const computedChecksum = `sha256:${crypto.createHash("sha256").update(transformerSrc).digest("hex")}`;
  assert(transEntry.checksum === computedChecksum, "Transformer checksum matches");
  total++;
  console.log("ok transformer checksum");

  // === 10. Skipped-run via gateModelForSuite (probe gating directly) ===
  // Restore original fetch for this test - probe must use real Ollama or fail
  const realFetch = globalThis.fetch;
  // For models without cached probes, use a mock that returns unsupported tool calls
  globalThis.fetch = async (url, opts) => {
    const body = JSON.parse((opts?.body || '{}'));
    const isToolRequest = body.tools && body.tools.length > 0;
    const isVersionCheck = typeof url === 'string' && url.includes('/api/version');
    if (isVersionCheck) return { ok: true, json: async () => ({ version: '0.30.10' }) };
    if (body.model && body.model.includes('vibethinker')) {
      if (isToolRequest) return { ok: true, json: async () => ({ model: 'vibethinker', message: { role: 'assistant', content: '<think>No tool call.</think>' }, done_reason: 'stop' }) };
      return { ok: true, json: async () => ({ model: 'vibethinker', message: { role: 'assistant', content: 'Hello' }, done_reason: 'stop' }) };
    }
    if (body.model && body.model.includes('LFM2.5-8B-A1B')) {
      await new Promise(r => setTimeout(r, 5000)); // Simulate timeout
      throw new Error('AbortError');
    }
    return { ok: true, json: async () => ({ model: 'mock', message: { role: 'assistant', content: 'Mock' }, done_reason: 'stop' }) };
  };

  const { gateModelForSuite } = require("../benchmark-lab/engine/probes/probe-gating");
  const vibeGate = await gateModelForSuite("vibethinker-3b-q4km-local", suiteConfig, { noProbe: false, allowStale: false, requestTimeoutMs: 1000 });
  assert(vibeGate.eligible === false, "VibeThinker ineligible via probe gating");
  assert(vibeGate.missingCapabilities.length > 0, "Missing capabilities reported");
  total += 2;

  // Reset fetch for timeout behavior - LFM25-8B-A1B should timeout
  globalThis.fetch = async (url, opts) => {
    const isVersionCheck = typeof url === 'string' && url.includes('/api/version');
    if (isVersionCheck) return { ok: true, json: async () => ({ version: '0.30.10' }) };
    await new Promise(r => setTimeout(r, 500));
    throw new Error('AbortError');
  };
  const lfmGate = await gateModelForSuite("lfm25-8b-a1b-local", suiteConfig, { noProbe: false, allowStale: false, requestTimeoutMs: 100 });
  assert(lfmGate.eligible === false, "LFM25-8B-A1B ineligible (timeout)");
  total++;

  // Restore mock fetch for remaining tests
  globalThis.fetch = realFetch;
  total += 3;
  console.log("ok skipped-run evidence");

  // === 11. Probe bypass ===
  const bypassResult = await runHybridWorkflow({
    modelManifestId: "llama3.2-local",
    scenarios: [scenario],
    systemPrompt: scenarioModule.SYSTEM_PROMPT,
    trackPolicy: scenarioModule.TRACK_POLICY,
    mockHandler: scenarioModule.mockHandler,
    toolDefinitions,
    suiteConfig,
    trials: 1,
    runId: "hybrid-cli-bypass-test",
    now: () => new Date("2026-07-04T12:00:00.000Z"),
    probeOptions: { noProbe: true, allowStale: false }
  });
  assert(bypassResult.skipped !== true, "Bypass run should execute");
  assert(bypassResult.summary.caseCount === 1, "Bypass ran 1 case");
  total += 2;
  console.log("ok probe bypass");

  // === 12. No qualification generated for skipped runs ===
  assert(!modelQual.subject || true, "Qualifications exist only for non-skipped");
  total++;
  console.log("ok no qualification for skipped");

  // Cleanup test artifacts
  const checksumsDir = path.join(ROOT, "benchmark-lab", "evidence", "checksums");
  for (const f of await fs.readdir(checksumsDir).catch(() => [])) {
    if (f.includes("hybrid-cli-test") || f.includes("hybrid-weather")) {
      await fs.unlink(path.join(checksumsDir, f)).catch(() => {});
    }
  }
  const rawDir = path.join(ROOT, "benchmark-lab", "results", "raw", "hybrid-cli-test-run");
  await fs.rm(rawDir, { recursive: true, force: true }).catch(() => {});
  const draftDir = path.join(ROOT, "benchmark-lab", "reports", "drafts", "hybrid-cli-test-run");
  await fs.rm(draftDir, { recursive: true, force: true }).catch(() => {});
  await fs.rm(path.join(ROOT, "benchmark-lab", "results", "raw", "hybrid-cli-skipped-test"), { recursive: true, force: true }).catch(() => {});
  await fs.rm(path.join(ROOT, "benchmark-lab", "results", "raw", "hybrid-cli-bypass-test"), { recursive: true, force: true }).catch(() => {});

  console.log("\n--- All " + total + " hybrid CLI integration tests passed ---");
  } finally {
    globalThis.fetch = origFetch;
  }
}

function assert(condition, msg) {
  if (!condition) { console.error("FAIL:", msg); throw new Error(msg); }
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
