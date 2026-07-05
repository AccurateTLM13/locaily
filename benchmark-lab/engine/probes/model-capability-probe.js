const path = require("node:path");
const fs = require("node:fs/promises");
const crypto = require("node:crypto");

const COMPATIBILITY = {
  SUPPORTED: "SUPPORTED",
  UNSUPPORTED: "UNSUPPORTED",
  INCOMPATIBLE_FORMAT: "INCOMPATIBLE_FORMAT",
  TIMEOUT: "TIMEOUT",
  LOAD_FAILED: "LOAD_FAILED",
  REQUEST_FAILED: "REQUEST_FAILED",
  PARTIAL: "PARTIAL",
  UNTESTED: "UNTESTED"
};

const REASON_CODES = {
  CAPABILITY_NOT_DECLARED: "CAPABILITY_NOT_DECLARED",
  TOOLS_REQUEST_TIMEOUT: "TOOLS_REQUEST_TIMEOUT",
  NO_TOOL_CALL_RETURNED: "NO_TOOL_CALL_RETURNED",
  NONSTANDARD_TOOL_FORMAT: "NONSTANDARD_TOOL_FORMAT",
  INVALID_TOOL_ARGUMENTS: "INVALID_TOOL_ARGUMENTS",
  GUIDED_JSON_UNSUPPORTED: "GUIDED_JSON_UNSUPPORTED",
  MODEL_LOAD_TIMEOUT: "MODEL_LOAD_TIMEOUT",
  CHAT_ENDPOINT_FAILED: "CHAT_ENDPOINT_FAILED",
  TEXT_ONLY_MODEL: "TEXT_ONLY_MODEL"
};

const PROBE_VERSION = "1.0.0";

async function probeModel({ modelId, runtimeModelName, baseUrl, fetchImpl = globalThis.fetch, requestTimeoutMs = 120000 }) {
  const startedAt = Date.now();

  const manifest = await loadManifest(modelId).catch(() => null);
  const declaredCapabilities = manifest && Array.isArray(manifest.capabilities) ? manifest.capabilities : [];

  const rawEvidence = [];
  const verifiedCapabilities = {};
  const compatibility = {};
  const latency = {};
  const timeouts = [];
  let ollamaVersion = "unknown";

  async function chat(messages, tools, toolChoice, responseFormat, label) {
    const body = { model: runtimeModelName, messages, stream: false, options: { temperature: 0, num_predict: 512 } };
    if (Array.isArray(tools) && tools.length > 0) body.tools = tools;
    if (toolChoice) body.tool_choice = toolChoice;
    if (responseFormat) body.format = responseFormat;

    const t0 = Date.now();
    try {
      const res = await fetchImpl(`${baseUrl}/api/chat`, {
        method: "POST",
        signal: AbortSignal.timeout(requestTimeoutMs),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const dur = Date.now() - t0;
      latency[label] = dur;
      if (!res.ok) {
        return { ok: false, errorCode: "HTTP_" + res.status, durationMs: dur, rawBody: await res.text().catch(() => "") };
      }
      const data = await res.json();
      rawEvidence.push({ label, requestBody: JSON.stringify(body).substring(0, 1000), responseMsg: data.message });
      return { ok: true, durationMs: dur, message: data.message || {}, data };
    } catch (err) {
      const dur = Date.now() - t0;
      latency[label] = dur;
      const code = err.name === "AbortError" || err.name === "TimeoutError" ? "TIMEOUT" : "REQUEST_FAILED";
      timeouts.push({ label, code, durationMs: dur, message: err.message });
      return { ok: false, errorCode: code, durationMs: dur };
    }
  }

  // Text completion
  const textRes = await chat(
    [{ role: "user", content: "Say hello in one word." }],
    null, null, null, "textCompletion"
  );
  verifiedCapabilities.textCompletion = textRes.ok && textRes.message?.content ? COMPATIBILITY.SUPPORTED : textRes.errorCode === "TIMEOUT" ? COMPATIBILITY.TIMEOUT : COMPATIBILITY.REQUEST_FAILED;

  // Chat completion
  const chatRes = await chat(
    [{ role: "system", content: "You are helpful." }, { role: "user", content: "What is 2+2?" }],
    null, null, null, "chatCompletion"
  );
  verifiedCapabilities.chatCompletion = chatRes.ok && chatRes.message?.content ? COMPATIBILITY.SUPPORTED : chatRes.errorCode === "TIMEOUT" ? COMPATIBILITY.TIMEOUT : COMPATIBILITY.REQUEST_FAILED;

  // Native tool call support
  const weatherTool = [{ type: "function", function: { name: "get_weather", description: "Get weather", parameters: { type: "object", properties: { location: { type: "string" } }, required: ["location"] } } }];
  const toolRes = await chat(
    [{ role: "system", content: "You are a helpful assistant with tools." }, { role: "user", content: "What's the weather in Berlin? Use get_weather." }],
    weatherTool, "auto", null, "nativeToolCalls"
  );
  if (!toolRes.ok) {
    verifiedCapabilities.nativeToolCalls = toolRes.errorCode === "TIMEOUT" ? COMPATIBILITY.TIMEOUT : COMPATIBILITY.REQUEST_FAILED;
    compatibility.nativeToolCalls = { status: verifiedCapabilities.nativeToolCalls, reason: toolRes.errorCode === "TIMEOUT" ? REASON_CODES.TOOLS_REQUEST_TIMEOUT : REASON_CODES.REQUEST_FAILED };
  } else if (!toolRes.message?.tool_calls || toolRes.message.tool_calls.length === 0) {
    const content = (toolRes.message?.content || "").toLowerCase();
    if (content.includes("<parallel") || content.includes("<call>") || content.includes("<tool")) {
      verifiedCapabilities.nativeToolCalls = COMPATIBILITY.INCOMPATIBLE_FORMAT;
      compatibility.nativeToolCalls = { status: COMPATIBILITY.INCOMPATIBLE_FORMAT, reason: REASON_CODES.NONSTANDARD_TOOL_FORMAT };
    } else {
      verifiedCapabilities.nativeToolCalls = COMPATIBILITY.UNSUPPORTED;
      compatibility.nativeToolCalls = { status: COMPATIBILITY.UNSUPPORTED, reason: REASON_CODES.NO_TOOL_CALL_RETURNED };
    }
  } else {
    const tc = toolRes.message.tool_calls[0];
    const hasStandard = tc.function && tc.function.name && tc.function.arguments;
    verifiedCapabilities.nativeToolCalls = hasStandard ? COMPATIBILITY.SUPPORTED : COMPATIBILITY.INCOMPATIBLE_FORMAT;
    compatibility.nativeToolCalls = { status: verifiedCapabilities.nativeToolCalls, toolName: tc.function?.name };
  }

  // Tool arguments correctness
  if (verifiedCapabilities.nativeToolCalls === COMPATIBILITY.SUPPORTED) {
    const argTool = [{ type: "function", function: { name: "create_calendar_event", description: "Create event", parameters: { type: "object", properties: { title: { type: "string" }, date: { type: "string" }, attendees: { type: "array", items: { type: "string" } } }, required: ["title", "date"] } } }];
    const argRes = await chat(
      [{ role: "user", content: "Create a meeting on 2026-03-23 titled Standup." }],
      argTool, "auto", null, "toolArguments"
    );
    if (argRes.ok && argRes.message?.tool_calls?.length > 0) {
      const args = argRes.message.tool_calls[0].function?.arguments;
      const parsed = parseArgs(args);
      const hasStringArgs = typeof parsed.title === "string" && typeof parsed.date === "string";
      verifiedCapabilities.toolArguments = hasStringArgs ? COMPATIBILITY.SUPPORTED : COMPATIBILITY.PARTIAL;
    } else {
      verifiedCapabilities.toolArguments = COMPATIBILITY.UNSUPPORTED;
      compatibility.toolArguments = { status: COMPATIBILITY.UNSUPPORTED, reason: REASON_CODES.INVALID_TOOL_ARGUMENTS };
    }
  } else {
    verifiedCapabilities.toolArguments = COMPATIBILITY.UNSUPPORTED;
  }

  // Guided JSON support
  const jsonSchema = { type: "object", required: ["answer"], properties: { answer: { type: "string" } }, additionalProperties: false };
  const guidedRes = await chat(
    [{ role: "user", content: "Say hello in JSON with key 'answer'." }],
    null, null, jsonSchema, "guidedJson"
  );
  if (guidedRes.ok) {
    try {
      const parsed = JSON.parse(guidedRes.message?.content || "{}");
      verifiedCapabilities.guidedJson = parsed.answer ? COMPATIBILITY.SUPPORTED : COMPATIBILITY.PARTIAL;
    } catch { verifiedCapabilities.guidedJson = COMPATIBILITY.UNSUPPORTED; }
  } else {
    verifiedCapabilities.guidedJson = guidedRes.errorCode === "TIMEOUT" ? COMPATIBILITY.TIMEOUT : COMPATIBILITY.REQUEST_FAILED;
  }

  // Tool result follow-up
  if (verifiedCapabilities.nativeToolCalls === COMPATIBILITY.SUPPORTED) {
    const followMsgs = [
      { role: "user", content: "What's the weather in Berlin?" },
      { role: "assistant", content: null, tool_calls: [{ id: "call_followup", type: "function", function: { name: "get_weather", arguments: { location: "Berlin" } } }] },
      { role: "tool", tool_call_id: "call_followup", content: JSON.stringify({ temperature: 8, condition: "Cloudy" }) },
      { role: "user", content: "What was the temperature?" }
    ];
    const followRes = await chat(followMsgs, weatherTool, "auto", null, "toolResultFollowUp");
    verifiedCapabilities.toolResultFollowUp = followRes.ok && (followRes.message?.content || "").length > 0 ? COMPATIBILITY.SUPPORTED : COMPATIBILITY.REQUEST_FAILED;
  } else {
    const content = toolRes.message?.content || "";
    const hasToolTags = content.includes("<parallel") || content.includes("<call>");
    if (hasToolTags) {
      verifiedCapabilities.toolResultFollowUp = COMPATIBILITY.INCOMPATIBLE_FORMAT;
    } else {
      verifiedCapabilities.toolResultFollowUp = COMPATIBILITY.UNSUPPORTED;
    }
  }

  // Ollama version
  try {
    const verRes = await fetchImpl(`${baseUrl}/api/version`, { signal: AbortSignal.timeout(5000) });
    if (verRes.ok) {
      const verData = await verRes.json();
      ollamaVersion = verData.version || "unknown";
    }
  } catch {}

  const probe = {
    schemaVersion: "benchmark.model_capability_probe.v1",
    probeId: `${modelId}-probe-${Date.now()}`,
    modelId,
    runtime: "ollama",
    runtimeModelName,
    runtimeVersion: ollamaVersion,
    adapterVersion: "1.0.0",
    probeVersion: PROBE_VERSION,
    probeTimestamp: new Date().toISOString(),
    declaredCapabilities,
    verifiedCapabilities,
    compatibility,
    latency,
    timeouts,
    rawEvidence: rawEvidence.map((r) => ({ label: r.label, requestBodyPrefix: r.requestBody.substring(0, 200), responseContentPrefix: (r.responseMsg?.content || "").substring(0, 200), toolCallCount: (r.responseMsg?.tool_calls || []).length, standardFormat: !!(r.responseMsg?.tool_calls) })),
    createdAt: new Date().toISOString(),
    probeDurationMs: Date.now() - startedAt
  };

  return probe;
}

function parseArgs(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try { return JSON.parse(raw); } catch { return {}; }
}

async function loadManifest(modelId) {
  const repoRoot = path.resolve(__dirname, "..", "..", "..");
  const manifestPath = path.join(repoRoot, "benchmark-lab", "models", "manifests", `${modelId}.json`);
  return JSON.parse(await fs.readFile(manifestPath, "utf8"));
}

function getProbeCacheDir() {
  return path.resolve(__dirname, "..", "..", "..", "benchmark-lab", "evidence", "probes");
}

async function saveProbeRecord(probe) {
  const dir = path.join(getProbeCacheDir(), probe.modelId);
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${probe.probeId}.json`);
  await fs.writeFile(filePath, JSON.stringify(probe, null, 2), "utf8");
  return filePath;
}

async function loadLatestProbe(modelId, runtimeModelName, ollamaVersion) {
  const dir = path.join(getProbeCacheDir(), modelId);
  try {
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json")).sort().reverse();
    for (const file of files) {
      const probe = JSON.parse(await fs.readFile(path.join(dir, file), "utf8"));
      if (probe.runtimeModelName === runtimeModelName && probe.runtimeVersion === ollamaVersion && probe.probeVersion === PROBE_VERSION) {
        return probe;
      }
    }
  } catch {}
  return null;
}

function checkSuiteRequirements(suiteConfig, probe) {
  const required = suiteConfig.requiredModelCapabilities || [];
  const optional = suiteConfig.optionalModelCapabilities || [];
  const requiredVerified = required.filter((r) => r !== "guidedJson");
  const allRequired = requiredVerified.every((r) => probe.verifiedCapabilities[r] === COMPATIBILITY.SUPPORTED);
  if (!allRequired) {
    const missing = requiredVerified.filter((r) => probe.verifiedCapabilities[r] !== COMPATIBILITY.SUPPORTED);
    return { eligible: false, missingCapabilities: missing, reason: "Missing required capabilities: " + missing.join(", ") };
  }
  return { eligible: true, missingCapabilities: [] };
}

module.exports = {
  probeModel,
  saveProbeRecord,
  loadLatestProbe,
  checkSuiteRequirements,
  COMPATIBILITY,
  REASON_CODES
};
