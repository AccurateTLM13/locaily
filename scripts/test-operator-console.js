const { mkdtempSync, rmSync, mkdirSync, readFileSync, existsSync } = require("node:fs");
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
  const dir = mkdtempSync(join(tmpdir(), "locaily-operator-test-"));
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
      headers: {}
    };
    if (body) {
      options.headers["Content-Type"] = "application/json";
    }
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        let parsed = null;
        try { parsed = JSON.parse(data); } catch {}
        resolve({ status: res.statusCode, headers: res.headers, body: parsed, rawBody: data });
      });
    });
    req.on("error", reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

// ==================== Test Server ====================

function startTestServer(store) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (request, response) => {
      const url = new URL(request.url, `http://${request.headers.host || "127.0.0.1"}`);
      const startedAt = Date.now();
      const operatorDir = join(__dirname, "..", "companion", "operator");

      function sendJson(res, statusCode, body) {
        const payload = JSON.stringify(body, null, 2);
        res.writeHead(statusCode, {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Length": Buffer.byteLength(payload)
        });
        res.end(payload);
      }

      function sendContent(res, statusCode, contentType, body) {
        res.writeHead(statusCode, {
          "Content-Type": contentType,
          "Content-Length": Buffer.byteLength(body),
          "Cache-Control": "no-store"
        });
        res.end(body);
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

      // --- Operator static files ---
      if (request.method === "GET" && (url.pathname === "/operator" || url.pathname === "/operator/")) {
        try {
          const body = readFileSync(join(operatorDir, "index.html"));
          return sendContent(response, 200, "text/html; charset=utf-8", body);
        } catch {
          return sendContent(response, 500, "text/plain", "Internal error");
        }
      }

      if (request.method === "GET" && url.pathname === "/operator/styles.css") {
        try {
          const body = readFileSync(join(operatorDir, "styles.css"));
          return sendContent(response, 200, "text/css; charset=utf-8", body);
        } catch {
          return sendContent(response, 500, "text/plain", "Internal error");
        }
      }

      if (request.method === "GET" && url.pathname === "/operator/app.js") {
        try {
          const body = readFileSync(join(operatorDir, "app.js"));
          return sendContent(response, 200, "text/javascript; charset=utf-8", body);
        } catch {
          return sendContent(response, 500, "text/plain", "Internal error");
        }
      }

      // --- Job endpoints (mirrors server.js logic) ---
      if (request.method === "POST" && url.pathname === "/jobs") {
        const bodyResult = await readJsonBody(request);
        if (!bodyResult.ok) {
          return sendJson(response, 400, { ok: false, code: "BAD_JSON", message: "Request body could not be parsed as JSON." });
        }

        const { type, trackId, workflowId, input, context, options, maxAttempts, correlationId } = bodyResult.body || {};

        if (!type || (type !== "track" && type !== "workflow")) {
          return sendJson(response, 400, { ok: false, code: "INVALID_TYPE", message: "type must be 'track' or 'workflow'." });
        }

        if (type === "track" && !trackId) {
          return sendJson(response, 400, { ok: false, code: "MISSING_TRACK_ID", message: "trackId is required when type is 'track'." });
        }

        if (type === "workflow" && !workflowId) {
          return sendJson(response, 400, { ok: false, code: "MISSING_WORKFLOW_ID", message: "workflowId is required when type is 'workflow'." });
        }

        const createResult = store.createJob({
          executionType: type, trackId: type === "track" ? trackId : null,
          workflowId: type === "workflow" ? workflowId : null,
          input: input || {}, context: context || {}, options: options || {},
          maxAttempts: typeof maxAttempts === "number" ? maxAttempts : 3,
          correlationId: correlationId || null
        });

        if (!createResult.ok) {
          return sendJson(response, 400, { ok: false, code: createResult.code, message: createResult.message });
        }

        return sendJson(response, 201, { ok: true, job: createResult.job });
      }

      if (request.method === "GET" && url.pathname === "/jobs") {
        const statusFilter = url.searchParams.get("status") || null;
        const limitParam = url.searchParams.get("limit");
        const limit = limitParam ? parseInt(limitParam, 10) : null;
        let jobs = store.listJobs(statusFilter ? { status: statusFilter } : {});
        if (limit && Number.isFinite(limit) && limit > 0) jobs = jobs.slice(0, limit);
        const summary = jobs.map((j) => ({
          jobId: j.jobId, type: j.executionType, trackId: j.trackId, workflowId: j.workflowId,
          status: j.status, createdAt: j.timestamps.createdAt, attempts: j.attempt,
          lease: j.lease ? { holder: j.lease.holder, expiresAt: j.lease.expiresAt } : null
        }));
        return sendJson(response, 200, { ok: true, jobs: summary });
      }

      // GET /jobs/:id
      const jobGetMatch = url.pathname.match(/^\/jobs\/([^/]+)$/);
      if (jobGetMatch && request.method === "GET") {
        const jobId = decodeURIComponent(jobGetMatch[1]);
        const job = store.getJob(jobId);
        if (!job) return sendJson(response, 404, { ok: false, code: "JOB_NOT_FOUND", message: `Job '${jobId}' was not found.` });
        return sendJson(response, 200, { ok: true, job });
      }

      // POST /jobs/:id/cancel
      const jobCancelMatch = url.pathname.match(/^\/jobs\/([^/]+)\/cancel$/);
      if (jobCancelMatch && request.method === "POST") {
        const jobId = decodeURIComponent(jobCancelMatch[1]);
        const result = store.cancelJob(jobId);
        if (!result.ok) {
          const sc = result.code === "JOB_NOT_FOUND" ? 404 : 400;
          return sendJson(response, sc, { ok: false, code: result.code, message: result.message });
        }
        return sendJson(response, 200, { ok: true, job: result.job });
      }

      // POST /jobs/:id/retry
      const jobRetryMatch = url.pathname.match(/^\/jobs\/([^/]+)\/retry$/);
      if (jobRetryMatch && request.method === "POST") {
        const jobId = decodeURIComponent(jobRetryMatch[1]);
        const result = store.retryJob(jobId);
        if (!result.ok) {
          const sc = result.code === "JOB_NOT_FOUND" ? 404 : 400;
          return sendJson(response, sc, { ok: false, code: result.code, message: result.message });
        }
        return sendJson(response, 200, { ok: true, job: result.job });
      }

      // POST /jobs/:id/review
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
          const sc = result.code === "JOB_NOT_FOUND" ? 404 : 400;
          return sendJson(response, sc, { ok: false, code: result.code, message: result.message });
        }
        return sendJson(response, 200, { ok: true, job: result.job });
      }

      // --- Health endpoint with jobTotals ---
      if (request.method === "GET" && url.pathname === "/health") {
        const allJobs = store.listJobs();
        const jobTotals = {};
        for (const status of store.STATUSES) {
          jobTotals[status] = allJobs.filter((j) => j.status === status).length;
        }
        return sendJson(response, 200, {
          ok: true, service: "local-ai-platform", version: "test.0.1.0",
          relay: { nodes: 0, healthy: 0 }, jobTotals
        });
      }

      // --- Relay nodes endpoint ---
      if (request.method === "GET" && url.pathname === "/relay/nodes") {
        return sendJson(response, 200, { ok: true, nodes: [], stats: { total: 0, healthy: 0, unhealthy: 0 } });
      }

      return sendJson(response, 404, { ok: false, code: "NOT_FOUND" });
    });

    let resolved = false;
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const url = `http://127.0.0.1:${addr.port}`;
      if (!resolved) { resolved = true; resolve({ server, url }); }
    });
    server.on("error", (err) => { if (!resolved) { resolved = true; reject(err); } });
  });
}

async function stopTestServer(server) {
  return new Promise((resolve) => { server.server.close(resolve); });
}

// ==================== Tests ====================

async function testOperatorHtml() {
  console.log("TEST: GET /operator/ returns HTML");
  const dir = createTempDataDir();
  const store = createDurableJobStore({ dataDir: dir });
  const server = await startTestServer(store);
  try {
    const res = await makeRequest(server.url, "GET", "/operator/");
    assert(res.status === 200, "GET /operator/ returns 200");
    assert(res.headers["content-type"] && res.headers["content-type"].includes("text/html"),
      "Content-Type is text/html");
    assert(res.rawBody.includes("<!DOCTYPE html>"), "Response contains HTML doctype");
    assert(res.rawBody.includes("Locaily Operator"), "Response contains operator title");
  } finally {
    await stopTestServer(server);
    rmSync(dir, { recursive: true, force: true });
  }
}

async function testOperatorHtmlNoSlash() {
  console.log("TEST: GET /operator returns HTML");
  const dir = createTempDataDir();
  const store = createDurableJobStore({ dataDir: dir });
  const server = await startTestServer(store);
  try {
    const res = await makeRequest(server.url, "GET", "/operator");
    assert(res.status === 200, "GET /operator returns 200");
    assert(res.headers["content-type"] && res.headers["content-type"].includes("text/html"),
      "Content-Type is text/html");
  } finally {
    await stopTestServer(server);
    rmSync(dir, { recursive: true, force: true });
  }
}

async function testOperatorCss() {
  console.log("TEST: GET /operator/styles.css returns CSS");
  const dir = createTempDataDir();
  const store = createDurableJobStore({ dataDir: dir });
  const server = await startTestServer(store);
  try {
    const res = await makeRequest(server.url, "GET", "/operator/styles.css");
    assert(res.status === 200, "GET /operator/styles.css returns 200");
    assert(res.headers["content-type"] && res.headers["content-type"].includes("text/css"),
      "Content-Type is text/css");
    assert(res.rawBody.includes(":root"), "Response contains CSS variables");
  } finally {
    await stopTestServer(server);
    rmSync(dir, { recursive: true, force: true });
  }
}

async function testOperatorJs() {
  console.log("TEST: GET /operator/app.js returns JS");
  const dir = createTempDataDir();
  const store = createDurableJobStore({ dataDir: dir });
  const server = await startTestServer(store);
  try {
    const res = await makeRequest(server.url, "GET", "/operator/app.js");
    assert(res.status === 200, "GET /operator/app.js returns 200");
    assert(res.headers["content-type"] && res.headers["content-type"].includes("javascript"),
      "Content-Type is application/javascript");
    assert(res.rawBody.includes("Operator Console"), "Response contains operator console reference");
  } finally {
    await stopTestServer(server);
    rmSync(dir, { recursive: true, force: true });
  }
}

async function testHealthReturnsJobTotals() {
  console.log("TEST: /health returns jobTotals unchanged");
  const dir = createTempDataDir();
  const store = createDurableJobStore({ dataDir: dir });
  const server = await startTestServer(store);
  try {
    // Create a job to populate totals
    store.createJob({ executionType: "track", trackId: "test_track", input: {} });

    const res = await makeRequest(server.url, "GET", "/health");
    assert(res.status === 200, "GET /health returns 200");
    assert(res.body.ok === true, "health ok is true");
    assert(res.body.jobTotals !== undefined, "health has jobTotals");
    assert(typeof res.body.jobTotals === "object", "jobTotals is an object");
    assert(res.body.jobTotals.queued >= 1, "jobTotals has queued count >= 1");
  } finally {
    await stopTestServer(server);
    rmSync(dir, { recursive: true, force: true });
  }
}

async function testRelayNodes() {
  console.log("TEST: /relay/nodes returns node list unchanged");
  const dir = createTempDataDir();
  const store = createDurableJobStore({ dataDir: dir });
  const server = await startTestServer(store);
  try {
    const res = await makeRequest(server.url, "GET", "/relay/nodes");
    assert(res.status === 200, "GET /relay/nodes returns 200");
    assert(res.body.ok === true, "relay/nodes ok is true");
    assert(Array.isArray(res.body.nodes), "nodes is an array");
  } finally {
    await stopTestServer(server);
    rmSync(dir, { recursive: true, force: true });
  }
}

async function testJobMutationEndpoints() {
  console.log("TEST: Job mutation endpoints still work");
  const dir = createTempDataDir();
  const store = createDurableJobStore({ dataDir: dir });
  const server = await startTestServer(store);
  try {
    // Create a job
    const createResult = store.createJob({ executionType: "track", trackId: "test_track", input: {} });
    const jobId = createResult.job.jobId;
    assert(createResult.ok, "Job created successfully");

    // Cancel it
    const cancelRes = await makeRequest(server.url, "POST", `/jobs/${jobId}/cancel`);
    assert(cancelRes.status === 200, "Cancel returns 200");
    assert(cancelRes.body.ok === true, "Cancel ok is true");
    assert(cancelRes.body.job.status === "cancelled", "Job status is cancelled");

    // Retry a failed job
    store.createJob({ executionType: "track", trackId: "test_track", input: {} });
    const failedResult = store.createJob({ executionType: "track", trackId: "test_track", input: {} });
    // Claim and fail it
    const claimResult = store.claimJob(failedResult.job.jobId, "test-worker");
    if (claimResult.ok) {
      store.startJob(failedResult.job.jobId, "test-worker");
      store.failJob(failedResult.job.jobId, { code: "TEST_ERROR", message: "Test fail" });
    }
    const retryRes = await makeRequest(server.url, "POST", `/jobs/${failedResult.job.jobId}/retry`);
    assert(retryRes.status === 200, "Retry returns 200");
    assert(retryRes.body.ok === true, "Retry ok is true");
    assert(retryRes.body.job.status === "queued", "Retried job status is queued");

    // Review: request_review
    const reviewJob = store.createJob({ executionType: "track", trackId: "test_track", input: {} });
    const claimR = store.claimJob(reviewJob.job.jobId, "test-worker");
    if (claimR.ok) store.startJob(reviewJob.job.jobId, "test-worker");
    const reviewRes = await makeRequest(server.url, "POST", `/jobs/${reviewJob.job.jobId}/review`, {
      action: "request_review", reviewedBy: "test", reason: "testing"
    });
    assert(reviewRes.status === 200, "Review request_review returns 200");
    assert(reviewRes.body.ok === true, "Review ok is true");
    assert(reviewRes.body.job.status === "paused_review", "Job status is paused_review");
  } finally {
    await stopTestServer(server);
    rmSync(dir, { recursive: true, force: true });
  }
}

async function testOperatorMissing() {
  console.log("TEST: /operator/missing returns 404");
  const dir = createTempDataDir();
  const store = createDurableJobStore({ dataDir: dir });
  const server = await startTestServer(store);
  try {
    const res = await makeRequest(server.url, "GET", "/operator/missing");
    assert(res.status === 404, "GET /operator/missing returns 404");
  } finally {
    await stopTestServer(server);
    rmSync(dir, { recursive: true, force: true });
  }
}

async function testNonExistentJobId() {
  console.log("TEST: Non-existent job ID returns 404 from /jobs/:id");
  const dir = createTempDataDir();
  const store = createDurableJobStore({ dataDir: dir });
  const server = await startTestServer(store);
  try {
    const res = await makeRequest(server.url, "GET", "/jobs/nonexistent-job-id");
    assert(res.status === 404, "GET /jobs/nonexistent-job-id returns 404");
    assert(res.body.ok === false, "Response ok is false");
    assert(res.body.code === "JOB_NOT_FOUND", "Response code is JOB_NOT_FOUND");
  } finally {
    await stopTestServer(server);
    rmSync(dir, { recursive: true, force: true });
  }
}

// ==================== Run All Tests ====================

async function runAllTests() {
  console.log("=== Operator Console Tests ===\n");

  await testOperatorHtml();
  await testOperatorHtmlNoSlash();
  await testOperatorCss();
  await testOperatorJs();
  await testHealthReturnsJobTotals();
  await testRelayNodes();
  await testJobMutationEndpoints();
  await testOperatorMissing();
  await testNonExistentJobId();

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
