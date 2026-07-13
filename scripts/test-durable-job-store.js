const { mkdir, rm } = require("node:fs/promises");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const { createDurableJobStore } = require("../companion/core/durable-job-store");

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
  const dir = join(tmpdir(), `durable-job-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
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

// ==================== Creation Tests ====================

function testCreateTrackJob() {
  console.log("TEST: create track job");
  return withTempDir(async (dir) => {
    const store = createDurableJobStore({ dataDir: dir });
    const result = store.createJob({
      executionType: "track",
      trackId: "website_audit.lighthouse_handoff",
      input: { url: "https://example.com" },
      context: { memory: {} },
      options: { modelRole: "default_worker" },
      maxAttempts: 3,
      correlationId: "corr_123"
    });
    assert(result.ok === true, "create track job succeeds");
    assert(result.job.status === "queued", "status is queued");
    assert(result.job.executionType === "track", "executionType is track");
    assert(result.job.trackId === "website_audit.lighthouse_handoff", "trackId set");
    assert(result.job.workflowId === null, "workflowId is null");
    assert(result.job.attempt === 0, "attempt is 0");
    assert(result.job.maxAttempts === 3, "maxAttempts is 3");
    assert(result.job.lease === null, "lease is null");
    assert(result.job.correlationId === "corr_123", "correlationId set");
    assert(result.job.jobId.startsWith("job_"), "jobId has prefix");
  });
}

function testCreateWorkflowJob() {
  console.log("TEST: create workflow job");
  return withTempDir(async (dir) => {
    const store = createDurableJobStore({ dataDir: dir });
    const result = store.createJob({
      executionType: "workflow",
      workflowId: "lighthouse_full",
      input: { url: "https://example.com" },
      context: {},
      options: {}
    });
    assert(result.ok === true, "create workflow job succeeds");
    assert(result.job.executionType === "workflow", "executionType is workflow");
    assert(result.job.workflowId === "lighthouse_full", "workflowId set");
    assert(result.job.trackId === null, "trackId is null");
  });
}

function testCreateInvalidExecutionType() {
  console.log("TEST: create with invalid execution type");
  return withTempDir(async (dir) => {
    const store = createDurableJobStore({ dataDir: dir });
    const result = store.createJob({
      executionType: "invalid",
      input: {}
    });
    assert(result.ok === false, "create fails");
    assert(result.code === "INVALID_EXECUTION_TYPE", "correct error code");
  });
}

function testCreateMissingTrackId() {
  console.log("TEST: create track job without trackId");
  return withTempDir(async (dir) => {
    const store = createDurableJobStore({ dataDir: dir });
    const result = store.createJob({
      executionType: "track",
      input: {}
    });
    assert(result.ok === false, "create fails");
    assert(result.code === "MISSING_TRACK_ID", "correct error code");
  });
}

function testCreateMissingWorkflowId() {
  console.log("TEST: create workflow job without workflowId");
  return withTempDir(async (dir) => {
    const store = createDurableJobStore({ dataDir: dir });
    const result = store.createJob({
      executionType: "workflow",
      input: {}
    });
    assert(result.ok === false, "create fails");
    assert(result.code === "MISSING_WORKFLOW_ID", "correct error code");
  });
}

// ==================== State Transition Tests ====================

function testFullLifecycle() {
  console.log("TEST: full lifecycle queued → claimed → running → completed");
  return withTempDir(async (dir) => {
    const store = createDurableJobStore({ dataDir: dir });
    const created = store.createJob({
      executionType: "track",
      trackId: "test.track",
      input: {},
      context: {},
      options: {}
    });
    const jobId = created.job.jobId;

    const claimed = store.claimJob(jobId, "worker-1");
    assert(claimed.ok === true, "claim succeeds");
    assert(claimed.job.status === "claimed", "status is claimed");
    assert(claimed.job.lease.holder === "worker-1", "lease holder set");
    assert(claimed.job.lease.startedAt !== null, "lease startedAt set");
    assert(claimed.job.lease.expiresAt !== null, "lease expiresAt set");

    const started = store.startJob(jobId);
    assert(started.ok === true, "start succeeds");
    assert(started.job.status === "running", "status is running");
    assert(started.job.timestamps.startedAt !== null, "startedAt timestamp set");

    const completed = store.completeJob(jobId, { summary: "done" });
    assert(completed.ok === true, "complete succeeds");
    assert(completed.job.status === "completed", "status is completed");
    assert(completed.job.result.summary === "done", "result stored");
    assert(completed.job.lease === null, "lease cleared");
    assert(completed.job.timestamps.completedAt !== null, "completedAt set");
  });
}

function testFailJob() {
  console.log("TEST: fail job from running");
  return withTempDir(async (dir) => {
    const store = createDurableJobStore({ dataDir: dir });
    const created = store.createJob({
      executionType: "track",
      trackId: "test.track",
      input: {},
      context: {},
      options: {}
    });
    const jobId = created.job.jobId;

    store.claimJob(jobId, "worker-1");
    store.startJob(jobId);

    const failed = store.failJob(jobId, {
      code: "RUNTIME_ERROR",
      message: "Model crashed",
      retryable: true,
      details: { stack: "..." }
    });
    assert(failed.ok === true, "fail succeeds");
    assert(failed.job.status === "failed", "status is failed");
    assert(failed.job.error.code === "RUNTIME_ERROR", "error code set");
    assert(failed.job.error.retryable === true, "error retryable");
    assert(failed.job.lease === null, "lease cleared");
  });
}

function testCancelFromQueued() {
  console.log("TEST: cancel job from queued");
  return withTempDir(async (dir) => {
    const store = createDurableJobStore({ dataDir: dir });
    const created = store.createJob({
      executionType: "track",
      trackId: "test.track",
      input: {},
      context: {},
      options: {}
    });
    const jobId = created.job.jobId;

    const cancelled = store.cancelJob(jobId);
    assert(cancelled.ok === true, "cancel succeeds");
    assert(cancelled.job.status === "cancelled", "status is cancelled");
    assert(cancelled.job.timestamps.completedAt !== null, "completedAt set");
  });
}

function testCancelFromClaimed() {
  console.log("TEST: cancel job from claimed");
  return withTempDir(async (dir) => {
    const store = createDurableJobStore({ dataDir: dir });
    const created = store.createJob({
      executionType: "track",
      trackId: "test.track",
      input: {},
      context: {},
      options: {}
    });
    const jobId = created.job.jobId;

    store.claimJob(jobId, "worker-1");
    const cancelled = store.cancelJob(jobId);
    assert(cancelled.ok === true, "cancel from claimed succeeds");
    assert(cancelled.job.status === "cancelled", "status is cancelled");
  });
}

function testRetryFromFailed() {
  console.log("TEST: retry job from failed");
  return withTempDir(async (dir) => {
    const store = createDurableJobStore({ dataDir: dir });
    const created = store.createJob({
      executionType: "track",
      trackId: "test.track",
      input: {},
      context: {},
      options: {},
      maxAttempts: 3
    });
    const jobId = created.job.jobId;

    store.claimJob(jobId, "worker-1");
    store.startJob(jobId);
    store.failJob(jobId, { code: "ERR", message: "fail", retryable: true });

    const retried = store.retryJob(jobId);
    assert(retried.ok === true, "retry succeeds");
    assert(retried.job.status === "queued", "status back to queued");
    assert(retried.job.attempt === 1, "attempt incremented to 1");
    assert(retried.job.error === null, "error cleared");
    assert(retried.job.lease === null, "lease cleared");
    assert(retried.job.timestamps.completedAt === null, "completedAt cleared");
  });
}

// ==================== Invalid Transition Tests ====================

function testInvalidTransitionStartFromQueued() {
  console.log("TEST: cannot start job from queued");
  return withTempDir(async (dir) => {
    const store = createDurableJobStore({ dataDir: dir });
    const created = store.createJob({
      executionType: "track",
      trackId: "test.track",
      input: {},
      context: {},
      options: {}
    });
    const jobId = created.job.jobId;

    const result = store.startJob(jobId);
    assert(result.ok === false, "start from queued fails");
    assert(result.code === "INVALID_STATE_TRANSITION", "correct error code");
  });
}

function testInvalidTransitionCompleteFromClaimed() {
  console.log("TEST: cannot complete job from claimed");
  return withTempDir(async (dir) => {
    const store = createDurableJobStore({ dataDir: dir });
    const created = store.createJob({
      executionType: "track",
      trackId: "test.track",
      input: {},
      context: {},
      options: {}
    });
    const jobId = created.job.jobId;

    store.claimJob(jobId, "worker-1");
    const result = store.completeJob(jobId, {});
    assert(result.ok === false, "complete from claimed fails");
    assert(result.code === "INVALID_STATE_TRANSITION", "correct error code");
  });
}

function testInvalidTransitionFailFromQueued() {
  console.log("TEST: cannot fail job from queued");
  return withTempDir(async (dir) => {
    const store = createDurableJobStore({ dataDir: dir });
    const created = store.createJob({
      executionType: "track",
      trackId: "test.track",
      input: {},
      context: {},
      options: {}
    });
    const jobId = created.job.jobId;

    const result = store.failJob(jobId, { code: "ERR", message: "fail", retryable: true });
    assert(result.ok === false, "fail from queued fails");
    assert(result.code === "INVALID_STATE_TRANSITION", "correct error code");
  });
}

function testInvalidTransitionCancelFromRunning() {
  console.log("TEST: cannot cancel job from running");
  return withTempDir(async (dir) => {
    const store = createDurableJobStore({ dataDir: dir });
    const created = store.createJob({
      executionType: "track",
      trackId: "test.track",
      input: {},
      context: {},
      options: {}
    });
    const jobId = created.job.jobId;

    store.claimJob(jobId, "worker-1");
    store.startJob(jobId);
    const result = store.cancelJob(jobId);
    assert(result.ok === false, "cancel from running fails");
    assert(result.code === "INVALID_STATE_TRANSITION", "correct error code");
  });
}

function testInvalidTransitionRetryFromQueued() {
  console.log("TEST: cannot retry job from queued");
  return withTempDir(async (dir) => {
    const store = createDurableJobStore({ dataDir: dir });
    const created = store.createJob({
      executionType: "track",
      trackId: "test.track",
      input: {},
      context: {},
      options: {}
    });
    const jobId = created.job.jobId;

    const result = store.retryJob(jobId);
    assert(result.ok === false, "retry from queued fails");
    assert(result.code === "INVALID_STATE_TRANSITION", "correct error code");
  });
}

function testDuplicateCompletionPrevention() {
  console.log("TEST: cannot complete already-completed job");
  return withTempDir(async (dir) => {
    const store = createDurableJobStore({ dataDir: dir });
    const created = store.createJob({
      executionType: "track",
      trackId: "test.track",
      input: {},
      context: {},
      options: {}
    });
    const jobId = created.job.jobId;

    store.claimJob(jobId, "worker-1");
    store.startJob(jobId);
    store.completeJob(jobId, { done: true });

    const result = store.completeJob(jobId, { done: false });
    assert(result.ok === false, "duplicate complete fails");
    assert(result.code === "INVALID_STATE_TRANSITION", "correct error code");
  });
}

// ==================== Lease Tests ====================

function testDuplicateClaimPrevention() {
  console.log("TEST: cannot claim already-claimed job with active lease");
  return withTempDir(async (dir) => {
    const store = createDurableJobStore({ dataDir: dir });
    const created = store.createJob({
      executionType: "track",
      trackId: "test.track",
      input: {},
      context: {},
      options: {}
    });
    const jobId = created.job.jobId;

    store.claimJob(jobId, "worker-1");
    const result = store.claimJob(jobId, "worker-2");
    assert(result.ok === false, "duplicate claim fails");
    assert(result.code === "JOB_ALREADY_CLAIMED", "correct error code");
  });
}

function testLeaseExpirationAllowsReclaim() {
  console.log("TEST: expired lease allows re-claim by different holder");
  return withTempDir(async (dir) => {
    const store = createDurableJobStore({ dataDir: dir });
    const created = store.createJob({
      executionType: "track",
      trackId: "test.track",
      input: {},
      context: {},
      options: {}
    });
    const jobId = created.job.jobId;

    store.claimJob(jobId, "worker-1", 50);
    assert(store.getJob(jobId).lease.holder === "worker-1", "first holder");

    await sleep(100);

    const reclaimed = store.claimJob(jobId, "worker-2");
    assert(reclaimed.ok === true, "reclaim after expiry succeeds");
    assert(reclaimed.job.lease.holder === "worker-2", "new holder");
    assert(reclaimed.job.status === "claimed", "still claimed");
  });
}

function testInvalidHolder() {
  console.log("TEST: claim with invalid holder");
  return withTempDir(async (dir) => {
    const store = createDurableJobStore({ dataDir: dir });
    const created = store.createJob({
      executionType: "track",
      trackId: "test.track",
      input: {},
      context: {},
      options: {}
    });
    const jobId = created.job.jobId;

    const result = store.claimJob(jobId, "");
    assert(result.ok === false, "empty holder fails");
    assert(result.code === "INVALID_HOLDER", "correct error code");
  });
}

// ==================== Retry Exhaustion ====================

function testRetryExhaustion() {
  console.log("TEST: retry exhaustion when max attempts reached");
  return withTempDir(async (dir) => {
    const store = createDurableJobStore({ dataDir: dir });
    const created = store.createJob({
      executionType: "track",
      trackId: "test.track",
      input: {},
      context: {},
      options: {},
      maxAttempts: 2
    });
    const jobId = created.job.jobId;

    store.claimJob(jobId, "worker-1");
    store.startJob(jobId);
    store.failJob(jobId, { code: "ERR", message: "fail", retryable: true });

    const retry1 = store.retryJob(jobId);
    assert(retry1.ok === true, "first retry succeeds");
    assert(retry1.job.attempt === 1, "attempt is 1");

    store.claimJob(jobId, "worker-1");
    store.startJob(jobId);
    store.failJob(jobId, { code: "ERR", message: "fail", retryable: true });

    const retry2 = store.retryJob(jobId);
    assert(retry2.ok === false, "second retry fails");
    assert(retry2.code === "MAX_ATTEMPTS_EXCEEDED", "correct error code");
  });
}

// ==================== Query Tests ====================

function testGetJob() {
  console.log("TEST: getJob returns deep clone");
  return withTempDir(async (dir) => {
    const store = createDurableJobStore({ dataDir: dir });
    const created = store.createJob({
      executionType: "track",
      trackId: "test.track",
      input: { key: "value" },
      context: {},
      options: {}
    });
    const jobId = created.job.jobId;

    const fetched = store.getJob(jobId);
    assert(fetched !== null, "job found");
    assert(fetched.jobId === jobId, "jobId matches");
    assert(fetched.input.key === "value", "input preserved");

    fetched.input.key = "modified";
    const refetched = store.getJob(jobId);
    assert(refetched.input.key === "value", "deep clone prevents mutation");
  });
}

function testGetJobNotFound() {
  console.log("TEST: getJob returns null for missing job");
  return withTempDir(async (dir) => {
    const store = createDurableJobStore({ dataDir: dir });
    const result = store.getJob("nonexistent");
    assert(result === null, "returns null");
  });
}

function testListJobsWithFilter() {
  console.log("TEST: listJobs with filter");
  return withTempDir(async (dir) => {
    const store = createDurableJobStore({ dataDir: dir });

    store.createJob({ executionType: "track", trackId: "track.a", input: {}, context: {}, options: {} });
    store.createJob({ executionType: "track", trackId: "track.b", input: {}, context: {}, options: {} });
    store.createJob({ executionType: "workflow", workflowId: "wf.a", input: {}, context: {}, options: {} });

    const all = store.listJobs();
    assert(all.length === 3, "all jobs returned");

    const tracks = store.listJobs({ executionType: "track" });
    assert(tracks.length === 2, "filtered by executionType");

    const trackA = store.listJobs({ trackId: "track.a" });
    assert(trackA.length === 1, "filtered by trackId");
    assert(trackA[0].trackId === "track.a", "correct trackId");
  });
}

function testListClaimableJobs() {
  console.log("TEST: listClaimableJobs returns queued and expired-lease jobs");
  return withTempDir(async (dir) => {
    const store = createDurableJobStore({ dataDir: dir });

    const j1 = store.createJob({ executionType: "track", trackId: "t1", input: {}, context: {}, options: {} });
    const j2 = store.createJob({ executionType: "track", trackId: "t2", input: {}, context: {}, options: {} });
    const j3 = store.createJob({ executionType: "track", trackId: "t3", input: {}, context: {}, options: {} });

    store.claimJob(j2.job.jobId, "worker-1", 50);
    store.claimJob(j3.job.jobId, "worker-2");

    let claimable = store.listClaimableJobs();
    assert(claimable.length === 1, "queued jobs are claimable");

    await sleep(100);

    claimable = store.listClaimableJobs();
    assert(claimable.length === 2, "expired lease job now claimable");

    const claimableIds = claimable.map(j => j.jobId).sort();
    assert(claimableIds.includes(j1.job.jobId), "j1 claimable");
    assert(claimableIds.includes(j2.job.jobId), "j2 claimable after expiry");
    assert(!claimableIds.includes(j3.job.jobId), "j3 not claimable (lease active)");
  });
}

function testListLeasedJobs() {
  console.log("TEST: listLeasedJobs returns active leases");
  return withTempDir(async (dir) => {
    const store = createDurableJobStore({ dataDir: dir });

    const j1 = store.createJob({ executionType: "track", trackId: "t1", input: {}, context: {}, options: {} });
    const j2 = store.createJob({ executionType: "track", trackId: "t2", input: {}, context: {}, options: {} });

    store.claimJob(j1.job.jobId, "worker-1");
    store.claimJob(j2.job.jobId, "worker-2", 50);

    let leased = store.listLeasedJobs();
    assert(leased.length === 2, "both leased");

    await sleep(100);

    leased = store.listLeasedJobs();
    assert(leased.length === 1, "only active lease remains");
    assert(leased[0].jobId === j1.job.jobId, "correct job");
  });
}

// ==================== Persistence Tests ====================

function testPersistenceAcrossReload() {
  console.log("TEST: persistence across store reload");
  return withTempDir(async (dir) => {
    let store = createDurableJobStore({ dataDir: dir });
    const created = store.createJob({
      executionType: "track",
      trackId: "test.track",
      input: { url: "https://example.com" },
      context: { memory: {} },
      options: { modelRole: "default_worker" },
      maxAttempts: 5,
      correlationId: "corr_persist"
    });
    const jobId = created.job.jobId;

    store.claimJob(jobId, "worker-1");
    store.startJob(jobId);

    store = createDurableJobStore({ dataDir: dir });
    const reloaded = store.getJob(jobId);
    assert(reloaded !== null, "job persists across reload");
    assert(reloaded.status === "running", "status persists");
    assert(reloaded.input.url === "https://example.com", "input persists");
    assert(reloaded.maxAttempts === 5, "maxAttempts persists");
    assert(reloaded.correlationId === "corr_persist", "correlationId persists");
    assert(reloaded.timestamps.startedAt !== null, "startedAt persists");
  });
}

function testMultipleJobsPersistence() {
  console.log("TEST: multiple jobs persist independently");
  return withTempDir(async (dir) => {
    let store = createDurableJobStore({ dataDir: dir });

    const j1 = store.createJob({ executionType: "track", trackId: "t1", input: { a: 1 }, context: {}, options: {} });
    const j2 = store.createJob({ executionType: "workflow", workflowId: "w1", input: { b: 2 }, context: {}, options: {} });

    store.claimJob(j1.job.jobId, "worker-1");
    store.startJob(j1.job.jobId);
    store.completeJob(j1.job.jobId, { result: "done" });

    store = createDurableJobStore({ dataDir: dir });
    const r1 = store.getJob(j1.job.jobId);
    const r2 = store.getJob(j2.job.jobId);

    assert(r1.status === "completed", "j1 completed persists");
    assert(r1.result.result === "done", "j1 result persists");
    assert(r2.status === "queued", "j2 queued persists");
    assert(r2.input.b === 2, "j2 input persists");
  });
}

// ==================== Edge Cases ====================

function testJobNotFound() {
  console.log("TEST: operations on nonexistent job");
  return withTempDir(async (dir) => {
    const store = createDurableJobStore({ dataDir: dir });

    const claim = store.claimJob("nonexistent", "worker-1");
    assert(claim.ok === false, "claim nonexistent fails");
    assert(claim.code === "JOB_NOT_FOUND", "claim correct code");

    const start = store.startJob("nonexistent");
    assert(start.ok === false, "start nonexistent fails");

    const complete = store.completeJob("nonexistent", {});
    assert(complete.ok === false, "complete nonexistent fails");

    const fail = store.failJob("nonexistent", {});
    assert(fail.ok === false, "fail nonexistent fails");

    const cancel = store.cancelJob("nonexistent");
    assert(cancel.ok === false, "cancel nonexistent fails");

    const retry = store.retryJob("nonexistent");
    assert(retry.ok === false, "retry nonexistent fails");
  });
}

function testDefaultMaxAttempts() {
  console.log("TEST: default maxAttempts is 3");
  return withTempDir(async (dir) => {
    const store = createDurableJobStore({ dataDir: dir });
    const created = store.createJob({
      executionType: "track",
      trackId: "test.track",
      input: {},
      context: {},
      options: {}
    });
    assert(created.job.maxAttempts === 3, "default maxAttempts is 3");
  });
}

function testCorrelationIdDefaultsToJobId() {
  console.log("TEST: correlationId defaults to jobId");
  return withTempDir(async (dir) => {
    const store = createDurableJobStore({ dataDir: dir });
    const created = store.createJob({
      executionType: "track",
      trackId: "test.track",
      input: {},
      context: {},
      options: {}
    });
    assert(created.job.correlationId === created.job.jobId, "correlationId defaults to jobId");
  });
}

function testEvidenceRefsDefaultEmpty() {
  console.log("TEST: evidenceRefs defaults to empty array");
  return withTempDir(async (dir) => {
    const store = createDurableJobStore({ dataDir: dir });
    const created = store.createJob({
      executionType: "track",
      trackId: "test.track",
      input: {},
      context: {},
      options: {}
    });
    assert(Array.isArray(created.job.evidenceRefs), "evidenceRefs is array");
    assert(created.job.evidenceRefs.length === 0, "evidenceRefs is empty");
  });
}

function testCannotClaimCompletedJob() {
  console.log("TEST: cannot claim completed job");
  return withTempDir(async (dir) => {
    const store = createDurableJobStore({ dataDir: dir });
    const created = store.createJob({
      executionType: "track",
      trackId: "test.track",
      input: {},
      context: {},
      options: {}
    });
    const jobId = created.job.jobId;

    store.claimJob(jobId, "worker-1");
    store.startJob(jobId);
    store.completeJob(jobId, {});

    const result = store.claimJob(jobId, "worker-2");
    assert(result.ok === false, "claim completed fails");
    assert(result.code === "INVALID_STATE_TRANSITION", "correct error code");
  });
}

function testCannotRetryCompletedJob() {
  console.log("TEST: cannot retry completed job");
  return withTempDir(async (dir) => {
    const store = createDurableJobStore({ dataDir: dir });
    const created = store.createJob({
      executionType: "track",
      trackId: "test.track",
      input: {},
      context: {},
      options: {}
    });
    const jobId = created.job.jobId;

    store.claimJob(jobId, "worker-1");
    store.startJob(jobId);
    store.completeJob(jobId, {});

    const result = store.retryJob(jobId);
    assert(result.ok === false, "retry completed fails");
    assert(result.code === "INVALID_STATE_TRANSITION", "correct error code");
  });
}

function testCannotRetryCancelledJob() {
  console.log("TEST: cannot retry cancelled job");
  return withTempDir(async (dir) => {
    const store = createDurableJobStore({ dataDir: dir });
    const created = store.createJob({
      executionType: "track",
      trackId: "test.track",
      input: {},
      context: {},
      options: {}
    });
    const jobId = created.job.jobId;

    store.cancelJob(jobId);

    const result = store.retryJob(jobId);
    assert(result.ok === false, "retry cancelled fails");
    assert(result.code === "INVALID_STATE_TRANSITION", "correct error code");
  });
}

// ==================== Run All Tests ====================

async function runAllTests() {
  console.log("=== Durable Job Store Tests ===\n");

  await testCreateTrackJob();
  await testCreateWorkflowJob();
  await testCreateInvalidExecutionType();
  await testCreateMissingTrackId();
  await testCreateMissingWorkflowId();
  await testFullLifecycle();
  await testFailJob();
  await testCancelFromQueued();
  await testCancelFromClaimed();
  await testRetryFromFailed();
  await testInvalidTransitionStartFromQueued();
  await testInvalidTransitionCompleteFromClaimed();
  await testInvalidTransitionFailFromQueued();
  await testInvalidTransitionCancelFromRunning();
  await testInvalidTransitionRetryFromQueued();
  await testDuplicateCompletionPrevention();
  await testDuplicateClaimPrevention();
  await testLeaseExpirationAllowsReclaim();
  await testInvalidHolder();
  await testRetryExhaustion();
  await testGetJob();
  await testGetJobNotFound();
  await testListJobsWithFilter();
  await testListClaimableJobs();
  await testListLeasedJobs();
  await testPersistenceAcrossReload();
  await testMultipleJobsPersistence();
  await testJobNotFound();
  await testDefaultMaxAttempts();
  await testCorrelationIdDefaultsToJobId();
  await testEvidenceRefsDefaultEmpty();
  await testCannotClaimCompletedJob();
  await testCannotRetryCompletedJob();
  await testCannotRetryCancelledJob();

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
