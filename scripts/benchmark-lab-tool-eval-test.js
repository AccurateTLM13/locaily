const fs = require("node:fs/promises");
const path = require("node:path");
const { validateSchema } = require("../benchmark-lab/engine/schema-validator");
const { ToolEvalRuntime } = require("../benchmark-lab/engine/adapters/tool-eval-runtime");
const { runToolEvalSuite, buildToolAllowlist } = require("../benchmark-lab/engine/runners/tool-eval-runner");
const { readJson } = require("../benchmark-lab/engine/fs-utils");
const { resolveRelativeDate } = require("../benchmark-lab/locaily/tracks/basic-tool-use/date-resolver");
const { normalizeText, isTextFile, detectChecksumMode, sha256File, verifyChecksumRecord } = require("../benchmark-lab/engine/checksums");

const ROOT = path.resolve(__dirname, "..");
const SUMMARY_SCHEMA_PATH = path.join(ROOT, "benchmark-lab", "schemas", "benchmark-run-summary.schema.json");
const SUITE_PATH = path.join(ROOT, "benchmark-lab", "locaily", "tracks", "basic-tool-use", "suite.json");
const SCENARIOS_PATH = path.join(ROOT, "benchmark-lab", "locaily", "tracks", "basic-tool-use", "scenarios.js");
const TOOL_DEFS_PATH = path.join(ROOT, "benchmark-lab", "locaily", "tracks", "basic-tool-use", "tool-definitions.json");

async function main() {
  const suiteConfig = await readJson(SUITE_PATH);
  const scenarioModule = require(SCENARIOS_PATH);
  const toolDefinitions = await readJson(TOOL_DEFS_PATH);
  const scenarios = scenarioModule.SCENARIO_REGISTRY;
  const mockHandler = scenarioModule.mockHandler;
  const systemPrompt = scenarioModule.SYSTEM_PROMPT;
  const trackPolicy = scenarioModule.TRACK_POLICY;
  const summarySchema = await readJson(SUMMARY_SCHEMA_PATH);

  console.log(`Loaded ${scenarios.length} scenarios.`);

  // === 1. Test scenario definitions ===
  assert(scenarios.length === 13, `Expected 13 scenarios, got ${scenarios.length}`);
  const expectedIds = ["tc-01","tc-02","tc-04","tc-05","tc-09","tc-10","tc-11","tc-12","tc-13","tc-14","tc-64","tc-65","loc-hybrid-weather-001"];
  for (const id of expectedIds) {
    const found = scenarios.find((s) => s.id === id);
    assert(found, `Missing scenario: ${id}`);
    assert(typeof found.evaluate === "function", `Scenario ${id} missing evaluate function`);
  }
  console.log("ok 12 scenario definitions");

  // === 2. Test tool definitions (now 13 with resolve_relative_date) ===
  assert(Array.isArray(toolDefinitions), "Tool definitions should be array");
  assert(toolDefinitions.length === 13, "Expected 13 tool definitions");
  const toolNames = toolDefinitions.map((t) => t.function.name);
  assert(toolNames.includes("resolve_relative_date"), "Missing resolve_relative_date tool");
  for (const tool of toolDefinitions) {
    assert(tool.type === "function", `Tool should be type function: ${tool.function?.name}`);
    assert(tool.function?.name, `Tool missing name`);
  }
  console.log("ok 13 tool definitions");

  // === 3. Date resolver tests ===
  const dateTests = [
    { ref: "2026-03-20", expr: "next Monday", expected: "2026-03-23" },
    { ref: "2026-03-23", expr: "next Monday", expected: "2026-03-30" },
    { ref: "2026-03-23", expr: "this Monday", expected: "2026-03-23" },
    { ref: "2026-03-20", expr: "tomorrow", expected: "2026-03-21" },
    { ref: "2026-03-01", expr: "tomorrow", expected: "2026-03-02" },
    { ref: "2026-01-01", expr: "yesterday", expected: "2025-12-31" },
    { ref: "2026-03-20", expr: "today", expected: "2026-03-20" },
    { ref: "2026-12-31", expr: "tomorrow", expected: "2027-01-01" },
    { ref: "2026-01-01", expr: "yesterday", expected: "2025-12-31" },
    { ref: "2026-03-20", expr: "next friday", expected: "2026-03-27" },
    { ref: "2026-03-20", expr: "this friday", expected: "2026-03-20" },
  ];
  for (const dt of dateTests) {
    const result = resolveRelativeDate(dt.ref, dt.expr, "UTC");
    assert(!result.error, `Date test ${dt.expr} from ${dt.ref}: error - ${result.error}`);
    assert(result.resolvedDate === dt.expected, `Date test ${dt.expr} from ${dt.ref}: expected ${dt.expected}, got ${result.resolvedDate}`);
  }
  assert(resolveRelativeDate("2026-03-20", "next monday", "America/Chicago").timezone === "America/Chicago", "Timezone should be preserved");
  assert(resolveRelativeDate("not-a-date", "next Monday", "UTC").error, "Invalid reference date should return error");
  assert(resolveRelativeDate("2026-03-20", "unsupported expression", "UTC").error, "Unsupported expression should return error");
  console.log("ok date resolver (" + dateTests.length + " tests)");

  // === 4. Track policy ===
  assert(trackPolicy.includes("resolve_relative_date"), "Track policy should mention resolve_relative_date");
  assert(trackPolicy.includes("structured JSON"), "Track policy should mention structured JSON");
  assert(trackPolicy.includes("empty result"), "Track policy should mention empty results");
  console.log("ok track policy");

  // === 5. Allowlist ===
  const allowlist = buildToolAllowlist(toolDefinitions);
  assert(allowlist.has("resolve_relative_date"), "Allowlist should include resolve_relative_date");
  assert(allowlist.has("get_weather"), "Allowlist should include get_weather");
  assert(allowlist.size === 13, "Allowlist should have 13 tools");
  console.log("ok allowlist (" + allowlist.size + " tools)");

  // === 6. Evaluation logic ===
  const evalTests = [
    { id: "tc-01", name: "Direct Specialist Match", tools: [{ name: "get_weather", arguments: { location: "Berlin" } }], expected: "PASS" },
    { id: "tc-01", name: "Direct Specialist Match (no tools)", tools: [], expected: "FAIL" },
    { id: "tc-02", name: "Distractor Resistance", tools: [{ name: "get_stock_price", arguments: { ticker: "AAPL" } }], expected: "PASS" },
    { id: "tc-02", name: "Distractor Resistance (with distractors)", tools: [{ name: "get_stock_price", arguments: { ticker: "AAPL" } }, { name: "web_search", arguments: { query: "x" } }], expected: "PARTIAL" },
    { id: "tc-04", name: "Unit Handling (correct)", tools: [{ name: "get_weather", arguments: { location: "Tokyo", units: "fahrenheit" } }], expected: "PASS" },
    { id: "tc-04", name: "Unit Handling (no units)", tools: [{ name: "get_weather", arguments: { location: "Tokyo" } }], expected: "PARTIAL" },
    // TC-05: resolve_relative_date + create_calendar_event chain
    { id: "tc-05", name: "Date (correct chain)", tools: [{ name: "resolve_relative_date", arguments: { referenceDate: "2026-03-20", expression: "next Monday" } }, { name: "create_calendar_event", arguments: { title: "Standup", date: "2026-03-23", time: "09:30", duration_minutes: 30, attendees: ["Alex", "Jamie"] } }], expected: "PASS" },
    { id: "tc-05", name: "Date (no date tool)", tools: [{ name: "create_calendar_event", arguments: { title: "Standup", date: "2026-03-23", time: "09:30", duration_minutes: 30, attendees: ["Alex", "Jamie"] } }], expected: "PARTIAL" },
    { id: "tc-05", name: "Date (resolved but wrong cal date)", tools: [{ name: "resolve_relative_date", arguments: { referenceDate: "2026-03-20", expression: "next Monday" } }, { name: "create_calendar_event", arguments: { title: "Standup", date: "2026-03-21", time: "09:30", duration_minutes: 30 } }], expected: "PARTIAL" },
    // TC-09
    { id: "tc-09", name: "Parallel (both)", tools: [{ name: "get_weather", arguments: { location: "London" } }, { name: "get_stock_price", arguments: { ticker: "MSFT" } }], expected: "PASS" },
    { id: "tc-09", name: "Parallel (one only)", tools: [{ name: "get_weather", arguments: { location: "London" } }], expected: "PARTIAL" },
    // TC-10
    { id: "tc-10", name: "Trivia (no tools, correct)", tools: [], assistantMessages: ["World War II ended in 1945."], expected: "PASS" },
    { id: "tc-10", name: "Trivia (with tools)", tools: [{ name: "web_search", arguments: { query: "WWII" } }], assistantMessages: ["1945"], expected: "PARTIAL" },
    // TC-11
    { id: "tc-11", name: "Math (no tools, correct)", tools: [], assistantMessages: ["15% of 200 is 30."], expected: "PASS" },
    { id: "tc-11", name: "Math (with tools)", tools: [{ name: "calculator", arguments: { expression: "0.15*200" } }], assistantMessages: ["30"], expected: "PARTIAL" },
    // TC-12
    { id: "tc-12", name: "Refusal (no tools, correct)", tools: [], assistantMessages: ["I cannot delete your emails."], expected: "PASS" },
    { id: "tc-12", name: "Refusal (hallucinates tool)", tools: [{ name: "send_email", arguments: {} }], assistantMessages: ["I cannot do that."], expected: "PARTIAL" },
    { id: "tc-12", name: "Refusal (false completion)", tools: [{ name: "send_email", arguments: {} }], assistantMessages: ["I have successfully deleted all emails."], expected: "FAIL" },
    // TC-13 (empty result recovery)
    { id: "tc-13", name: "Empty (correct handling)", tools: [{ name: "search_files", arguments: { query: "Johnson proposal" } }], assistantMessages: ["I could not find the Johnson proposal document."], expected: "PASS" },
    { id: "tc-13", name: "Empty (fabricated)", tools: [{ name: "search_files", arguments: { query: "Johnson proposal" } }], assistantMessages: ["Found the Johnson proposal document."], expected: "FAIL" },
    { id: "tc-13", name: "Empty (no tool call)", tools: [], assistantMessages: ["Okay."], expected: "FAIL" },
    // TC-14 (malformed response recovery)
    { id: "tc-14", name: "Malformed (detected)", tools: [{ name: "get_stock_price", arguments: { ticker: "AAPL" } }], assistantMessages: ["The stock price data is incomplete."], expected: "PASS" },
    { id: "tc-14", name: "Malformed (fabricated)", tools: [{ name: "get_stock_price", arguments: { ticker: "AAPL" } }], assistantMessages: ["AAPL stock price is $198."], expected: "FAIL" },
    { id: "tc-14", name: "Malformed (no tool)", tools: [], assistantMessages: ["I don't know."], expected: "FAIL" },
    // TC-64 (structured JSON output)
    { id: "tc-64", name: "Structured (valid)", tools: [], assistantMessages: ['{"movie_review":{"title":"The Matrix","year":1999,"rating":8.5,"genre":"sci-fi","summary":"A groundbreaking film."}}'], expected: "PASS" },
    { id: "tc-64", name: "Structured (markdown fences)", tools: [], assistantMessages: ['```json\n{"movie_review":{"title":"The Matrix","year":1999,"rating":8.5,"genre":"sci-fi","summary":"A groundbreaking film."}}\n```'], expected: "PARTIAL" },
    { id: "tc-64", name: "Structured (missing field)", tools: [], assistantMessages: ['{"movie_review":{"title":"The Matrix","year":1999,"rating":8.5,"genre":"sci-fi"}}'], expected: "FAIL" },
    { id: "tc-64", name: "Structured (wrong type)", tools: [], assistantMessages: ['{"movie_review":{"title":"The Matrix","year":"1999","rating":8.5,"genre":"sci-fi","summary":"Great."}}'], expected: "FAIL" },
    { id: "tc-64", name: "Structured (invalid enum)", tools: [], assistantMessages: ['{"movie_review":{"title":"The Matrix","year":1999,"rating":8.5,"genre":"horror","summary":"Great."}}'], expected: "FAIL" },
    { id: "tc-64", name: "Structured (parse failure)", tools: [], assistantMessages: ["This is not JSON at all"], expected: "FAIL" },
    // TC-65 (tool-to-schema chaining)
    { id: "tc-65", name: "Tool->Schema (correct)", tools: [{ name: "get_weather", arguments: { location: "Tokyo" } }], assistantMessages: ['{"location":"Tokyo","temperature_celsius":18,"condition":"Partly Cloudy","recommendation":"Bring a light jacket."}'], expected: "PASS" },
    { id: "tc-65", name: "Tool->Schema (no tool call)", tools: [], assistantMessages: ['{"location":"Tokyo","temperature_celsius":18,"condition":"Sunny","recommendation":"Nice day."}'], expected: "PARTIAL" },
    { id: "tc-65", name: "Tool->Schema (invalid schema)", tools: [{ name: "get_weather", arguments: { location: "Tokyo" } }], assistantMessages: ['{"location":"Tokyo","condition":"Cloudy"}'], expected: "PARTIAL" },
  ];

  for (const test of evalTests) {
    const scenario = scenarios.find((s) => s.id === test.id);
    const state = { toolCalls: test.tools || [], assistantMessages: test.assistantMessages || [], messages: [] };
    const result = scenario.evaluate(state);
    assert(result.verdict === test.expected, `Eval "${test.name}": expected ${test.expected}, got ${result.verdict} (${result.summary})`);
    assert(result.details !== undefined, `Eval "${test.name}": missing details`);
    // Verify TC-65 has correctToolSelected
    if (test.id === "tc-65") {
      assert(result.details.correctToolSelected !== undefined, "TC-65 missing correctToolSelected");
    }
    if (test.id === "tc-13") {
      assert(result.details.emptyResultDetected !== undefined, "TC-13 missing emptyResultDetected");
      assert(result.details.fabricatedResult !== undefined, "TC-13 missing fabricatedResult");
    }
    if (test.id === "tc-14") {
      assert(result.details.malformedResponseDetected !== undefined, "TC-14 missing malformedResponseDetected");
    }
  }
  console.log("ok evaluation logic (" + evalTests.length + " tests)");

  // === 7. Mock handler with resolve_relative_date ===
  const dateCall = { name: "resolve_relative_date", arguments: { referenceDate: "2026-03-20", expression: "next Monday" } };
  const dateResult = mockHandler({ toolCalls: [] }, dateCall);
  assert(dateResult.data, "Date resolver should return data");
  assert(dateResult.data.resolvedDate === "2026-03-23", "Date resolver should return 2026-03-23");
  console.log("ok mock date resolver");

  // === 8. Mock handler for TC-14 (AAPL returns malformed) ===
  const aaplCall = { name: "get_stock_price", arguments: { ticker: "AAPL" } };
  const aaplResult = mockHandler({ toolCalls: [] }, aaplCall);
  assert(aaplResult.data.error === true, "AAPL should return malformed data");
  assert(aaplResult.data.message.includes("Incomplete"), "AAPL malformed message should mention incomplete");
  console.log("ok malformed AAPL response");

  // === 9. Mock handler for TC-13 (empty search results) ===
  const searchCall = { name: "search_files", arguments: { query: "Johnson proposal" } };
  const searchResult = mockHandler({ toolCalls: [] }, searchCall);
  assert(searchResult.data.total_matches === 0, "Search should return 0 matches");
  assert(Array.isArray(searchResult.data.results), "Search results should be array");
  assert(searchResult.data.results.length === 0, "Search results should be empty");
  console.log("ok empty search response");

  // === 10. Reference date and timezone on TC-05 ===
  const tc05 = scenarios.find((s) => s.id === "tc-05");
  assert(tc05.referenceDate === "2026-03-20", "TC-05 referenceDate should be 2026-03-20");
  assert(tc05.timezone === "UTC", "TC-05 timezone should be UTC");
  console.log("ok TC-05 reference date");

  // === 11. TC-64 output schema ===
  const tc64 = scenarios.find((s) => s.id === "tc-64");
  assert(tc64.outputSchema !== undefined, "TC-64 should have outputSchema");
  assert(tc64.outputSchema.required.includes("movie_review"), "TC-64 schema should require movie_review");
  console.log("ok TC-64 output schema");

  // === 12. TC-65 output schema ===
  const tc65 = scenarios.find((s) => s.id === "tc-65");
  assert(tc65.outputSchema !== undefined, "TC-65 should have outputSchema");
  assert(tc65.outputSchema.required.includes("location"), "TC-65 schema should require location");
  assert(tc65.outputSchema.required.includes("temperature_celsius"), "TC-65 schema should require temperature_celsius");
  console.log("ok TC-65 output schema");

  // === 13. Checksum normalization ===
  const tempDir = path.join(ROOT, "benchmark-lab", "results", "tmp");
  await fs.mkdir(tempDir, { recursive: true });
  const lfText = Buffer.from("hello\nworld\n", "utf8");
  const crlfText = Buffer.from("hello\r\nworld\r\n", "utf8");
  const lfPath = path.join(tempDir, "test-lf.txt");
  const crlfPath = path.join(tempDir, "test-crlf.txt");
  await fs.writeFile(lfPath, lfText);
  await fs.writeFile(crlfPath, crlfText);
  const lfHash = await sha256File(lfPath, "canonical_text_v1");
  const crlfHash = await sha256File(crlfPath, "canonical_text_v1");
  assert(lfHash === crlfHash, "LF and CRLF should produce same canonical hash");
  assert(isTextFile("test.json") === true, ".json should be text");
  assert(isTextFile("test.bin") === false, ".bin should not be text");
  assert(detectChecksumMode("test.json") === "canonical_text_v1", "JSON should use canonical mode");
  assert(detectChecksumMode("test.exe") === "byte_exact", "EXE should use byte_exact mode");
  await fs.unlink(lfPath).catch(() => {});
  await fs.unlink(crlfPath).catch(() => {});
  console.log("ok checksum normalization");

  // === 14. Schema accepts PARTIAL ===
  const validPartialSummary = {
    schemaVersion: "benchmark.run_summary.v1",
    runId: "run-test", suiteId: "basic-tool-use-v1", trackId: "basic-tool-use", contractId: "basic-tool-use-v1",
    runtime: { provider: "tool-eval", modelId: "llama3.2-local", runtimeModelName: "llama3.2" },
    startedAt: "2026-07-04T00:00:00.000Z", completedAt: "2026-07-04T00:01:00.000Z",
    caseCount: 13, passed: 4, partial: 4, failed: 2, errors: 0, timeouts: 0, malformed: 3,
    caseResults: [
      { caseId: "tc-01", verdict: "PASS", checks: [{ validator: "tool-selection", status: "pass" }] },
      { caseId: "tc-04", verdict: "PARTIAL", checks: [{ validator: "tool-selection", status: "fail", summary: "Missing fahrenheit unit" }] },
      { caseId: "tc-12", verdict: "FAIL", checks: [{ validator: "refusal", status: "fail", summary: "Used tool for impossible request" }] },
      { caseId: "loc-hybrid-weather-001", verdict: "PASS", checks: [{ validator: "hybrid-tool-selection", status: "pass" }] }
    ]
  };
  const schemaValidation = validateSchema(validPartialSummary, summarySchema, "test-partial");
  assert(schemaValidation.ok === true, `Schema validation with PARTIAL should pass: ${schemaValidation.errors.join(" ")}`);
  console.log("ok schema accepts PARTIAL");

  // === 15. Legacy checksum compat ===
  const evidenceFile = path.join(ROOT, "benchmark-lab", "evidence", "summaries", "llama32-local-intent-classification-v1.json");
  const legacyRecord = {
    schemaVersion: "benchmark.checksum.v1",
    checksumId: "test-legacy-compat",
    artifactType: "test",
    artifactPath: "benchmark-lab/evidence/summaries/llama32-local-intent-classification-v1.json",
    algorithm: "sha256",
    checksum: await sha256File(evidenceFile, "canonical_text_v1"),
    generatedAt: new Date().toISOString()
  };
  delete legacyRecord.checksumMode;
  const legacyPath = path.join(tempDir, "test-legacy-compat.json");
  await fs.writeFile(legacyPath, JSON.stringify(legacyRecord, null, 2), "utf8");
  const legacyVerify = await verifyChecksumRecord(legacyPath);
  assert(legacyVerify.ok === true, "Legacy checksum should verify via canonical fallback");
  await fs.unlink(legacyPath).catch(() => {});
  console.log("ok legacy checksum compat");

  console.log("\n--- All " + passedTests + " extended tool-eval tests passed ---");
}

let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  if (condition) {
    passedTests++;
  } else {
    failedTests++;
    console.error(`FAIL: ${message}`);
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
