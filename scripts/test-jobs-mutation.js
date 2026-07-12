const { mkdtempSync, rmSync, mkdirSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const http = require("node:http");
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

function createTempDataDir() {
  const dir = mkdtempSync(join(tmpdir(), "locaily-jobs-mutation-test-"));
  mkdirSync(join(dir, "jobs"), { recursive: true });
  return dir;
}

function makeRequest(baseUrl, method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: { "Content-Type": "application/json" }
    };
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        let parsed = null;
        try { parsed = JSON.parse(data); } catch {}
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on("error", reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ==================== Cancel Tests ====================

async function testCancelQueuedJob() {
  console.log("TEST: POST /jobs/:id/cancel cancels a queued job");
  const dir = createTempDataDir();
  const store = createDurableJobStore({ dataDir: dir });
  const created = store.createJob({ executionType: "track", trackId: "test.track", input: {}, context: {}, options: {} });
  const jobId = created.job.jobId;
  const server = await startTestServer(store);

  try {
    const res = await makeRequest(server.url, "POST", `/jobs/${encodeURIComponent(jobId)}/cancel`);
    assert(res.status === 200, "returns 200");
    assert(res.body.ok === true, "ok true");
    assert(res.body.job.status === "cancelled", "status is cancelled");
    assert(res.body.job.jobId === jobId, "jobId matches");
  } finally {
    await stopTestServer(server);
    rmSync(dir, { recursive: true, force: true });
  }
}

async function testCancelClaimedJob() {
  console.log("TEST: POST /jobs/:id/cancel cancels a claimed job");
  const dir = createTempDataDir();
  const store = createDurableJobStore({ dataDir: dir });
  const created = store.createJob({ executionType: "track", trackId: "test.track", input: {}, context: {}, options: {} });
  const jobId = created.job.jobId;
  store.claimJob(jobId, "test-worker");
  const server = await startTestServer(store);

  try {
    const res = await makeRequest(server.url, "POST", `/jobs/${encodeURIComponent(jobId)}/cancel`);
    assert(res.status === 200, "returns 200");
    assert(res.body.ok === true, "ok true");
    assert(res.body.job.status === "cancelled", "status is cancelled");
  } finally {
    await stopTestServer(server);
    rmSync(dir, { recursive: true, force: true });
  }
}

async function testCancelRunningJob() {
  console.log("TEST: POST /jobs/:id/cancel rejects cancel of running job");
  const dir = createTempDataDir();
  const store = createDurableJobStore({ dataDir: dir });
  const created = store.createJob({ executionType: "track", trackId: "test.track", input: {}, context: {}, options: {} });
  const jobId = created.job.jobId;
  store.claimJob(jobId, "test-worker");
  store.startJob(jobId);
  const server = await startTestServer(store);

  try {
    const res = await makeRequest(server.url, "POST", `/jobs/${encodeURIComponent(jobId)}/cancel`);
    assert(res.status === 400, "returns 400");
    assert(res.body.ok === false, "ok false");
    assert(res.body.code === "INVALID_STATE_TRANSITION", "correct error code");
  } finally {
    await stopTestServer(server);
    rmSync(dir, { recursive: true, force: true });
  }
}

async function testCancelCompletedJob() {
  console.log("TEST: POST /jobs/:id/cancel rejects cancel of completed job");
  const dir = createTempDataDir();
  const store = createDurableJobStore({ dataDir: dir });
  const created = store.createJob({ executionType: "track", trackId: "test.track", input: {}, context: {}, options: {} });
  const jobId = created.job.jobId;
  store.claimJob(jobId, "test-worker");
  store.startJob(jobId);
  store.completeJob(jobId, {});
  const server = await startTestServer(store);

  try {
    const res = await makeRequest(server.url, "POST", `/jobs/${encodeURIComponent(jobId)}/cancel`);
    assert(res.status === 400, "returns 400");
    assert(res.body.ok === false, "ok false");
    assert(res.body.code === "INVALID_STATE_TRANSITION", "correct error code");
  } finally {
    await stopTestServer(server);
    rmSync(dir, { recursive: true, force: true });
  }
}

async function testCancelFailedJob() {
  console.log("TEST: POST /jobs/:id/cancel rejects cancel of failed job");
  const dir = createTempDataDir();
  const store = createDurableJobStore({ dataDir: dir });
  const created = store.createJob({ executionType: "track", trackId: "test.track", input: {}, context: {}, options: {} });
  const jobId = created.job.jobId;
  store.claimJob(jobId, "test-worker");
  store.startJob(jobId);
  store.failJob(jobId, { code: "ERR", message: "fail", retryable: true });
  const server = await startTestServer(store);

  try {
    const res = await makeRequest(server.url, "POST", `/jobs/${encodeURIComponent(jobId)}/cancel`);
    assert(res.status === 400, "returns 400");
    assert(res.body.ok === false, "ok false");
    assert(res.body.code === "INVALID_STATE_TRANSITION", "correct error code");
  } finally {
    await stopTestServer(server);
    rmSync(dir, { recursive: true, force: true });
  }
}

async function testCancelNonexistentJob() {
  console.log("TEST: POST /jobs/:id/cancel returns 404 for unknown job");
  const dir = createTempDataDir();
  const store = createDurableJobStore({ dataDir: dir });
  const server = await startTestServer(store);

  try {
    const res = await makeRequest(server.url, "POST", "/jobs/nonexistent_id/cancel");
    assert(res.status === 404, "returns 404");
    assert(res.body.ok === false, "ok false");
    assert(res.body.code === "JOB_NOT_FOUND", "correct error code");
  } finally {
    await stopTestServer(server);
    rmSync(dir, { recursive: true, force: true });
  }
}

// ==================== Retry Tests ====================

async function testRetryFailedJob() {
  console.log("TEST: POST /jobs/:id/retry retries a failed job");
  const dir = createTempDataDir();
  const store = createDurableJobStore({ dataDir: dir });
  const created = store.createJob({ executionType: "track", trackId: "test.track", input: {}, context: {}, options: {}, maxAttempts: 3 });
  const jobId = created.job.jobId;
  store.claimJob(jobId, "test-worker");
  store.startJob(jobId);
  store.failJob(jobId, { code: "ERR", message: "fail", retryable: true });
  const server = await startTestServer(store);

  try {
    const res = await makeRequest(server.url, "POST", `/jobs/${encodeURIComponent(jobId)}/retry`);
    assert(res.status === 200, "returns 200");
    assert(res.body.ok === true, "ok true");
    assert(res.body.job.status === "queued", "status back to queued");
    assert(res.body.job.attempt === 1, "attempt incremented to 1");
    assert(res.body.job.error === null, "error cleared");
  } finally {
    await stopTestServer(server);
    rmSync(dir, { recursive: true, force: true });
  }
}

async function testRetryMaxAttemptsExhausted() {
  console.log("TEST: POST /jobs/:id/retry rejects retry when max attempts exhausted");
  const dir = createTempDataDir();
  const store = createDurableJobStore({ dataDir: dir });
  const created = store.createJob({ executionType: "track", trackId: "test.track", input: {}, context: {}, options: {}, maxAttempts: 1 });
  const jobId = created.job.jobId;
  store.claimJob(jobId, "test-worker");
  store.startJob(jobId);
  store.failJob(jobId, { code: "ERR", message: "fail", retryable: true });
  const server = await startTestServer(store);

  try {
    const res = await makeRequest(server.url, "POST", `/jobs/${encodeURIComponent(jobId)}/retry`);
    assert(res.status === 400, "returns 400");
    assert(res.body.ok === false, "ok false");
    assert(res.body.code === "MAX_ATTEMPTS_EXCEEDED", "correct error code");
  } finally {
    await stopTestServer(server);
    rmSync(dir, { recursive: true, force: true });
  }
}

async function testRetryNonFailedJob() {
  console.log("TEST: POST /jobs/:id/retry rejects retry of non-failed job");
  const dir = createTempDataDir();
  const store = createDurableJobStore({ dataDir: dir });
  const created = store.createJob({ executionType: "track", trackId: "test.track", input: {}, context: {}, options: {} });
  const jobId = created.job.jobId;
  const server = await startTestServer(store);

  try {
    const res = await makeRequest(server.url, "POST", `/jobs/${encodeURIComponent(jobId)}/retry`);
    assert(res.status === 400, "returns 400");
    assert(res.body.ok === false, "ok false");
    assert(res.body.code === "INVALID_STATE_TRANSITION", "correct error code");
  } finally {
    await stopTestServer(server);
    rmSync(dir, { recursive: true, force: true });
  }
}

async function testRetryNonexistentJob() {
  console.log("TEST: POST /jobs/:id/retry returns 404 for unknown job");
  const dir = createTempDataDir();
  const store = createDurableJobStore({ dataDir: dir });
  const server = await startTestServer(store);

  try {
    const res = await makeRequest(server.url, "POST", "/jobs/nonexistent_id/retry");
    assert(res.status === 404, "returns 404");
    assert(res.body.ok === false, "ok false");
    assert(res.body.code === "JOB_NOT_FOUND", "correct error code");
  } finally {
    await stopTestServer(server);
    rmSync(dir, { recursive: true, force: true });
  }
}

// ==================== Review Tests ====================

async function testReviewRequestReview() {
  console.log("TEST: POST /jobs/:id/review request_review transitions running → paused_review");
  const dir = createTempDataDir();
  const store = createDurableJobStore({ dataDir: dir });
  const created = store.createJob({ executionType: "track", trackId: "test.track", input: {}, context: {}, options: {} });
  const jobId = created.job.jobId;
  store.claimJob(jobId, "test-worker");
  store.startJob(jobId);
  const server = await startTestServer(store);

  try {
    const res = await makeRequest(server.url, "POST", `/jobs/${encodeURIComponent(jobId)}/review`, {
      action: "request_review",
      reviewedBy: "human-operator",
      reason: "Please review this job"
    });
    assert(res.status === 200, "returns 200");
    assert(res.body.ok === true, "ok true");
    assert(res.body.job.status === "paused_review", "status is paused_review");
    assert(res.body.job.review.reviewAction === "request_review", "review action set");
    assert(res.body.job.review.reviewedBy === "human-operator", "reviewedBy set");
    assert(res.body.job.review.reviewReason === "Please review this job", "reviewReason set");
    assert(res.body.job.review.reviewedAt !== undefined, "reviewedAt set");
  } finally {
    await stopTestServer(server);
    rmSync(dir, { recursive: true, force: true });
  }
}

async function testReviewApprove() {
  console.log("TEST: POST /jobs/:id/review approve transitions paused_review → queued");
  const dir = createTempDataDir();
  const store = createDurableJobStore({ dataDir: dir });
  const created = store.createJob({ executionType: "track", trackId: "test.track", input: {}, context: {}, options: {} });
  const jobId = created.job.jobId;
  store.claimJob(jobId, "test-worker");
  store.startJob(jobId);
  // First transition to paused_review via store
  store.reviewJob(jobId, "request_review", { reviewedBy: "test", reason: "review" });
  const server = await startTestServer(store);

  try {
    const res = await makeRequest(server.url, "POST", `/jobs/${encodeURIComponent(jobId)}/review`, {
      action: "approve",
      reviewedBy: "human-operator",
      reason: "Looks good, approve"
    });
    assert(res.status === 200, "returns 200");
    assert(res.body.ok === true, "ok true");
    assert(res.body.job.status === "queued", "status back to queued");
    assert(res.body.job.review.reviewAction === "approve", "review action is approve");
    assert(res.body.job.review.reviewedBy === "human-operator", "reviewedBy set");
    assert(res.body.job.review.reviewReason === "Looks good, approve", "reviewReason set");
  } finally {
    await stopTestServer(server);
    rmSync(dir, { recursive: true, force: true });
  }
}

async function testReviewReject() {
  console.log("TEST: POST /jobs/:id/review reject transitions paused_review → failed");
  const dir = createTempDataDir();
  const store = createDurableJobStore({ dataDir: dir });
  const created = store.createJob({ executionType: "track", trackId: "test.track", input: {}, context: {}, options: {} });
  const jobId = created.job.jobId;
  store.claimJob(jobId, "test-worker");
  store.startJob(jobId);
  store.reviewJob(jobId, "request_review", { reviewedBy: "test", reason: "review" });
  const server = await startTestServer(store);

  try {
    const res = await makeRequest(server.url, "POST", `/jobs/${encodeURIComponent(jobId)}/review`, {
      action: "reject",
      reviewedBy: "human-operator",
      reason: "Output quality insufficient"
    });
    assert(res.status === 200, "returns 200");
    assert(res.body.ok === true, "ok true");
    assert(res.body.job.status === "failed", "status is failed");
    assert(res.body.job.review.reviewAction === "reject", "review action is reject");
    assert(res.body.job.review.reviewedBy === "human-operator", "reviewedBy set");
    assert(res.body.job.review.reviewReason === "Output quality insufficient", "reviewReason set");
    assert(res.body.job.error !== null, "error recorded for failed job");
    assert(res.body.job.error.code === "HUMAN_REJECTED", "error code is HUMAN_REJECTED");
  } finally {
    await stopTestServer(server);
    rmSync(dir, { recursive: true, force: true });
  }
}

async function testReviewRequestCorrection() {
  console.log("TEST: POST /jobs/:id/review request_correction transitions paused_review → queued with correction note");
  const dir = createTempDataDir();
  const store = createDurableJobStore({ dataDir: dir });
  const created = store.createJob({ executionType: "track", trackId: "test.track", input: {}, context: {}, options: {} });
  const jobId = created.job.jobId;
  store.claimJob(jobId, "test-worker");
  store.startJob(jobId);
  store.reviewJob(jobId, "request_review", { reviewedBy: "test", reason: "review" });
  const server = await startTestServer(store);

  try {
    const res = await makeRequest(server.url, "POST", `/jobs/${encodeURIComponent(jobId)}/review`, {
      action: "request_correction",
      reviewedBy: "human-operator",
      reason: "Please fix the formatting and re-run"
    });
    assert(res.status === 200, "returns 200");
    assert(res.body.ok === true, "ok true");
    assert(res.body.job.status === "queued", "status back to queued");
    assert(res.body.job.review.reviewAction === "request_correction", "review action is request_correction");
    assert(res.body.job.review.reviewReason === "Please fix the formatting and re-run", "correction reason set");
  } finally {
    await stopTestServer(server);
    rmSync(dir, { recursive: true, force: true });
  }
}

async function testReviewStop() {
  console.log("TEST: POST /jobs/:id/review stop transitions paused_review → cancelled");
  const dir = createTempDataDir();
  const store = createDurableJobStore({ dataDir: dir });
  const created = store.createJob({ executionType: "track", trackId: "test.track", input: {}, context: {}, options: {} });
  const jobId = created.job.jobId;
  store.claimJob(jobId, "test-worker");
  store.startJob(jobId);
  store.reviewJob(jobId, "request_review", { reviewedBy: "test", reason: "review" });
  const server = await startTestServer(store);

  try {
    const res = await makeRequest(server.url, "POST", `/jobs/${encodeURIComponent(jobId)}/review`, {
      action: "stop",
      reviewedBy: "human-operator",
      reason: "This analysis is no longer needed"
    });
    assert(res.status === 200, "returns 200");
    assert(res.body.ok === true, "ok true");
    assert(res.body.job.status === "cancelled", "status is cancelled");
    assert(res.body.job.review.reviewAction === "stop", "review action is stop");
    assert(res.body.job.review.reviewReason === "This analysis is no longer needed", "reason set");
  } finally {
    await stopTestServer(server);
    rmSync(dir, { recursive: true, force: true });
  }
}

async function testReviewInvalidActionOnQueued() {
  console.log("TEST: POST /jobs/:id/review rejects review action on non-paused_review job");
  const dir = createTempDataDir();
  const store = createDurableJobStore({ dataDir: dir });
  const created = store.createJob({ executionType: "track", trackId: "test.track", input: {}, context: {}, options: {} });
  const jobId = created.job.jobId;
  const server = await startTestServer(store);

  try {
    const res = await makeRequest(server.url, "POST", `/jobs/${encodeURIComponent(jobId)}/review`, {
      action: "approve",
      reviewedBy: "test",
      reason: "should fail"
    });
    assert(res.status === 400, "returns 400");
    assert(res.body.ok === false, "ok false");
    assert(res.body.code === "INVALID_STATE_TRANSITION", "correct error code");
  } finally {
    await stopTestServer(server);
    rmSync(dir, { recursive: true, force: true });
  }
}

async function testReviewInvalidActionOnCompleted() {
  console.log("TEST: POST /jobs/:id/review rejects review action on completed job");
  const dir = createTempDataDir();
  const store = createDurableJobStore({ dataDir: dir });
  const created = store.createJob({ executionType: "track", trackId: "test.track", input: {}, context: {}, options: {} });
  const jobId = created.job.jobId;
  store.claimJob(jobId, "test-worker");
  store.startJob(jobId);
  store.completeJob(jobId, {});
  const server = await startTestServer(store);

  try {
    const res = await makeRequest(server.url, "POST", `/jobs/${encodeURIComponent(jobId)}/review`, {
      action: "request_review",
      reviewedBy: "test",
      reason: "should fail"
    });
    assert(res.status === 400, "returns 400");
    assert(res.body.ok === false, "ok false");
    assert(res.body.code === "INVALID_STATE_TRANSITION", "correct error code");
  } finally {
    await stopTestServer(server);
    rmSync(dir, { recursive: true, force: true });
  }
}

async function testReviewNonexistentJob() {
  console.log("TEST: POST /jobs/:id/review returns 404 for unknown job");
  const dir = createTempDataDir();
  const store = createDurableJobStore({ dataDir: dir });
  const server = await startTestServer(store);

  try {
    const res = await makeRequest(server.url, "POST", "/jobs/nonexistent_id/review", {
      action: "approve",
      reviewedBy: "test"
    });
    assert(res.status === 404, "returns 404");
    assert(res.body.ok === false, "ok false");
    assert(res.body.code === "JOB_NOT_FOUND", "correct error code");
  } finally {
    await stopTestServer(server);
    rmSync(dir, { recursive: true, force: true });
  }
}

async function testReviewMissingAction() {
  console.log("TEST: POST /jobs/:id/review returns 400 when action is missing");
  const dir = createTempDataDir();
  const store = createDurableJobStore({ dataDir: dir });
  const created = store.createJob({ executionType: "track", trackId: "test.track", input: {}, context: {}, options: {} });
  const jobId = created.job.jobId;
  const server = await startTestServer(store);

  try {
    const res = await makeRequest(server.url, "POST", `/jobs/${encodeURIComponent(jobId)}/review`, {
      reviewedBy: "test"
    });
    assert(res.status === 400, "returns 400");
    assert(res.body.ok === false, "ok false");
    assert(res.body.code === "MISSING_ACTION", "correct error code");
  } finally {
    await stopTestServer(server);
    rmSync(dir, { recursive: true, force: true });
  }
}

async function testReviewPersistence() {
  console.log("TEST: review metadata survives store reload");
  const dir = createTempDataDir();
  let store = createDurableJobStore({ dataDir: dir });
  const created = store.createJob({ executionType: "track", trackId: "test.track", input: {}, context: {}, options: {} });
  const jobId = created.job.jobId;
  store.claimJob(jobId, "worker");
  store.startJob(jobId);
  store.reviewJob(jobId, "request_review", { reviewedBy: "operator-1", reason: "for review" });

  // Reload store
  store = createDurableJobStore({ dataDir: dir });
  const server = await startTestServer(store);

  try {
    const res = await makeRequest(server.url, "POST", `/jobs/${encodeURIComponent(jobId)}/review`, {
      action: "approve",
      reviewedBy: "operator-2",
      reason: "Approved after review"
    });
    assert(res.status === 200, "approve after reload returns 200");
    assert(res.body.job.status === "queued", "status back to queued");
    assert(res.body.job.review.reviewAction === "approve", "review action persists");
    assert(res.body.job.review.reviewedBy === "operator-2", "reviewedBy persists");
    assert(res.body.job.review.reviewReason === "Approved after review", "reviewReason persists");
  } finally {
    await stopTestServer(server);
    rmSync(dir, { recursive: true, force: true });
  }
}

async function testReviewEnvelopeShape() {
  console.log("TEST: POST /jobs/:id/review returns proper JSON envelope");
  const dir = createTempDataDir();
  const store = createDurableJobStore({ dataDir: dir });
  const created = store.createJob({ executionType: "track", trackId: "test.track", input: {}, context: {}, options: {} });
  const jobId = created.job.jobId;
  store.claimJob(jobId, "worker");
  store.startJob(jobId);
  store.reviewJob(jobId, "request_review", { reviewedBy: "test", reason: "review" });
  const server = await startTestServer(store);

  try {
    const res = await makeRequest(server.url, "POST", `/jobs/${encodeURIComponent(jobId)}/review`, {
      action: "approve",
      reviewedBy: "operator",
      reason: "Approved"
    });
    assert(res.body.ok === true, "envelope has ok");
    assert(res.body.job !== undefined, "envelope has job");
    assert(res.body.job.jobId === jobId, "envelope job has jobId");
    assert(res.body.job.status === "queued", "envelope job has correct status");
  } finally {
    await stopTestServer(server);
    rmSync(dir, { recursive: true, force: true });
  }
}

// ==================== Test Server Helpers ====================

function startTestServer(store) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (request, response) => {
      const url = new URL(request.url, `http://${request.headers.host || "127.0.0.1"}`);

      function sendJson(res, statusCode, body) {
        const payload = JSON.stringify(body, null, 2);
        res.writeHead(statusCode, {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Length": Buffer.byteLength(payload)
        });
        res.end(payload);
      }

      function readJsonBody(req) {
        return new Promise((resolveRead) => {
          let body = "";
          req.setEncoding("utf8");
          req.on("data", (chunk) => { body += chunk; });
          req.on("end", () => {
            if (!body.trim()) return resolveRead({ ok: true, body: {} });
            try { resolveRead({ ok: true, body: JSON.parse(body) }); }
            catch { resolveRead({ ok: false, body: null }); }
          });
          req.on("error", () => resolveRead({ ok: true, body: {} }));
        });
      }

      // --- Cancel endpoint ---
      const jobCancelMatch = url.pathname.match(/^\/jobs\/([^/]+)\/cancel$/);
      if (jobCancelMatch && request.method === "POST") {
        const jobId = decodeURIComponent(jobCancelMatch[1]);
        const result = store.cancelJob(jobId);
        if (!result.ok) {
          const statusCode = result.code === "JOB_NOT_FOUND" ? 404 : 400;
          return sendJson(response, statusCode, { ok: false, code: result.code, message: result.message });
        }
        return sendJson(response, 200, { ok: true, job: result.job });
      }

      // --- Retry endpoint ---
      const jobRetryMatch = url.pathname.match(/^\/jobs\/([^/]+)\/retry$/);
      if (jobRetryMatch && request.method === "POST") {
        const jobId = decodeURIComponent(jobRetryMatch[1]);
        const result = store.retryJob(jobId);
        if (!result.ok) {
          const statusCode = result.code === "JOB_NOT_FOUND" ? 404 : 400;
          return sendJson(response, statusCode, { ok: false, code: result.code, message: result.message });
        }
        return sendJson(response, 200, { ok: true, job: result.job });
      }

      // --- Review endpoint ---
      const jobReviewMatch = url.pathname.match(/^\/jobs\/([^/]+)\/review$/);
      if (jobReviewMatch && request.method === "POST") {
        const jobId = decodeURIComponent(jobReviewMatch[1]);
        const bodyResult = await readJsonBody(request);
        if (!bodyResult.ok) {
          return sendJson(response, 400, { ok: false, code: "BAD_JSON", message: "Request body could not be parsed as JSON." });
        }
        const { action, reviewedBy, reason } = bodyResult.body || {};
        if (!action || typeof action !== "string") {
          return sendJson(response, 400, { ok: false, code: "MISSING_ACTION", message: "Review action is required." });
        }
        const result = store.reviewJob(jobId, action, { reviewedBy, reason });
        if (!result.ok) {
          const statusCode = result.code === "JOB_NOT_FOUND" ? 404 : 400;
          return sendJson(response, statusCode, { ok: false, code: result.code, message: result.message });
        }
        return sendJson(response, 200, { ok: true, job: result.job });
      }

      return sendJson(response, 404, { ok: false, code: "NOT_FOUND" });
    });

    let resolved = false;
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const url = `http://127.0.0.1:${addr.port}`;
      if (!resolved) {
        resolved = true;
        resolve({ server, url });
      }
    });
    server.on("error", (err) => {
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    });
  });
}

async function stopTestServer(server) {
  return new Promise((resolve) => {
    server.server.close(resolve);
  });
}

// ==================== Run All Tests ====================

async function runAllTests() {
  console.log("=== Jobs Mutation API Tests ===\n");

  // Cancel tests
  await testCancelQueuedJob();
  await testCancelClaimedJob();
  await testCancelRunningJob();
  await testCancelCompletedJob();
  await testCancelFailedJob();
  await testCancelNonexistentJob();

  // Retry tests
  await testRetryFailedJob();
  await testRetryMaxAttemptsExhausted();
  await testRetryNonFailedJob();
  await testRetryNonexistentJob();

  // Review tests
  await testReviewRequestReview();
  await testReviewApprove();
  await testReviewReject();
  await testReviewRequestCorrection();
  await testReviewStop();
  await testReviewInvalidActionOnQueued();
  await testReviewInvalidActionOnCompleted();
  await testReviewNonexistentJob();
  await testReviewMissingAction();
  await testReviewPersistence();
  await testReviewEnvelopeShape();

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
