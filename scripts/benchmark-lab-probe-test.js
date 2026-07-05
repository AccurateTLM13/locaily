const path = require("node:path");
const fs = require("node:fs/promises");
const { validateSchema } = require("../benchmark-lab/engine/schema-validator");
const { probeModel, saveProbeRecord, loadLatestProbe, checkSuiteRequirements, COMPATIBILITY } = require("../benchmark-lab/engine/probes/model-capability-probe");
const { readJson } = require("../benchmark-lab/engine/fs-utils");

const ROOT = path.resolve(__dirname, "..");
const PROBE_SCHEMA_PATH = path.join(ROOT, "benchmark-lab", "schemas", "model-capability-probe.schema.json");

async function main() {
  let total = 0;

  // === 1. Probe schema exists and is valid ===
  const schema = await readJson(PROBE_SCHEMA_PATH);
  assert(schema.schemaVersion === undefined, "Schema has no schemaVersion const"); // meta check
  assert(schema.title === "Model Capability Probe", "Schema title");
  assert(schema.required.includes("verifiedCapabilities"), "Schema requires verifiedCapabilities");
  total++;
  console.log("ok probe schema exists");

  // === 2. Probe schema rejects invalid data ===
  const invalidProbe = { schemaVersion: "wrong", modelId: "test" };
  const badResult = validateSchema(invalidProbe, schema, "invalid-probe");
  assert(!badResult.ok, "Invalid probe should fail validation");
  total++;
  console.log("ok probe schema rejects invalid");

  // === 3. Probe model with mock fetch (full capability) ===
  const fullMock = createMockFetch(true, true);
  const fullProbe = await probeModel({
    modelId: "mock-full",
    runtimeModelName: "mock-full",
    baseUrl: "http://localhost:11434",
    requestTimeoutMs: 5000,
    fetchImpl: fullMock
  });
  assert(fullProbe.probeId.startsWith("mock-full"), "Probe ID prefix");
  assert(fullProbe.verifiedCapabilities.textCompletion === "SUPPORTED", "Text completion supported");
  assert(fullProbe.verifiedCapabilities.chatCompletion === "SUPPORTED", "Chat completion supported");
  assert(fullProbe.verifiedCapabilities.nativeToolCalls === "SUPPORTED", "Native tool calls supported");
  assert(fullProbe.verifiedCapabilities.toolArguments === "SUPPORTED", "Tool arguments supported");
  total += 5;
  console.log("ok full capability probe");

  // === 4. Probe model with mock fetch (no tools) ===
  const noToolMock = createMockFetch(true, false);
  const noToolProbe = await probeModel({
    modelId: "mock-notools",
    runtimeModelName: "mock-notools",
    baseUrl: "http://localhost:11434",
    requestTimeoutMs: 5000,
    fetchImpl: noToolMock
  });
  assert(noToolProbe.verifiedCapabilities.nativeToolCalls === "UNSUPPORTED", "No tools unsupported");
  assert(noToolProbe.verifiedCapabilities.toolArguments === "UNSUPPORTED", "Tool args unsupported");
  total += 2;
  console.log("ok no-tool probe");

  // === 5. Probe model with nonstandard XML tool output ===
  const xmlMock = createMockFetch(true, true, true);
  const xmlProbe = await probeModel({
    modelId: "mock-xml",
    runtimeModelName: "mock-xml",
    baseUrl: "http://localhost:11434",
    requestTimeoutMs: 5000,
    fetchImpl: xmlMock
  });
  assert(xmlProbe.verifiedCapabilities.nativeToolCalls === "INCOMPATIBLE_FORMAT", "XML tool format detected");
  total++;
  console.log("ok XML format detection");

  // === 6. Probe with timeout ===
  const timeoutMock = createMockFetch(false, false, false, true);
  const timeoutResult = await Promise.race([
    probeModel({
      modelId: "mock-timeout",
      runtimeModelName: "mock-timeout",
      baseUrl: "http://localhost:11434",
      requestTimeoutMs: 200,
      fetchImpl: timeoutMock
    }),
    new Promise((_, rej) => setTimeout(() => rej(new Error("Probe model call timed out")), 10000))
  ]);
  const timeoutProbe = timeoutResult;
  assert(timeoutProbe.timeouts.length > 0, "Timeouts recorded");
  // At least one capability should show TIMEOUT
  const hasTimeout = Object.values(timeoutProbe.verifiedCapabilities).some((v) => v === "TIMEOUT");
  assert(hasTimeout, "At least one capability should timeout");
  total += 2;
  console.log("ok timeout probe");

  // === 7. Save and load cached probe ===
  const savedPath = await saveProbeRecord(fullProbe);
  assert(savedPath.includes("mock-full"), "Saved path includes model ID");
  const cached = await loadLatestProbe("mock-full", "mock-full", "unknown");
  assert(cached !== null, "Cached probe loaded");
  assert(cached.probeId === fullProbe.probeId, "Cached probe matches");
  total += 3;
  console.log("ok probe cache");

  // === 8. Suite requirement matching (eligible) ===
  const eligibleSuite = {
    requiredModelCapabilities: ["chatCompletion", "nativeToolCalls"],
    optionalModelCapabilities: ["guidedJson"]
  };
  const checkPass = checkSuiteRequirements(eligibleSuite, fullProbe);
  assert(checkPass.eligible === true, "Eligible suite should pass");
  assert(checkPass.missingCapabilities.length === 0, "No missing capabilities");
  total += 2;
  console.log("ok suite requirements - eligible");

  // === 9. Suite requirement matching (ineligible) ===
  const strictSuite = {
    requiredModelCapabilities: ["chatCompletion", "nativeToolCalls", "nonexistentCapability"]
  };
  const checkFail = checkSuiteRequirements(strictSuite, noToolProbe);
  assert(checkFail.eligible === false, "Ineligible suite should fail");
  total++;
  console.log("ok suite requirements - ineligible");

  // === 10. Cleanup test artifacts ===
  const probeDir = path.join(ROOT, "benchmark-lab", "evidence", "probes");
  await fs.rm(path.join(probeDir, "mock-full"), { recursive: true, force: true });
  await fs.rm(path.join(probeDir, "mock-notools"), { recursive: true, force: true });
  await fs.rm(path.join(probeDir, "mock-xml"), { recursive: true, force: true });
  await fs.rm(path.join(probeDir, "mock-timeout"), { recursive: true, force: true });
  total++;
  console.log("ok probe cache cleanup");

  console.log(`\n--- All ${total} probe tests passed ---`);
}

function createMockFetch(succeed, withTools, xmlFormat, timeout) {
  return async (url, request) => {
    if (timeout) {
      // Simulate a hanging request by returning a promise that waits for the signal
      return new Promise((resolve, reject) => {
        const sig = request?.signal;
        if (sig && typeof sig.addEventListener === "function") {
          sig.addEventListener("abort", () => {
            const e = new Error("The operation was aborted");
            e.name = "AbortError";
            reject(e);
          }, { once: true });
        } else {
          // If no signal available, reject after a delay
          setTimeout(() => {
            const e = new Error("The operation was aborted");
            e.name = "AbortError";
            reject(e);
          }, 100);
        }
      });
    }

    const body = JSON.parse(request.body || "{}");
    const isToolRequest = body.tools && body.tools.length > 0;
    const isFormatRequest = body.format;
    const messages = body.messages || [];
    const lastUserMsg = messages.filter((m) => m.role === "user").pop()?.content || "";
    const usesCalendarTool = body.tools && body.tools.some((t) => t.function?.name === "create_calendar_event");

    if (succeed && isFormatRequest) {
      return {
        ok: true,
        json: async () => ({
          model: "mock",
          message: { role: "assistant", content: JSON.stringify({ answer: "Hello" }) },
          done_reason: "stop"
        })
      };
    }

    if (succeed && isToolRequest && xmlFormat) {
      return {
        ok: true,
        json: async () => ({
          model: "mock",
          message: { role: "assistant", content: "<parallel>\n{\"name\":\"get_weather\",\"arguments\":[\"Berlin\"]}\n</parallel>" },
          done_reason: "stop"
        })
      };
    }

    if (succeed && isToolRequest && withTools) {
      if (usesCalendarTool) {
        return {
          ok: true,
          json: async () => ({
            model: "mock",
            message: {
              role: "assistant",
              content: "",
              tool_calls: [{ id: "call_002", function: { name: "create_calendar_event", arguments: { title: "Standup", date: "2026-03-23" } } }]
            },
            done_reason: "stop"
          })
        };
      }
      return {
        ok: true,
        json: async () => ({
          model: "mock",
          message: {
            role: "assistant",
            content: "",
            tool_calls: [{ id: "call_001", function: { name: "get_weather", arguments: { location: "Berlin" } } }]
          },
          done_reason: "stop"
        })
      };
    }

    if (succeed) {
      return {
        ok: true,
        json: async () => ({
          model: "mock",
          message: { role: "assistant", content: "Hello!" },
          done_reason: "stop"
        })
      };
    }

    return { ok: false, status: 500, json: async () => ({}) };
  };
}

function assert(condition, msg) {
  if (!condition) { console.error("FAIL:", msg); throw new Error(msg); }
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
