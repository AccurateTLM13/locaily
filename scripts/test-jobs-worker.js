const { mkdir, rm } = require("node:fs/promises");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const { createDurableJobStore } = require("../companion/core/durable-job-store");
const { createBackgroundWorker } = require("../companion/jobs/worker");

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

async function withTempDir(fn) {
  const dir = join(tmpdir(), `worker-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  await mkdir(dir, { recursive: true });
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForJobStatus(store, jobId, expectedStatus, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = store.getJob(jobId);
    if (job && job.status === expectedStatus) return job;
    await sleep(100);
  }
  const job = store.getJob(jobId);
  return job;
}

async function waitForWorkerIdle(worker, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = worker.getStatus();
    if (!status.isProcessing && status.currentJobId === null) return;
    await sleep(100);
  }
}

// ==================== Success Path Tests ====================

async function testWorkerCompletesTrackJob() {
  console.log("TEST: worker claims and completes a track-type job");
  await withTempDir(async (dir) => {
    const store = createDurableJobStore({ dataDir: dir });
    const created = store.createJob({
      executionType: "track",
      trackId: "test.lighthouse",
      input: { url: "https://example.com" },
      context: { memory: {} },
      options: { modelRole: "default_worker" }
    });
    const jobId = created.job.jobId;

    const worker = createBackgroundWorker({
      durableJobStore: store,
      executionCallbacks: {
        runTrack: async (trackId, input, context, options) => {
          return { summary: `Processed ${trackId} for ${input.url}` };
        },
        runWorkflow: async () => { throw new Error("not expected"); }
      },
      config: { pollIntervalMs: 100, workerName: "test-worker" }
    });

    worker.start();
    const completed = await waitForJobStatus(store, jobId, "completed");
    worker.stop();

    assert(completed !== null, "job found");
    assert(completed.status === "completed", "job completed");
    assert(completed.result.summary === "Processed test.lighthouse for https://example.com", "result stored");
    assert(completed.lease === null, "lease cleared");
  });
}

async function testWorkerCompletesWorkflowJob() {
  console.log("TEST: worker claims and completes a workflow-type job");
  await withTempDir(async (dir) => {
    const store = createDurableJobStore({ dataDir: dir });
    const created = store.createJob({
      executionType: "workflow",
      workflowId: "lighthouse_full",
      input: { url: "https://example.com" },
      context: {},
      options: {}
    });
    const jobId = created.job.jobId;

    const worker = createBackgroundWorker({
      durableJobStore: store,
      executionCallbacks: {
        runTrack: async () => { throw new Error("not expected"); },
        runWorkflow: async (workflowId, input, context, options) => {
          return { completed: true, workflowId, url: input.url };
        }
      },
      config: { pollIntervalMs: 100, workerName: "test-worker" }
    });

    worker.start();
    const completed = await waitForJobStatus(store, jobId, "completed");
    worker.stop();

    assert(completed !== null, "job found");
    assert(completed.status === "completed", "job completed");
    assert(completed.result.completed === true, "result has completed flag");
    assert(completed.result.workflowId === "lighthouse_full", "workflowId in result");
    assert(completed.result.url === "https://example.com", "url in result");
  });
}

// ==================== Failure and Retry Tests ====================

async function testWorkerFailsAndRetries() {
  console.log("TEST: worker fails a job with retryable error, retries");
  await withTempDir(async (dir) => {
    const store = createDurableJobStore({ dataDir: dir });
    const created = store.createJob({
      executionType: "track",
      trackId: "test.fail",
      input: {},
      context: {},
      options: {},
      maxAttempts: 3
    });
    const jobId = created.job.jobId;

    let callCount = 0;
    const worker = createBackgroundWorker({
      durableJobStore: store,
      executionCallbacks: {
        runTrack: async () => {
          callCount++;
          const err = new Error("Runtime error");
          err.code = "RUNTIME_ERROR";
          err.retryable = true;
          throw err;
        },
        runWorkflow: async () => { throw new Error("not expected"); }
      },
      config: { pollIntervalMs: 100, workerName: "test-worker" }
    });

    worker.start();
    // Wait for job to be claimed (status goes to queued after retry, then claimed again during second attempt)
    await sleep(2000);
    worker.stop();

    // After retry, the job should have been re-queued. But since the callback always fails,
    // the job should eventually exhaust retries and stay failed.
    const finalJob = store.getJob(jobId);
    assert(finalJob !== null, "job found");
    assert(finalJob.status === "failed", "job ended in failed after retry exhaustion");
    assert(finalJob.attempt > 0, "attempts were made");
    assert(callCount > 1, "execution callback called multiple times");
  });
}

async function testWorkerDoesNotRetryOnMaxAttemptsExhausted() {
  console.log("TEST: worker does NOT retry when maxAttempts is exhausted");
  await withTempDir(async (dir) => {
    const store = createDurableJobStore({ dataDir: dir });
    const created = store.createJob({
      executionType: "track",
      trackId: "test.exhaust",
      input: {},
      context: {},
      options: {},
      maxAttempts: 1
    });
    const jobId = created.job.jobId;

    const worker = createBackgroundWorker({
      durableJobStore: store,
      executionCallbacks: {
        runTrack: async () => {
          const err = new Error("Will not retry");
          err.code = "FATAL";
          err.retryable = true;
          throw err;
        },
        runWorkflow: async () => { throw new Error("not expected"); }
      },
      config: { pollIntervalMs: 100, workerName: "test-worker" }
    });

    worker.start();
    const failed = await waitForJobStatus(store, jobId, "failed");
    worker.stop();

    assert(failed !== null, "job found");
    assert(failed.status === "failed", "job ended in failed");
    assert(failed.attempt === 0, "no retry occurred (attempt still 0)");
    assert(failed.error !== null, "error recorded");
  });
}

async function testWorkerDoesNotRetryWhenErrorNotRetryable() {
  console.log("TEST: worker does NOT retry when error has retryable: false");
  await withTempDir(async (dir) => {
    const store = createDurableJobStore({ dataDir: dir });
    const created = store.createJob({
      executionType: "track",
      trackId: "test.nonretry",
      input: {},
      context: {},
      options: {},
      maxAttempts: 3
    });
    const jobId = created.job.jobId;

    const worker = createBackgroundWorker({
      durableJobStore: store,
      executionCallbacks: {
        runTrack: async () => {
          const err = new Error("Non-retryable failure");
          err.code = "SCHEMA_ERROR";
          err.retryable = false;
          throw err;
        },
        runWorkflow: async () => { throw new Error("not expected"); }
      },
      config: { pollIntervalMs: 100, workerName: "test-worker" }
    });

    worker.start();
    const failed = await waitForJobStatus(store, jobId, "failed");
    worker.stop();

    assert(failed !== null, "job found");
    assert(failed.status === "failed", "job ended in failed");
    assert(failed.attempt === 0, "no retry occurred (attempt still 0)");
    assert(failed.error.code === "SCHEMA_ERROR", "error code matches");
    assert(failed.error.retryable === false, "error marked non-retryable");
  });
}

async function testWorkerFailsWorkflowWithFailedStatus() {
  console.log("TEST: worker marks job failed when workflow returns failed status without throwing");
  await withTempDir(async (dir) => {
    const store = createDurableJobStore({ dataDir: dir });
    const created = store.createJob({
      executionType: "workflow",
      workflowId: "lighthouse_full",
      input: {},
      context: {},
      options: {},
      maxAttempts: 1
    });
    const jobId = created.job.jobId;

    const worker = createBackgroundWorker({
      durableJobStore: store,
      executionCallbacks: {
        runTrack: async () => { throw new Error("not expected"); },
        runWorkflow: async () => ({
          plan: { status: "failed", workflow_id: "lighthouse_full" },
          result: {},
          schemaValid: true,
          validation: { ok: false, errors: ["step failed"] },
          durationMs: 12,
          evidence: null
        })
      },
      config: { pollIntervalMs: 100, workerName: "test-worker" }
    });

    worker.start();
    const failed = await waitForJobStatus(store, jobId, "failed");
    worker.stop();

    assert(failed !== null, "job found");
    assert(failed.status === "failed", "job ended in failed");
    assert(failed.error && failed.error.code === "WORKFLOW_FAILED", "workflow failure code recorded");
  });
}

async function testWorkerFailsTrackWithInvalidSchema() {
  console.log("TEST: worker marks job failed when track returns schemaValid false");
  await withTempDir(async (dir) => {
    const store = createDurableJobStore({ dataDir: dir });
    const created = store.createJob({
      executionType: "track",
      trackId: "test.invalid_schema",
      input: {},
      context: {},
      options: {},
      maxAttempts: 1
    });
    const jobId = created.job.jobId;

    const worker = createBackgroundWorker({
      durableJobStore: store,
      executionCallbacks: {
        runTrack: async () => ({
          track_id: "test.invalid_schema",
          result: { meta: { verification: { valid: true } } },
          schemaValid: false,
          durationMs: 5,
          evidence: null
        }),
        runWorkflow: async () => { throw new Error("not expected"); }
      },
      config: { pollIntervalMs: 100, workerName: "test-worker" }
    });

    worker.start();
    const failed = await waitForJobStatus(store, jobId, "failed");
    worker.stop();

    assert(failed !== null, "job found");
    assert(failed.status === "failed", "job ended in failed");
    assert(failed.error && failed.error.code === "SCHEMA_VALIDATION_FAILED", "schema failure code recorded");
  });
}

// ==================== Single Concurrency Tests ====================

async function testWorkerProcessesOneJobPerCycle() {
  console.log("TEST: worker processes only one job per cycle (isProcessing guard)");
  await withTempDir(async (dir) => {
    const store = createDurableJobStore({ dataDir: dir });

    // Create two jobs
    const j1 = store.createJob({
      executionType: "track", trackId: "test.a",
      input: { id: "a" }, context: {}, options: {}
    });
    const j2 = store.createJob({
      executionType: "track", trackId: "test.b",
      input: { id: "b" }, context: {}, options: {}
    });

    let concurrentCalls = 0;
    let maxConcurrent = 0;

    const worker = createBackgroundWorker({
      durableJobStore: store,
      executionCallbacks: {
        runTrack: async (trackId) => {
          concurrentCalls++;
          if (concurrentCalls > maxConcurrent) maxConcurrent = concurrentCalls;
          await sleep(500); // simulate work
          concurrentCalls--;
          return { processed: trackId };
        },
        runWorkflow: async () => { throw new Error("not expected"); }
      },
      config: { pollIntervalMs: 50, workerName: "test-worker" }
    });

    worker.start();

    // Both should complete, but never concurrently
    await waitForJobStatus(store, j1.job.jobId, "completed");
    await waitForJobStatus(store, j2.job.jobId, "completed");

    worker.stop();

    assert(store.getJob(j1.job.jobId).status === "completed", "j1 completed");
    assert(store.getJob(j2.job.jobId).status === "completed", "j2 completed");
    assert(maxConcurrent <= 1, "never processed more than 1 concurrently");
  });
}

async function testWorkerSkipsPollWhileProcessing() {
  console.log("TEST: worker skips poll while processing (does not double-claim)");
  await withTempDir(async (dir) => {
    const store = createDurableJobStore({ dataDir: dir });
    const created = store.createJob({
      executionType: "track", trackId: "test.slow",
      input: {}, context: {}, options: {}
    });
    const jobId = created.job.jobId;

    let startClaimed = null;

    const worker = createBackgroundWorker({
      durableJobStore: store,
      executionCallbacks: {
        runTrack: async () => {
          startClaimed = store.getJob(jobId);

          // During execution, poll should be skipped.
          // If another claim happened, the status would be claimed again.
          // Since listClaimableJobs only returns queued or expired-lease jobs,
          // and our job is "running", nothing should change.
          await sleep(1000);

          // Verify no other claim happened
          const during = store.getJob(jobId);
          assert(during.status === "running", "job stays running during processing (no double claim)");

          return { result: "done" };
        },
        runWorkflow: async () => { throw new Error("not expected"); }
      },
      config: { pollIntervalMs: 50, workerName: "test-worker" }
    });

    worker.start();
    const completed = await waitForJobStatus(store, jobId, "completed");
    worker.stop();

    assert(completed !== null, "job completed");
    assert(completed.status === "completed", "job status is completed");
  });
}

// ==================== Polling and Status Tests ====================

async function testWorkerPollsForNewJobs() {
  console.log("TEST: worker polls for new jobs after completing current work");
  await withTempDir(async (dir) => {
    const store = createDurableJobStore({ dataDir: dir });

    const j1 = store.createJob({
      executionType: "track", trackId: "test.first",
      input: { id: 1 }, context: {}, options: {}
    });
    const j2 = store.createJob({
      executionType: "track", trackId: "test.second",
      input: { id: 2 }, context: {}, options: {}
    });

    const processedIds = [];
    const worker = createBackgroundWorker({
      durableJobStore: store,
      executionCallbacks: {
        runTrack: async (trackId) => {
          processedIds.push(trackId);
          return { processed: trackId };
        },
        runWorkflow: async () => { throw new Error("not expected"); }
      },
      config: { pollIntervalMs: 100, workerName: "test-worker" }
    });

    worker.start();

    // Wait for both jobs to complete
    await waitForJobStatus(store, j1.job.jobId, "completed");
    await waitForJobStatus(store, j2.job.jobId, "completed");

    worker.stop();

    assert(processedIds.length === 2, "both jobs processed");
    assert(processedIds.includes("test.first"), "first job processed");
    assert(processedIds.includes("test.second"), "second job processed");
  });
}

async function testWorkerGetStatus() {
  console.log("TEST: getStatus() returns correct running/stopped state");
  await withTempDir(async (dir) => {
    const store = createDurableJobStore({ dataDir: dir });

    const worker = createBackgroundWorker({
      durableJobStore: store,
      executionCallbacks: {
        runTrack: async () => ({ ok: true }),
        runWorkflow: async () => ({ ok: true })
      },
      config: { pollIntervalMs: 5000, workerName: "status-test" }
    });

    // Initially stopped
    let status = worker.getStatus();
    assert(status.running === false, "initially not running");
    assert(status.stopped === true, "initially stopped");
    assert(status.pollIntervalMs === 5000, "poll interval set");
    assert(status.workerName === "status-test", "worker name set");
    assert(status.isProcessing === false, "not processing");
    assert(status.currentJobId === null, "no current job");

    // Start
    worker.start();
    status = worker.getStatus();
    assert(status.running === true, "running after start");
    assert(status.stopped === false, "not stopped after start");

    // Stop
    worker.stop();
    status = worker.getStatus();
    assert(status.running === false, "not running after stop");
    assert(status.stopped === true, "stopped after stop");
  });
}

async function testWorkerStartStop() {
  console.log("TEST: stop() halts polling, start() resumes it");
  await withTempDir(async (dir) => {
    const store = createDurableJobStore({ dataDir: dir });

    const worker = createBackgroundWorker({
      durableJobStore: store,
      executionCallbacks: {
        runTrack: async () => ({ ok: true }),
        runWorkflow: async () => ({ ok: true })
      },
      config: { pollIntervalMs: 100, workerName: "start-stop-test" }
    });

    // Create a job
    const created = store.createJob({
      executionType: "track", trackId: "test.stop",
      input: {}, context: {}, options: {}
    });
    const jobId = created.job.jobId;

    // Start and verify it processes
    worker.start();
    await waitForJobStatus(store, jobId, "completed");
    worker.stop();
    assert(worker.getStatus().running === false, "stopped after processing");

    // Create another job while stopped
    const created2 = store.createJob({
      executionType: "track", trackId: "test.resume",
      input: {}, context: {}, options: {}
    });
    const jobId2 = created2.job.jobId;

    // Should not process while stopped
    await sleep(500);
    const stillQueued = store.getJob(jobId2);
    assert(stillQueued.status === "queued", "job stays queued while worker stopped");

    // Restart
    worker.start();
    await waitForJobStatus(store, jobId2, "completed");
    worker.stop();

    assert(store.getJob(jobId2).status === "completed", "job completed after restart");
  });
}

// ==================== Run All Tests ====================

async function runAllTests() {
  console.log("=== Background Worker Tests ===\n");

  // Success paths
  await testWorkerCompletesTrackJob();
  await testWorkerCompletesWorkflowJob();

  // Failure and retry paths
  await testWorkerFailsAndRetries();
  await testWorkerDoesNotRetryOnMaxAttemptsExhausted();
  await testWorkerDoesNotRetryWhenErrorNotRetryable();
  await testWorkerFailsWorkflowWithFailedStatus();
  await testWorkerFailsTrackWithInvalidSchema();

  // Single concurrency
  await testWorkerProcessesOneJobPerCycle();
  await testWorkerSkipsPollWhileProcessing();

  // Polling and status
  await testWorkerPollsForNewJobs();
  await testWorkerGetStatus();
  await testWorkerStartStop();

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
