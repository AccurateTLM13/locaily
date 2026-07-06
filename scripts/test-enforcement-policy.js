const { createEnforcementPolicy, ENFORCEMENT_STATES } = require("../companion/core/enforcement-policy");
const { buildEvidenceReview } = require("../companion/evidence/shadow-evidence-review");

const NOW = new Date("2026-07-05T12:00:00.000Z");

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; }
  else { console.error(`  FAIL: ${label}`); failed++; }
}

// Helper: create a policy that initializes immediately
function createTestPolicy(opts = {}) {
  return createEnforcementPolicy({
    dataDir: opts.dataDir,
    resolver: opts.resolver || null,
    getProviderStatus: opts.getProviderStatus || (async () => ({ available: true, modelReady: true })),
    ...opts
  });
}

// ==================== Enforcement Policy Tests ====================

function testDefaultState() {
  console.log("TEST: default state is shadow");
  const p = createEnforcementPolicy({ resolver: null, getProviderStatus: async () => ({ available: true, modelReady: true }) });
  assert(p.getTrackState("unknown") === "shadow", "default shadow");
  assert(p.getPolicySummary().defaultState === "shadow", "default constant");
}

async function testSetTrackState() {
  console.log("TEST: set track state");
  const p = createEnforcementPolicy({ resolver: null, getProviderStatus: async () => ({ available: true, modelReady: true }) });
  const r1 = await p.setTrackState("t", "disabled");
  assert(r1.ok === true, "set disabled ok");
  assert(p.getTrackState("t") === "disabled", "get disabled");
  const r2 = await p.setTrackState("t", "shadow");
  assert(r2.ok === true, "set shadow ok");
  assert(p.getTrackState("t") === "shadow", "get shadow");
  const r3 = await p.setTrackState("t", "invalid");
  assert(r3.ok === false, "invalid state rejected");
  assert(p.getTrackState("t") === "shadow", "unchanged after invalid");
}

function testEnforcementStates() {
  console.log("TEST: enforcement states enum");
  assert(ENFORCEMENT_STATES.length === 5, "5 states");
  assert(ENFORCEMENT_STATES.includes("disabled"), "disabled");
  assert(ENFORCEMENT_STATES.includes("shadow"), "shadow");
  assert(ENFORCEMENT_STATES.includes("eligible"), "eligible");
  assert(ENFORCEMENT_STATES.includes("enforced"), "enforced");
  assert(ENFORCEMENT_STATES.includes("suspended"), "suspended");
}

async function testOverrides() {
  console.log("TEST: override CRUD");
  const p = createEnforcementPolicy({ resolver: null, getProviderStatus: async () => ({ available: true, modelReady: true }) });
  await p.setOverride({ trackId: "t", role: "r", modelId: "m", reason: "test" });
  assert(p.hasOverride({ trackId: "t", role: "r", modelId: "m" }) === true, "override exists");
  assert(p.hasOverride({ trackId: "t", role: "r", modelId: "other" }) === false, "other model no override");
  assert(p.getOverrides().length === 1, "1 override");
  await p.clearOverride({ trackId: "t", role: "r", modelId: "m" });
  assert(p.getOverrides().length === 0, "0 after clear");
}

async function testApproveTrack() {
  console.log("TEST: track approval");
  const p = createEnforcementPolicy({ resolver: null, getProviderStatus: async () => ({ available: true, modelReady: true }) });
  assert(p.isTrackApproved("t") === false, "not approved initially");
  await p.approveTrack("t");
  assert(p.isTrackApproved("t") === true, "approved after call");
}

async function testPolicySummary() {
  console.log("TEST: policy summary");
  const p = createEnforcementPolicy({
    resolver: null,
    getProviderStatus: async () => ({ available: true, modelReady: true }),
  });
  await p.approveTrack("a");
  await p.setOverride({ trackId: "a", role: "r", modelId: "m", reason: "x" });
  const s = p.getPolicySummary();
  assert(s.states.length === 5, "5 states");
  assert(s.approvedTracks.length === 1, "1 approved");
  assert(s.activeOverrides === 1, "1 override");
  assert(s.scoreThreshold === 0.7, "default threshold");
}

async function testEligibilityDisabled() {
  console.log("TEST: eligibility disabled state");
  const p = createEnforcementPolicy({
    resolver: null, getProviderStatus: async () => ({ available: true, modelReady: true })
  });
  await p.setTrackState("t", "disabled");
  const r = await p.evaluateEligibility({ trackId: "t", role: "w", recommendedCapabilityId: "m", qualificationState: "qualified", comparisonState: "agree", score: 0.95 });
  assert(r.eligible === false, "not eligible");
  assert(r.blocks.some(b => b.includes("disabled")), "disabled reason");
}

async function testEligibilityShadow() {
  console.log("TEST: eligibility shadow state");
  const p = createEnforcementPolicy({
    resolver: null, getProviderStatus: async () => ({ available: true, modelReady: true })
  });
  assert(p.getTrackState("t") === "shadow", "already shadow");
  const r = await p.evaluateEligibility({ trackId: "t", role: "w", recommendedCapabilityId: "m", qualificationState: "qualified", comparisonState: "agree", score: 0.95 });
  assert(r.eligible === false, "not eligible");
  assert(r.blocks.some(b => b.includes("shadow")), "shadow reason");
}

async function testEligibilitySuspended() {
  console.log("TEST: eligibility suspended state");
  const p = createEnforcementPolicy({
    resolver: null, getProviderStatus: async () => ({ available: true, modelReady: true })
  });
  await p.approveTrack("t");
  await p.setTrackState("t", "eligible", { forceGate: true });
  await p.setTrackState("t", "enforced", { forceGate: true });
  await p.setTrackState("t", "suspended");
  const r = await p.evaluateEligibility({ trackId: "t", role: "w", recommendedCapabilityId: "m", qualificationState: "qualified", comparisonState: "agree", score: 0.95 });
  assert(r.eligible === false, "not eligible");
  assert(r.blocks.some(b => b.includes("suspended")), "suspended reason");
}

async function testEligibilityNotApproved() {
  console.log("TEST: eligibility not approved");
  const p = createEnforcementPolicy({
    resolver: null, getProviderStatus: async () => ({ available: true, modelReady: true })
  });
  await p.setTrackState("t", "eligible", { forceGate: true });
  const r = await p.evaluateEligibility({ trackId: "t", role: "w", recommendedCapabilityId: "m", qualificationState: "qualified", comparisonState: "agree", score: 0.95 });
  assert(r.eligible === false, "not eligible");
  assert(r.blocks.some(b => b.includes("not approved")), "approval reason");
}

async function testEligibilityNotQualified() {
  console.log("TEST: eligibility not qualified state");
  const p = createEnforcementPolicy({
    resolver: null, getProviderStatus: async () => ({ available: true, modelReady: true })
  });
  await p.approveTrack("t");
  await p.setTrackState("t", "eligible", { forceGate: true });
  const r = await p.evaluateEligibility({ trackId: "t", role: "w", recommendedCapabilityId: null, qualificationState: "untested", comparisonState: "insufficient-evidence" });
  assert(r.eligible === false, "not eligible");
  assert(r.blocks.some(b => b.includes("insufficient-evidence")), "evidence reason");
}

async function testEligibilityBelowScore() {
  console.log("TEST: eligibility below score threshold");
  const p = createEnforcementPolicy({
    resolver: null, getProviderStatus: async () => ({ available: true, modelReady: true })
  });
  await p.approveTrack("t");
  await p.setTrackState("t", "eligible", { forceGate: true });
  const r = await p.evaluateEligibility({ trackId: "t", role: "w", recommendedCapabilityId: "m", qualificationState: "qualified", comparisonState: "agree", score: 0.6 });
  assert(r.eligible === false, "not eligible");
  assert(r.blocks.some(b => b.includes("threshold")), "threshold reason");
}

async function testEligibilityOverride() {
  console.log("TEST: eligibility blocked by override");
  const p = createEnforcementPolicy({
    resolver: null, getProviderStatus: async () => ({ available: true, modelReady: true })
  });
  await p.approveTrack("t");
  await p.setTrackState("t", "eligible", { forceGate: true });
  await p.setOverride({ trackId: "t", role: "w", modelId: "m", reason: "manual" });
  const r = await p.evaluateEligibility({ trackId: "t", role: "w", recommendedCapabilityId: "m", qualificationState: "qualified", comparisonState: "agree", score: 0.95 });
  assert(r.eligible === false, "not eligible");
  assert(r.blocks.some(b => b.includes("override")), "override reason");
}

async function testEligibilityRuntimeUnavailable() {
  console.log("TEST: eligibility runtime unavailable");
  const p = createEnforcementPolicy({
    resolver: null, getProviderStatus: async () => ({ available: false, modelReady: false })
  });
  await p.approveTrack("t");
  await p.setTrackState("t", "eligible", { forceGate: true });
  const r = await p.evaluateEligibility({ trackId: "t", role: "w", recommendedCapabilityId: "m", qualificationState: "qualified", comparisonState: "agree", score: 0.95 });
  assert(r.eligible === false, "not eligible");
  assert(r.blocks.some(b => b.includes("Runtime")), "runtime reason");
}

async function testEligibilityFullyMet() {
  console.log("TEST: eligibility fully met (enforced state)");
  const p = createEnforcementPolicy({
    resolver: null, getProviderStatus: async () => ({ available: true, modelReady: true })
  });
  await p.approveTrack("t");
  await p.setTrackState("t", "eligible", { forceGate: true });
  await p.setTrackState("t", "enforced", { forceGate: true });
  const r = await p.evaluateEligibility({ trackId: "t", role: "w", recommendedCapabilityId: "m", qualificationState: "qualified", comparisonState: "agree", score: 0.95 });
  assert(r.eligible === true, "eligible");
  assert(r.canEnforce === true, "can enforce");
  assert(r.blocks.length === 0, "no blocks");
  assert(r.checks.every(c => c.passed === true), "all checks pass");
}

async function testEligibilityEligibleNotEnforced() {
  console.log("TEST: eligible but not enforced");
  const p = createEnforcementPolicy({
    resolver: null, getProviderStatus: async () => ({ available: true, modelReady: true })
  });
  await p.approveTrack("t");
  await p.setTrackState("t", "eligible", { forceGate: true });
  const r = await p.evaluateEligibility({ trackId: "t", role: "w", recommendedCapabilityId: "m", qualificationState: "qualified", comparisonState: "agree", score: 0.95 });
  assert(r.eligible === true, "eligible");
  assert(r.canEnforce === false, "not enforced");
}

// ==================== Evidence Review Tests ====================

function makeShadowRecord(trackId, comparison, selected, recommended, role) {
  return {
    trackId,
    timestamps: { createdAt: NOW.toISOString() },
    routing: {
      capabilityId: selected,
      shadowRecommendation: {
        enabled: true, enforced: false,
        selectedCapabilityId: selected,
        recommendedCapabilityId: recommended,
        comparison, reason: `Test: ${comparison}`,
        role: role || "worker",
        notEnforcedReason: "Shadow mode"
      }
    }
  };
}

function makeNonShadowRecord(trackId) {
  return { trackId, timestamps: { createdAt: NOW.toISOString() }, routing: { capabilityId: "m1" } };
}

function testEvidenceReviewBasic() {
  console.log("TEST: evidence review aggregation");
  const records = [
    makeShadowRecord("a", "agree", "m1", "m1"),
    makeShadowRecord("a", "agree", "m1", "m1"),
    makeShadowRecord("a", "disagree", "m2", "m1"),
    makeShadowRecord("b", "current-selection-unqualified", "m3", null),
    makeShadowRecord("b", "insufficient-evidence", "m3", null),
    makeNonShadowRecord("c")
  ];
  const r = buildEvidenceReview(records);
  assert(r.totalShadowComparisons === 5, `5 shadow recs, got ${r.totalShadowComparisons}`);
  assert(r.agree === 2, `2 agrees, got ${r.agree}`);
  assert(r.disagree === 1, `1 disagree, got ${r.disagree}`);
  assert(r.currentSelectionUnqualified === 1, `1 unqualified, got ${r.currentSelectionUnqualified}`);
  assert(r.coverageMissing === 0, `0 coverage missing, got ${r.coverageMissing}`);
  assert(r.agreementRate === 40, `40% agree rate, got ${r.agreementRate}`);
  assert(r.coverageRate === 100, `100% coverage, got ${r.coverageRate}`);
  assert(r.hasReviews === true, "has reviews");
  assert(r.byTrack.a.total === 3, "track a 3 recs");
  assert(r.byTrack.b.total === 2, "track b 2 recs");
}

function testEvidenceReviewEmpty() {
  console.log("TEST: evidence review empty");
  const r = buildEvidenceReview([]);
  assert(r.totalShadowComparisons === 0, "0 total");
  assert(r.hasReviews === false, "no reviews");
  assert(r.agreementRate === 0, "0% agreement");
}

function testPerTrack() {
  console.log("TEST: per-track review");
  const records = [
    makeShadowRecord("a", "agree", "m1", "m1"),
    makeShadowRecord("a", "disagree", "m2", "m1"),
    makeShadowRecord("a", "disagree", "m2", "m1"),
    makeShadowRecord("b", "agree", "m1", "m1")
  ];
  const r = buildEvidenceReview(records);
  assert(r.byTrack.a.byComparison.disagree === 2, "track a 2 disagrees");
  assert(r.byTrack.b.byComparison.agree === 1, "track b 1 agree");
}

// ==================== Run ====================

testDefaultState();
testEnforcementStates();
testEvidenceReviewBasic();
testEvidenceReviewEmpty();
testPerTrack();

(async () => {
  await testSetTrackState();
  await testOverrides();
  await testApproveTrack();
  await testPolicySummary();
  await testEligibilityDisabled();
  await testEligibilityShadow();
  await testEligibilitySuspended();
  await testEligibilityNotApproved();
  await testEligibilityNotQualified();
  await testEligibilityBelowScore();
  await testEligibilityOverride();
  await testEligibilityRuntimeUnavailable();
  await testEligibilityFullyMet();
  await testEligibilityEligibleNotEnforced();

  const total = passed + failed;
  console.log(`\n${total} tests: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
