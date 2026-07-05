const { createQualificationResolver } = require("../companion/core/qualification-resolver");

const PAST = new Date("2025-01-01T00:00:00.000Z");
const RECENT = new Date("2026-07-04T00:00:00.000Z");
const NOW = new Date("2026-07-05T12:00:00.000Z");
const FUTURE = new Date("2027-01-01T00:00:00.000Z");

const TTL_MS = 30 * 24 * 60 * 60 * 1000;

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

function testQualified() {
  console.log("TEST: qualified state");

  const resolver = createQualificationResolver({
    loader: makeLoader([{
      recordId: "qualified-record",
      subject: { id: "model-a", type: "model" },
      status: "qualified",
      generatedAt: RECENT.toISOString(),
      evidence: { evidenceIds: ["ev-1"] },
      qualifiedFor: [{
        role: "default_worker",
        trackId: "test-track",
        contractId: "test-contract-v1",
        status: "qualified",
        score: 0.95
      }]
    }]),
    now: () => NOW
  });

  const result = resolver.resolveForCapability({
    modelId: "model-a",
    role: "default_worker",
    trackId: "test-track",
    contractId: "test-contract-v1"
  });

  assert(result.state === "qualified", "state should be qualified");
  assert(result.capabilities.length === 1, "should have 1 capability");
  assert(result.capabilities[0].state === "qualified", "capability state should be qualified");
  assert(result.capabilities[0].score === 0.95, "score should be 0.95");
}

function testUnqualified() {
  console.log("TEST: unqualified state");

  const resolver = createQualificationResolver({
    loader: makeLoader([{
      recordId: "rejected-record",
      subject: { id: "model-b", type: "model" },
      status: "rejected",
      generatedAt: RECENT.toISOString(),
      evidence: { evidenceIds: ["ev-2"] },
      qualifiedFor: [{
        role: "default_worker",
        trackId: "test-track",
        contractId: "test-contract-v1",
        status: "rejected"
      }]
    }]),
    now: () => NOW
  });

  const result = resolver.resolveForCapability({
    modelId: "model-b",
    role: "default_worker",
    trackId: "test-track"
  });

  assert(result.state === "unqualified", "state should be unqualified");
  assert(result.capabilities[0].state === "unqualified", "capability state should be unqualified");
}

function testExpired() {
  console.log("TEST: expired state");

  const resolver = createQualificationResolver({
    loader: makeLoader([{
      recordId: "expired-record",
      subject: { id: "model-c", type: "model" },
      status: "qualified",
      generatedAt: RECENT.toISOString(),
      expiresAt: PAST.toISOString(),
      evidence: { evidenceIds: ["ev-3"] },
      qualifiedFor: [{
        role: "default_worker",
        trackId: "test-track",
        contractId: "test-contract-v1",
        status: "qualified",
        score: 0.9
      }]
    }]),
    now: () => NOW
  });

  const result = resolver.resolveForCapability({
    modelId: "model-c",
    role: "default_worker",
    trackId: "test-track"
  });

  assert(result.state === "expired", "state should be expired");
  assert(result.capabilities[0].state === "expired", "capability state should be expired");
}

function testStale() {
  console.log("TEST: stale state");

  const OLD = new Date("2024-01-01T00:00:00.000Z");

  const resolver = createQualificationResolver({
    loader: makeLoader([{
      recordId: "stale-record",
      subject: { id: "model-d", type: "model" },
      status: "qualified",
      generatedAt: OLD.toISOString(),
      evidence: { evidenceIds: ["ev-4"] },
      qualifiedFor: [{
        role: "default_worker",
        trackId: "test-track",
        contractId: "test-contract-v1",
        status: "qualified",
        score: 0.85
      }]
    }]),
    now: () => NOW,
    ttlMs: TTL_MS
  });

  const result = resolver.resolveForCapability({
    modelId: "model-d",
    role: "default_worker",
    trackId: "test-track"
  });

  assert(result.state === "stale", `state should be stale, got ${result.state}`);
  assert(result.capabilities[0].state === "stale", "capability state should be stale");
}

function testInvalid() {
  console.log("TEST: invalid state");

  const resolver = createQualificationResolver({
    loader: makeLoader([{
      recordId: "invalid-record",
      subject: { id: "model-e", type: "model" },
      status: "screening",
      generatedAt: RECENT.toISOString(),
      evidence: { evidenceIds: ["ev-5"] },
      _invalid: true,
      _invalidReason: "Schema validation failed",
      qualifiedFor: [{
        role: "default_worker",
        trackId: "test-track",
        contractId: "test-contract-v1",
        status: "qualified"
      }]
    }]),
    now: () => NOW
  });

  const result = resolver.resolveEntryState(
    { role: "default_worker", trackId: "test-track", contractId: "test-contract-v1", status: "qualified" },
    { recordId: "invalid-record", _invalid: true, _invalidReason: "Schema validation failed" }
  );

  assert(result.state === "invalid", `state should be invalid, got ${result.state}`);
  assert(result.reason.includes("Schema validation failed"), "reason should mention validation failure");
}

function testUntested() {
  console.log("TEST: untested state");

  const resolver = createQualificationResolver({
    loader: makeLoader([]),
    now: () => NOW
  });

  const result = resolver.resolveForCapability({
    modelId: "model-f",
    role: "default_worker",
    trackId: "test-track"
  });

  assert(result.state === "untested", "state should be untested");
  assert(result.capabilities.length === 0, "should have 0 capabilities");
}

function testUntestedFromScreening() {
  console.log("TEST: untested from screening status");

  const resolver = createQualificationResolver({
    loader: makeLoader([{
      recordId: "screening-record",
      subject: { id: "model-g", type: "model" },
      status: "screening",
      generatedAt: RECENT.toISOString(),
      evidence: { evidenceIds: ["ev-6"] },
      qualifiedFor: [{
        role: "default_worker",
        trackId: "test-track",
        contractId: "test-contract-v1",
        status: "qualified"
      }]
    }]),
    now: () => NOW
  });

  const result = resolver.resolveEntryState(
    { role: "default_worker", trackId: "test-track", contractId: "test-contract-v1", status: "qualified" },
    { recordId: "screening-record", subject: { id: "model-g" }, status: "screening", generatedAt: RECENT.toISOString(),
      qualifiedFor: [{ role: "default_worker", trackId: "test-track", contractId: "test-contract-v1", status: "qualified" }] }
  );

  assert(result.state === "untested", `state should be untested for screening record, got ${result.state}`);
}

function testDryRunRecommendation() {
  console.log("TEST: dry-run recommendation");

  const resolver = createQualificationResolver({
    loader: makeLoader([{
      recordId: "qualified-record",
      subject: { id: "model-h", type: "model" },
      status: "qualified",
      generatedAt: RECENT.toISOString(),
      evidence: { evidenceIds: ["ev-7"] },
      qualifiedFor: [{
        role: "default_worker",
        trackId: "test-track",
        contractId: "test-contract-v1",
        status: "qualified",
        score: 0.98
      }]
    }]),
    now: () => NOW
  });

  const rec = resolver.getDryRunRecommendation({
    modelId: "model-h",
    role: "default_worker",
    trackId: "test-track",
    policy: "require_qualified"
  });

  assert(rec.eligible === true, "should be eligible");
  assert(rec.state === "qualified", "state should be qualified");
  assert(rec.blocks === null, "should have no blocks");

  const recUntested = resolver.getDryRunRecommendation({
    modelId: "nonexistent",
    role: "default_worker",
    trackId: "unknown-track",
    policy: "require_qualified"
  });

  assert(recUntested.eligible === false, "nonexistent should not be eligible");
  assert(recUntested.state === "untested", "state should be untested");
  assert(recUntested.blocks.length > 0, "should have blocks/reasons");
}

function testAllSummary() {
  console.log("TEST: getAllSummary");

  const resolver = createQualificationResolver({
    loader: makeLoader([
      {
        recordId: "rec-1",
        subject: { id: "model-a", type: "model" },
        status: "qualified",
        generatedAt: RECENT.toISOString(),
        evidence: { evidenceIds: ["ev-1"] },
        qualifiedFor: [{ role: "fast_worker", trackId: "track-x", contractId: "c1", status: "qualified", score: 0.9 }]
      },
      {
        recordId: "rec-2",
        subject: { id: "model-b", type: "model" },
        status: "rejected",
        generatedAt: RECENT.toISOString(),
        evidence: { evidenceIds: ["ev-2"] },
        qualifiedFor: [{ role: "default_worker", trackId: "track-y", contractId: "c2", status: "rejected" }]
      }
    ]),
    now: () => NOW
  });

  const summary = resolver.getAllSummary();
  assert(summary.totalCapabilities === 2, `totalCapabilities should be 2, got ${summary.totalCapabilities}`);
  assert(summary.byState.qualified === 1, `qualified count should be 1, got ${summary.byState.qualified}`);
  assert(summary.byState.unqualified === 1, `unqualified count should be 1, got ${summary.byState.unqualified}`);
  assert(summary.records === 2, `records should be 2, got ${summary.records}`);
}

testQualified();
testUnqualified();
testExpired();
testStale();
testInvalid();
testUntested();
testUntestedFromScreening();
testDryRunRecommendation();
testAllSummary();

const total = passed + failed;
console.log(`\n${total} tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
