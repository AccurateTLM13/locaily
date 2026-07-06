const { createEnforcementPolicyStore, ALLOWED_STATES, DEFAULT_STATE } = require("./enforcement-policy-store");

const ENFORCEMENT_STATES = ALLOWED_STATES;
const DEFAULT_ENFORCEMENT_STATE = DEFAULT_STATE;
const MIN_SCORE_THRESHOLD = 0.7;

function getScoreThreshold(options, store) {
  if (options.scoreThreshold != null) return options.scoreThreshold;
  const canonical = store.getCanonical();
  if (canonical && canonical.metadata && canonical.metadata.minimumScoreThreshold != null) {
    return canonical.metadata.minimumScoreThreshold;
  }
  return MIN_SCORE_THRESHOLD;
}

function createEnforcementPolicy(options = {}) {
  const resolver = options.resolver;
  const getProviderStatus = options.getProviderStatus || (async () => ({ available: true, modelReady: true }));

  const store = createEnforcementPolicyStore({
    dataDir: options.dataDir,
    getCapabilityRegistry: options.getCapabilityRegistry,
    getProviderStatus,
    getShadowEvidence: options.getShadowEvidence
  });

  // Synchronously seed initial state from legacy constructor options
  if (store.syncApi) {
    if (options.trackStates) {
      for (const [trackId, state] of Object.entries(options.trackStates)) {
        store.syncApi._seedTrackStateSync(trackId, state);
      }
    }
    if (options.approvedTracks) {
      for (const trackId of options.approvedTracks) {
        store.syncApi._seedApprovalSync(trackId);
      }
    }
    if (options.overrides) {
      for (const [key, override] of Object.entries(options.overrides)) {
        store.syncApi._seedOverrideSync({
          trackId: override.trackId || key.split(":")[0],
          role: override.role || key.split(":")[1],
          modelId: override.modelId || key.split(":")[2],
          reason: override.reason || "Legacy override"
        });
      }
    }
  }

  async function ensureSeeded() {
    // Seeding was done synchronously in constructor, no-op
  }

  function getTrackState(trackId) {
    return store.getTrackState(trackId);
  }

  function getTrackStates() {
    return store.getTrackStates();
  }

  async function setTrackState(trackId, state, opts = {}) {
    await ensureSeeded();
    const transitionResult = store.validateStateTransition
      ? store.validateStateTransition(getTrackState(trackId), state)
      : { ok: ALLOWED_STATES.includes(state) };

    if (!transitionResult.ok) {
      return transitionResult;
    }

    return store.setTrackState(trackId, state, {
      updatedBy: opts.updatedBy || opts.actor || "operator",
      reason: opts.reason || null,
      role: opts.role,
      forceGate: opts.forceGate
    });
  }

  async function setOverride({ trackId, role, modelId, reason, updatedBy, expiresAt }) {
    await ensureSeeded();
    if (hasOverride({ trackId, role, modelId })) {
      return { ok: false, code: "DUPLICATE_OVERRIDE", message: `Override already exists for ${trackId}:${role}:${modelId}.` };
    }
    if (options.dataDir && store.syncApi) {
      return store.setOverride({ trackId, role, modelId, reason, updatedBy: updatedBy || "operator", expiresAt });
    }
    if (store.syncApi) {
      store.syncApi._seedOverrideSync({ trackId, role, modelId, reason: reason || "Manual override" });
    }
    return { ok: true, overrideId: "sync_override" };
  }

  async function clearOverride(identifier, opts = {}) {
    await ensureSeeded();
    return store.clearOverride(identifier, { updatedBy: opts.updatedBy || "operator", reason: opts.reason || null });
  }

  function getOverrides() {
    return store.getOverrides();
  }

  function hasOverride({ trackId, role, modelId }) {
    return store.hasOverride({ trackId, role, modelId });
  }

  async function approveTrack(trackId, opts = {}) {
    await ensureSeeded();
    return store.approveTrack(trackId, { updatedBy: opts.updatedBy || "operator", reason: opts.reason || null });
  }

  async function revokeApproval(trackId, opts = {}) {
    await ensureSeeded();
    return store.revokeApproval(trackId, { updatedBy: opts.updatedBy || "operator", reason: opts.reason || null });
  }

  function isTrackApproved(trackId) {
    return store.isTrackApproved(trackId);
  }

  let scoreThreshold = getScoreThreshold(options, store);

  async function evaluateEligibility({
    trackId, role, recommendedCapabilityId, contractId, score,
    qualificationState, comparisonState,
    selectedQualificationState, recommendedQualificationState
  }) {
    await ensureSeeded();
    scoreThreshold = getScoreThreshold(options, store);
    const trackState = getTrackState(trackId);
    const eligibility = {
      eligible: false,
      trackId, role, recommendedCapabilityId,
      trackState, checks: [], blocks: [], canEnforce: false
    };

    if (trackState === "disabled") {
      eligibility.blocks.push("Enforcement is disabled for this track.");
      eligibility.checks.push({ check: "track_state", passed: false, detail: `Track state is '${trackState}'` });
      return eligibility;
    }
    eligibility.checks.push({ check: "track_state", passed: true, detail: `Track state is '${trackState}'` });

    if (trackState === "shadow") {
      eligibility.blocks.push("Track is in shadow mode — observe only.");
      return eligibility;
    }

    if (trackState === "suspended") {
      eligibility.blocks.push("Enforcement is suspended for this track.");
      eligibility.checks.push({ check: "track_suspended", passed: false, detail: "Track is suspended." });
      return eligibility;
    }

    if (!isTrackApproved(trackId)) {
      eligibility.blocks.push("Track is not approved for enforcement.");
      eligibility.checks.push({ check: "track_approved", passed: false, detail: "Track not in approved list." });
      return eligibility;
    }
    eligibility.checks.push({ check: "track_approved", passed: true });

    if (comparisonState === "insufficient-evidence" || comparisonState === "recommendation-unavailable") {
      eligibility.blocks.push(`Cannot enforce: comparison state is '${comparisonState}'.`);
      eligibility.checks.push({ check: "comparison_state", passed: false, detail: `State is '${comparisonState}'` });
      return eligibility;
    }

    const effectiveQualificationState = recommendedQualificationState || qualificationState;
    if (effectiveQualificationState !== "qualified") {
      eligibility.blocks.push(`Recommended capability state is '${effectiveQualificationState}', not 'qualified'.`);
      eligibility.checks.push({ check: "qualification_state", passed: false, detail: `State is '${effectiveQualificationState}'` });
      return eligibility;
    }
    eligibility.checks.push({ check: "qualification_state", passed: true });

    if (score != null && score < scoreThreshold) {
      eligibility.blocks.push(`Score ${score} is below threshold ${scoreThreshold}.`);
      eligibility.checks.push({ check: "score_threshold", passed: false, detail: `Score ${score} < ${scoreThreshold}` });
      return eligibility;
    }
    eligibility.checks.push({ check: "score_threshold", passed: true, detail: `Score ${score || "N/A"} >= ${scoreThreshold}` });

    if (hasOverride({ trackId, role, modelId: recommendedCapabilityId })) {
      eligibility.blocks.push("Active override blocks this recommendation.");
      eligibility.checks.push({ check: "active_override", passed: false, detail: "Override exists for this capability." });
      return eligibility;
    }
    eligibility.checks.push({ check: "active_override", passed: true });

    try {
      const providerStatus = await getProviderStatus(recommendedCapabilityId);
      if (!providerStatus.available) {
        eligibility.blocks.push("Runtime is not available.");
        eligibility.checks.push({ check: "runtime_available", passed: false, detail: "Provider unavailable." });
        return eligibility;
      }
      eligibility.checks.push({ check: "runtime_available", passed: true });

      if (!providerStatus.modelReady) {
        eligibility.blocks.push("Recommended model is not ready on the runtime.");
        eligibility.checks.push({ check: "model_ready", passed: false, detail: `Model '${recommendedCapabilityId}' not ready.` });
        return eligibility;
      }
      eligibility.checks.push({ check: "model_ready", passed: true });
    } catch (error) {
      eligibility.blocks.push("Runtime check failed.");
      eligibility.checks.push({ check: "runtime_check", passed: false, detail: error.message });
      return eligibility;
    }

    if (trackState === "eligible" || trackState === "enforced") {
      eligibility.eligible = true;
      eligibility.canEnforce = trackState === "enforced";
      eligibility.checks.push({ check: "enforcement_state", passed: true, detail: `Track state '${trackState}' allows ${trackState === "enforced" ? "enforcement" : "eligibility"}.` });
    }

    return eligibility;
  }

  function getPolicySummary() {
    const health = store.getStoreHealth();
    return {
      states: ALLOWED_STATES,
      defaultState: DEFAULT_STATE,
      scoreThreshold: getScoreThreshold(options, store),
      trackStates: getTrackStates(),
      approvedTracks: Object.entries(store.getCanonical()?.tracks || {})
        .filter(([_, rec]) => rec.approved)
        .map(([id]) => id),
      activeOverrides: getOverrides().length,
      trackCount: Object.keys(store.getCanonical()?.tracks || {}).length,
      storeHealth: {
        healthy: health.healthy,
        safeFallback: health.safeFallback,
        enforcementLocked: health.enforcementLocked,
        revision: health.revision,
        schemaVersion: health.schemaVersion,
        loadError: health.loadError
      }
    };
  }

  function getStore() {
    return store;
  }

  return {
    ENFORCEMENT_STATES,
    getTrackState,
    getTrackStates,
    setTrackState,
    setOverride,
    clearOverride,
    getOverrides,
    hasOverride,
    approveTrack,
    revokeApproval,
    isTrackApproved,
    evaluateEligibility,
    getPolicySummary,
    getStore,
    store
  };
}

module.exports = { createEnforcementPolicy, ENFORCEMENT_STATES, DEFAULT_ENFORCEMENT_STATE };
