const fs = require("node:fs/promises");
const path = require("node:path");
const { runSuite } = require("../benchmark-lab/engine/runners/suite-runner");
const { aggregateRuns } = require("../benchmark-lab/engine/aggregation");
const { promoteRun } = require("../benchmark-lab/engine/review-run");
const { assertQualificationEligible } = require("../benchmark-lab/engine/qualification");
const { readJson } = require("../benchmark-lab/engine/fs-utils");

const ROOT = path.resolve(__dirname, "..");
const SUITE_PATH = path.join(ROOT, "benchmark-lab", "locaily", "tracks", "semantic-scorer-fixture", "suite.json");
const RUN_IDS = [
  "run-test-aggregation-a",
  "run-test-aggregation-b",
  "run-test-aggregation-c"
];
const AGGREGATION_ID = "aggregation-test-semantic-scorer";

async function main() {
  await cleanup();

  try {
    for (const runId of RUN_IDS) {
      await runSuite({
        suitePath: SUITE_PATH,
        runId,
        now: () => new Date("2026-08-02T00:00:00.000Z")
      });
    }

    const result = await aggregateRuns({
      runIds: RUN_IDS,
      aggregationId: AGGREGATION_ID,
      now: () => new Date("2026-08-02T00:01:00.000Z")
    });
    const aggregation = result.aggregation;

    assert(aggregation.runCount === 3, "Expected three independent runs.");
    assert(aggregation.independentRunCount === 3, "Expected independent-run count.");
    assert(aggregation.metrics.trialCount === 6, "Expected six total case trials.");
    assert(aggregation.metrics.scoredTrialCount === 6, "Expected six scored trials.");
    assert(aggregation.metrics.passed === 3, "Expected three passed trials.");
    assert(aggregation.metrics.failed === 3, "Expected three semantic failures.");
    assert(aggregation.metrics.criticalFailureCount === 0, "Expected no critical infrastructure failures.");
    assert(aggregation.metrics.scoredPassRate === 0.5, "Expected scored pass rate.");
    assert(aggregation.metrics.scoredUncertainty.lower < 0.5, "Expected lower Wilson bound.");
    assert(aggregation.metrics.scoredUncertainty.upper > 0.5, "Expected upper Wilson bound.");
    assert(aggregation.caseResults.length === 2, "Expected per-case aggregation rows.");
    assert(aggregation.caseResults[0].difficulty === "easy", "Expected case difficulty provenance.");
    assert(aggregation.qualificationGate.eligible === false, "Expected the fixture to remain below qualification minimums.");
    assert(aggregation.qualificationGate.reasons.some((reason) => reason.includes("20 scored trials")), "Expected scored-trial gate reason.");
    assert(aggregation.qualificationGate.reasons.some((reason) => reason.includes("3 difficulty strata")), "Expected difficulty-strata gate reason.");
    assert(aggregation.qualificationGate.reasons.some((reason) => reason.includes("3 independent runs")) === false, "Three runs should satisfy the run-count gate.");

    const stored = await readJson(result.aggregationPath);
    assert(stored.metrics.scoredUncertainty.method === "wilson", "Expected persisted uncertainty method.");
    assert(!JSON.stringify(stored).includes("Return the correct semantic answer"), "Aggregation must not include prompts.");

    const promoted = await promoteRun({
      runId: RUN_IDS[0],
      evidenceId: "evidence-test-aggregation",
      aggregationId: AGGREGATION_ID,
      approvedBy: "benchmark-lab-aggregation-test",
      now: () => new Date("2026-08-02T00:02:00.000Z")
    });
    assert(promoted.promotedEvidence.aggregation.aggregationId === AGGREGATION_ID, "Expected aggregation to attach to promoted evidence.");

    let qualificationRejected = false;
    try {
      assertQualificationEligible({
        status: "qualified",
        roleStatus: null,
        evidence: promoted.promotedEvidence
      });
    } catch (error) {
      qualificationRejected = error.message.includes("eligible repeated-trial aggregation");
    }
    assert(qualificationRejected, "Expected qualified status to reject an ineligible aggregation.");
    assertQualificationEligible({
      status: "qualified",
      roleStatus: null,
      evidence: {
        aggregation: {
          qualificationGate: { eligible: true }
        }
      }
    });

    console.log("ok benchmark-lab aggregation");
  } finally {
    await cleanup();
  }
}

async function cleanup() {
  for (const runId of RUN_IDS) {
    await fs.rm(path.join(ROOT, "benchmark-lab", "results", "raw", runId), { recursive: true, force: true });
    await fs.rm(path.join(ROOT, "benchmark-lab", "reports", "drafts", runId), { recursive: true, force: true });
  }
  await fs.rm(path.join(ROOT, "benchmark-lab", "reports", "drafts", "aggregations", `${AGGREGATION_ID}.json`), { force: true });
  await fs.rm(path.join(ROOT, "benchmark-lab", "evidence", "summaries", "evidence-test-aggregation.json"), { force: true });
  await fs.rm(path.join(ROOT, "benchmark-lab", "evidence", "approved", "evidence-test-aggregation.json"), { force: true });
  await fs.rm(path.join(ROOT, "benchmark-lab", "evidence", "checksums", "evidence-test-aggregation-promoted-evidence.json"), { force: true });
  await fs.rm(path.join(ROOT, "benchmark-lab", "evidence", "checksums", "evidence-test-aggregation-approved-summary.json"), { force: true });
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
