const path = require("node:path");
const fs = require("node:fs/promises");
const { ToolEvalRuntime } = require("../adapters/tool-eval-runtime");
const { readJson, writeJson, toPosixPath } = require("../fs-utils");
const { validateSchema } = require("../schema-validator");
const { buildExecutionPlan, EXECUTION_MODES, EXECUTION_POLICIES, resolvePolicy } = require("../../locaily/tracks/basic-tool-use/execution-router");
const { resolveRelativeDate } = require("../../locaily/tracks/basic-tool-use/date-resolver");
const { gateModelForSuite } = require("../probes/probe-gating");

const LAB_ROOT = path.resolve(__dirname, "..", "..");

function buildToolAllowlist(toolDefinitions) {
  const names = new Set();
  for (const tool of toolDefinitions) {
    if (tool.function && tool.function.name) names.add(tool.function.name);
  }
  return names;
}

function addPolicyToSystemPrompt(systemPrompt, trackPolicy, plan, scenario) {
  if (!plan.policyInstructed && !plan.runtimeConstrained) {
    const refDate = scenario.referenceDate || "2026-03-20";
    const tz = scenario.timezone || "UTC";
    return systemPrompt + "\n\n" + (trackPolicy || "") + `\n\nThe current date is ${refDate} (Friday). Timezone: ${tz}.`;
  }

  let prompt = systemPrompt;
  prompt += "\n\n" + (trackPolicy || "");

  const refDate = scenario.referenceDate || "2026-03-20";
  const tz = scenario.timezone || "UTC";
  prompt += `\n\nThe current date is ${refDate} (Friday). Timezone: ${tz}.`;

  if (plan.policyMessage) {
    prompt += "\n\n" + plan.policyMessage;
  }

  return prompt;
}

async function runModeComparison({
  modelManifestId,
  scenarios,
  systemPrompt,
  trackPolicy,
  mockHandler,
  toolDefinitions,
  suiteConfig,
  trials = 3,
  runIdBase = "mode-comparison",
  now = () => new Date(),
  probeOptions = {}
}) {
  const startedAt = now().toISOString();

  // Probe gate
  const gate = modelManifestId ? await gateModelForSuite(modelManifestId, suiteConfig, probeOptions) : { eligible: true, manifest: null, probeId: null, probed: false };
  if (gate && gate.eligible === false) {
    return { runId: runIdBase + "-skipped", skipped: true, gate, summary: { status: "SKIPPED_INCOMPATIBLE", modelId: modelManifestId, probeId: gate.probeId, missingCapabilities: gate.missingCapabilities || [], reason: gate.reason, scored: false } };
  }

  const manifest = gate?.manifest || (modelManifestId ? await loadModelManifest(modelManifestId) : null);
  const envInfo = await collectEnvInfo();
  const modes = [EXECUTION_MODES.NATIVE, EXECUTION_MODES.POLICY_ROUTED, EXECUTION_MODES.RUNTIME_CONSTRAINED];

  const modeResults = [];

  for (const executionMode of modes) {
    const modeTrialResults = [];

    for (const scenario of scenarios) {
      const plan = buildExecutionPlan(scenario.id, executionMode, scenario, toolDefinitions);

      for (let trial = 1; trial <= trials; trial++) {
        const result = await executeModeTrial({
          scenario,
          plan,
          executionMode,
          systemPrompt,
          trackPolicy,
          mockHandler,
          toolDefinitions,
          suiteConfig,
          trial,
          trials,
          manifest
        });
        modeTrialResults.push(result);
      }
    }

    const aggregated = aggregateMode(modeTrialResults);
    modeResults.push({
      executionMode,
      trials: modeTrialResults,
      aggregate: aggregated
    });
  }

  return {
    startedAt,
    completedAt: now().toISOString(),
    modelManifest: manifest,
    envInfo,
    modeResults
  };
}

async function executeModeTrial({ scenario, plan, executionMode, systemPrompt, trackPolicy, mockHandler, toolDefinitions, suiteConfig, trial, trials, manifest }) {
  const startedAt = Date.now();
  const runtime = new ToolEvalRuntime({
    model: manifest ? manifest.runtimeModelName : "llama3.2",
    baseUrl: suiteConfig.runtime?.baseUrl || "http://127.0.0.1:11434",
    timeoutMs: suiteConfig.runtime?.timeoutMs || 120000,
    temperature: suiteConfig.runtime?.temperature || 0,
    numPredict: suiteConfig.runtime?.numPredict || 4096,
    maxTurns: suiteConfig.runtime?.maxTurns || 8
  });

  const effectivePrompt = addPolicyToSystemPrompt(systemPrompt, trackPolicy, plan, scenario);
  const messages = [
    { role: "system", content: effectivePrompt },
    { role: "user", content: scenario.userMessage }
  ];

  const trajectory = [];
  const state = { toolCalls: [], assistantMessages: [], messages: [], rejectedTools: [], executionOrderViolations: [] };
  let done = false;
  let errorCode = null;
  let errorMessage = null;
  let lastChatResult = null;

  for (let turn = 0; turn < (runtime.maxTurns || 8) && !done; turn++) {
    const stageTools = plan.stages ? plan.stages.find((s) => s.turn === turn)?.tools || null : plan.exposedTools;
    const currentTools = stageTools !== null ? stageTools : plan.exposedTools;

    const chatResult = await runtime.chat({
      messages,
      tools: currentTools.length > 0 ? currentTools : undefined,
      toolChoice: currentTools.length > 0 ? "auto" : "none",
      responseFormat: plan.responseMode === "json_schema" && plan.runtimeConstrained ? plan.responseSchema : null
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
      const toolInStage = currentTools.length === 0 || currentTools.some((t) => t.function?.name === tc.name);
      if (toolInStage) {
        allowedCalls.push(tc);
      } else {
        rejectedCalls.push({ name: tc.name, arguments: tc.arguments, reason: currentTools.length === 0 ? "no_tools_exposed" : "not_in_stage" });
        state.rejectedTools.push(tc.name);
        state.executionOrderViolations.push({ turn, toolName: tc.name, reason: "tool_not_available_this_turn" });
      }
    }

    const turnRecord = {
      turn,
      executionMode,
      assistantContent,
      toolCalls: allowedCalls.map((tc) => ({ name: tc.name, arguments: tc.arguments })),
      rejectedCalls: rejectedCalls.map((rc) => ({ name: rc.name, arguments: rc.arguments, reason: rc.reason })),
      toolResults: [],
      exposedTools: currentTools.map((t) => t.function?.name).filter(Boolean),
      stageTools: stageTools !== null
    };

    for (const rc of rejectedCalls) {
      turnRecord.toolResults.push({
        name: rc.name,
        result: { error: "Tool not available this turn", available: false, requestedTool: rc.name },
        rejected: true
      });
    }

    if (allowedCalls.length === 0 && rejectedCalls.length > 0) {
      for (const rc of rejectedCalls) {
        messages.push({
          role: "assistant", content: null,
          tool_calls: [{ id: `rejected_${Date.now()}`, type: "function", function: { name: rc.name, arguments: rc.arguments } }]
        });
        messages.push({
          role: "tool", tool_call_id: `rejected_${Date.now()}`,
          content: JSON.stringify({ error: "Tool not available: " + rc.name + ". Use only the tools provided for this step." })
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
      role: "assistant", content: assistantContent || "",
      tool_calls: allowedCalls.map((tc) => ({ id: tc.id, type: "function", function: { name: tc.name, arguments: tc.arguments } }))
    });

    for (const tc of allowedCalls) {
      state.toolCalls.push(tc);
      const handlerResult = mockHandler(state, tc);
      turnRecord.toolResults.push({ name: tc.name, result: handlerResult });
      messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(handlerResult) });
    }

    trajectory.push(turnRecord);
  }

  const durationMs = Date.now() - startedAt;
  const evaluation = scenario.evaluate(state);

  let verdict = evaluation.verdict;
  if (errorCode === "TIMEOUT") verdict = "TIMEOUT";
  else if (errorCode === "RUNTIME_ERROR") verdict = "RUNTIME_ERROR";

  const resultDetail = {
    evaluationType: evaluation.type || "tool-selection",
    summary: evaluation.summary,
    details: evaluation.details || {},
    toolCallCount: state.toolCalls.length,
    hallucinatedToolCount: state.rejectedTools.length,
    hallucinatedTools: state.rejectedTools,
    executionOrderViolations: state.executionOrderViolations,
    hasViolations: state.executionOrderViolations.length > 0,
    turnCount: trajectory.length,
    executionMode,
    policy: resolvePolicy(scenario.id),
    runtimeConstrained: plan.runtimeConstrained,
    policyInstructed: plan.policyInstructed,
    responseMode: plan.responseMode,
    responseSchema: plan.responseSchema ? JSON.stringify(plan.responseSchema).substring(0, 500) : null,
    nativeLabel: executionMode === EXECUTION_MODES.NATIVE ? "native" : (plan.runtimeConstrained ? "orchestration-assisted" : "policy-assisted"),
    policyMessage: plan.policyMessage
  };

  const checks = [
    { validator: evaluation.type || "tool-selection", status: verdict === "PASS" ? "pass" : "fail", summary: evaluation.summary },
    { validator: "execution-mode", status: "pass", message: executionMode },
    { validator: "execution-policy", status: "pass", message: resolvePolicy(scenario.id) },
    { validator: "runtime", status: errorCode ? "fail" : "pass", message: errorCode || "ok" }
  ];

  return {
    trial, scenarioId: scenario.id, scenarioTitle: scenario.title,
    verdict, points: evaluation.points, summary: evaluation.summary,
    errorMessage, resultDetail, checks, trajectory, state,
    durationMs, turnCount: trajectory.length
  };
}

function aggregateMode(trialResults) {
  const total = trialResults.length;
  const passCount = trialResults.filter((t) => t.verdict === "PASS").length;
  const partialCount = trialResults.filter((t) => t.verdict === "PARTIAL").length;
  const failCount = trialResults.filter((t) => t.verdict === "FAIL").length;
  const totalHallucinated = trialResults.reduce((s, t) => s + (t.resultDetail?.hallucinatedToolCount || 0), 0);
  const totalViolations = trialResults.reduce((s, t) => s + (t.resultDetail?.hasViolations ? 1 : 0), 0);

  return {
    totalScenarios: 6, total,
    passCount, partialCount, failCount,
    totalHallucinated, totalViolations,
    avgDurationMs: Math.round(trialResults.reduce((s, t) => s + t.durationMs, 0) / total)
  };
}

async function loadModelManifest(modelManifestId) {
  if (!modelManifestId) return null;
  const manifestSchema = await readJson(path.join(LAB_ROOT, "schemas", "model-manifest.schema.json"));
  return await readJson(path.join(LAB_ROOT, "models", "manifests", `${modelManifestId}.json`));
}

async function collectEnvInfo() {
  try {
    const os = require("node:os");
    return { platform: os.platform(), release: os.release(), hostname: os.hostname(), nodeVersion: process.version, cwd: process.cwd() };
  } catch {
    return { nodeVersion: process.version };
  }
}

module.exports = { runModeComparison, EXECUTION_MODES, EXECUTION_POLICIES };
