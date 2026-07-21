const { classifyDisagreement, detectDrift, buildDisagreementBreakdown, buildLearningState, buildDisagreementSummary } = require("../companion/evidence/shadow-evidence-review");
const { compareOutputs } = require("../companion/evidence/retry-comparison");

const PASS = "PASS";
const FAIL = "FAIL";
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ${PASS}  ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ${FAIL}  ${name}`);
    console.error(`       ${e.message}`);
    failed++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || "assertion failed");
}

// ---- Disagreement Classification Tests ----

console.log("\n## Disagreement Classification");

test("classifyDisagreement returns null for non-disagree records", () => {
  const record = { routing: { shadowRecommendation: { enabled: true, comparison: "agree" } } };
  assert(classifyDisagreement(record) === null);
});

test("classifyDisagreement detects model_regression when both qualified", () => {
  const record = {
    routing: {
      shadowRecommendation: {
        enabled: true,
        comparison: "disagree",
        selectedCapabilityId: "model-a",
        recommendedCapabilityId: "model-b",
        selectedQualificationState: "qualified",
        recommendedQualificationState: "qualified",
        reason: "Qualification recommends model-b over model-a"
      }
    }
  };
  const cls = classifyDisagreement(record);
  assert(cls !== null);
  assert(cls.classification === "model_regression");
});

test("classifyDisagreement detects qualification_stale", () => {
  const record = {
    routing: {
      shadowRecommendation: {
        enabled: true,
        comparison: "disagree",
        selectedQualificationState: "expired",
        reason: "Qualification record is expired"
      }
    }
  };
  const cls = classifyDisagreement(record);
  assert(cls !== null);
  assert(cls.classification === "qualification_stale");
});

test("classifyDisagreement detects runtime_unavailable from reason text", () => {
  const record = {
    routing: {
      shadowRecommendation: {
        enabled: true,
        comparison: "disagree",
        selectedQualificationState: "qualified",
        recommendedQualificationState: "qualified",
        reason: "runtime unavailable for recommended model"
      }
    }
  };
  const cls = classifyDisagreement(record);
  assert(cls !== null);
  assert(cls.classification === "runtime_unavailable");
});

test("classifyDisagreement classifies as unexplainable when no clear match", () => {
  const record = {
    routing: {
      shadowRecommendation: {
        enabled: true,
        comparison: "disagree",
        selectedQualificationState: "candidate",
        recommendedQualificationState: "screening",
        reason: "Some other reason"
      }
    }
  };
  const cls = classifyDisagreement(record);
  assert(cls !== null);
  assert(cls.classification === "unexplainable");
});

// ---- Drift Detection Tests ----

console.log("\n## Drift Detection");

test("detectDrift returns drift=false for insufficient records", () => {
  const records = [
    { timestamps: { createdAt: "2026-07-01T00:00:00Z" }, routing: { shadowRecommendation: { enabled: true, comparison: "agree" } } }
  ];
  const drift = detectDrift(records);
  assert(drift.driftDetected === false);
  assert(drift.reason.includes("Insufficient"));
});

function makeShadowRecord(comparison, timestamp) {
  return {
    timestamps: { createdAt: timestamp },
    routing: { shadowRecommendation: { enabled: true, comparison } }
  };
}

test("detectDrift returns drift=false when rates are stable", () => {
  const records = [
    makeShadowRecord("agree", "2026-07-01T00:00:00Z"),
    makeShadowRecord("agree", "2026-07-02T00:00:00Z"),
    makeShadowRecord("agree", "2026-07-03T00:00:00Z"),
    makeShadowRecord("agree", "2026-07-04T00:00:00Z"),
    makeShadowRecord("agree", "2026-07-05T00:00:00Z"),
    makeShadowRecord("agree", "2026-07-06T00:00:00Z"),
  ];
  const drift = detectDrift(records);
  assert(drift.driftDetected === false);
});

test("detectDrift detects degrading agreement rate", () => {
  const records = [
    makeShadowRecord("agree", "2026-07-01T00:00:00Z"),
    makeShadowRecord("agree", "2026-07-02T00:00:00Z"),
    makeShadowRecord("agree", "2026-07-03T00:00:00Z"),
    makeShadowRecord("disagree", "2026-07-04T00:00:00Z"),
    makeShadowRecord("disagree", "2026-07-05T00:00:00Z"),
    makeShadowRecord("disagree", "2026-07-06T00:00:00Z"),
  ];
  const drift = detectDrift(records);
  assert(drift.driftDetected === true);
  const agreementPoint = drift.driftPoints.find(p => p.metric === "agreement_rate");
  assert(agreementPoint !== null);
  assert(agreementPoint.direction === "degrading");
});

// ---- Disagreement Breakdown Tests ----

console.log("\n## Disagreement Breakdown");

test("buildDisagreementBreakdown classifies all disagree records", () => {
  const records = [
    makeShadowRecord("disagree", "2026-07-01T00:00:00Z"),
    makeShadowRecord("agree", "2026-07-02T00:00:00Z"),
  ];
  records[0].routing.shadowRecommendation.selectedQualificationState = "expired";
  records[0].routing.shadowRecommendation.recommendedQualificationState = "qualified";
  const breakdown = buildDisagreementBreakdown(records);
  assert(breakdown.totalClassifiedDisagreements === 1);
  assert(breakdown.byClassification.qualification_stale === 1);
});

test("buildDisagreementBreakdown returns zero when no disagreements", () => {
  const records = [
    makeShadowRecord("agree", "2026-07-01T00:00:00Z"),
    makeShadowRecord("agree", "2026-07-02T00:00:00Z"),
  ];
  const breakdown = buildDisagreementBreakdown(records);
  assert(breakdown.totalClassifiedDisagreements === 0);
});

// ---- Learning State Tests ----

console.log("\n## Learning State");

test("buildLearningState returns empty state for no records", () => {
  const state = buildLearningState([]);
  assert(state.totalRecords === 0);
  assert(state.shadowComparisonCount === 0);
  assert(Object.keys(state.trackStates).length === 0);
});

test("buildLearningState aggregates per-track data", () => {
  const records = [
    { recordId: "r1", trackId: "test-a", timestamps: { createdAt: "2026-07-01T00:00:00Z" }, routing: { shadowRecommendation: { enabled: true, comparison: "agree", state: "qualified", qualificationRecordId: "qr1", recommendedQualificationState: "qualified" } } },
    { recordId: "r2", trackId: "test-a", timestamps: { createdAt: "2026-07-02T00:00:00Z" }, routing: { shadowRecommendation: { enabled: true, comparison: "disagree", state: "qualified", selectedQualificationState: "expired", recommendedQualificationState: "qualified", qualificationRecordId: "qr1" } } },
    { recordId: "r3", trackId: "test-b", timestamps: { createdAt: "2026-07-03T00:00:00Z" }, routing: { shadowRecommendation: { enabled: true, comparison: "agree", state: "qualified", qualificationRecordId: "qr2", recommendedQualificationState: "qualified" } } },
  ];
  const state = buildLearningState(records);
  assert(state.totalRecords === 3);
  assert(state.shadowComparisonCount === 3);
  assert(state.trackStates["test-a"] !== undefined);
  assert(state.trackStates["test-a"].recordCount === 2);
  assert(state.trackStates["test-a"].agreementPercent === 50);
  assert(state.trackStates["test-a"].disagreementCount === 1);
  assert(state.trackStates["test-b"].recordCount === 1);
  assert(state.trackStates["test-b"].agreementPercent === 100);
});

// ---- Retry Comparison Tests ----

console.log("\n## Retry Comparison");

test("compareOutputs detects improvement", () => {
  const original = { recordId: "orig-1", execution: { status: "failure" }, error: { type: "TIMEOUT" } };
  const retry = { recordId: "retry-1", execution: { status: "success" } };
  const comp = compareOutputs(original, retry);
  assert(comp.improved === true);
  assert(comp.regressed === false);
  assert(comp.unchanged === false);
  assert(comp.changes.some(c => c.field === "execution.status"));
});

test("compareOutputs detects regression", () => {
  const original = { recordId: "orig-1", execution: { status: "success" } };
  const retry = { recordId: "retry-1", execution: { status: "failure" }, error: { type: "TIMEOUT" } };
  const comp = compareOutputs(original, retry);
  assert(comp.improved === false);
  assert(comp.regressed === true);
  assert(comp.unchanged === false);
});

test("compareOutputs detects unchanged", () => {
  const original = { recordId: "orig-1", execution: { status: "success" } };
  const retry = { recordId: "retry-1", execution: { status: "success" } };
  const comp = compareOutputs(original, retry);
  assert(comp.improved === false);
  assert(comp.regressed === false);
  assert(comp.unchanged === true);
});

test("compareOutputs detects model change", () => {
  const original = { recordId: "orig-1", execution: { status: "success", modelInfo: { modelId: "model-a" } }, routing: { capabilityId: "model-a" } };
  const retry = { recordId: "retry-1", execution: { status: "success", modelInfo: { modelId: "model-b" } }, routing: { capabilityId: "model-b" } };
  const comp = compareOutputs(original, retry);
  assert(comp.changes.some(c => c.field === "execution.model"));
});

test("compareOutputs detects duration change", () => {
  const original = { recordId: "orig-1", execution: { status: "success", durationMs: 500 } };
  const retry = { recordId: "retry-1", execution: { status: "success", durationMs: 2000 } };
  const comp = compareOutputs(original, retry);
  assert(comp.changes.some(c => c.field === "execution.durationMs"));
});

// ---- Summary ----

console.log(`\n## Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
