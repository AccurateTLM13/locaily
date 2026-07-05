const path = require("node:path");
const fs = require("node:fs/promises");
const { ToolEvalRuntime } = require("../adapters/tool-eval-runtime");
const { VARIANT_CONFIGS, classifyTC65Failure, mockWeatherHandler, deterministicTransformer, SCHEMAS } = require("../../locaily/tracks/basic-tool-use/tc65-diagnostics");
const { probeModel, saveProbeRecord, loadLatestProbe, checkSuiteRequirements, COMPATIBILITY } = require("../probes/model-capability-probe");

async function runTC65Diagnostics({ modelManifests, suiteConfig, trials = 5, runId = null }) {
  const results = { runs: [] };

  for (const { modelId, modeLabel, modeConfig } of getModeConfigs(modelManifests)) {
    const manifest = await loadManifest(modelId);
    if (!manifest) { results.runs.push({ modelId, modeLabel, error: "manifest not found" }); continue; }

    // Auto-probe
    const probe = await getOrProbe(modelId, manifest.runtimeModelName, suiteConfig);
    if (probe && !probe.eligible) {
      results.runs.push({ modelId, modeLabel, skipped: true, reason: probe.reason, probeId: probe.probeId });
      continue;
    }
    const probeId = probe?.probeId || null;

    for (const [variantName, variantConfig] of Object.entries(VARIANT_CONFIGS)) {
      const trialResults = [];
      for (let t = 1; t <= trials; t++) {
        const trial = await runSingleTrial(modelId, manifest.runtimeModelName, variantConfig, modeConfig, suiteConfig);
        trialResults.push(trial);
      }
      const agg = aggregateDiagnostic(trialResults);
      results.runs.push({ modelId, modeLabel, variant: variantName, trialResults, aggregate: agg, probeId });
    }
  }

  // Multi-model split
  const multiModel = await runMultiModelSplit(modelManifests, suiteConfig, trials);
  results.runs.push(...multiModel);

  // Deterministic baseline
  const baseline = runDeterministicBaseline(trials);
  results.baseline = baseline;

  return results;
}

async function runSingleTrial(modelId, runtimeModelName, variantConfig, modeConfig, suiteConfig) {
  const runtime = new ToolEvalRuntime({
    model: runtimeModelName,
    baseUrl: "http://127.0.0.1:11434",
    timeoutMs: suiteConfig.runtime?.timeoutMs || 120000,
    temperature: 0, numPredict: 2048, maxTurns: 8
  });

  const toolDefinitions = [{ type: "function", function: { name: "get_weather", description: "Get weather for a location", parameters: { type: "object", properties: { location: { type: "string" } }, required: ["location"] } } }];

  const effectiveSchema = modeConfig.responseSchema || variantConfig.schema;
  const messages = [{ role: "system", content: buildSystemPrompt(variantConfig, modeConfig) }, { role: "user", content: variantConfig.userMessage }];

  const trajectory = [];
  const state = { toolCalls: [], assistantMessages: [], messages: [] };
  let done = false, errorCode = null;

  for (let turn = 0; turn < 8 && !done; turn++) {
    const stageTools = modeConfig.staged ? (turn === 0 ? [toolDefinitions[0]] : []) : modeConfig.exposeTools ? toolDefinitions : null;
    const chatResult = await runtime.chat({
      messages,
      tools: stageTools && stageTools.length > 0 ? stageTools : undefined,
      toolChoice: stageTools && stageTools.length > 0 ? "auto" : "none",
      responseFormat: modeConfig.useFormat && effectiveSchema ? effectiveSchema : null
    });

    if (!chatResult.ok) { errorCode = chatResult.errorCode; break; }

    const content = chatResult.content || "";
    if (content) state.assistantMessages.push(content);

    const turnRecord = { turn, content, toolCalls: [] };
    for (const tc of (chatResult.toolCalls || [])) {
      state.toolCalls.push(tc);
      turnRecord.toolCalls.push({ name: tc.name, args: tc.arguments });
      const result = mockWeatherHandler(state, tc);
      messages.push({ role: "assistant", content: null, tool_calls: [{ id: tc.id, type: "function", function: { name: tc.name, arguments: tc.arguments } }] });
      messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) });
    }

    if (chatResult.toolCalls?.length === 0) {
      done = true;
      trajectory.push(turnRecord);
      messages.push({ role: "assistant", content });
      break;
    }
    trajectory.push(turnRecord);
  }

  const rawResponse = state.assistantMessages.join("\n");
  let parsedJSON = null;
  let text = rawResponse;
  const fenceMatch = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  if (fenceMatch) text = fenceMatch[1];
  try { parsedJSON = JSON.parse(text); } catch {}

  const reasonCodes = classifyTC65Failure(state, rawResponse, parsedJSON, effectiveSchema);

  // Schema validation
  const issues = [];
  if (parsedJSON && effectiveSchema) {
    const required = effectiveSchema.required || [];
    const missing = required.filter((f) => parsedJSON[f] === undefined);
    if (missing.length > 0) issues.push("missing: " + missing.join(","));
    for (const f of required) {
      if (parsedJSON[f] !== undefined) {
        const et = effectiveSchema.properties?.[f]?.type;
        if (et === "number" && typeof parsedJSON[f] !== "number") issues.push(f + " type mismatch");
        if (Array.isArray(et) && !et.includes(typeof parsedJSON[f])) issues.push(f + " type mismatch");
      }
    }
    if (effectiveSchema.additionalProperties === false) {
      for (const k of Object.keys(parsedJSON)) {
        if (!required.includes(k)) { issues.push("extra: " + k); break; }
      }
    }
  }

  const toolCalled = state.toolCalls.some((tc) => tc.name === "get_weather");
  const schemaValid = issues.length === 0;
  const sourceFaithful = parsedJSON?.temperature_celsius === 18 && String(parsedJSON?.location || "").toLowerCase().includes("tokyo");

  let verdict;
  if (!toolCalled && !parsedJSON) verdict = "FAIL";
  else if (toolCalled && schemaValid && sourceFaithful) verdict = "PASS";
  else if (toolCalled && parsedJSON && !schemaValid) verdict = "PARTIAL";
  else if (toolCalled && schemaValid && !sourceFaithful) verdict = "PARTIAL";
  else verdict = "FAIL";

  return {
    trial: 1, verdict, toolCalled, schemaValid, sourceFaithful,
    reasonCodes, issues, rawResponseLength: rawResponse.length,
    turnCount: trajectory.length, durationMs: 0, errorCode,
    parsedJSON, hasToolCall: toolCalled
  };
}

function buildSystemPrompt(variantConfig, modeConfig) {
  let prompt = "You are a helpful assistant with access to the tools provided. ";
  if (modeConfig.policyInstructed) {
    if (modeConfig.policyMessage) prompt += modeConfig.policyMessage + " ";
  }
  if (variantConfig.includeSchemaInPrompt) {
    prompt += "The output must match this schema: " + JSON.stringify(variantConfig.schema) + " ";
  }
  return prompt;
}

function getModeConfigs(modelManifests) {
  const configs = [];
  for (const m of modelManifests) {
    configs.push({ modelId: m, modeLabel: "native", modeConfig: { exposeTools: true, policyInstructed: false, staged: false, useFormat: false } });
    configs.push({ modelId: m, modeLabel: "policy-routed", modeConfig: { exposeTools: true, policyInstructed: true, policyMessage: "[Execution Policy: TOOL_THEN_STRUCTURED_RESPONSE] First call get_weather to retrieve data. After receiving the result, return ONLY valid JSON matching the requested schema.", staged: false, useFormat: false } });
    configs.push({ modelId: m, modeLabel: "runtime-constrained", modeConfig: { exposeTools: true, policyInstructed: true, policyMessage: "First call get_weather to retrieve data. After receiving the result, format your final response as valid JSON matching the required schema.", staged: true, useFormat: true, responseSchema: null } });
  }
  return configs;
}

async function loadManifest(modelId) {
  const repoRoot = path.resolve(__dirname, "..", "..");
  try { return JSON.parse(await fs.readFile(path.join(repoRoot, "models", "manifests", `${modelId}.json`), "utf8")); }
  catch { return null; }
}

async function getOrProbe(modelId, runtimeModelName, suiteConfig) {
  let ollamaVersion = "unknown";
  try { const r = await globalThis.fetch("http://127.0.0.1:11434/api/version", { signal: AbortSignal.timeout(5000) }); if (r.ok) ollamaVersion = (await r.json()).version || "unknown"; } catch {}
  const cached = await loadLatestProbe(modelId, runtimeModelName, ollamaVersion);
  if (cached) {
    const check = checkSuiteRequirements(suiteConfig, cached);
    return { ...check, probeId: cached.probeId };
  }
  const probe = await probeModel({ modelId, runtimeModelName, baseUrl: "http://127.0.0.1:11434", requestTimeoutMs: 300000 });
  const probePath = await saveProbeRecord(probe);
  const check = checkSuiteRequirements(suiteConfig, probe);
  return { ...check, probeId: probe.probeId, probePath };
}

async function runMultiModelSplit(modelManifests, suiteConfig, trials) {
  const results = [];
  const pairs = [["llama3.2-local", "lfm25-local"], ["lfm25-local", "llama3.2-local"]];
  for (const [toolModel, formatModel] of pairs) {
    const tmManifest = await loadManifest(toolModel);
    const fmManifest = await loadManifest(formatModel);
    if (!tmManifest || !fmManifest) continue;

    for (const [vName, vConfig] of Object.entries(VARIANT_CONFIGS)) {
      if (vName !== "canonical" && vName !== "visible-schema") continue;
      for (let t = 1; t <= trials; t++) {
        const result = await runSplitTrial(tmManifest.runtimeModelName, fmManifest.runtimeModelName, vConfig, suiteConfig);
        results.push({ modelPair: `${toolModel}→${formatModel}`, variant: vName, ...result });
      }
    }
  }
  return results;
}

async function runSplitTrial(toolModelName, formatModelName, variantConfig, suiteConfig) {
  const toolRuntime = new ToolEvalRuntime({ model: toolModelName, baseUrl: "http://127.0.0.1:11434", timeoutMs: 120000, temperature: 0, numPredict: 1024, maxTurns: 4 });
  const formatRuntime = new ToolEvalRuntime({ model: formatModelName, baseUrl: "http://127.0.0.1:11434", timeoutMs: 120000, temperature: 0, numPredict: 1024, maxTurns: 4 });

  const toolDefs = [{ type: "function", function: { name: "get_weather", description: "Get weather", parameters: { type: "object", properties: { location: { type: "string" } }, required: ["location"] } } }];

  // Tool stage
  const toolMessages = [{ role: "system", content: "You are a helpful assistant with tools. Get the weather in Tokyo." }, { role: "user", content: "Get the weather in Tokyo." }];
  const toolResult = await toolRuntime.chat({ messages: toolMessages, tools: toolDefs, toolChoice: "auto" });

  let weatherData = null;
  if (toolResult.ok && toolResult.toolCalls?.length > 0) {
    weatherData = mockWeatherHandler({ toolCalls: [] }, { name: "get_weather", arguments: { location: "Tokyo" } });
  }

  if (!weatherData) return { toolStageOk: false, verdict: "FAIL", reasonCodes: ["TOOL_SELECTION_FAILED"] };

  // Format stage - pass weather data to the formatter model
  const formatMessages = [
    { role: "system", content: "You are a JSON formatter. Given weather data, produce a JSON object matching the schema. Return ONLY the JSON object." + (variantConfig.includeSchemaInPrompt ? " Schema: " + JSON.stringify(variantConfig.schema) : "") },
    { role: "user", content: "Format this weather data as JSON: " + JSON.stringify(weatherData.data) + (variantConfig.userMessage ? " " + variantConfig.userMessage : "") }
  ];

  const formatResult = await formatRuntime.chat({ messages: formatMessages, tools: null, toolChoice: "none", responseFormat: null });

  const rawResponse = formatResult.ok ? (formatResult.content || "") : "";
  let parsedJSON = null;
  const fenceMatch = /```(?:json)?\s*([\s\S]*?)```/.exec(rawResponse);
  try { parsedJSON = JSON.parse(fenceMatch ? fenceMatch[1] : rawResponse); } catch {}

  const required = variantConfig.schema?.required || [];
  const issues = [];
  if (parsedJSON) {
    for (const f of required) { if (parsedJSON[f] === undefined) issues.push("missing: " + f); }
    if (variantConfig.schema?.additionalProperties === false) {
      for (const k of Object.keys(parsedJSON)) { if (!required.includes(k)) { issues.push("extra: " + k); break; } }
    }
  } else {
    issues.push("parse failure");
  }

  const schemaValid = issues.length === 0;
  const codes = !parsedJSON ? ["JSON_PARSE_FAILED"] : schemaValid ? ["none"] : ["SCHEMA_FIELD_MISSING"];

  return { toolStageOk: true, formatStageOk: !!parsedJSON, schemaValid, verdict: schemaValid ? "PASS" : "PARTIAL", reasonCodes: codes, rawResponseLength: rawResponse.length };
}

function runDeterministicBaseline(trials) {
  const results = [];
  for (let t = 0; t < trials; t++) {
    const expected = { location: "Tokyo", temperature_celsius: 18, condition: "Partly Cloudy", recommendation: "Bring a light jacket." };
    const rawData = { location: "Tokyo", temperature_celsius: 18, condition: "Partly Cloudy" };
    const transformed = deterministicTransformer(rawData);
    const match = JSON.stringify(transformed) === JSON.stringify(expected);
    results.push({ trial: t + 1, input: rawData, output: transformed, expected, match });
  }
  return results;
}

module.exports = { runTC65Diagnostics };
