const {
  loadCapturePolicy,
  resolveCaptureEnabled,
  isEventTypeAllowed
} = require("./capture-policy-loader");

let gateState = {
  initialized: false,
  captureEnabled: true,
  paused: false,
  policy: null,
  policyPath: null,
  warnings: []
};

function configureCaptureGate(options = {}) {
  const loaded = loadCapturePolicy(options);
  const previous = gateState.initialized ? gateState : {};

  gateState = {
    initialized: true,
    captureEnabled: resolveCaptureEnabled(loaded.policy, options),
    paused: options.paused !== undefined ? Boolean(options.paused) : Boolean(previous.paused),
    policy: loaded.policy,
    policyPath: loaded.policyPath,
    warnings: loaded.warnings
  };

  return gateState;
}

function getCaptureGateState() {
  if (!gateState.initialized) {
    configureCaptureGate({});
  }

  return gateState;
}

function setCapturePaused(paused) {
  getCaptureGateState();
  gateState.paused = Boolean(paused);
  return gateState;
}

function shouldCaptureEvent(eventType) {
  const state = getCaptureGateState();

  if (!state.captureEnabled) {
    return { allowed: false, reason: "capture_disabled" };
  }

  if (state.paused) {
    return { allowed: false, reason: "capture_paused" };
  }

  if (!isEventTypeAllowed(eventType, state.policy)) {
    return { allowed: false, reason: "capture_policy_blocked" };
  }

  return { allowed: true, reason: null };
}

module.exports = {
  configureCaptureGate,
  getCaptureGateState,
  setCapturePaused,
  shouldCaptureEvent
};
