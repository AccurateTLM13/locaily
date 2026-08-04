const fs = require("node:fs/promises");
const path = require("node:path");
const { runRequalification } = require("../benchmark-lab/engine/requalification");
const { loadSemanticScorer } = require("../benchmark-lab/engine/semantic-scorer");
const { readJson } = require("../benchmark-lab/engine/fs-utils");
const { validateSchema } = require("../benchmark-lab/engine/schema-validator");

const ROOT = path.resolve(__dirname, "..");
const SUITE_PATH = path.join(ROOT, "benchmark-lab", "locaily", "tracks", "semantic-scorer-fixture", "suite.json");
const V2_SUITE_PATH = path.join(ROOT, "benchmark-lab", "locaily", "tracks", "accessibility-deep", "suite-v2.json");
const RUN_PREFIX = "run-test-requalification";
const AGGREGATION_ID = "aggregation-test-requalification";

async function main() {
  await cleanup();

  try {
    await assertV2SuiteContract();

    const result = await runRequalification({
      suitePath: SUITE_PATH,
      trialCount: 3,
      runIdPrefix: RUN_PREFIX,
      aggregationId: AGGREGATION_ID,
      now: () => new Date("2026-08-02T00:00:00.000Z"),
      policy: {
        minScoredTrials: 6,
        minDifficultyStrata: 2
      }
    });

    assert(result.runIds.join(",") === `${RUN_PREFIX}-01,${RUN_PREFIX}-02,${RUN_PREFIX}-03`, "Expected stable repeated run ids.");
    assert(result.runs.length === 3, "Expected three suite runs.");
    assert(result.aggregation.aggregation.metrics.trialCount === 6, "Expected six aggregated trials.");
    assert(result.aggregation.aggregation.qualificationGate.eligible === true, "Expected the policy-adjusted fixture gate to pass.");

    console.log("ok benchmark-lab requalification");
  } finally {
    await cleanup();
  }
}

async function assertV2SuiteContract() {
  const suite = await readJson(V2_SUITE_PATH);
  const suiteSchema = await readJson(path.join(ROOT, "benchmark-lab", "schemas", "benchmark-suite.schema.json"));
  const suiteValidation = validateSchema(suite, suiteSchema, "accessibility-deep-v2");
  assert(suiteValidation.ok, `Expected accessibility v2 suite schema: ${suiteValidation.errors.join(" ")}`);

  const cases = [];
  for (const caseFile of suite.caseFiles) {
    cases.push(...await readJson(path.join(path.dirname(V2_SUITE_PATH), caseFile)));
  }
  assert(cases.length === 4, "Expected accessibility v2 to contain four cases.");
  assert(new Set(cases.map((benchmarkCase) => benchmarkCase.difficulty)).size === 3, "Expected accessibility v2 to contain three difficulty strata.");

  const scorer = loadSemanticScorer({
    suite,
    suiteDir: path.dirname(V2_SUITE_PATH)
  });
  assert(scorer.scenariosByCaseId.has("a11y-004"), "Expected accessibility v2 hard-case semantic scenario.");
}

async function cleanup() {
  for (let index = 1; index <= 3; index += 1) {
    const runId = `${RUN_PREFIX}-${String(index).padStart(2, "0")}`;
    await fs.rm(path.join(ROOT, "benchmark-lab", "results", "raw", runId), { recursive: true, force: true });
    await fs.rm(path.join(ROOT, "benchmark-lab", "reports", "drafts", runId), { recursive: true, force: true });
  }
  await fs.rm(path.join(ROOT, "benchmark-lab", "reports", "drafts", "aggregations", `${AGGREGATION_ID}.json`), { force: true });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
