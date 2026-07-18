function createBackgroundWorker(options = {}) {
  const { durableJobStore, executionCallbacks, config = {} } = options;

  const pollIntervalMs = config.pollIntervalMs || 5000;
  const workerName = config.workerName || "background-worker";

  let intervalHandle = null;
  let started = false;
  let isProcessing = false;
  let currentJobId = null;
  let lastActivity = null;

  function getStatus() {
    return {
      running: started && intervalHandle !== null,
      stopped: !started || intervalHandle === null,
      pollIntervalMs,
      workerName,
      currentJobId,
      lastActivity,
      isProcessing
    };
  }

  function start() {
    if (started) return;
    started = true;
    intervalHandle = setInterval(poll, pollIntervalMs);
    console.log(`[Background Worker] Started (poll every ${pollIntervalMs}ms, name: ${workerName})`);
  }

  function stop() {
    if (intervalHandle) {
      clearInterval(intervalHandle);
      intervalHandle = null;
    }
    started = false;
    currentJobId = null;
    isProcessing = false;
    console.log(`[Background Worker] Stopped`);
  }

  async function poll() {
    if (isProcessing) {
      return;
    }

    try {
      isProcessing = true;

      const claimableJobs = durableJobStore.listClaimableJobs();

      if (claimableJobs.length === 0) {
        isProcessing = false;
        return;
      }

      const job = claimableJobs[0];

      const claimResult = durableJobStore.claimJob(job.jobId, workerName);
      if (!claimResult.ok) {
        isProcessing = false;
        return;
      }

      console.log(`[Background Worker] Claimed job ${job.jobId} (${job.executionType})`);
      currentJobId = job.jobId;
      lastActivity = new Date().toISOString();

      const startResult = durableJobStore.startJob(job.jobId);
      if (!startResult.ok) {
        currentJobId = null;
        isProcessing = false;
        return;
      }

      console.log(`[Background Worker] Started job ${job.jobId}`);

      let executionResult;
      try {
        if (job.executionType === "track") {
          executionResult = await executionCallbacks.runTrack(
            job.trackId,
            job.input,
            job.context,
            job.options
          );
        } else if (job.executionType === "workflow") {
          executionResult = await executionCallbacks.runWorkflow(
            job.workflowId,
            job.input,
            job.context,
            job.options
          );
        }

        const completeResult = durableJobStore.completeJob(job.jobId, executionResult);
        if (completeResult.ok) {
          console.log(`[Background Worker] Completed job ${job.jobId}`);
        }
      } catch (error) {
        const errorDetails = {
          code: error.code || "EXECUTION_FAILED",
          message: error.message || "Job execution failed.",
          retryable: error.retryable !== false,
          details: error.details || {}
        };

        const failResult = durableJobStore.failJob(job.jobId, errorDetails);
        if (failResult.ok) {
          console.log(`[Background Worker] Failed job ${job.jobId}: ${errorDetails.message}`);

          const shouldRetry = errorDetails.retryable !== false
            && job.attempt < job.maxAttempts - 1;

          if (shouldRetry) {
            const retryResult = durableJobStore.retryJob(job.jobId);
            if (retryResult.ok) {
              console.log(`[Background Worker] Retried job ${job.jobId} (attempt ${job.attempt + 1}/${job.maxAttempts})`);
            } else {
              console.log(`[Background Worker] Job ${job.jobId} not retried: ${retryResult.message}`);
            }
          } else {
            console.log(`[Background Worker] Job ${job.jobId} not retried (max attempts exhausted or non-retryable)`);
          }
        }
      }

      currentJobId = null;
      isProcessing = false;
      lastActivity = new Date().toISOString();
    } catch (pollError) {
      console.error(`[Background Worker] Poll error: ${pollError.message}`);
      isProcessing = false;
    }
  }

  return {
    start,
    stop,
    getStatus
  };
}

module.exports = { createBackgroundWorker };
