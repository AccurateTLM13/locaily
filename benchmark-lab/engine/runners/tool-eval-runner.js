const path = require("node:path");
const fs = require("node:fs/promises");
const { ToolEvalRuntime } = require("../adapters/tool-eval-runtime");
const { readJson, writeJson, toPosixPath } = require("../fs-utils");
const { validateSchema } = require("../schema-validator");
const { gateModelForSuite } = require("../probes/probe-gating");

const LAB_ROOT = path.resolve(__dirname, "..", "..");
const SUMMARY_SCHEMA_PATH = path.join(LAB_ROOT, "schemas", "benchmark-run-summary.schema.json");
const MODEL_MANIFEST_SCHEMA_PATH = path.join(LAB_ROOT, "schemas", "model-manifest.schema.json");

function buildToolAllowlist(toolDefinitions) {
  const names = new Set();
  for (const tool of toolDefinitions) {
    if (tool.function && tool.function.name) {
      names.add(tool.function.name);
    }
  }
  return names;
}

async function runToolEvalSuite({
  modelManifestId,
  scenarios,
  systemPrompt,
  trackPolicy,
  mockHandler,
  toolDefinitions,
  suiteConfig,
  trials = 1,
  runId = createRunId(),
  now = () => new Date(),
  probeOptions = {}
}) {
  const startedAt = now().toISOString();
  const summarySchema = await readJson(SUMMARY_SCHEMA_PATH);

  // Probe gate
  const gate = modelManifestId ? await gateModelForSuite(modelManifestId, suiteConfig, probeOptions) : { eligible: true, manifest: null, probeId: null, probed: false };
  if (gate && gate.eligible === false) {
    const completedAt = now().toISOString();
    const skipped = {
      schemaVersion: "benchmark.run_summary.v1", runId, suiteId: suiteConfig.suiteId || "unknown", trackId: suiteConfig.trackId || "unknown",
      contractId: suiteConfig.contractId || "unknown", runtime: { provider: "tool-eval", modelId: modelManifestId, runtimeModelName: gate.manifest?.runtimeModelName || "unknown" },
      startedAt, completedAt, caseCount: 0, passed: 0, partial: 0, failed: 0, errors: 0, timeouts: 0, malformed: 0,
      caseResults: [], status: "SKIPPED_INCOMPATIBLE", modelId: modelManifestId, probeId: gate.probeId,
      missingCapabilities: gate.missingCapabilities || [], reason: gate.reason, scored: false
    };
    const draftDir = path.join(LAB_ROOT, "reports", "drafts", runId);
    await fs.mkdir(draftDir, { recursive: true });
    await writeJson(path.join(draftDir, "summary.json"), skipped);
    return { runId, skipped: true, summary: skipped, gate };
  }

  const manifest = gate?.manifest || (modelManifestId ? await loadModelManifest(modelManifestId) : null);
  const allowlist = buildToolAllowlist(toolDefinitions);

  const runtime = new ToolEvalRuntime({
    model: manifest ? manifest.runtimeModelName : "llama3.2",
    baseUrl: suiteConfig.runtime?.baseUrl || "http://127.0.0.1:11434",
    timeoutMs: suiteConfig.runtime?.timeoutMs || 120000,
    temperature: suiteConfig.runtime?.temperature || 0,
    numPredict: suiteConfig.runtime?.numPredict || 2048,
    maxTurns: suiteConfig.runtime?.maxTurns || 8
  });

  const envInfo = await collectEnvInfo();
  const rawCaseResults = [];
  const summaryCaseResults = [];

  for (const scenario of scenarios) {
    const trialResults = [];

    for (let trial = 1; trial <= trials; trial++) {
      const result = await executeScenario({
        runtime,
        scenario,
        systemPrompt,
        trackPolicy,
        mockHandler,
        toolDefinitions,
        allowlist,
        trial,
        trials,
        suiteConfig
      });
      trialResults.push(result);
    }

    const aggregate = aggregateTrials(trialResults);
    rawCaseResults.push({
      scenarioId: scenario.id,
      title: scenario.title,
      category: scenario.category,
      difficulty: scenario.difficulty,
      expectedTool: scenario.expectedTool,
      trialResults,
      aggregate
    });

    summaryCaseResults.push({
      caseId: scenario.id,
      verdict: aggregate.verdict,
      checks: aggregate.checks
    });
  }

  const passed = summaryCaseResults.filter((r) => r.verdict === "PASS" || r.verdict === "PASS_WITH_RESTRAINT").length;
  const partial = summaryCaseResults.filter((r) => r.verdict === "PARTIAL").length;
  const failed = summaryCaseResults.filter((r) => r.verdict === "FAIL").length;
  const errors = summaryCaseResults.filter((r) => r.verdict === "RUNTIME_ERROR").length;
  const timeouts = summaryCaseResults.filter((r) => r.verdict === "TIMEOUT").length;
  const malformed = summaryCaseResults.filter((r) => r.verdict === "MALFORMED_OUTPUT").length;

  const completedAt = now().toISOString();
  const summary = {
    schemaVersion: "benchmark.run_summary.v1",
    runId,
    suiteId: suiteConfig.suiteId || "basic-tool-use-v1",
    trackId: suiteConfig.trackId || "basic-tool-use",
    contractId: suiteConfig.contractId || "basic-tool-use-v1",
    runtime: {
      provider: "tool-eval",
      modelId: manifest ? manifest.modelId : "unknown",
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
    schemaVersion: "benchmark.tool_eval_raw_run.v1",
    runId,
    suiteId: suiteConfig.suiteId || "basic-tool-use-v1",
    trackId: suiteConfig.trackId || "basic-tool-use",
    modelManifest: manifest || null,
    toolEvalBench: {
      repositoryUrl: "https://github.com/MiaAI-Lab/tool-eval-bench",
      commitSha: "8eca976167dfe925c125edd5a289433e78ee54e0"
    },
    trackPolicy,
    allowlist: [...allowlist],
    probe: gate ? { probeId: gate.probeId, probed: gate.probed, cached: !!gate.cached, verifiedCapabilities: gate.verifiedCapabilities } : null,
    trials,
    scenarioIds: scenarios.map((s) => s.id),
    startedAt,
    completedAt,
    envInfo,
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

async function executeScenario({ runtime, scenario, systemPrompt, trackPolicy, mockHandler, toolDefinitions, allowlist, trial, trials, suiteConfig }) {
  const startedAt = Date.now();
  const referenceDate = scenario.referenceDate || "2026-03-20";
  const timezone = scenario.timezone || "UTC";
  const effectivePolicy = (trackPolicy || "") + `\n\nThe current date is ${referenceDate} (Friday). Timezone: ${timezone}.`;

  const messages = [
    { role: "system", content: systemPrompt + "\n\n" + effectivePolicy },
    { role: "user", content: scenario.userMessage }
  ];

  const trajectory = [];
  const state = { toolCalls: [], assistantMessages: [], messages: [], rejectedTools: [] };
  let done = false;
  let errorCode = null;
  let errorMessage = null;
  let lastChatResult = null;

  for (let turn = 0; turn < (runtime.maxTurns || 8) && !done; turn++) {
    const chatResult = await runtime.chat({
      messages,
      tools: toolDefinitions,
      toolChoice: "auto"
    });
    lastChatResult = chatResult;

    if (!chatResult.ok) {
      errorCode = chatResult.errorCode;
      errorMessage = chatResult.message || chatResult.errorCode;
      break;
    }

    const assistantContent = chatResult.content || "";
    if (assistantContent) {
      state.assistantMessages.push(assistantContent);
    }

    const allowedCalls = [];
    const rejectedCalls = [];

    for (const tc of (chatResult.toolCalls || [])) {
      if (allowlist.has(tc.name)) {
        allowedCalls.push(tc);
      } else {
        rejectedCalls.push({ name: tc.name, arguments: tc.arguments, reason: "not_in_allowlist" });
        state.rejectedTools.push(tc.name);
      }
    }

    const turnRecord = {
      turn,
      assistantContent,
      toolCalls: allowedCalls.map((tc) => ({
        name: tc.name,
        arguments: tc.arguments
      })),
      rejectedCalls: rejectedCalls.map((rc) => ({
        name: rc.name,
        arguments: rc.arguments,
        reason: rc.reason
      })),
      toolResults: []
    };

    for (const rc of rejectedCalls) {
      turnRecord.toolResults.push({
        name: rc.name,
        result: { error: "Tool not available", available: false, requestedTool: rc.name },
        rejected: true
      });
    }

    if (allowedCalls.length === 0 && rejectedCalls.length > 0) {
      for (const rc of rejectedCalls) {
        messages.push({
          role: "assistant",
          content: null,
          tool_calls: [{
            id: `rejected_${Date.now()}`,
            type: "function",
            function: { name: rc.name, arguments: rc.arguments }
          }]
        });
        messages.push({
          role: "tool",
          tool_call_id: `rejected_${Date.now()}`,
          content: JSON.stringify({ error: "Tool not available: " + rc.name + ". Use only the tools provided." })
        });
      }
      trajectory.push(turnRecord);
      continue;
    }

    if (allowedCalls.length === 0) {
      done = true;
      trajectory.push(turnRecord);
      messages.push({ role: "assistant", content: assistantContent });
      break;
    }

    messages.push({
      role: "assistant",
      content: assistantContent || "",
      tool_calls: allowedCalls.map((tc) => ({
        id: tc.id,
        type: "function",
        function: { name: tc.name, arguments: tc.arguments }
      }))
    });

    for (const tc of allowedCalls) {
      state.toolCalls.push(tc);
      const handlerResult = mockHandler(state, tc);
      turnRecord.toolResults.push({ name: tc.name, result: handlerResult });
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify(handlerResult)
      });
    }

    trajectory.push(turnRecord);
  }

  const durationMs = Date.now() - startedAt;
  const evaluation = scenario.evaluate(state);

  let verdict = evaluation.verdict;
  if (errorCode === "TIMEOUT") verdict = "TIMEOUT";
  else if (errorCode === "RUNTIME_ERROR") verdict = "RUNTIME_ERROR";

  const allToolCalls = lastChatResult ? state.toolCalls : [];
  const unnecessaryToolCount = allToolCalls.length;
  const hallucinatedToolCount = state.rejectedTools.length;

  const resultDetail = {
    evaluationType: evaluation.type || "tool-selection",
    summary: evaluation.summary,
    details: evaluation.details || {},
    toolCallCount: allToolCalls.length,
    hallucinatedToolCount,
    unnecessaryToolCount,
    hallucinatedTools: state.rejectedTools,
    hasHallucinatedTools: hallucinatedToolCount > 0,
    hasDirectAnswer: state.assistantMessages.some((msg) => msg.length > 10 && !msg.includes("tool_calls")),
    turnCount: trajectory.length,
    referenceDate,
    timezone
  };

  const checks = [
    { validator: evaluation.type || "tool-selection", status: verdict === "PASS" ? "pass" : "fail", summary: evaluation.summary },
    { validator: "capability-allowlist", status: hallucinatedToolCount === 0 ? "pass" : "fail", message: hallucinatedToolCount > 0 ? `${hallucinatedToolCount} hallucinated tool(s): ${state.rejectedTools.join(", ")}` : "all tools in allowlist" },
    { validator: "runtime", status: errorCode ? "fail" : "pass", message: errorCode || "ok" }
  ];

  return {
    trial,
    verdict,
    points: evaluation.points,
    summary: evaluation.summary,
    errorMessage,
    resultDetail,
    checks,
    trajectory,
    state,
    durationMs,
    turnCount: trajectory.length
  };
}

function aggregateTrials(trialResults) {
  const total = trialResults.length;
  const passCount = trialResults.filter((t) => t.verdict === "PASS").length;
  const partialCount = trialResults.filter((t) => t.verdict === "PARTIAL").length;
  const failCount = trialResults.filter((t) => t.verdict === "FAIL").length;
  const timeoutCount = trialResults.filter((t) => t.verdict === "TIMEOUT").length;
  const errorCount = trialResults.filter((t) => t.verdict === "RUNTIME_ERROR").length;

  let aggregateVerdict;
  if (passCount === total) {
    aggregateVerdict = "PASS";
  } else if (passCount + partialCount === total) {
    aggregateVerdict = "PARTIAL";
  } else if (failCount === total || timeoutCount === total || errorCount === total) {
    aggregateVerdict = "FAIL";
  } else {
    aggregateVerdict = partialCount > 0 ? "PARTIAL" : "FAIL";
  }

  const totalHallucinated = trialResults.reduce((sum, t) => sum + (t.resultDetail?.hallucinatedToolCount || 0), 0);
  const totalUnnecessary = trialResults.reduce((sum, t) => sum + (t.resultDetail?.unnecessaryToolCount || 0), 0);

  return {
    trialCount: total,
    passCount,
    partialCount,
    failCount,
    timeoutCount,
    errorCount,
    verdict: aggregateVerdict,
    reliability: total > 0 ? Math.round((passCount / total) * 10000) / 100 : 0,
    hallucinatedToolCount: totalHallucinated,
    unnecessaryToolCount: totalUnnecessary,
    checks: [
      { validator: "aggregate", status: aggregateVerdict === "PASS" ? "pass" : "fail", message: `${passCount}/${total} trials passed` },
      { validator: "reliability", status: passCount >= Math.ceil(total / 2) ? "pass" : "fail", message: `${Math.round((passCount / total) * 100)}% reliability` },
      { validator: "allowlist", status: totalHallucinated === 0 ? "pass" : "fail", message: totalHallucinated > 0 ? `${totalHallucinated} hallucinated tool requests across trials` : "no hallucinated tools" }
    ]
  };
}

async function loadModelManifest(modelManifestId) {
  if (!modelManifestId) return null;
  const manifestSchema = await readJson(MODEL_MANIFEST_SCHEMA_PATH);
  const manifest = await readJson(path.join(LAB_ROOT, "models", "manifests", `${modelManifestId}.json`));
  assertValid(validateSchema(manifest, manifestSchema, "modelManifest"), "Model manifest is invalid.");
  return manifest;
}

async function collectEnvInfo() {
  try {
    const os = require("node:os");
    return {
      platform: os.platform(),
      release: os.release(),
      hostname: os.hostname(),
      nodeVersion: process.version,
      cwd: process.cwd()
    };
  } catch {
    return { nodeVersion: process.version };
  }
}

function createRunId() {
  const ts = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
  return `run-tool-eval-${ts}`;
}

function assertValid(validation, message) {
  if (!validation.ok) {
    const error = new Error(`${message} ${validation.errors.join(" ")}`);
    error.validation = validation;
    throw error;
  }
}

module.exports = { runToolEvalSuite, createRunId, buildToolAllowlist };
