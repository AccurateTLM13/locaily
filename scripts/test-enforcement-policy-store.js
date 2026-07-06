const { mkdir, rm, writeFile, readFile } = require("node:fs/promises");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const { createEnforcementPolicyStore } = require("../companion/core/enforcement-policy-store");
const { createEnforcementPolicy } = require("../companion/core/enforcement-policy");

let passed = 0;
let failed = 0;
let testTmpDir = null;

function assert(condition, label) {
  if (condition) { passed++; }
  else { console.error(`  FAIL: ${label}`); failed++; }
}

async function withTempDir(fn) {
  const dir = join(tmpdir(), `enf-policy-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  await mkdir(dir, { recursive: true });
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// ==================== Loading and Validation ====================

async function testMissingPolicyFile() {
  console.log("TEST: missing policy file initializes safe default");
  await withTempDir(async (dir) => {
    const store = createEnforcementPolicyStore({ dataDir: dir });
    await store.initialize();
    const health = store.getStoreHealth();
    assert(health.healthy === true, "healthy after missing file");
    assert(health.safeFallback === true, "safe fallback active");
    assert(health.enforcementLocked === false, "not locked for missing file");
    assert(health.revision === 0, "revision 0");
    const canonical = store.getCanonical();
    assert(canonical.schemaVersion === "enforcement-policy.v1", "correct schema version");
    assert(canonical.metadata.defaultState === "shadow", "default state shadow");
    assert(Object.keys(canonical.tracks).length === 0, "no tracks");
    assert(canonical.overrides.length === 0, "no overrides");
  });
}

async function testValidPolicyLoad() {
  console.log("TEST: valid policy file loads correctly");
  await withTempDir(async (dir) => {
    const policyDir = join(dir, "policy");
    await mkdir(policyDir, { recursive: true });
    const policy = {
      schemaVersion: "enforcement-policy.v1",
      revision: 3,
      createdAt: "2026-07-05T00:00:00.000Z",
      updatedAt: "2026-07-05T01:00:00.000Z",
      updatedBy: "operator",
      tracks: {
        "test-track": {
          state: "eligible",
          approved: true,
          updatedAt: "2026-07-05T00:30:00.000Z",
          updatedBy: "operator",
          reason: null
        }
      },
      overrides: [],
      metadata: {
        defaultState: "shadow",
        minimumScoreThreshold: 0.7
      }
    };
    await writeFile(join(policyDir, "enforcement-policy.json"), JSON.stringify(policy));

    const store = createEnforcementPolicyStore({ dataDir: dir });
    await store.initialize();
    const health = store.getStoreHealth();
    assert(health.healthy === true, "healthy after valid load");
    assert(health.safeFallback === false, "no fallback");
    assert(health.revision === 3, "revision matches");
    assert(store.getTrackState("test-track") === "eligible", "track state loaded");
    assert(store.isTrackApproved("test-track") === true, "track approved");
  });
}

async function testInvalidSchemaRejection() {
  console.log("TEST: invalid schema rejection");
  await withTempDir(async (dir) => {
    const policyDir = join(dir, "policy");
    await mkdir(policyDir, { recursive: true });
    const invalid = {
      schemaVersion: "enforcement-policy.v1",
      revision: 0,
      tracks: "not-an-object",
      overrides: "not-an-array"
    };
    await writeFile(join(policyDir, "enforcement-policy.json"), JSON.stringify(invalid));

    const store = createEnforcementPolicyStore({ dataDir: dir });
    await store.initialize();
    const health = store.getStoreHealth();
    assert(health.healthy === false, "not healthy (degraded state)");
    assert(health.safeFallback === true, "safe fallback active");
    assert(health.enforcementLocked === true, "enforcement locked");
    assert(health.loadError !== null, "load error present");
    assert(health.loadError.code === "SCHEMA_VALIDATION_FAILED", "schema validation error code");
    assert(store.getTrackState("any") === "shadow", "defaults to shadow");
  });
}

async function testMalformedJsonRejection() {
  console.log("TEST: malformed JSON rejection");
  await withTempDir(async (dir) => {
    const policyDir = join(dir, "policy");
    await mkdir(policyDir, { recursive: true });
    await writeFile(join(policyDir, "enforcement-policy.json"), "this is not json {{{");

    const store = createEnforcementPolicyStore({ dataDir: dir });
    await store.initialize();
    const health = store.getStoreHealth();
    assert(health.healthy === false, "degraded after malformed");
    assert(health.safeFallback === true, "fallback after malformed");
    assert(health.loadError.code === "MALFORMED_JSON", "malformed json error code");
  });
}

async function testUnsupportedSchemaVersion() {
  console.log("TEST: unsupported schema version rejection");
  await withTempDir(async (dir) => {
    const policyDir = join(dir, "policy");
    await mkdir(policyDir, { recursive: true });
    const wrongVersion = {
      schemaVersion: "enforcement-policy.v0",
      revision: 0,
      tracks: {},
      overrides: [],
      metadata: { defaultState: "shadow", minimumScoreThreshold: 0.7 }
    };
    await writeFile(join(policyDir, "enforcement-policy.json"), JSON.stringify(wrongVersion));

    const store = createEnforcementPolicyStore({ dataDir: dir });
    await store.initialize();
    const health = store.getStoreHealth();
    assert(health.healthy === false, "degraded despite fallback");
    assert(health.safeFallback === true, "fallback active");
    assert(health.loadError.code === "UNSUPPORTED_SCHEMA_VERSION", "unsupported version error code");
  });
}

async function testCorruptedFileSafeFallback() {
  console.log("TEST: corrupted file safe fallback");
  await withTempDir(async (dir) => {
    const policyDir = join(dir, "policy");
    await mkdir(policyDir, { recursive: true });
    await writeFile(join(policyDir, "enforcement-policy.json"), "null");

    const store = createEnforcementPolicyStore({ dataDir: dir });
    await store.initialize();
    const health = store.getStoreHealth();
    assert(health.healthy === false, "degraded after null file");
    assert(health.safeFallback === true, "fallback");
  });
}

async function testCorruptionRemainsVisible() {
  console.log("TEST: corruption remains visible through health");
  await withTempDir(async (dir) => {
    const policyDir = join(dir, "policy");
    await mkdir(policyDir, { recursive: true });
    await writeFile(join(policyDir, "enforcement-policy.json"), "{bad json");

    const store = createEnforcementPolicyStore({ dataDir: dir });
    await store.initialize();
    const health = store.getStoreHealth();
    assert(health.loadError !== null, "load error visible");
    assert(health.safeFallback === true, "fallback visible");
    assert(health.enforcementLocked === true, "locked visible");
  });
}

async function testNoSilentOverwrite() {
  console.log("TEST: no silent overwrite of corrupted file");
  await withTempDir(async (dir) => {
    const policyDir = join(dir, "policy");
    const filePath = join(policyDir, "enforcement-policy.json");
    await mkdir(policyDir, { recursive: true });
    const originalContent = "{bad json";
    await writeFile(filePath, originalContent);

    const store = createEnforcementPolicyStore({ dataDir: dir });
    await store.initialize();

    const contentAfterInit = await readFile(filePath, "utf8");
    assert(contentAfterInit === originalContent, "original corrupted file preserved");

    const health = store.getStoreHealth();
    assert(health.loadError.code === "MALFORMED_JSON", "error still malformed json");
  });
}

// ==================== Persistence ====================

async function testAtomicWrite() {
  console.log("TEST: atomic write creates valid file");
  await withTempDir(async (dir) => {
    const store = createEnforcementPolicyStore({ dataDir: dir });
    await store.initialize();

    await store.approveTrack("test-track");
    const health = store.getStoreHealth();
    assert(health.revision >= 1, "revision incremented");

    const policyDir = join(dir, "policy");
    const filePath = join(policyDir, "enforcement-policy.json");
    const content = await readFile(filePath, "utf8");
    const parsed = JSON.parse(content);
    assert(parsed.revision >= 1, "file has incremented revision");
    assert(parsed.tracks["test-track"].approved === true, "approval persisted");
    assert(parsed.schemaVersion === "enforcement-policy.v1", "schema version correct");
  });
}

async function testRevisionIncrement() {
  console.log("TEST: revision increments per mutation");
  await withTempDir(async (dir) => {
    const store = createEnforcementPolicyStore({ dataDir: dir });
    await store.initialize();

    const h0 = store.getStoreHealth();
    assert(h0.revision === 0, "initial revision 0");

    await store.approveTrack("t1");
    assert(store.getStoreHealth().revision === 1, "revision 1 after approval");

    await store.setTrackState("t1", "eligible", { forceGate: true });
    assert(store.getStoreHealth().revision === 2, "revision 2 after state change");

    await store.setOverride({ trackId: "t1", role: "w", modelId: "m" });
    assert(store.getStoreHealth().revision === 3, "revision 3 after override");
  });
}

async function testRestartRecovery() {
  console.log("TEST: restart recovers persisted state");
  await withTempDir(async (dir) => {
    const s1 = createEnforcementPolicyStore({ dataDir: dir });
    await s1.initialize();
    await s1.approveTrack("persist-track");
    await s1.setTrackState("persist-track", "eligible", { forceGate: true });

    const s2 = createEnforcementPolicyStore({ dataDir: dir });
    await s2.initialize();
    assert(s2.isTrackApproved("persist-track") === true, "approval recovered");
    assert(s2.getTrackState("persist-track") === "eligible", "state recovered");
    assert(s2.getStoreHealth().revision >= 2, "revision recovered");
  });
}

// ==================== Track State ====================

async function testApprovalPersistence() {
  console.log("TEST: approval persists through atomic write");
  await withTempDir(async (dir) => {
    const store = createEnforcementPolicyStore({ dataDir: dir });
    await store.initialize();
    const result = await store.approveTrack("approve-me");
    assert(result.ok === true, "approval ok");
    assert(store.isTrackApproved("approve-me") === true, "approved");
  });
}

async function testApprovalRevocationPersistence() {
  console.log("TEST: approval revocation persists");
  await withTempDir(async (dir) => {
    const store = createEnforcementPolicyStore({ dataDir: dir });
    await store.initialize();
    await store.approveTrack("revoke-me");
    assert(store.isTrackApproved("revoke-me") === true, "approved before revoke");
    const result = await store.revokeApproval("revoke-me");
    assert(result.ok === true, "revocation ok");
    assert(store.isTrackApproved("revoke-me") === false, "not approved after revoke");
  });
}

async function testRevokeEnforcedAtomicallySuspends() {
  console.log("TEST: revoking approval while enforced atomically suspends");
  await withTempDir(async (dir) => {
    const store = createEnforcementPolicyStore({ dataDir: dir });
    await store.initialize();
    await store.approveTrack("enf-track");
    await store.setTrackState("enf-track", "eligible", { forceGate: true });
    await store.setTrackState("enf-track", "enforced", { forceGate: true });
    assert(store.getTrackState("enf-track") === "enforced", "is enforced");

    await store.revokeApproval("enf-track");
    assert(store.isTrackApproved("enf-track") === false, "approval revoked");
    assert(store.getTrackState("enf-track") === "suspended", "atomically suspended");
  });
}

async function testRevokeEligibleMovesToShadow() {
  console.log("TEST: revoking approval while eligible moves to shadow");
  await withTempDir(async (dir) => {
    const store = createEnforcementPolicyStore({ dataDir: dir });
    await store.initialize();
    await store.approveTrack("elig-track");
    await store.setTrackState("elig-track", "eligible", { forceGate: true });
    assert(store.getTrackState("elig-track") === "eligible", "is eligible");

    await store.revokeApproval("elig-track");
    assert(store.getTrackState("elig-track") === "shadow", "moved to shadow");
  });
}

async function testSuspensionPersistence() {
  console.log("TEST: suspension persists");
  await withTempDir(async (dir) => {
    const store = createEnforcementPolicyStore({ dataDir: dir });
    await store.initialize();
    await store.approveTrack("sus-track");
    await store.setTrackState("sus-track", "eligible", { forceGate: true });
    await store.setTrackState("sus-track", "enforced", { forceGate: true });
    await store.setTrackState("sus-track", "suspended");
    assert(store.getTrackState("sus-track") === "suspended", "suspended");
  });
}

async function testRestorationPersistence() {
  console.log("TEST: restoration from suspended");
  await withTempDir(async (dir) => {
    const store = createEnforcementPolicyStore({ dataDir: dir });
    await store.initialize();
    await store.approveTrack("sus-track");
    await store.setTrackState("sus-track", "eligible", { forceGate: true });
    await store.setTrackState("sus-track", "enforced", { forceGate: true });
    await store.setTrackState("sus-track", "suspended");
    assert(store.getTrackState("sus-track") === "suspended", "is suspended");
    await store.restoreTrack("sus-track");
    assert(store.getTrackState("sus-track") === "shadow", "restored to shadow");
  });
}

async function testInvalidStateTransition() {
  console.log("TEST: invalid state transitions rejected");
  await withTempDir(async (dir) => {
    const store = createEnforcementPolicyStore({ dataDir: dir });
    await store.initialize();

    const r1 = await store.setTrackState("t", "invalid_state");
    assert(r1.ok === false, "invalid state rejected");
    assert(r1.code === "INVALID_ENFORCEMENT_STATE", "correct error code");

    const r2 = await store.setTrackState("t", "disabled");
    assert(r2.ok === true, "shadow->disabled ok");

    const r3 = await store.setTrackState("t", "eligible");
    assert(r3.ok === false, "disabled->eligible rejected (invalid transition)");
  });
}

async function testDirectEnforcedRejected() {
  console.log("TEST: direct transition to enforced rejected");
  await withTempDir(async (dir) => {
    const store = createEnforcementPolicyStore({ dataDir: dir });
    await store.initialize();
    await store.approveTrack("t");
    const result = await store.setTrackState("t", "enforced");
    assert(result.ok === false, "direct enforced rejected");
    assert(result.code === "INVALID_STATE_TRANSITION", "invalid transition code");
  });
}

async function testEnteringEligibleWithoutApprovalRejected() {
  console.log("TEST: entering eligible without approval rejected");
  await withTempDir(async (dir) => {
    const store = createEnforcementPolicyStore({ dataDir: dir });
    await store.initialize();
    const result = await store.setTrackState("unapproved", "eligible");
    assert(result.ok === false, "entering eligible rejected without approval");
    assert(result.code === "TRACK_NOT_APPROVED", "correct error code");
  });
}

async function testEnforcedToSuspendedSucceeds() {
  console.log("TEST: enforced to suspended succeeds");
  await withTempDir(async (dir) => {
    const store = createEnforcementPolicyStore({ dataDir: dir });
    await store.initialize();
    await store.approveTrack("enf-sus");
    await store.setTrackState("enf-sus", "eligible", { forceGate: true });
    await store.setTrackState("enf-sus", "enforced", { forceGate: true });
    const result = await store.setTrackState("enf-sus", "suspended");
    assert(result.ok === true, "enforced->suspended succeeds");
    assert(store.getTrackState("enf-sus") === "suspended", "now suspended");
  });
}

// ==================== Overrides ====================

async function testOverridePersistence() {
  console.log("TEST: override persists");
  await withTempDir(async (dir) => {
    const store = createEnforcementPolicyStore({ dataDir: dir });
    await store.initialize();
    const r = await store.setOverride({ trackId: "t", role: "r", modelId: "m", reason: "test" });
    assert(r.ok === true, "override created");
    assert(r.overrideId, "has overrideId");
    assert(store.hasOverride({ trackId: "t", role: "r", modelId: "m" }) === true, "override exists");
  });
}

async function testDuplicateOverrideRejected() {
  console.log("TEST: duplicate override rejected");
  await withTempDir(async (dir) => {
    const store = createEnforcementPolicyStore({ dataDir: dir });
    await store.initialize();
    await store.setOverride({ trackId: "t", role: "r", modelId: "m" });
    const r = await store.setOverride({ trackId: "t", role: "r", modelId: "m" });
    assert(r.ok === false, "duplicate rejected");
    assert(r.code === "DUPLICATE_OVERRIDE", "duplicate override code");
  });
}

async function testClearOverride() {
  console.log("TEST: clear override by overrideId");
  await withTempDir(async (dir) => {
    const store = createEnforcementPolicyStore({ dataDir: dir });
    await store.initialize();
    const r = await store.setOverride({ trackId: "t", role: "r", modelId: "m" });
    const overrideId = r.overrideId;
    assert(store.hasOverride({ trackId: "t", role: "r", modelId: "m" }) === true, "exists before clear");

    const clearR = await store.clearOverride(overrideId);
    assert(clearR.ok === true, "clear succeeded");
    assert(store.hasOverride({ trackId: "t", role: "r", modelId: "m" }) === false, "gone after clear");
  });
}

async function testClearOverrideByComposite() {
  console.log("TEST: clear override by composite key");
  await withTempDir(async (dir) => {
    const store = createEnforcementPolicyStore({ dataDir: dir });
    await store.initialize();
    await store.setOverride({ trackId: "t", role: "r", modelId: "m" });
    const r = await store.clearOverride({ trackId: "t", role: "r", modelId: "m" });
    assert(r.ok === true, "clear by composite succeeded");
    assert(store.hasOverride({ trackId: "t", role: "r", modelId: "m" }) === false, "gone");
  });
}

async function testClearMissingOverride() {
  console.log("TEST: clear missing override returns error");
  await withTempDir(async (dir) => {
    const store = createEnforcementPolicyStore({ dataDir: dir });
    await store.initialize();
    const r = await store.clearOverride("nonexistent-override-id");
    assert(r.ok === false, "clear missing returns error");
    assert(r.code === "OVERRIDE_NOT_FOUND", "override not found code");
  });
}

async function testOverrideRestartRecovery() {
  console.log("TEST: override survives restart");
  await withTempDir(async (dir) => {
    const s1 = createEnforcementPolicyStore({ dataDir: dir });
    await s1.initialize();
    await s1.setOverride({ trackId: "t", role: "r", modelId: "m", reason: "persist" });

    const s2 = createEnforcementPolicyStore({ dataDir: dir });
    await s2.initialize();
    assert(s2.hasOverride({ trackId: "t", role: "r", modelId: "m" }) === true, "override persisted after restart");
    const overrides = s2.getOverrides();
    assert(overrides.length === 1, "1 override after restart");
    assert(overrides[0].reason === "persist", "reason persisted");
  });
}

// ==================== Audit ====================

async function testSuccessfulMutationCreatesAuditEvent() {
  console.log("TEST: successful mutation creates audit event");
  await withTempDir(async (dir) => {
    const store = createEnforcementPolicyStore({ dataDir: dir });
    await store.initialize();
    await store.approveTrack("audit-track");

    const auditPath = join(dir, "enforcement-policy-audit.jsonl");
    const content = await readFile(auditPath, "utf8");
    const lines = content.trim().split("\n").filter(Boolean);
    const events = lines.map((l) => JSON.parse(l));
    const approveEvents = events.filter((e) => e.action === "track.approved");
    assert(approveEvents.length >= 1, "at least one approve event");
    assert(approveEvents[0].result === "success", "result is success");
  });
}

async function testRejectedMutationCreatesRejectionEvent() {
  console.log("TEST: rejected mutation creates rejection event");
  await withTempDir(async (dir) => {
    const store = createEnforcementPolicyStore({ dataDir: dir });
    await store.initialize();
    await store.setOverride({ trackId: "t", role: "r", modelId: "m" });
    const dup = await store.setOverride({ trackId: "t", role: "r", modelId: "m" });
    assert(dup.ok === false, "duplicate rejected");

    const auditPath = join(dir, "enforcement-policy-audit.jsonl");
    const content = await readFile(auditPath, "utf8");
    const lines = content.trim().split("\n").filter(Boolean);
    const events = lines.map((l) => JSON.parse(l));
    const rejectEvents = events.filter((e) => e.result === "rejected");
    assert(rejectEvents.length >= 1, "at least one rejected event");
    assert(rejectEvents.some((e) => e.errorCode === "DUPLICATE_OVERRIDE"), "duplicate override rejection logged");
  });
}

async function testInvalidStartupCreatesRejectionEvent() {
  console.log("TEST: invalid startup policy creates rejection event");
  await withTempDir(async (dir) => {
    const policyDir = join(dir, "policy");
    await mkdir(policyDir, { recursive: true });
    await writeFile(join(policyDir, "enforcement-policy.json"), "{{{broken}}}");

    const store = createEnforcementPolicyStore({ dataDir: dir });
    await store.initialize();

    const auditPath = join(dir, "enforcement-policy-audit.jsonl");
    const content = await readFile(auditPath, "utf8");
    const lines = content.trim().split("\n").filter(Boolean);
    const events = lines.map((l) => JSON.parse(l));
    const rejectEvents = events.filter((e) => e.action === "policy.load.rejected");
    assert(rejectEvents.length >= 1, "policy load rejected event");
    assert(rejectEvents[0].result === "rejected", "result is rejected");
  });
}

async function testBeforeAfterStatesInAudit() {
  console.log("TEST: audit events contain before/after states");
  await withTempDir(async (dir) => {
    const store = createEnforcementPolicyStore({ dataDir: dir });
    await store.initialize();
    await store.approveTrack("state-track");
    await store.setTrackState("state-track", "eligible", { forceGate: true });
    assert(store.getTrackState("state-track") === "eligible", "eligible before enforced");
    await store.setTrackState("state-track", "suspended");
    assert(store.getTrackState("state-track") === "suspended", "suspended");
    await store.setTrackState("state-track", "shadow");
    assert(store.getTrackState("state-track") === "shadow", "shadow");

    const auditPath = join(dir, "enforcement-policy-audit.jsonl");
    const content = await readFile(auditPath, "utf8");
    const lines = content.trim().split("\n").filter(Boolean);
    const events = lines.map((l) => JSON.parse(l));
    const stateEvents = events.filter((e) => e.action === "track.state.changed");
    assert(stateEvents.length >= 3, "at least 3 state change events");
    const event = stateEvents[1];
    assert(event.before !== null, "before present");
    assert(event.after !== null, "after present");
    assert(event.trackId === "state-track", "trackId recorded");
    assert(event.before.state === "eligible" || event.after.state === "eligible" || event.before.state != null, "state info present");
  });
}

async function testRevisionsMatchCommittedState() {
  console.log("TEST: audit revisions match committed state");
  await withTempDir(async (dir) => {
    const store = createEnforcementPolicyStore({ dataDir: dir });
    await store.initialize();
    await store.approveTrack("rev-track");

    const canonical = store.getCanonical();
    const auditPath = join(dir, "enforcement-policy-audit.jsonl");
    const content = await readFile(auditPath, "utf8");
    const lines = content.trim().split("\n").filter(Boolean);
    const events = lines.map((l) => JSON.parse(l));
    const lastEvent = events[events.length - 1];
    assert(lastEvent.committedRevision === canonical.revision, "revision matches committed state");
  });
}

// ==================== Regression ====================

async function testExistingShadowBehaviorUnchanged() {
  console.log("TEST: existing shadow behavior unchanged via store");
  await withTempDir(async (dir) => {
    const store = createEnforcementPolicyStore({ dataDir: dir });
    await store.initialize();
    assert(store.getTrackState("unknown") === "shadow", "unknown track defaults to shadow");
    assert(store.isTrackApproved("unknown") === false, "unknown track not approved");
    assert(store.getOverrides().length === 0, "no overrides initially");
  });
}

async function testNoTrackEnforcedAfterMigration() {
  console.log("TEST: no track enforced after migration/initialization");
  await withTempDir(async (dir) => {
    const store = createEnforcementPolicyStore({ dataDir: dir });
    await store.initialize();
    const tracks = store.getTrackStates();
    const enforcedTracks = Object.entries(tracks).filter(([_, state]) => state === "enforced");
    assert(enforcedTracks.length === 0, "no enforced tracks after init");
    assert(Object.keys(tracks).length === 0, "no tracks configured after init");
  });
}

async function testBackwardCompatibleEnforcementPolicy() {
  console.log("TEST: createEnforcementPolicy wrapper backward compatible");
  const policy = createEnforcementPolicy({
    getProviderStatus: async () => ({ available: true, modelReady: true })
  });
  assert(typeof policy.getTrackState === "function", "getTrackState exists");
  assert(typeof policy.setTrackState === "function", "setTrackState exists");
  assert(typeof policy.approveTrack === "function", "approveTrack exists");
  assert(typeof policy.revokeApproval === "function", "revokeApproval exists");
  assert(typeof policy.getOverrides === "function", "getOverrides exists");
  assert(typeof policy.evaluateEligibility === "function", "evaluateEligibility exists");
  assert(typeof policy.getPolicySummary === "function", "getPolicySummary exists");
  assert(typeof policy.getStore === "function", "getStore exists");
}

// ==================== State Graph Tests ====================

async function testAllValidTransitions() {
  console.log("TEST: all valid transitions");
  await withTempDir(async (dir) => {
    const store = createEnforcementPolicyStore({ dataDir: dir });
    await store.initialize();
    await store.approveTrack("t-state");

    await store.setTrackState("t-state", "disabled");
    assert(store.getTrackState("t-state") === "disabled", "shadow to disabled");

    await store.setTrackState("t-state", "shadow");
    assert(store.getTrackState("t-state") === "shadow", "disabled to shadow");

    await store.setTrackState("t-state", "eligible", { forceGate: true });
    assert(store.getTrackState("t-state") === "eligible", "shadow to eligible (forced)");

    await store.setTrackState("t-state", "shadow");
    assert(store.getTrackState("t-state") === "shadow", "eligible to shadow");

    await store.setTrackState("t-state", "eligible", { forceGate: true });
    await store.setTrackState("t-state", "enforced", { forceGate: true });
    assert(store.getTrackState("t-state") === "enforced", "eligible to enforced (forced)");

    await store.setTrackState("t-state", "suspended");
    assert(store.getTrackState("t-state") === "suspended", "enforced to suspended");

    await store.setTrackState("t-state", "eligible", { forceGate: true });
    assert(store.getTrackState("t-state") === "eligible", "suspended to eligible");

    await store.setTrackState("t-state", "shadow");
    assert(store.getTrackState("t-state") === "shadow", "eligible to shadow");
  });
}

async function testDisabledAllValidTransitions() {
  console.log("TEST: disabled state transitions");
  await withTempDir(async (dir) => {
    const store = createEnforcementPolicyStore({ dataDir: dir });
    await store.initialize();
    await store.setTrackState("d", "disabled");
    await store.setTrackState("d", "shadow");
    assert(store.getTrackState("d") === "shadow", "disabled->shadow ok");

    await store.setTrackState("d", "disabled");
    const r = await store.setTrackState("d", "eligible");
    assert(r.ok === false, "disabled->eligible rejected");
  });
}

// ==================== Policy Summary ====================

async function testPolicySummaryIncludesHealth() {
  console.log("TEST: policy summary includes store health");
  await withTempDir(async (dir) => {
    const policy = createEnforcementPolicy({
      dataDir: dir,
      getProviderStatus: async () => ({ available: true, modelReady: true })
    });
    const summary = policy.getPolicySummary();
    assert(summary.storeHealth !== undefined, "storeHealth present");
    assert(typeof summary.storeHealth.healthy === "boolean", "healthy boolean");
    assert(summary.defaultState === "shadow", "default shadow");
  });
}

// ==================== Run ====================

const tests = [
  testMissingPolicyFile,
  testValidPolicyLoad,
  testInvalidSchemaRejection,
  testMalformedJsonRejection,
  testUnsupportedSchemaVersion,
  testCorruptedFileSafeFallback,
  testCorruptionRemainsVisible,
  testNoSilentOverwrite,
  testAtomicWrite,
  testRevisionIncrement,
  testRestartRecovery,
  testApprovalPersistence,
  testApprovalRevocationPersistence,
  testRevokeEnforcedAtomicallySuspends,
  testRevokeEligibleMovesToShadow,
  testSuspensionPersistence,
  testRestorationPersistence,
  testInvalidStateTransition,
  testDirectEnforcedRejected,
  testEnteringEligibleWithoutApprovalRejected,
  testEnforcedToSuspendedSucceeds,
  testOverridePersistence,
  testDuplicateOverrideRejected,
  testClearOverride,
  testClearOverrideByComposite,
  testClearMissingOverride,
  testOverrideRestartRecovery,
  testSuccessfulMutationCreatesAuditEvent,
  testRejectedMutationCreatesRejectionEvent,
  testInvalidStartupCreatesRejectionEvent,
  testBeforeAfterStatesInAudit,
  testRevisionsMatchCommittedState,
  testExistingShadowBehaviorUnchanged,
  testNoTrackEnforcedAfterMigration,
  testBackwardCompatibleEnforcementPolicy,
  testAllValidTransitions,
  testDisabledAllValidTransitions,
  testPolicySummaryIncludesHealth
];

(async () => {
  console.log("==== Enforcement Policy Store Tests ====\n");
  for (const test of tests) {
    try {
      await test();
    } catch (error) {
      console.error(`  EXCEPTION in ${test.name}:`, error.message);
      failed++;
    }
  }

  const total = passed + failed;
  console.log(`\n${total} tests: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
