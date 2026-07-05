const path = require("node:path");
const { EXECUTION_POLICIES, EXECUTION_MODES, resolvePolicy, buildExecutionPlan, buildPolicyMessage, buildConstrainedMessage, POLICY_BY_SCENARIO } = require("../benchmark-lab/locaily/tracks/basic-tool-use/execution-router");

const ROOT = path.resolve(__dirname, "..");

async function main() {
  let total = 0;

  // === 1. Policy resolution ===
  assert(resolvePolicy("tc-05") === EXECUTION_POLICIES.DATE_RESOLUTION_REQUIRED, "tc-05 policy");
  assert(resolvePolicy("tc-10") === EXECUTION_POLICIES.DIRECT_RESPONSE, "tc-10 policy");
  assert(resolvePolicy("tc-11") === EXECUTION_POLICIES.DIRECT_RESPONSE, "tc-11 policy");
  assert(resolvePolicy("tc-12") === EXECUTION_POLICIES.REFUSAL_REQUIRED, "tc-12 policy");
  assert(resolvePolicy("tc-64") === EXECUTION_POLICIES.STRUCTURED_RESPONSE, "tc-64 policy");
  assert(resolvePolicy("tc-65") === EXECUTION_POLICIES.TOOL_THEN_STRUCTURED_RESPONSE, "tc-65 policy");
  assert(resolvePolicy("tc-01") === EXECUTION_POLICIES.NATIVE, "default policy should be NATIVE");
  total += 7;
  console.log("ok policy resolution");

  // === 2. Mode A - Native plan ===
  const mockTools = [
    { type: "function", function: { name: "get_weather", parameters: { type: "object", properties: { location: { type: "string" } } } } },
    { type: "function", function: { name: "resolve_relative_date", parameters: { type: "object", properties: { referenceDate: { type: "string" }, expression: { type: "string" } } } } },
    { type: "function", function: { name: "create_calendar_event", parameters: { type: "object", properties: { title: { type: "string" }, date: { type: "string" } } } } }
  ];
  const mockScenario = { id: "tc-05", outputSchema: null };
  const nativePlan = buildExecutionPlan("tc-05", EXECUTION_MODES.NATIVE, mockScenario, mockTools);
  assert(nativePlan.executionMode === "native", "native mode");
  assert(nativePlan.policy === "NATIVE", "native policy");
  assert(nativePlan.runtimeConstrained === false, "native not constrained");
  assert(nativePlan.policyInstructed === false, "native not policy-instructed");
  assert(nativePlan.exposedTools.length === 3, "native has all 3 tools");
  assert(nativePlan.responseMode === "text", "native response mode text");
  total += 6;
  console.log("ok native plan");

  // === 3. Mode B - Policy-routed plan (TC-05 DATE_RESOLUTION_REQUIRED) ===
  const policyPlan = buildExecutionPlan("tc-05", EXECUTION_MODES.POLICY_ROUTED, mockScenario, mockTools);
  assert(policyPlan.executionMode === "policy-routed", "policy-routed mode");
  assert(policyPlan.policy === "DATE_RESOLUTION_REQUIRED", "policy-routed policy");
  assert(policyPlan.runtimeConstrained === false, "policy-routed not constrained");
  assert(policyPlan.policyInstructed === true, "policy-routed policy-instructed");
  assert(policyPlan.policyMessage !== null, "policy-routed has message");
  assert(policyPlan.policyMessage.includes("DATE_RESOLUTION_REQUIRED"), "policy message contains policy id");
  const ptools = Array.isArray(policyPlan.exposedTools) ? policyPlan.exposedTools : [];
  assert(ptools.length === 3, "policy-routed has all tools");
  assert(policyPlan.stages === null, "policy-routed has no stages");
  total += 8;
  console.log("ok policy-routed plan");

  // === 4. Mode C - Runtime-constrained plan (TC-05 DATE_RESOLUTION_REQUIRED) ===
  const constrainedPlan = buildExecutionPlan("tc-05", EXECUTION_MODES.RUNTIME_CONSTRAINED, mockScenario, mockTools);
  assert(constrainedPlan.executionMode === "runtime-constrained", "runtime-constrained mode");
  assert(constrainedPlan.runtimeConstrained === true, "runtime-constrained flag");
  assert(constrainedPlan.stages !== null, "runtime-constrained has stages");
  assert(constrainedPlan.stages.length === 2, "runtime-constrained has 2 stages");
  assert(constrainedPlan.stages[0].turn === 0, "stage 0 turn 0");
  assert(constrainedPlan.stages[0].tools[0].function.name === "resolve_relative_date", "stage 0 has resolve_relative_date");
  assert(constrainedPlan.stages[1].turn === 1, "stage 1 turn 1");
  assert(constrainedPlan.policyMessage.includes("resolve_relative_date"), "constrained message mentions date tool");
  total += 8;
  console.log("ok runtime-constrained plan (TC-05)");

  // === 5. Mode C - Runtime-constrained DIRECT_RESPONSE (TC-10) ===
  const directPlan = buildExecutionPlan("tc-10", EXECUTION_MODES.RUNTIME_CONSTRAINED, { id: "tc-10" }, mockTools);
  const directTools = Array.isArray(directPlan.exposedTools) ? directPlan.exposedTools : [];
  assert(directTools.length === 0, "direct response: no tools");
  assert(directPlan.responseMode === "text", "direct response: text mode");
  total += 2;
  console.log("ok runtime-constrained DIRECT_RESPONSE");

  // === 6. Mode C - Runtime-constrained REFUSAL_REQUIRED (TC-12) ===
  const refusalPlan = buildExecutionPlan("tc-12", EXECUTION_MODES.RUNTIME_CONSTRAINED, { id: "tc-12" }, mockTools);
  const rTools = Array.isArray(refusalPlan.exposedTools) ? refusalPlan.exposedTools : [];
  assert(rTools.length === 0, "refusal: no tools");
  assert(refusalPlan.responseMode === "refusal", "refusal mode");
  assert(refusalPlan.policyMessage.includes("cannot") || refusalPlan.policyMessage.includes("refuse"), "refusal message");
  total += 3;
  console.log("ok runtime-constrained REFUSAL_REQUIRED");

  // === 7. Mode C - Runtime-constrained STRUCTURED_RESPONSE (TC-64) ===
  const tc64Scenario = { id: "tc-64", outputSchema: { type: "object", required: ["movie_review"], properties: {} } };
  const structuredPlan = buildExecutionPlan("tc-64", EXECUTION_MODES.RUNTIME_CONSTRAINED, tc64Scenario, mockTools);
  const sTools = Array.isArray(structuredPlan.exposedTools) ? structuredPlan.exposedTools : [];
  assert(sTools.length === 0, "structured: no tools");
  assert(structuredPlan.responseMode === "json_schema", "structured: json_schema mode");
  assert(structuredPlan.responseSchema !== null, "structured: has schema");
  assert(structuredPlan.responseSchema.type === "object", "structured: schema is object");
  total += 4;
  console.log("ok runtime-constrained STRUCTURED_RESPONSE");

  // === 8. Mode C - Runtime-constrained TOOL_THEN_STRUCTURED_RESPONSE (TC-65) ===
  const tc65Scenario = { id: "tc-65", outputSchema: { type: "object", required: ["location"], properties: {} } };
  const toolSchemaPlan = buildExecutionPlan("tc-65", EXECUTION_MODES.RUNTIME_CONSTRAINED, tc65Scenario, mockTools);
  const tsTools = Array.isArray(toolSchemaPlan.exposedTools) ? toolSchemaPlan.exposedTools : [];
  assert(tsTools.length > 0, "tool-schema: has tools");
  const weather = toolSchemaPlan.exposedTools.find((t) => t.function?.name === "get_weather");
  assert(weather, "tool-schema: has weather tool");
  assert(toolSchemaPlan.responseMode === "json_schema", "tool-schema: json_schema");
  assert(toolSchemaPlan.stages !== null, "tool-schema: has stages");
  assert(toolSchemaPlan.stages[0].tools.length > 0, "tool-schema stage 0: has tools");
  assert(!toolSchemaPlan.stages[1].tools || toolSchemaPlan.stages[1].tools.length === 0, "tool-schema stage 1: no tools");
  total += 6;
  console.log("ok runtime-constrained TOOL_THEN_STRUCTURED_RESPONSE");

  // === 9. Policy messages are non-empty for all non-NATIVE policies ===
  for (const [key, policy] of Object.entries(EXECUTION_POLICIES)) {
    if (policy !== EXECUTION_POLICIES.NATIVE) {
      const msg = buildPolicyMessage(policy);
      assert(msg && msg.length > 10, `Policy message for ${policy} should be non-empty`);
    }
  }
  total += Object.keys(EXECUTION_POLICIES).length - 1;
  console.log("ok policy messages");

  // === 10. Constrained messages for all non-NATIVE policies ===
  for (const [key, policy] of Object.entries(EXECUTION_POLICIES)) {
    if (policy !== EXECUTION_POLICIES.NATIVE) {
      const msg = buildConstrainedMessage(policy);
      assert(msg && msg.length > 10, `Constrained message for ${policy} should be non-empty`);
    }
  }
  total += Object.keys(EXECUTION_POLICIES).length - 1;
  console.log("ok constrained messages");

  // === 11. POLICY_BY_SCENARIO covers all 6 target scenarios ===
  const targetIds = ["tc-05", "tc-10", "tc-11", "tc-12", "tc-64", "tc-65"];
  for (const id of targetIds) {
    assert(POLICY_BY_SCENARIO[id] !== undefined, `Policy defined for ${id}`);
  }
  total += targetIds.length;
  console.log("ok policy coverage");

  console.log(`\n--- All ${total} mode comparison tests passed ---`);
}

let passed = 0;
function assert(condition, msg) {
  if (!condition) { console.error(`FAIL: ${msg}`); throw new Error(msg); }
  passed++;
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
