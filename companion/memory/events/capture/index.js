const { init, recordCaptureEvent, recordCaptureEventNonBlocking, getCaptureGateState } = require("./recorder");
const adapters = require("./adapters");
const { buildStableEventId } = require("./event-id");
const { configureCaptureGate, setCapturePaused, shouldCaptureEvent } = require("./capture-gate");
const { loadCapturePolicy, resolveCaptureEnabled, isEventTypeAllowed } = require("./capture-policy-loader");
const { createDevelopmentCaptureProcessor } = require("./capture-processor");
const { createDevelopmentCaptureProcessorStore } = require("./capture-processor-store");
const { createDevelopmentCaptureWorker } = require("./capture-worker");

module.exports = {
  init,
  recordCaptureEvent,
  recordCaptureEventNonBlocking,
  getCaptureGateState,
  buildStableEventId,
  configureCaptureGate,
  setCapturePaused,
  shouldCaptureEvent,
  loadCapturePolicy,
  resolveCaptureEnabled,
  isEventTypeAllowed,
  createDevelopmentCaptureProcessor,
  createDevelopmentCaptureProcessorStore,
  createDevelopmentCaptureWorker,
  ...adapters
};
