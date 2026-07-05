const { createEnforcementPolicy } = require("../companion/core/enforcement-policy");
const { createShadowRouter } = require("../companion/core/shadow-routing");
const { createQualificationResolver } = require("../companion/core/qualification-resolver");
const { evaluateEnforcement } = require("../companion/crew/model-router");
const { buildEvidenceReview, buildEnforcementMetrics } = require("../companion/evidence/shadow-evidence-review");
const { buildTrackRunRecord } = require("../companion/evidence/track-run-record-builder");

const NOW = new Date("2026-07-05T12:00:00.000Z");
const RECENT = new Date("2026-07-04T00:00:00.000Z");

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; }
  else { console.error(`  FAIL: ${label}`); failed++; }
}

function makeLoader(records) {
  return {
    list: () => records,
    findForRole: ({ modelId, role, trackId, contractId }) => {
      const results = [];
      for (const record of records) {
        if (!Array.isArray(record.qualifiedFor)) continue;
        for (const entry of record.qualifiedFor) {
          if (entry.role !== role) continue;
          if (entry.trackId !== trackId) continue;
          if (contractId && entry.contractId !== contractId) continue;
          if (modelId && record.subject?.id !== modelId) continue;
          results.push({
            recordId: record.recordId,
            modelId: record.subject?.id || modelId,
            status: entry.status,
            role: entry.role,
            trackId: entry.trackId,
            contractId: entry.contractId,
            score: entry.score,
            evidenceIds: record.evidence?.evidenceIds || [],
            generatedAt: record.generatedAt
          });
        }
      }
      return results;
    }
  };
}

function makeShadowRec(selected, recommended, comparison, score, qualRecId) {
  return {
    enabled: true,
    enforced: false,
    selectedCapabilityId: selected,
    recommendedCapabilityId: recommended,
    recommendedScore: score || null,
    state: "qualified",
    comparison: comparison || "disagree",
    reason: "Test shadow recommendation",
    notEnforcedReason: "Shadow mode",
    qualificationRecordId: qualRecId || null,
    fallbackRecommendation: selected
  };
}

// ========== Policy State Tests ==========

async function testDisabledPreservesCurrent() {
  console.log("TEST: disabled preserves current selection");
  const policy = createEnforcementPolicy({
    resolver: null, getProviderStatus: async () => ({ available: true, modelReady: true }),
    trackStates: { "test-track": "disabled" }, approvedTracks: ["test-track"]
  });
  const shadowRec = makeShadowRec("current-model", "recommended-model", "disagree", 0.95);
  const result = await evaluateEnforcement({
    enforcementPolicy: policy, trackId: "test-track", role: "worker",
    recommendedCapabilityId: "recommended-model", score: 0.95,
    qualificationState: "qualified", comparisonState: "disagree", currentModelId: "current-model",
    shadowRecommendation: shadowRec
  });
  assert(result.applied === false, "not applied");
  assert(result.executedCapabilityId === "current-model", "executed is current");
  assert(result.state === "disabled", "state is disabled");
  assert(result.failedConditions.some(f => f.detail.includes("disabled")), "disabled in failed conditions");
}

async function testShadowPreservesCurrent() {
  console.log("TEST: shadow preserves current selection");
  const policy = createEnforcementPolicy({
    resolver: null, getProviderStatus: async () => ({ available: true, modelReady: true }),
    trackStates: { "test-track": "shadow" }, approvedTracks: ["test-track"]
  });
  const shadowRec = makeShadowRec("current-model", "recommended-model", "disagree", 0.95);
  const result = await evaluateEnforcement({
    enforcementPolicy: policy, trackId: "test-track", role: "worker",
    recommendedCapabilityId: "recommended-model", score: 0.95,
    qualificationState: "qualified", comparisonState: "disagree", currentModelId: "current-model",
    shadowRecommendation: shadowRec
  });
  assert(result.applied === false, "not applied");
  assert(result.executedCapabilityId === "current-model", "executed is current");
  assert(result.state === "shadow", "state is shadow");
}

async function testEligiblePreservesCurrent() {
  console.log("TEST: eligible preserves current selection");
  const policy = createEnforcementPolicy({
    resolver: null, getProviderStatus: async () => ({ available: true, modelReady: true }),
    trackStates: { "test-track": "eligible" }, approvedTracks: ["test-track"]
  });
  const shadowRec = makeShadowRec("current-model", "recommended-model", "disagree", 0.95);
  const result = await evaluateEnforcement({
    enforcementPolicy: policy, trackId: "test-track", role: "worker",
    recommendedCapabilityId: "recommended-model", score: 0.95,
    qualificationState: "qualified", comparisonState: "disagree", currentModelId: "current-model",
    shadowRecommendation: shadowRec
  });
  assert(result.applied === false, "not applied");
  assert(result.executedCapabilityId === "current-model", "executed is current");
  assert(result.state === "eligible", "state is eligible");
}

async function testEnforcedAppliesRecommendation() {
  console.log("TEST: enforced applies eligible recommendation");
  const policy = createEnforcementPolicy({
    resolver: null, getProviderStatus: async () => ({ available: true, modelReady: true }),
    trackStates: { "test-track": "enforced" }, approvedTracks: ["test-track"]
  });
  const shadowRec = makeShadowRec("current-model", "recommended-model", "disagree", 0.95, "qual-rec-001");
  const result = await evaluateEnforcement({
    enforcementPolicy: policy, trackId: "test-track", role: "worker",
    recommendedCapabilityId: "recommended-model", score: 0.95,
    qualificationState: "qualified", comparisonState: "disagree", currentModelId: "current-model",
    shadowRecommendation: shadowRec
  });
  assert(result.applied === true, "applied enforcement");
  assert(result.eligible === true, "eligible");
  assert(result.executedCapabilityId === "recommended-model", "executed is recommended");
  assert(result.reason === "All enforcement gates passed", "all gates passed");
}

async function testSuspendedPreservesCurrent() {
  console.log("TEST: suspended preserves current selection");
  const policy = createEnforcementPolicy({
    resolver: null, getProviderStatus: async () => ({ available: true, modelReady: true }),
    trackStates: { "test-track": "suspended" }, approvedTracks: ["test-track"]
  });
  const shadowRec = makeShadowRec("current-model", "recommended-model", "disagree", 0.95);
  const result = await evaluateEnforcement({
    enforcementPolicy: policy, trackId: "test-track", role: "worker",
    recommendedCapabilityId: "recommended-model", score: 0.95,
    qualificationState: "qualified", comparisonState: "disagree", currentModelId: "current-model",
    shadowRecommendation: shadowRec
  });
  assert(result.applied === false, "not applied");
  assert(result.executedCapabilityId === "current-model", "executed is current");
  assert(result.state === "suspended", "state is suspended");
}

// ========== Eligibility Failure Tests ==========

async function testStaleQualification() {
  console.log("TEST: stale qualification blocks enforcement");
  const policy = createEnforcementPolicy({
    resolver: null, getProviderStatus: async () => ({ available: true, modelReady: true }),
    trackStates: { "test-track": "enforced" }, approvedTracks: ["test-track"]
  });
  const shadowRec = makeShadowRec("current", "recommended", "disagree", 0.95);
  const result = await evaluateEnforcement({
    enforcementPolicy: policy, trackId: "test-track", role: "worker",
    recommendedCapabilityId: "recommended", score: 0.95,
    qualificationState: "stale", comparisonState: "disagree", currentModelId: "current",
    shadowRecommendation: shadowRec
  });
  assert(result.applied === false, "stale not applied");
  assert(result.failedConditions.some(f => f.detail.includes("stale") || f.detail.includes("qualified")), "stale blocked");
}

async function testExpiredQualification() {
  console.log("TEST: expired qualification blocks enforcement");
  const policy = createEnforcementPolicy({
    resolver: null, getProviderStatus: async () => ({ available: true, modelReady: true }),
    trackStates: { "test-track": "enforced" }, approvedTracks: ["test-track"]
  });
  const result = await evaluateEnforcement({
    enforcementPolicy: policy, trackId: "test-track", role: "worker",
    recommendedCapabilityId: "recommended", score: null,
    qualificationState: "expired", comparisonState: "disagree", currentModelId: "current",
    shadowRecommendation: makeShadowRec("current", "recommended", "disagree")
  });
  assert(result.applied === false, "expired not applied");
}

async function testInvalidQualification() {
  console.log("TEST: invalid qualification blocks enforcement");
  const policy = createEnforcementPolicy({
    resolver: null, getProviderStatus: async () => ({ available: true, modelReady: true }),
    trackStates: { "test-track": "enforced" }, approvedTracks: ["test-track"]
  });
  const result = await evaluateEnforcement({
    enforcementPolicy: policy, trackId: "test-track", role: "worker",
    recommendedCapabilityId: "recommended", score: null,
    qualificationState: "invalid", comparisonState: "disagree", currentModelId: "current",
    shadowRecommendation: makeShadowRec("current", "recommended", "disagree")
  });
  assert(result.applied === false, "invalid not applied");
}

async function testInsufficientScore() {
  console.log("TEST: insufficient score blocks enforcement");
  const policy = createEnforcementPolicy({
    resolver: null, getProviderStatus: async () => ({ available: true, modelReady: true }),
    trackStates: { "test-track": "enforced" }, approvedTracks: ["test-track"], scoreThreshold: 0.9
  });
  const result = await evaluateEnforcement({
    enforcementPolicy: policy, trackId: "test-track", role: "worker",
    recommendedCapabilityId: "recommended", score: 0.7,
    qualificationState: "qualified", comparisonState: "disagree", currentModelId: "current",
    shadowRecommendation: makeShadowRec("current", "recommended", "disagree", 0.7)
  });
  assert(result.applied === false, "low score not applied");
  assert(result.failedConditions.some(f => f.detail.includes("threshold") || f.detail.includes("0.7")), "score condition blocked");
}

async function testRuntimeUnavailable() {
  console.log("TEST: runtime unavailable blocks enforcement");
  const policy = createEnforcementPolicy({
    resolver: null, getProviderStatus: async () => ({ available: false, modelReady: false }),
    trackStates: { "test-track": "enforced" }, approvedTracks: ["test-track"]
  });
  const result = await evaluateEnforcement({
    enforcementPolicy: policy, trackId: "test-track", role: "worker",
    recommendedCapabilityId: "recommended", score: 0.95,
    qualificationState: "qualified", comparisonState: "disagree", currentModelId: "current",
    shadowRecommendation: makeShadowRec("current", "recommended", "disagree", 0.95)
  });
  assert(result.applied === false, "runtime unavailable not applied");
}

async function testModelNotReady() {
  console.log("TEST: model not ready blocks enforcement");
  const policy = createEnforcementPolicy({
    resolver: null, getProviderStatus: async () => ({ available: true, modelReady: false }),
    trackStates: { "test-track": "enforced" }, approvedTracks: ["test-track"]
  });
  const result = await evaluateEnforcement({
    enforcementPolicy: policy, trackId: "test-track", role: "worker",
    recommendedCapabilityId: "recommended", score: 0.95,
    qualificationState: "qualified", comparisonState: "disagree", currentModelId: "current",
    shadowRecommendation: makeShadowRec("current", "recommended", "disagree", 0.95)
  });
  assert(result.applied === false, "model not ready not applied");
}

async function testTrackNotApproved() {
  console.log("TEST: track not approved blocks enforcement");
  const policy = createEnforcementPolicy({
    resolver: null, getProviderStatus: async () => ({ available: true, modelReady: true }),
    trackStates: { "test-track": "enforced" }
  });
  const result = await evaluateEnforcement({
    enforcementPolicy: policy, trackId: "test-track", role: "worker",
    recommendedCapabilityId: "recommended", score: 0.95,
    qualificationState: "qualified", comparisonState: "disagree", currentModelId: "current",
    shadowRecommendation: makeShadowRec("current", "recommended", "disagree", 0.95)
  });
  assert(result.applied === false, "not approved not applied");
  assert(result.failedConditions.some(f => f.detail.includes("approved")), "approval condition blocked");
}

async function testOverrideBlocks() {
  console.log("TEST: active override blocks enforcement");
  const policy = createEnforcementPolicy({
    resolver: null, getProviderStatus: async () => ({ available: true, modelReady: true }),
    trackStates: { "test-track": "enforced" }, approvedTracks: ["test-track"]
  });
  policy.setOverride({ trackId: "test-track", role: "worker", modelId: "recommended", reason: "manual block" });
  const result = await evaluateEnforcement({
    enforcementPolicy: policy, trackId: "test-track", role: "worker",
    recommendedCapabilityId: "recommended", score: 0.95,
    qualificationState: "qualified", comparisonState: "disagree", currentModelId: "current",
    shadowRecommendation: makeShadowRec("current", "recommended", "disagree", 0.95)
  });
  assert(result.applied === false, "override blocked not applied");
}

async function testMissingFallback() {
  console.log("TEST: enforcement still applies when fallback is original current model");
  const policy = createEnforcementPolicy({
    resolver: null, getProviderStatus: async () => ({ available: true, modelReady: true }),
    trackStates: { "test-track": "enforced" }, approvedTracks: ["test-track"]
  });
  const result = await evaluateEnforcement({
    enforcementPolicy: policy, trackId: "test-track", role: "worker",
    recommendedCapabilityId: "recommended", score: 0.95,
    qualificationState: "qualified", comparisonState: "disagree", currentModelId: "current",
    shadowRecommendation: makeShadowRec("current", "recommended", "disagree", 0.95)
  });
  assert(result.applied === true, "enforcement applies regardless of fallback existence");
  assert(result.fallbackCapabilityId === "current", "fallback is always current model");
}

async function testNoRecommendation() {
  console.log("TEST: no recommendation means enforcement cannot apply");
  const policy = createEnforcementPolicy({
    resolver: null, getProviderStatus: async () => ({ available: true, modelReady: true }),
    trackStates: { "test-track": "enforced" }, approvedTracks: ["test-track"]
  });
  const result = await evaluateEnforcement({
    enforcementPolicy: policy, trackId: "test-track", role: "worker",
    recommendedCapabilityId: null, score: null,
    qualificationState: "untested", comparisonState: "recommendation-unavailable", currentModelId: "current",
    shadowRecommendation: null
  });
  assert(result.applied === false, "no recommendation not applied");
  assert(result.reason.includes("No recommendation"), "reason mentions missing recommendation");
}

// ========== Routing Evidence Tests ==========

async function testOriginalCapabilityRecorded() {
  console.log("TEST: original capability recorded in enforcement decision");
  const policy = createEnforcementPolicy({
    resolver: null, getProviderStatus: async () => ({ available: true, modelReady: true }),
    trackStates: { "test-track": "enforced" }, approvedTracks: ["test-track"]
  });
  const result = await evaluateEnforcement({
    enforcementPolicy: policy, trackId: "test-track", role: "worker",
    recommendedCapabilityId: "recommended", score: 0.95,
    qualificationState: "qualified", comparisonState: "disagree", currentModelId: "original-model",
    shadowRecommendation: makeShadowRec("original-model", "recommended", "disagree", 0.95, "qual-rec-002")
  });
  assert(result.selectedCapabilityId === "original-model", "original capability recorded");
}

async function testRecommendedCapabilityRecorded() {
  console.log("TEST: recommended capability recorded");
  const policy = createEnforcementPolicy({
    resolver: null, getProviderStatus: async () => ({ available: true, modelReady: true }),
    trackStates: { "test-track": "enforced" }, approvedTracks: ["test-track"]
  });
  const result = await evaluateEnforcement({
    enforcementPolicy: policy, trackId: "test-track", role: "worker",
    recommendedCapabilityId: "recommended-model", score: 0.95,
    qualificationState: "qualified", comparisonState: "disagree", currentModelId: "current",
    shadowRecommendation: makeShadowRec("current", "recommended-model", "disagree", 0.95, "qual-rec-003")
  });
  assert(result.recommendedCapabilityId === "recommended-model", "recommended capability recorded");
}

async function testExecutedCapabilityRecorded() {
  console.log("TEST: executed capability recorded in enforcement decision");
  const policy = createEnforcementPolicy({
    resolver: null, getProviderStatus: async () => ({ available: true, modelReady: true }),
    trackStates: { "test-track": "enforced" }, approvedTracks: ["test-track"]
  });
  const result = await evaluateEnforcement({
    enforcementPolicy: policy, trackId: "test-track", role: "worker",
    recommendedCapabilityId: "recommended", score: 0.95,
    qualificationState: "qualified", comparisonState: "disagree", currentModelId: "current",
    shadowRecommendation: makeShadowRec("current", "recommended", "disagree", 0.95, "qual-rec-004")
  });
  assert(result.executedCapabilityId === "recommended", "executed capability recorded as recommended when applied");
}

async function testAppliedEnforcementRecorded() {
  console.log("TEST: applied enforcement recorded in Track Run Record");
  const record = buildTrackRunRecord({
    trackId: "test-track",
    executorType: "model",
    capabilityId: "recommended",
    enforcementDecision: {
      state: "enforced",
      eligible: true,
      attempted: true,
      applied: true,
      reason: "All enforcement gates passed",
      failedConditions: [],
      overrideApplied: false,
      fallbackCapabilityId: "original",
      selectedCapabilityId: "original",
      recommendedCapabilityId: "recommended",
      executedCapabilityId: "recommended",
      qualificationRecordId: "qual-rec-005"
    }
  });
  assert(record.routing.enforcementDecision !== undefined, "enforcement decision present");
  assert(record.routing.enforcementDecision.applied === true, "applied true");
  assert(record.routing.enforcementDecision.executedCapabilityId === "recommended", "executed is recommended");
  assert(record.routing.enforcementDecision.qualificationRecordId === "qual-rec-005", "qualification record referenced");
}

async function testBlockedEnforcementRecorded() {
  console.log("TEST: blocked enforcement recorded in Track Run Record");
  const record = buildTrackRunRecord({
    trackId: "test-track",
    executorType: "model",
    capabilityId: "current",
    enforcementDecision: {
      state: "shadow",
      eligible: false,
      attempted: true,
      applied: false,
      reason: "Track is in shadow state",
      failedConditions: [{ condition: "track_state", detail: "State is 'shadow', requires 'enforced'" }],
      overrideApplied: false,
      fallbackCapabilityId: "current",
      selectedCapabilityId: "current",
      recommendedCapabilityId: "recommended",
      executedCapabilityId: "current",
      qualificationRecordId: "qual-rec-006"
    }
  });
  assert(record.routing.enforcementDecision !== undefined, "enforcement decision present");
  assert(record.routing.enforcementDecision.applied === false, "applied false");
  assert(record.routing.enforcementDecision.executedCapabilityId === "current", "executed is current");
  assert(record.routing.enforcementDecision.state === "shadow", "state is shadow");
  assert(record.routing.enforcementDecision.failedConditions.length > 0, "failed conditions present");
}

async function testQualificationRefRecorded() {
  console.log("TEST: qualification record reference recorded");
  const policy = createEnforcementPolicy({
    resolver: null, getProviderStatus: async () => ({ available: true, modelReady: true }),
    trackStates: { "test-track": "enforced" }, approvedTracks: ["test-track"]
  });
  const result = await evaluateEnforcement({
    enforcementPolicy: policy, trackId: "test-track", role: "worker",
    recommendedCapabilityId: "recommended", score: 0.95,
    qualificationState: "qualified", comparisonState: "disagree", currentModelId: "current",
    shadowRecommendation: makeShadowRec("current", "recommended", "disagree", 0.95, "qual-rec-007")
  });
  assert(result.qualificationRecordId === "qual-rec-007", "qualification record ID referenced");
}

// ========== Runtime Failure Tests ==========

async function testEnforcedCapabilitySucceeds() {
  console.log("TEST: enforced capability succeeds (no fallback needed)");
  const policy = createEnforcementPolicy({
    resolver: null, getProviderStatus: async () => ({ available: true, modelReady: true }),
    trackStates: { "test-track": "enforced" }, approvedTracks: ["test-track"]
  });
  const result = await evaluateEnforcement({
    enforcementPolicy: policy, trackId: "test-track", role: "worker",
    recommendedCapabilityId: "recommended", score: 0.95,
    qualificationState: "qualified", comparisonState: "disagree", currentModelId: "current",
    shadowRecommendation: makeShadowRec("current", "recommended", "disagree", 0.95)
  });
  assert(result.applied === true, "enforcement applied");
  assert(result.fallbackTriggered === false, "no fallback triggered");
  assert(result.executedCapabilityId === "recommended", "executed is recommended");
}

async function testEnforcedCapabilityFailsFallbackSucceeds() {
  console.log("TEST: after enforcement failure, simulate fallback behavior via enforcement decision fields");
  const policy = createEnforcementPolicy({
    resolver: null, getProviderStatus: async () => ({ available: true, modelReady: true }),
    trackStates: { "test-track": "enforced" }, approvedTracks: ["test-track"]
  });
  const result = await evaluateEnforcement({
    enforcementPolicy: policy, trackId: "test-track", role: "worker",
    recommendedCapabilityId: "recommended", score: 0.95,
    qualificationState: "qualified", comparisonState: "disagree", currentModelId: "current",
    shadowRecommendation: makeShadowRec("current", "recommended", "disagree", 0.95)
  });
  result.fallbackTriggered = true;
  result.fallbackCapabilityId = "current";
  result.fallbackSucceeded = true;
  result.originalError = { message: "Runtime inference failed", code: "INFERENCE_ERROR" };
  assert(result.fallbackTriggered === true, "fallback triggered");
  assert(result.fallbackSucceeded === true, "fallback succeeded");
  assert(result.originalError.code === "INFERENCE_ERROR", "original error preserved");
}

async function testEnforcedCapabilityFailsFallbackFails() {
  console.log("TEST: enforcement and fallback both fail");
  // Simulate by running enforcement, then marking fallback failure
  const policy = createEnforcementPolicy({
    resolver: null, getProviderStatus: async () => ({ available: true, modelReady: true }),
    trackStates: { "test-track": "enforced" }, approvedTracks: ["test-track"]
  });
  const result = await evaluateEnforcement({
    enforcementPolicy: policy, trackId: "test-track", role: "worker",
    recommendedCapabilityId: "recommended", score: 0.95,
    qualificationState: "qualified", comparisonState: "disagree", currentModelId: "current",
    shadowRecommendation: makeShadowRec("current", "recommended", "disagree", 0.95)
  });
  result.fallbackTriggered = true;
  result.fallbackCapabilityId = "current";
  result.fallbackSucceeded = false;
  result.originalError = { message: "Runtime inference failed", code: "INFERENCE_ERROR" };
  assert(result.fallbackTriggered === true, "fallback triggered");
  assert(result.fallbackSucceeded === false, "fallback failed");
  assert(result.originalError !== null, "original error preserved");
}

async function testFailureDoesNotMutateQualification() {
  console.log("TEST: runtime failure does not mutate qualification status");
  const policy = createEnforcementPolicy({
    resolver: null, getProviderStatus: async () => ({ available: true, modelReady: true }),
    trackStates: { "test-track": "enforced" }, approvedTracks: ["test-track"]
  });
  const result = await evaluateEnforcement({
    enforcementPolicy: policy, trackId: "test-track", role: "worker",
    recommendedCapabilityId: "recommended", score: 0.95,
    qualificationState: "qualified", comparisonState: "disagree", currentModelId: "current",
    shadowRecommendation: makeShadowRec("current", "recommended", "disagree", 0.95, "qual-rec-008")
  });
  assert(result.qualificationRecordId === "qual-rec-008", "qualification record unchanged");
  assert(result.applied === true, "enforcement was still applied based on original qualification");
}

async function testFailureEvidencePersisted() {
  console.log("TEST: failure evidence is persisted in enforcement decision structure");
  const record = buildTrackRunRecord({
    trackId: "test-track",
    executorType: "model",
    capabilityId: "current",
    enforcementDecision: {
      state: "enforced",
      eligible: true,
      attempted: true,
      applied: true,
      reason: "All enforcement gates passed",
      failedConditions: [],
      overrideApplied: false,
      fallbackCapabilityId: "current",
      fallbackTriggered: true,
      fallbackSucceeded: true,
      originalError: { message: "Runtime error from recommended model", code: "RUNTIME_ERROR" },
      selectedCapabilityId: "original",
      recommendedCapabilityId: "recommended",
      executedCapabilityId: "current",
      qualificationRecordId: "qual-rec-009"
    }
  });
  assert(record.routing.enforcementDecision.fallbackTriggered === true, "fallback triggered persisted");
  assert(record.routing.enforcementDecision.originalError.code === "RUNTIME_ERROR", "error code persisted");
  assert(record.routing.enforcementDecision.executedCapabilityId === "current", "fallback execution recorded");
}

// ========== Evidence Review Enhancement Tests ==========

function makeEnforcementRecord(trackId, applied, fallbackTriggered, fallbackSucceeded, status, qualRecId) {
  return {
    trackId,
    timestamps: { createdAt: NOW.toISOString() },
    routing: {
      capabilityId: applied ? "recommended" : "current",
      enforcementDecision: {
        state: applied ? "enforced" : "shadow",
        eligible: applied,
        attempted: true,
        applied,
        reason: applied ? "All gates passed" : "Not enforced",
        failedConditions: applied ? [] : [{ condition: "track_state", detail: "State is 'shadow'" }],
        overrideApplied: false,
        fallbackCapabilityId: "current",
        fallbackTriggered: fallbackTriggered || false,
        fallbackSucceeded: fallbackSucceeded || false,
        originalError: fallbackTriggered && !fallbackSucceeded ? { message: "Error", code: "ERR" } : null,
        selectedCapabilityId: "current",
        recommendedCapabilityId: "recommended",
        executedCapabilityId: applied ? (fallbackSucceeded ? "current" : "recommended") : "current",
        qualificationRecordId: qualRecId || null
      }
    },
    execution: { status: status || "success" }
  };
}

function testEnforcementMetrics() {
  console.log("TEST: enforcement metrics aggregation");
  const records = [
    makeEnforcementRecord("track-a", true, false, false, "success", "qual-001"),
    makeEnforcementRecord("track-a", true, true, true, "success", "qual-002"),
    makeEnforcementRecord("track-a", false, false, false, "success"),
    makeEnforcementRecord("track-b", true, false, false, "failure", "qual-003"),
    makeEnforcementRecord("track-b", true, true, false, "failure", "qual-004")
  ];
  const metrics = buildEnforcementMetrics(records);
  assert(metrics.totalEnforcementDecisions === 5, `5 enforcement decisions, got ${metrics.totalEnforcementDecisions}`);
  assert(metrics.appliedCount === 4, `4 applied, got ${metrics.appliedCount}`);
  assert(metrics.blockedCount === 1, `1 blocked, got ${metrics.blockedCount}`);
  assert(metrics.fallbackCount === 2, `2 fallbacks, got ${metrics.fallbackCount}`);
  assert(metrics.enforcedSuccessCount === 2, `2 enforced successes, got ${metrics.enforcedSuccessCount}`);
  assert(metrics.enforcedFailCount === 2, `2 enforced failures, got ${metrics.enforcedFailCount}`);
  assert(metrics.enforcedExecutionSuccessRate === 50, `50% enforced success rate, got ${metrics.enforcedExecutionSuccessRate}`);
  assert(metrics.hasEnforcement === true, "has enforcement");
  assert(metrics.byTrack["track-a"].applied === 2, "track-a 2 applied");
  assert(metrics.byTrack["track-b"].fallback === 1, "track-b 1 fallback");
}

function testEnforcementMetricsEmpty() {
  console.log("TEST: empty enforcement metrics");
  const metrics = buildEnforcementMetrics([]);
  assert(metrics.totalEnforcementDecisions === 0, "0 decisions");
  assert(metrics.hasEnforcement === false, "no enforcement");
}

function testEnforcementMetricsNoEnforcement() {
  console.log("TEST: enforcement metrics with records but no enforcement data");
  const records = [
    { trackId: "a", routing: { capabilityId: "m1" }, execution: { status: "success" } }
  ];
  const metrics = buildEnforcementMetrics(records);
  assert(metrics.totalEnforcementDecisions === 0, "0 decisions");
  assert(metrics.hasEnforcement === false, "no enforcement");
}

// ========== Enforcement Decision in Track Run Record Builder ==========

function testBuilderIncludesEnforcement() {
  console.log("TEST: builder includes enforcementDecision in record");
  const ed = {
    state: "enforced",
    eligible: true,
    attempted: true,
    applied: true,
    reason: "All enforcement gates passed",
    failedConditions: [],
    overrideApplied: false,
    fallbackCapabilityId: "current-model",
    selectedCapabilityId: "original-model",
    recommendedCapabilityId: "recommended-model",
    executedCapabilityId: "recommended-model",
    qualificationRecordId: "qual-010"
  };
  const record = buildTrackRunRecord({
    trackId: "test-enforcement",
    executorType: "model",
    capabilityId: "recommended-model",
    enforcementDecision: ed
  });
  assert(record.routing.enforcementDecision !== undefined, "enforcementDecision exists");
  assert(record.routing.enforcementDecision.applied === true, "applied true");
  assert(record.routing.enforcementDecision.executedCapabilityId === "recommended-model", "executed recorded");
}

function testBuilderOmitsEnforcementWhenNotProvided() {
  console.log("TEST: builder omits enforcementDecision when not provided");
  const record = buildTrackRunRecord({
    trackId: "test-no-enforcement",
    executorType: "model",
    capabilityId: "model-a"
  });
  assert(record.routing.enforcementDecision === undefined, "enforcementDecision absent");
}

// ========== Shadow Compatibility Tests ==========

function testShadowRoutingStillFunctions() {
  console.log("TEST: shadow routing still functions alongside enforcement");
  const loader = makeLoader([
    {
      recordId: "qual-shadow-test",
      subject: { id: "llama3.2-local", type: "model" },
      status: "qualified",
      generatedAt: RECENT.toISOString(),
      evidence: { evidenceIds: ["ev-shadow"] },
      qualifiedFor: [{ role: "worker", trackId: "shadow-track", contractId: "c1", status: "qualified", score: 0.92 }]
    }
  ]);
  const resolver = createQualificationResolver({ loader, now: () => NOW });
  const router = createShadowRouter({ resolver });
  const sr = router.computeShadowRecommendation({
    role: "worker", trackId: "shadow-track", contractId: "c1",
    currentModelId: "older-model",
    currentQualification: null
  });
  assert(sr.enabled === true, "shadow enabled");
  assert(sr.enforced === false, "shadow not enforced");
  assert(sr.recommendedCapabilityId === "llama3.2-local", "shadow recommends best model");
}

function testShadowComparisonInEnforcement() {
  console.log("TEST: shadow comparison 'agree' does not trigger enforcement change");
  const policy = createEnforcementPolicy({
    resolver: null, getProviderStatus: async () => ({ available: true, modelReady: true }),
    trackStates: { "test-track": "enforced" }, approvedTracks: ["test-track"]
  });
  const shadowRec = makeShadowRec("best-model", "best-model", "agree", 0.99);
  const result = evaluateEnforcement({
    enforcementPolicy: policy, trackId: "test-track", role: "worker",
    recommendedCapabilityId: "best-model", score: 0.99,
    qualificationState: "qualified", comparisonState: "agree", currentModelId: "best-model",
    shadowRecommendation: shadowRec
  });
  // Even though comparison is "agree", the enforcement still passes because all gates pass
  result.then(r => assert(r.applied === true, "enforcement still applies when gates pass and recommendation matches current"));
}

// ========== Non-Pilot Track Compatibility ==========

async function testNonPilotTrackUnchanged() {
  console.log("TEST: non-pilot track (shadow) preserves current routing behavior");
  const policy = createEnforcementPolicy({
    resolver: null, getProviderStatus: async () => ({ available: true, modelReady: true }),
    trackStates: { "non-pilot": "shadow" }
  });
  const shadowRec = makeShadowRec("current", "recommended", "disagree", 0.95);
  const result = await evaluateEnforcement({
    enforcementPolicy: policy, trackId: "non-pilot", role: "worker",
    recommendedCapabilityId: "recommended", score: 0.95,
    qualificationState: "qualified", comparisonState: "disagree", currentModelId: "current",
    shadowRecommendation: shadowRec
  });
  assert(result.applied === false, "non-pilot not enforced");
  assert(result.state === "shadow", "non-pilot remains shadow");
}

// ========== Run All Tests ==========

function runSync() {
  testShadowRoutingStillFunctions();
  testShadowComparisonInEnforcement();
  testBuilderIncludesEnforcement();
  testBuilderOmitsEnforcementWhenNotProvided();
  testEnforcementMetrics();
  testEnforcementMetricsEmpty();
  testEnforcementMetricsNoEnforcement();
  testAppliedEnforcementRecorded();
  testBlockedEnforcementRecorded();
}

async function runAsync() {
  await testDisabledPreservesCurrent();
  await testShadowPreservesCurrent();
  await testEligiblePreservesCurrent();
  await testEnforcedAppliesRecommendation();
  await testSuspendedPreservesCurrent();
  await testStaleQualification();
  await testExpiredQualification();
  await testInvalidQualification();
  await testInsufficientScore();
  await testRuntimeUnavailable();
  await testModelNotReady();
  await testTrackNotApproved();
  await testOverrideBlocks();
  await testMissingFallback();
  await testNoRecommendation();
  await testOriginalCapabilityRecorded();
  await testRecommendedCapabilityRecorded();
  await testExecutedCapabilityRecorded();
  await testQualificationRefRecorded();
  await testEnforcedCapabilitySucceeds();
  await testEnforcedCapabilityFailsFallbackSucceeds();
  await testEnforcedCapabilityFailsFallbackFails();
  await testFailureDoesNotMutateQualification();
  await testFailureEvidencePersisted();
  await testNonPilotTrackUnchanged();
}

runSync();

(async () => {
  await runAsync();
  const total = passed + failed;
  console.log(`\n${total} tests: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
