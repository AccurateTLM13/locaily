function createDevelopmentCaptureWorker(options = {}) {
  const processor = options.processor;
  const pollIntervalMs = options.pollIntervalMs || 15000;
  const workerName = options.workerName || "development-capture-worker";

  if (!processor) {
    throw new Error("createDevelopmentCaptureWorker requires a capture processor.");
  }

  let intervalHandle = null;
  let started = false;
  let isProcessing = false;
  let lastActivity = null;
  let lastResult = null;
  let lastError = null;

  function getStatus() {
    return {
      running: started && intervalHandle !== null,
      stopped: !started || intervalHandle === null,
      pollIntervalMs,
      workerName,
      isProcessing,
      lastActivity,
      lastResult,
      lastError
    };
  }

  async function tick() {
    if (isProcessing) {
      return;
    }

    isProcessing = true;
    lastActivity = new Date().toISOString();

    try {
      lastResult = await processor.processOnce();
      lastError = null;
    } catch (error) {
      lastError = error.message || String(error);
      lastResult = {
        ok: false,
        error: {
          code: "CAPTURE_WORKER_FAILED",
          message: lastError
        }
      };
    } finally {
      isProcessing = false;
    }
  }

  function poll() {
    void tick();
  }

  function start() {
    if (started) {
      return;
    }

    started = true;
    intervalHandle = setInterval(poll, pollIntervalMs);
    void tick();
  }

  function stop() {
    if (intervalHandle) {
      clearInterval(intervalHandle);
      intervalHandle = null;
    }

    started = false;
    isProcessing = false;
  }

  return {
    start,
    stop,
    poll,
    tick,
    getStatus
  };
}

module.exports = {
  createDevelopmentCaptureWorker
};
