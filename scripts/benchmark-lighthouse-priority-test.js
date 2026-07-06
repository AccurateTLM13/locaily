const path = require("node:path");
const { runLighthousePrioritySuite } = require("../benchmark-lab/engine/runners/lighthouse-priority-runner");
const { readJson } = require("../benchmark-lab/engine/fs-utils");

const LAB_ROOT = path.resolve(__dirname, "..");
const SUITE_PATH = path.join(LAB_ROOT, "benchmark-lab/locaily/tracks/lighthouse-priority-helper/suite.json");

async function main() {
  console.log("=== Lighthouse Priority Helper Mock Test ===\n");

  const suiteConfig = await readJson(SUITE_PATH);
  suiteConfig._suitePath = SUITE_PATH;
  suiteConfig.runtime.provider = "mock";

  const scenarioModule = require(path.resolve(path.dirname(SUITE_PATH), suiteConfig.scenarioModule || "scenarios.js"));
  const mockResponses = await readJson(path.resolve(path.dirname(SUITE_PATH), "mock-responses.json"));

  console.log(`Scenarios loaded: ${scenarioModule.SCENARIO_REGISTRY.length}`);
  if (scenarioModule.SCENARIO_REGISTRY.length === 0) {
    console.error("FAIL: No scenarios loaded");
    process.exit(1);
  }

  // Build prompts for each scenario and validate mock responses were built
  let allHaveData = true;
  for (const s of scenarioModule.SCENARIO_REGISTRY) {
    const prompt = scenarioModule.buildPrompt(s.data);
    if (!prompt) {
      console.error(`FAIL: Scenario ${s.id} has no prompt`);
      allHaveData = false;
    }
    if (!mockResponses[s.id]) {
      console.error(`FAIL: Scenario ${s.id} has no mock response`);
      allHaveData = false;
    }
  }

  if (!allHaveData) {
    console.error("FAIL: Missing scenario data or mock responses");
    process.exit(1);
  }
  console.log("All scenarios have data and mock responses: OK\n");

  const testSuiteConfig = { ...suiteConfig, runtime: { provider: "mock" }, _scenarioModule: scenarioModule };

  const result = await runLighthousePrioritySuite({
    modelManifestId: null,
    scenarios: scenarioModule.SCENARIO_REGISTRY,
    suiteConfig: testSuiteConfig,
    mockResponses,
    runId: "test-mock-run"
  });

  const summary = result.summary;
  console.log(`Run ID: ${result.runId}`);
  console.log(`Cases: ${summary.caseCount}`);
  console.log(`Passed: ${summary.passed}`);
  console.log(`Partial: ${summary.partial}`);
  console.log(`Failed: ${summary.failed}`);
  console.log(`Errors: ${summary.errors}`);
  console.log(`Timeouts: ${summary.timeouts}`);
  console.log(`Malformed: ${summary.malformed}`);
  const totalScore = summary.caseCount > 0 ? Math.round((summary.passed + (summary.partial * 0.5)) / summary.caseCount * 100) / 100 : 0;
  console.log(`Total score: ${totalScore}\n`);

  for (const cr of summary.caseResults) {
    const statusIcon = cr.verdict === "PASS" ? "PASS" : (cr.verdict === "PARTIAL" ? "PART" : "FAIL");
    console.log(`  [${statusIcon}] ${cr.caseId}`);
    for (const c of cr.checks) {
      console.log(`    ${c.validator}: ${c.status}${c.score !== undefined ? ` (${c.score}%)` : ""}`);
    }
  }

  console.log(`\nDraft summary: ${result.draftSummaryPath}`);

  const passRate = summary.caseCount > 0 ? (summary.passed / summary.caseCount) : 0;
  if (passRate >= 0.8) {
    console.log("\nPASS: All mock tests passed");
  } else {
    console.log("\nFAIL: Mock test pass rate below threshold");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("FAIL:", error.message);
  process.exit(1);
});
