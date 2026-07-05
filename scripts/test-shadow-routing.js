const { createShadowRouter } = require("../companion/core/shadow-routing");
const { createQualificationResolver } = require("../companion/core/qualification-resolver");

const NOW = new Date("2026-07-05T12:00:00.000Z");
const RECENT = new Date("2026-07-04T00:00:00.000Z");

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

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    passed++;
  } else {
    console.error(`  FAIL: ${label}`);
    failed++;
  }
}

function makeQualRecords() {
  return [
    {
      recordId: "qual-llama3.2",
      subject: { id: "llama3.2-local", type: "model" },
      status: "qualified",
      generatedAt: RECENT.toISOString(),
      evidence: { evidenceIds: ["ev-llama"] },
      qualifiedFor: [
        { role: "default_worker", trackId: "test-a", contractId: "c1", status: "qualified", score: 0.92 }
      ]
    },
    {
      recordId: "qual-qwen3b",
      subject: { id: "qwen3b-local", type: "model" },
      status: "qualified",
      generatedAt: RECENT.toISOString(),
      evidence: { evidenceIds: ["ev-qwen"] },
      qualifiedFor: [
        { role: "default_worker", trackId: "test-a", contractId: "c1", status: "qualified", score: 0.98 }
      ]
    },
    {
      recordId: "qual-rejected-model",
      subject: { id: "rejected-model", type: "model" },
      status: "rejected",
      generatedAt: RECENT.toISOString(),
      evidence: { evidenceIds: ["ev-rej"] },
      qualifiedFor: [
        { role: "default_worker", trackId: "test-a", contractId: "c1", status: "rejected" }
      ]
    }
  ];
}

function testAgree() {
  console.log("TEST: agree — current model is best qualified");
  const loader = makeLoader(makeQualRecords());
  const resolver = createQualificationResolver({ loader, now: () => NOW });
  const router = createShadowRouter({ resolver });

  const result = router.computeShadowRecommendation({
    role: "default_worker",
    trackId: "test-a",
    contractId: "c1",
    currentModelId: "qwen3b-local",
    currentQualification: { recordId: "qual-qwen3b", status: "qualified", score: 0.98 }
  });

  assert(result.comparison === "agree", `comparison should be agree, got ${result.comparison}`);
  assert(result.recommendedCapabilityId === "qwen3b-local", "should recommend qwen3b-local");
  assert(result.enabled === true, "shadow should be enabled");
  assert(result.enforced === false, "should not be enforced");
  assert(result.selectedCapabilityId === "qwen3b-local", "selected should be qwen3b-local");
}

function testDisagree() {
  console.log("TEST: disagree — current model is not best qualified");
  const loader = makeLoader(makeQualRecords());
  const resolver = createQualificationResolver({ loader, now: () => NOW });
  const router = createShadowRouter({ resolver });

  const result = router.computeShadowRecommendation({
    role: "default_worker",
    trackId: "test-a",
    contractId: "c1",
    currentModelId: "llama3.2-local",
    currentQualification: { recordId: "qual-llama3.2", status: "qualified", score: 0.92 }
  });

  assert(result.comparison === "disagree", `comparison should be disagree, got ${result.comparison}`);
  assert(result.recommendedCapabilityId === "qwen3b-local", "should recommend qwen3b-local (higher score)");
  assert(result.recommendedScore === 0.98, "recommended score should be 0.98");
  assert(result.selectedCapabilityId === "llama3.2-local", "selected should be llama3.2-local");
  assert(result.fallbackRecommendation !== null, "should have fallback recommendation");
}

function testNoQualifiedCapability() {
  console.log("TEST: no-qualified-capability — no model has qualified status, current is untested");
  const loader = makeLoader([
    {
      recordId: "qual-rejected",
      subject: { id: "model-x", type: "model" },
      status: "rejected",
      generatedAt: RECENT.toISOString(),
      evidence: { evidenceIds: ["ev-x"] },
      qualifiedFor: [{ role: "default_worker", trackId: "test-b", contractId: "c2", status: "rejected" }]
    }
  ]);
  const resolver = createQualificationResolver({ loader, now: () => NOW });
  const router = createShadowRouter({ resolver });

  // Current model is NOT model-x, so it's untested — no qualified capability exists at all
  const result = router.computeShadowRecommendation({
    role: "default_worker",
    trackId: "test-b",
    contractId: "c2",
    currentModelId: "untested-model",
    currentQualification: null
  });

  assert(result.comparison === "no-qualified-capability", `should be no-qualified-capability, got ${result.comparison}`);
  assert(result.recommendedCapabilityId === null, "should have no recommendation");
  assert(result.reason.includes("none qualified"), "reason should mention no qualified models");
}

function testInsufficientEvidence() {
  console.log("TEST: insufficient-evidence — models exist but none definitive");
  const loader = makeLoader([
    {
      recordId: "qual-screening",
      subject: { id: "model-y", type: "model" },
      status: "screening",
      generatedAt: RECENT.toISOString(),
      evidence: { evidenceIds: ["ev-y"] },
      qualifiedFor: [{ role: "default_worker", trackId: "test-c", contractId: "c3", status: "qualified" }]
    }
  ]);
  const resolver = createQualificationResolver({ loader, now: () => NOW });
  const router = createShadowRouter({ resolver });

  const result = router.computeShadowRecommendation({
    role: "default_worker",
    trackId: "test-c",
    contractId: "c3",
    currentModelId: "model-y",
    currentQualification: null
  });

  assert(result.comparison === "insufficient-evidence", `should be insufficient-evidence, got ${result.comparison}`);
  assert(result.recommendedCapabilityId === null, "should have no recommendation");
}

function testCurrentSelectionUnqualified() {
  console.log("TEST: current-selection-unqualified — current model is rejected");
  const loader = makeLoader([
    {
      recordId: "qual-rejected-2",
      subject: { id: "rejected-model", type: "model" },
      status: "rejected",
      generatedAt: RECENT.toISOString(),
      evidence: { evidenceIds: ["ev-rej2"] },
      qualifiedFor: [{ role: "default_worker", trackId: "test-d", contractId: "c4", status: "rejected" }]
    }
  ]);
  const resolver = createQualificationResolver({ loader, now: () => NOW });
  const router = createShadowRouter({ resolver });

  const result = router.computeShadowRecommendation({
    role: "default_worker",
    trackId: "test-d",
    contractId: "c4",
    currentModelId: "rejected-model",
    currentQualification: { recordId: "qual-rejected-2", status: "rejected" }
  });

  assert(result.comparison === "current-selection-unqualified", `should be current-selection-unqualified, got ${result.comparison}`);
  assert(result.reason.includes("unqualified"), "reason should mention unqualified");
}

function testRecommendationUnavailable() {
  console.log("TEST: recommendation-unavailable — no records at all");
  const loader = makeLoader([]);
  const resolver = createQualificationResolver({ loader, now: () => NOW });
  const router = createShadowRouter({ resolver });

  const result = router.computeShadowRecommendation({
    role: "nonexistent_role",
    trackId: "nonexistent_track",
    currentModelId: "model-z",
    currentQualification: null
  });

  assert(result.comparison === "recommendation-unavailable", `should be recommendation-unavailable, got ${result.comparison}`);
  assert(result.recommendedCapabilityId === null, "should have no recommendation");
  assert(result.reason.includes("No qualification records"), "reason should mention missing records");
}

function testDisagreeWithFallback() {
  console.log("TEST: disagree with fallback when multiple qualified");
  const loader = makeLoader([
    {
      recordId: "qual-best",
      subject: { id: "best-model", type: "model" },
      status: "qualified",
      generatedAt: RECENT.toISOString(),
      evidence: { evidenceIds: ["ev-best"] },
      qualifiedFor: [{ role: "worker", trackId: "test-e", contractId: "c5", status: "qualified", score: 0.99 }]
    },
    {
      recordId: "qual-second",
      subject: { id: "second-model", type: "model" },
      status: "qualified",
      generatedAt: RECENT.toISOString(),
      evidence: { evidenceIds: ["ev-second"] },
      qualifiedFor: [{ role: "worker", trackId: "test-e", contractId: "c5", status: "qualified", score: 0.85 }]
    }
  ]);
  const resolver = createQualificationResolver({ loader, now: () => NOW });
  const router = createShadowRouter({ resolver });

  const result = router.computeShadowRecommendation({
    role: "worker",
    trackId: "test-e",
    contractId: "c5",
    currentModelId: "second-model",
    currentQualification: { recordId: "qual-second", status: "qualified", score: 0.85 }
  });

  assert(result.comparison === "disagree", `should be disagree, got ${result.comparison}`);
  assert(result.recommendedCapabilityId === "best-model", "should recommend best-model");
  assert(result.recommendedScore === 0.99, "should have score 0.99");
  assert(result.fallbackRecommendation === "second-model", "current model should be fallback");
}

function testShadowNotEnforced() {
  console.log("TEST: shadow routing is never enforced");
  const loader = makeLoader(makeQualRecords());
  const resolver = createQualificationResolver({ loader, now: () => NOW });
  const router = createShadowRouter({ resolver });

  const result = router.computeShadowRecommendation({
    role: "default_worker",
    trackId: "test-a",
    currentModelId: "qwen3b-local",
    currentQualification: { recordId: "qual-qwen3b", status: "qualified", score: 0.98 }
  });

  assert(result.enforced === false, "enforced must be false");
  assert(typeof result.notEnforcedReason === "string", "should explain why not enforced");
  assert(result.notEnforcedReason.includes("Shadow mode"), "reason should mention shadow mode");
}

function testBuilderIncludesShadowInRecord() {
  console.log("TEST: builder includes shadowRecommendation in record");
  const { buildTrackRunRecord } = require("../companion/evidence/track-run-record-builder");

  const shadowRec = {
    enabled: true,
    enforced: false,
    selectedCapabilityId: "model-a",
    recommendedCapabilityId: "model-b",
    comparison: "disagree",
    reason: "model-b has higher qualification score",
    notEnforcedReason: "Shadow mode"
  };

  const record = buildTrackRunRecord({
    trackId: "test-shadow",
    executorType: "model",
    capabilityId: "model-a",
    qualificationRecordId: "qual-001",
    shadowRecommendation: shadowRec
  });

  assert(record.routing.shadowRecommendation !== undefined, "shadowRecommendation should exist in record");
  assert(record.routing.shadowRecommendation.comparison === "disagree", "comparison should be disagree");
  assert(record.routing.shadowRecommendation.enforced === false, "enforced must be false");
}

function testBuilderOmitsShadowWhenNotProvided() {
  console.log("TEST: builder omits shadowRecommendation when not provided");
  const { buildTrackRunRecord } = require("../companion/evidence/track-run-record-builder");

  const record = buildTrackRunRecord({
    trackId: "test-no-shadow",
    executorType: "model",
    capabilityId: "model-a"
  });

  assert(record.routing.shadowRecommendation === undefined, "shadowRecommendation should be absent");
}

testAgree();
testDisagree();
testNoQualifiedCapability();
testInsufficientEvidence();
testCurrentSelectionUnqualified();
testRecommendationUnavailable();
testDisagreeWithFallback();
testShadowNotEnforced();
testBuilderIncludesShadowInRecord();
testBuilderOmitsShadowWhenNotProvided();

const total = passed + failed;
console.log(`\n${total} tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
