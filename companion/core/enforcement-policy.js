const ENFORCEMENT_STATES = ["disabled", "shadow", "eligible", "enforced", "suspended"];
const DEFAULT_ENFORCEMENT_STATE = "shadow";
const MIN_SCORE_THRESHOLD = 0.7;

function createEnforcementPolicy(options = {}) {
  const resolver = options.resolver;
  const getProviderStatus = options.getProviderStatus || (async () => ({ available: true, modelReady: true }));
  const trackStates = new Map(Object.entries(options.trackStates || {}));
  const overrides = new Map(Object.entries(options.overrides || {}));
  const approvedTracks = new Set(options.approvedTracks || []);
  const scoreThreshold = options.scoreThreshold != null ? options.scoreThreshold : MIN_SCORE_THRESHOLD;

  function getTrackState(trackId) {
    return trackStates.get(trackId) || DEFAULT_ENFORCEMENT_STATE;
  }

  function getTrackStates() {
    const result = {};
    for (const [trackId, state] of trackStates) {
      result[trackId] = state;
    }
    return result;
  }

  function setTrackState(trackId, state) {
    if (!ENFORCEMENT_STATES.includes(state)) {
      return {
        ok: false,
        error: {
          code: "INVALID_ENFORCEMENT_STATE",
          message: `'${state}' is not a valid enforcement state.`,
          nextStep: `Use one of: ${ENFORCEMENT_STATES.join(", ")}.`
        }
      };
    }
    trackStates.set(trackId, state);
    return { ok: true, trackId, state };
  }

  function setOverride({ trackId, role, modelId, reason }) {
    const key = `${trackId}:${role}:${modelId}`;
    overrides.set(key, { trackId, role, modelId, reason, createdAt: new Date().toISOString() });
    return { ok: true, key };
  }

  function clearOverride({ trackId, role, modelId }) {
    const key = `${trackId}:${role}:${modelId}`;
    return overrides.delete(key);
  }

  function getOverrides() {
    return Array.from(overrides.values());
  }

  function hasOverride({ trackId, role, modelId }) {
    const key = `${trackId}:${role}:${modelId}`;
    return overrides.has(key);
  }

  function approveTrack(trackId) {
    approvedTracks.add(trackId);
    if (!trackStates.has(trackId)) {
      trackStates.set(trackId, "shadow");
    }
    return { ok: true, trackId };
  }

  function isTrackApproved(trackId) {
    return approvedTracks.has(trackId);
  }

  async function evaluateEligibility({ trackId, role, recommendedCapabilityId, contractId, score, qualificationState, comparisonState }) {
    const trackState = getTrackState(trackId);
    const eligibility = {
      eligible: false,
      trackId,
      role,
      recommendedCapabilityId,
      trackState,
      checks: [],
      blocks: [],
      canEnforce: false
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

    if (qualificationState !== "qualified") {
      eligibility.blocks.push(`Recommended capability state is '${qualificationState}', not 'qualified'.`);
      eligibility.checks.push({ check: "qualification_state", passed: false, detail: `State is '${qualificationState}'` });
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
      const providerStatus = await getProviderStatus();
      if (!providerStatus.available) {
        eligibility.blocks.push("Runtime is not available.");
        eligibility.checks.push({ check: "runtime_available", passed: false, detail: "Provider unavailable." });
        return eligibility;
      }
      eligibility.checks.push({ check: "runtime_available", passed: true });

      if (recommendedCapabilityId && !providerStatus.modelReady) {
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
    return {
      states: ENFORCEMENT_STATES,
      defaultState: DEFAULT_ENFORCEMENT_STATE,
      scoreThreshold,
      trackStates: getTrackStates(),
      approvedTracks: Array.from(approvedTracks),
      activeOverrides: getOverrides().length,
      trackCount: trackStates.size
    };
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
    isTrackApproved,
    evaluateEligibility,
    getPolicySummary
  };
}

module.exports = { createEnforcementPolicy, ENFORCEMENT_STATES, DEFAULT_ENFORCEMENT_STATE };
