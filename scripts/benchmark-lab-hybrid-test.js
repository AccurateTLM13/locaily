const path = require("node:path");
const { registerTransformer, getTransformer, transform } = require("../benchmark-lab/engine/transforms/transform-registry");
const { gateModelForSuite } = require("../benchmark-lab/engine/probes/probe-gating");
const { validateSchema } = require("../benchmark-lab/engine/schema-validator");
const { readJson } = require("../benchmark-lab/engine/fs-utils");

const ROOT = path.resolve(__dirname, "..");
const TRANSFORMER_PATH = path.join(ROOT, "benchmark-lab", "engine", "transforms", "weather-tool-result-to-report.js");

async function main() {
  registerTransformer("weather-tool-result-to-report", TRANSFORMER_PATH, "1.0.0");
  let total = 0;

  // === 1. Transformer identity ===
  const entry = getTransformer("weather-tool-result-to-report");
  assert(entry.transformerId === "weather-tool-result-to-report", "ID match");
  assert(entry.version === "1.0.0", "Version match");
  assert(entry.checksum.startsWith("sha256:"), "Has checksum");
  total += 3;
  console.log("ok transformer identity");

  // === 2. Valid transform ===
  const r = transform("weather-tool-result-to-report", { location: "Tokyo", temperature_celsius: 18, condition: "Partly Cloudy" });
  assert(r.ok === true, "Valid transform ok");
  assert(r.output.temperature_celsius === 18, "Temp preserved");
  assert(r.output.recommendation === "Bring a light jacket.", "Recommendation correct");
  total += 3;
  console.log("ok valid transform");

  // === 3. String coercion ===
  const r2 = transform("weather-tool-result-to-report", { location: "Tokyo", temperature_celsius: "18", condition: "Cloudy" });
  assert(r2.ok === true, "String coercion ok");
  assert(r2.output.temperature_celsius === 18, "Coerced value correct");
  total += 2;
  console.log("ok string coercion");

  // === 4. Missing field fail ===
  const r3 = transform("weather-tool-result-to-report", { location: "Tokyo", condition: "Cloudy" });
  assert(r3.ok === false, "Missing field fails");
  total++;
  console.log("ok missing field");

  // === 5. Invalid temperature ===
  const r4 = transform("weather-tool-result-to-report", { location: "Tokyo", temperature_celsius: "eighteen", condition: "Cloudy" });
  assert(r4.ok === false, "Invalid temperature fails");
  total++;
  console.log("ok invalid temperature");

  // === 6. Extra metadata ignored ===
  const r5 = transform("weather-tool-result-to-report", { location: "Tokyo", temperature_celsius: 18, condition: "Cloudy", request_id: "abc", humidity: 80 });
  assert(r5.ok === true, "Extra metadata ok");
  assert(Object.keys(r5.output).length === 4, "Output has 4 fields only");
  assert(r5.diagnostics.ignoredSourceFields.length >= 1, "Ignored fields tracked");
  total += 3;
  console.log("ok extra metadata ignored");

  // === 7. Null input ===
  const r6 = transform("weather-tool-result-to-report", null);
  assert(r6.ok === false, "Null fails");
  total++;
  console.log("ok null input");

  // === 8. Schema validation (new enums) ===
  const schema = await readJson(path.join(ROOT, "benchmark-lab", "schemas", "benchmark-case.schema.json"));
  const validHybrid = {
    caseId: "loc-hybrid-001", trackId: "hybrid-weather", input: { text: "test" }, expected: { label: "extract" },
    executionPolicy: "TOOL_THEN_DETERMINISTIC_TRANSFORM",
    responseMode: "deterministic_schema",
    supportMode: "hybrid-deterministic",
    transformerId: "weather-tool-result-to-report",
    transformerVersion: "1.0.0",
    transformerChecksum: "sha256:abc123"
  };
  const vResult = validateSchema(validHybrid, schema, "valid-hybrid");
  assert(vResult.ok === true, "Hybrid case schema valid: " + vResult.errors.join(" "));
  total++;
  console.log("ok hybrid schema valid");

  // === 9. Invalid hybrid values ===
  const invalidHybrid = {
    caseId: "loc-hybrid-002", trackId: "hybrid-weather", input: { text: "test" }, expected: { label: "extract" },
    executionPolicy: "INVALID_POLICY",
    responseMode: "INVALID_MODE",
    supportMode: "INVALID_MODE"
  };
  const iResult = validateSchema(invalidHybrid, schema, "invalid-hybrid");
  assert(iResult.ok === false, "Invalid hybrid fails");
  total++;
  console.log("ok hybrid schema invalid");

  // === 10. Existing fixtures still valid ===
  const existingValid = await readJson(path.join(ROOT, "benchmark-lab", "schemas", "fixtures", "benchmark-case.valid.json"));
  const eResult = validateSchema(existingValid, schema, "existing-valid");
  assert(eResult.ok === true, "Existing fixture still valid: " + eResult.errors.join(" "));
  total++;
  console.log("ok existing fixture unchanged");

  // === 11. LOC-HYBRID-WEATHER-001 evaluator tests ===
  const scenarioModule = require(path.join(ROOT, "benchmark-lab", "locaily", "tracks", "basic-tool-use", "scenarios.js"));
  const scenarios = scenarioModule.SCENARIO_REGISTRY;
  const hybridScenario = scenarios.find((s) => s.id === "loc-hybrid-weather-001");
  assert(hybridScenario !== undefined, "LOC-HYBRID-WEATHER-001 found");
  assert(hybridScenario.transformerId === "weather-tool-result-to-report", "Transfomer ID set");
  assert(hybridScenario.executionPolicy === "TOOL_THEN_DETERMINISTIC_TRANSFORM", "Execution policy set");
  assert(hybridScenario.responseMode === "deterministic_schema", "Response mode set");
  assert(hybridScenario.supportMode === "hybrid-deterministic", "Support mode set");
  total += 5;
  console.log("ok LOC-HYBRID-WEATHER-001 definition");

  // === 12. Hybrid evaluator - PASS case ===
  const passState = { toolCalls: [{ name: "get_weather", arguments: { location: "Tokyo" } }], assistantMessages: [], messages: [] };
  const passResult = hybridScenario.evaluate(passState);
  assert(passResult.verdict === "PASS", "Hybrid PASS");
  assert(passResult.details.toolSelected === true, "Tool selected");
  assert(passResult.details.locationCorrect === true, "Location correct");
  total += 3;
  console.log("ok hybrid PASS evaluation");

  // === 13. Hybrid evaluator - FAIL (no tool) ===
  const failState = { toolCalls: [], assistantMessages: [], messages: [] };
  const failResult = hybridScenario.evaluate(failState);
  assert(failResult.verdict === "FAIL", "Hybrid FAIL (no tool)");
  total++;
  console.log("ok hybrid FAIL (no tool call)");

  // === 14. Hybrid evaluator - PARTIAL (hallucinated tool) ===
  const partialState = { toolCalls: [{ name: "get_weather", arguments: { location: "Tokyo" } }, { name: "send_email", arguments: {} }], assistantMessages: [], messages: [] };
  const partialResult = hybridScenario.evaluate(partialState);
  assert(partialResult.verdict === "PARTIAL", "Hybrid PARTIAL (hallucinated)");
  total++;
  console.log("ok hybrid PARTIAL (hallucinated tool)");

  // === 15. Probe gating - suite requirements ===
  const probeSuite = {
    requiredModelCapabilities: ["chatCompletion", "nativeToolCalls"],
    optionalModelCapabilities: ["guidedJson"]
  };
  const fullProbe = { verifiedCapabilities: { chatCompletion: "SUPPORTED", nativeToolCalls: "SUPPORTED" } };
  const { checkSuiteRequirements } = require("../benchmark-lab/engine/probes/model-capability-probe");
  const chk = checkSuiteRequirements(probeSuite, fullProbe);
  assert(chk.eligible === true, "Eligible suite passes");
  total++;
  console.log("ok suite requirements eligible");

  // === 16. Suite requirements ineligible ===
  const emptyProbe = { verifiedCapabilities: { chatCompletion: "SUPPORTED" } };
  const chk2 = checkSuiteRequirements(probeSuite, emptyProbe);
  assert(chk2.eligible === false, "Ineligible suite fails");
  total++;
  console.log("ok suite requirements ineligible");

  console.log(`\n--- All ${total} hybrid integration tests passed ---`);
}

function assert(condition, msg) {
  if (!condition) { console.error("FAIL:", msg); throw new Error(msg); }
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
