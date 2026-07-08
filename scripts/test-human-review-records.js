const { mkdtemp, rm } = require("node:fs/promises");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const {
  buildReviewRecord,
  buildQualitySummary,
  loadReview,
  storeReview,
  upsertReview
} = require("../companion/evidence/human-review-record-store");

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${label}`);
  }
}

function makeTrackRun() {
  return {
    schemaVersion: "locaily.track_run_record.v1",
    recordId: "track-review-test-001",
    trackId: "website_audit.lighthouse_handoff",
    timestamps: {
      createdAt: "2026-07-08T00:00:00.000Z"
    },
    routing: {
      executorType: "hybrid",
      capabilityId: "website_audit.lighthouse_handoff"
    },
    execution: {
      status: "success"
    },
    output: {
      outputFormat: "json",
      outputSummary: "original model summary"
    },
    childRuns: [
      {
        recordId: "step-model-review-test-001",
        trackId: "website_audit.lighthouse_handoff",
        parentRunId: "track-review-test-001",
        routing: {
          executorType: "model",
          capabilityId: "hf.co/LiquidAI/LFM2.5-1.2B-Thinking-GGUF:latest",
          enforcementDecision: {
            state: "enforced",
            eligible: true,
            attempted: true,
            applied: true,
            reason: "All enforcement gates passed",
            selectedCapabilityId: "llama3.2",
            recommendedCapabilityId: "lfm25-1p2b-thinking-local",
            executedCapabilityId: "lfm25-1p2b-thinking-local",
            fallbackTriggered: false,
            fallbackSucceeded: false
          }
        },
        execution: {
          status: "success",
          modelInfo: {
            modelId: "hf.co/LiquidAI/LFM2.5-1.2B-Thinking-GGUF:latest",
            role: "priority_helper"
          }
        },
        output: {
          outputFormat: "json",
          outputSummary: "thinking=\"\", priorityFixes[2]"
        }
      }
    ]
  };
}

function makeReviewBody(overrides = {}) {
  return {
    reviewer: "JP",
    usefulnessScore: 4,
    accuracyScore: 3,
    structureScore: 5,
    clarityScore: 4,
    riskScore: 1,
    riskFlags: [],
    verdict: "needs_edit",
    correctionRequired: true,
    correctionText: "Use a more specific reason for the LCP fix.",
    reviewerNotes: "Useful but needs one edit.",
    failureReasons: ["vague_reasoning"],
    ...overrides
  };
}

async function testValidReviewCreation(storageDir) {
  console.log("TEST: valid review record creation");
  const result = await upsertReview({
    trackRun: makeTrackRun(),
    body: makeReviewBody(),
    now: new Date("2026-07-08T01:00:00.000Z"),
    storageDir
  });
  assert(result.created === true, "created flag true");
  assert(result.review.trackRunId === "track-review-test-001", "trackRunId captured");
  assert(result.review.roleId === "priority_helper", "roleId derived");
  assert(result.review.executedCapabilityId === "lfm25-1p2b-thinking-local", "executed capability derived");
}

async function testInvalidScoreBounds(storageDir) {
  console.log("TEST: invalid score bounds");
  const review = buildReviewRecord({
    trackRun: makeTrackRun(),
    body: makeReviewBody({ usefulnessScore: 6 }),
    now: new Date("2026-07-08T01:00:00.000Z")
  });
  try {
    await storeReview(review, { storageDir });
    assert(false, "invalid score rejected");
  } catch (error) {
    assert(error.code === "HUMAN_REVIEW_SCHEMA_INVALID", "schema invalid error");
    assert(error.validation.errors.some((e) => e.includes("usefulnessScore")), "score error included");
  }
}

async function testInvalidVerdict(storageDir) {
  console.log("TEST: invalid verdict");
  const review = buildReviewRecord({
    trackRun: makeTrackRun(),
    body: makeReviewBody({ verdict: "maybe" }),
    now: new Date("2026-07-08T01:00:00.000Z")
  });
  try {
    await storeReview(review, { storageDir });
    assert(false, "invalid verdict rejected");
  } catch (error) {
    assert(error.code === "HUMAN_REVIEW_SCHEMA_INVALID", "schema invalid error");
    assert(error.validation.errors.some((e) => e.includes("verdict")), "verdict error included");
  }
}

async function testReviewRetrieval(storageDir) {
  console.log("TEST: review retrieval");
  const loaded = await loadReview("track-review-test-001", { storageDir });
  assert(loaded && loaded.trackRunId === "track-review-test-001", "review loaded");
  assert(loaded.correctionText.includes("LCP"), "correction text preserved");
}

function testQualitySummaryAggregation() {
  console.log("TEST: quality summary aggregation");
  const summary = buildQualitySummary([
    buildReviewRecord({ trackRun: makeTrackRun(), body: makeReviewBody({ verdict: "pass", correctionRequired: false, usefulnessScore: 5, accuracyScore: 5, structureScore: 5, riskScore: 0, failureReasons: [] }) }),
    buildReviewRecord({ trackRun: { ...makeTrackRun(), recordId: "track-review-test-002" }, body: makeReviewBody({ verdict: "needs_edit", correctionRequired: true, usefulnessScore: 3, accuracyScore: 2, structureScore: 4, riskScore: 2, failureReasons: ["vague_reasoning"] }) }),
    buildReviewRecord({ trackRun: { ...makeTrackRun(), recordId: "track-review-test-003" }, body: makeReviewBody({ verdict: "fail", correctionRequired: true, usefulnessScore: 1, accuracyScore: 1, structureScore: 2, riskScore: 4, riskFlags: ["critical"], failureReasons: ["invented_audit", "vague_reasoning"] }) })
  ]);
  assert(summary.totalReviewedRuns === 3, "three reviewed runs");
  assert(summary.passCount === 1, "pass count");
  assert(summary.needsEditCount === 1, "needs-edit count");
  assert(summary.failCount === 1, "fail count");
  assert(summary.passRate === 33.33, "pass rate");
  assert(summary.correctionRate === 66.67, "correction rate");
  assert(summary.averageUsefulnessScore === 3, "average usefulness");
  assert(summary.averageAccuracyScore === 2.67, "average accuracy");
  assert(summary.averageStructureScore === 3.67, "average structure");
  assert(summary.commonFailureReasons[0].reason === "vague_reasoning", "common failure reason");
  assert(summary.criticalRiskCount === 1, "critical risk count");
}

async function testOriginalOutputAndEnforcementPreserved(storageDir) {
  console.log("TEST: original output and enforcement decision preserved");
  const trackRun = makeTrackRun();
  const before = JSON.stringify(trackRun);
  await upsertReview({
    trackRun,
    body: makeReviewBody({ correctionText: "Corrected human guidance." }),
    now: new Date("2026-07-08T02:00:00.000Z"),
    storageDir
  });
  assert(JSON.stringify(trackRun) === before, "track run object unchanged");
  assert(trackRun.output.outputSummary === "original model summary", "original output unchanged");
  assert(trackRun.childRuns[0].routing.enforcementDecision.applied === true, "enforcement decision unchanged");
  const loaded = await loadReview("track-review-test-001", { storageDir });
  assert(loaded.correctionText === "Corrected human guidance.", "correction attached separately");
}

async function main() {
  const storageDir = await mkdtemp(join(tmpdir(), "locaily-human-reviews-"));
  try {
    await testValidReviewCreation(storageDir);
    await testInvalidScoreBounds(storageDir);
    await testInvalidVerdict(storageDir);
    await testReviewRetrieval(storageDir);
    testQualitySummaryAggregation();
    await testOriginalOutputAndEnforcementPreserved(storageDir);
  } finally {
    await rm(storageDir, { recursive: true, force: true });
  }

  console.log(`\n${passed + failed} assertions: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
