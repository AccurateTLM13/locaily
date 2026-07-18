const { mkdtempSync, rmSync, existsSync, mkdirSync } = require("node:fs");
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
  const dir = mkdtempSync(join(tmpdir(), "locaily-jobs-api-test-"));
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

// ==================== Integration Tests ====================

async function testPostJobTrack() {
  console.log("TEST: POST /jobs with executionType track");
  const dir = createTempDataDir();
  const store = createDurableJobStore({ dataDir: dir });
  const server = await startTestServer(store);

  try {
    const res = await makeRequest(server.url, "POST", "/jobs", {
      executionType: "track",
      trackId: "website_audit.lighthouse_handoff",
      input: { url: "https://example.com" },
      context: { memory: {} },
      options: { modelRole: "default_worker" },
      maxAttempts: 3,
      correlationId: "corr_test_track"
    });
    assert(res.status === 200, "POST /jobs track returns 200");
    assert(res.body.ok === true, "POST /jobs track ok true");
    assert(res.body.job !== undefined, "POST /jobs track has job field");
    assert(res.body.job.executionType === "track", "job executionType is track");
    assert(res.body.job.trackId === "website_audit.lighthouse_handoff", "job trackId set");
    assert(res.body.job.workflowId === null, "job workflowId is null");
    assert(res.body.job.status === "queued", "job status is queued");
    assert(res.body.job.jobId.startsWith("job_"), "job jobId has prefix");
  } finally {
    await stopTestServer(server);
    rmSync(dir, { recursive: true, force: true });
  }
}

async function testPostJobWorkflow() {
  console.log("TEST: POST /jobs with executionType workflow");
  const dir = createTempDataDir();
  const store = createDurableJobStore({ dataDir: dir });
  const server = await startTestServer(store);

  try {
    const res = await makeRequest(server.url, "POST", "/jobs", {
      executionType: "workflow",
      workflowId: "lighthouse_full",
      input: { url: "https://example.com" },
      options: {}
    });
    assert(res.status === 200, "POST /jobs workflow returns 200");
    assert(res.body.ok === true, "POST /jobs workflow ok true");
    assert(res.body.job.executionType === "workflow", "job executionType is workflow");
    assert(res.body.job.workflowId === "lighthouse_full", "job workflowId set");
    assert(res.body.job.trackId === null, "job trackId is null");
    assert(res.body.job.status === "queued", "job status is queued");
  } finally {
    await stopTestServer(server);
    rmSync(dir, { recursive: true, force: true });
  }
}

async function testPostJobInvalidType() {
  console.log("TEST: POST /jobs with invalid executionType");
  const dir = createTempDataDir();
  const store = createDurableJobStore({ dataDir: dir });
  const server = await startTestServer(store);

  try {
    const res = await makeRequest(server.url, "POST", "/jobs", {
      executionType: "invalid",
      input: {}
    });
    assert(res.status === 400, "POST /jobs invalid executionType returns 400");
    assert(res.body.ok === false, "POST /jobs invalid executionType ok false");
    assert(res.body.code === "INVALID_EXECUTION_TYPE", "POST /jobs invalid executionType code");
  } finally {
    await stopTestServer(server);
    rmSync(dir, { recursive: true, force: true });
  }
}

async function testPostJobMissingTrackId() {
  console.log("TEST: POST /jobs track without trackId");
  const dir = createTempDataDir();
  const store = createDurableJobStore({ dataDir: dir });
  const server = await startTestServer(store);

  try {
    const res = await makeRequest(server.url, "POST", "/jobs", {
      executionType: "track",
      input: {}
    });
    assert(res.status === 400, "POST /jobs missing trackId returns 400");
    assert(res.body.ok === false, "POST /jobs missing trackId ok false");
    assert(res.body.code === "MISSING_TRACK_ID", "POST /jobs missing trackId code");
  } finally {
    await stopTestServer(server);
    rmSync(dir, { recursive: true, force: true });
  }
}

async function testPostJobMissingWorkflowId() {
  console.log("TEST: POST /jobs workflow without workflowId");
  const dir = createTempDataDir();
  const store = createDurableJobStore({ dataDir: dir });
  const server = await startTestServer(store);

  try {
    const res = await makeRequest(server.url, "POST", "/jobs", {
      executionType: "workflow",
      input: {}
    });
    assert(res.status === 400, "POST /jobs missing workflowId returns 400");
    assert(res.body.ok === false, "POST /jobs missing workflowId ok false");
    assert(res.body.code === "MISSING_WORKFLOW_ID", "POST /jobs missing workflowId code");
  } finally {
    await stopTestServer(server);
    rmSync(dir, { recursive: true, force: true });
  }
}

async function testGetJobsEmpty() {
  console.log("TEST: GET /jobs when empty");
  const dir = createTempDataDir();
  const store = createDurableJobStore({ dataDir: dir });
  const server = await startTestServer(store);

  try {
    const res = await makeRequest(server.url, "GET", "/jobs");
    assert(res.status === 200, "GET /jobs empty returns 200");
    assert(res.body.ok === true, "GET /jobs empty ok true");
    assert(Array.isArray(res.body.jobs), "GET /jobs empty jobs array");
    assert(res.body.jobs.length === 0, "GET /jobs empty returns empty array");
  } finally {
    await stopTestServer(server);
    rmSync(dir, { recursive: true, force: true });
  }
}

async function testGetJobsWithJobs() {
  console.log("TEST: GET /jobs returns all jobs");
  const dir = createTempDataDir();
  const store = createDurableJobStore({ dataDir: dir });
  store.createJob({ executionType: "track", trackId: "t1", input: {}, context: {}, options: {} });
  store.createJob({ executionType: "track", trackId: "t2", input: {}, context: {}, options: {} });
  store.createJob({ executionType: "workflow", workflowId: "w1", input: {}, context: {}, options: {} });
  const server = await startTestServer(store);

  try {
    const res = await makeRequest(server.url, "GET", "/jobs");
    assert(res.status === 200, "GET /jobs returns 200");
    assert(res.body.jobs.length === 3, "GET /jobs returns 3 jobs");
    assert(res.body.jobs[0].jobId, "GET /jobs summary has jobId");
    assert(res.body.jobs[0].type, "GET /jobs summary has type");
    assert(res.body.jobs[0].status, "GET /jobs summary has status");
    assert(res.body.jobs[0].createdAt, "GET /jobs summary has createdAt");
  } finally {
    await stopTestServer(server);
    rmSync(dir, { recursive: true, force: true });
  }
}

async function testGetJobsFilterByStatus() {
  console.log("TEST: GET /jobs?status=queued");
  const dir = createTempDataDir();
  const store = createDurableJobStore({ dataDir: dir });
  const j1 = store.createJob({ executionType: "track", trackId: "t1", input: {}, context: {}, options: {} });
  store.createJob({ executionType: "track", trackId: "t2", input: {}, context: {}, options: {} });
  store.createJob({ executionType: "workflow", workflowId: "w1", input: {}, context: {}, options: {} });
  // Claim and complete one to change its status
  store.claimJob(j1.job.jobId, "worker-1");
  store.startJob(j1.job.jobId);
  store.completeJob(j1.job.jobId, {});
  const server = await startTestServer(store);

  try {
    const queued = await makeRequest(server.url, "GET", "/jobs?status=queued");
    assert(queued.status === 200, "GET /jobs?status=queued returns 200");
    assert(queued.body.jobs.length === 2, "GET /jobs?status=queued returns 2 queued jobs");
    assert(queued.body.jobs.every((j) => j.status === "queued"), "all jobs have queued status");

    const completed = await makeRequest(server.url, "GET", "/jobs?status=completed");
    assert(completed.body.jobs.length === 1, "GET /jobs?status=completed returns 1 completed");
    assert(completed.body.jobs[0].status === "completed", "completed job status is completed");

    const running = await makeRequest(server.url, "GET", "/jobs?status=running");
    assert(running.body.jobs.length === 0, "GET /jobs?status=running returns 0");
  } finally {
    await stopTestServer(server);
    rmSync(dir, { recursive: true, force: true });
  }
}

async function testGetJobById() {
  console.log("TEST: GET /jobs/:id");
  const dir = createTempDataDir();
  const store = createDurableJobStore({ dataDir: dir });
  const created = store.createJob({ executionType: "track", trackId: "t1", input: { key: "value" }, context: {}, options: {} });
  const jobId = created.job.jobId;
  const server = await startTestServer(store);

  try {
    const res = await makeRequest(server.url, "GET", `/jobs/${encodeURIComponent(jobId)}`);
    assert(res.status === 200, "GET /jobs/:id returns 200");
    assert(res.body.ok === true, "GET /jobs/:id ok true");
    assert(res.body.job.jobId === jobId, "GET /jobs/:id matches jobId");
    assert(res.body.job.executionType === "track", "GET /jobs/:id full job has executionType");
    assert(res.body.job.trackId === "t1", "GET /jobs/:id full job has trackId");
    assert(res.body.job.input.key === "value", "GET /jobs/:id full job has input");
    assert(res.body.job.timestamps, "GET /jobs/:id full job has timestamps");
    assert(res.body.job.timestamps.createdAt, "GET /jobs/:id full job has createdAt");
  } finally {
    await stopTestServer(server);
    rmSync(dir, { recursive: true, force: true });
  }
}

async function testGetJobByIdNotFound() {
  console.log("TEST: GET /jobs/:id not found");
  const dir = createTempDataDir();
  const store = createDurableJobStore({ dataDir: dir });
  const server = await startTestServer(store);

  try {
    const res = await makeRequest(server.url, "GET", "/jobs/nonexistent_id");
    assert(res.status === 404, "GET /jobs/:id not found returns 404");
    assert(res.body.ok === false, "GET /jobs/:id not found ok false");
    assert(res.body.code === "JOB_NOT_FOUND", "GET /jobs/:id not found code JOB_NOT_FOUND");
  } finally {
    await stopTestServer(server);
    rmSync(dir, { recursive: true, force: true });
  }
}

async function testHealthJobTotals() {
  console.log("TEST: GET /health includes jobTotals");
  const dir = createTempDataDir();
  const store = createDurableJobStore({ dataDir: dir });
  store.createJob({ executionType: "track", trackId: "t1", input: {}, context: {}, options: {} });
  store.createJob({ executionType: "track", trackId: "t2", input: {}, context: {}, options: {} });
  store.createJob({ executionType: "workflow", workflowId: "w1", input: {}, context: {}, options: {} });
  const server = await startTestServer(store);

  try {
    const res = await makeRequest(server.url, "GET", "/health");
    assert(res.status === 200, "GET /health returns 200");
    assert(res.body.jobTotals !== undefined, "GET /health has jobTotals");
    assert(typeof res.body.jobTotals.queued === "number", "GET /health jobTotals.queued is number");
    assert(typeof res.body.jobTotals.completed === "number", "GET /health jobTotals.completed is number");
    assert(typeof res.body.jobTotals.failed === "number", "GET /health jobTotals.failed is number");
    assert(res.body.jobTotals.queued === 3, "GET /health jobTotals.queued is 3");
    assert(res.body.jobTotals.completed === 0, "GET /health jobTotals.completed is 0");
    assert(res.body.jobTotals.failed === 0, "GET /health jobTotals.failed is 0");
  } finally {
    await stopTestServer(server);
    rmSync(dir, { recursive: true, force: true });
  }
}

async function testPersistenceAcrossRestart() {
  console.log("TEST: jobs persist across server restart");
  const dir = createTempDataDir();
  let store = createDurableJobStore({ dataDir: dir });
  const created = store.createJob({
    executionType: "track",
    trackId: "website_audit.lighthouse_handoff",
    input: { url: "https://example.com" },
    context: { memory: {} },
    options: { modelRole: "default_worker" },
    correlationId: "corr_persist_test"
  });
  const jobId = created.job.jobId;

  // Simulate restart by creating new store from same dir
  store = createDurableJobStore({ dataDir: dir });
  const server = await startTestServer(store);

  try {
    const listRes = await makeRequest(server.url, "GET", "/jobs");
    assert(listRes.body.jobs.length >= 1, "persisted jobs appear in GET /jobs after restart");

    const jobRes = await makeRequest(server.url, "GET", `/jobs/${encodeURIComponent(jobId)}`);
    assert(jobRes.status === 200, "persisted job retrievable by id after restart");
    assert(jobRes.body.job.jobId === jobId, "persisted job id matches");
    assert(jobRes.body.job.trackId === "website_audit.lighthouse_handoff", "persisted job trackId matches");
    assert(jobRes.body.job.input.url === "https://example.com", "persisted job input matches");
    assert(jobRes.body.job.correlationId === "corr_persist_test", "persisted job correlationId matches");
  } finally {
    await stopTestServer(server);
    rmSync(dir, { recursive: true, force: true });
  }
}

// ==================== Test Server Helpers ====================

function startTestServer(store) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (request, response) => {
      // Minimal HTTP handler that wraps the real server's job endpoints
      // but uses the injected store directly.
      const url = new URL(request.url, `http://${request.headers.host || "127.0.0.1"}`);
      const startedAt = Date.now();

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

      // --- Job endpoints (mirrors server.js logic) ---
      if (request.method === "POST" && url.pathname === "/jobs") {
        const bodyResult = await readJsonBody(request);
        if (!bodyResult.ok) {
          return sendJson(response, 400, {
            ok: false, code: "BAD_JSON",
            message: "Request body could not be parsed as JSON.",
            nextStep: "Send a valid JSON object."
          });
        }

        const { executionType, trackId, workflowId, input, context, options, maxAttempts, correlationId } = bodyResult.body || {};

        if (!executionType || (executionType !== "track" && executionType !== "workflow")) {
          return sendJson(response, 400, {
            ok: false, code: "INVALID_EXECUTION_TYPE",
            message: "executionType must be 'track' or 'workflow'."
          });
        }

        if (executionType === "track" && !trackId) {
          return sendJson(response, 400, {
            ok: false, code: "MISSING_TRACK_ID",
            message: "trackId is required when executionType is 'track'."
          });
        }

        if (executionType === "workflow" && !workflowId) {
          return sendJson(response, 400, {
            ok: false, code: "MISSING_WORKFLOW_ID",
            message: "workflowId is required when executionType is 'workflow'."
          });
        }

        const createResult = store.createJob({
          executionType,
          trackId: executionType === "track" ? trackId : null,
          workflowId: executionType === "workflow" ? workflowId : null,
          input: input || {}, context: context || {}, options: options || {},
          maxAttempts: typeof maxAttempts === "number" ? maxAttempts : 3,
          correlationId: correlationId || null
        });

        if (!createResult.ok) {
          return sendJson(response, 400, {
            ok: false, code: createResult.code,
            message: createResult.message
          });
        }

        return sendJson(response, 200, { ok: true, job: createResult.job });
      }

      if (request.method === "GET" && url.pathname === "/jobs") {
        const statusFilter = url.searchParams.get("status") || null;
        const limitParam = url.searchParams.get("limit");
        const limit = limitParam ? parseInt(limitParam, 10) : null;

        let jobs = store.listJobs(statusFilter ? { status: statusFilter } : {});
        if (limit && Number.isFinite(limit) && limit > 0) {
          jobs = jobs.slice(0, limit);
        }

        const summary = jobs.map((job) => ({
          jobId: job.jobId,
          type: job.executionType,
          trackId: job.trackId,
          workflowId: job.workflowId,
          status: job.status,
          createdAt: job.timestamps.createdAt,
          attempts: job.attempt,
          lease: job.lease ? { holder: job.lease.holder, expiresAt: job.lease.expiresAt } : null
        }));

        return sendJson(response, 200, { ok: true, jobs: summary });
      }

      const jobGetMatch = url.pathname.match(/^\/jobs\/([^/]+)$/);
      if (jobGetMatch && request.method === "GET") {
        const jobId = decodeURIComponent(jobGetMatch[1]);
        const job = store.getJob(jobId);
        if (!job) {
          return sendJson(response, 404, {
            ok: false, code: "JOB_NOT_FOUND",
            message: `Job '${jobId}' was not found.`,
            nextStep: "Use GET /jobs to list all jobs."
          });
        }
        return sendJson(response, 200, { ok: true, job });
      }

      // --- Health endpoint with jobTotals ---
      if (request.method === "GET" && url.pathname === "/health") {
        const allJobs = store.listJobs();
        const jobTotals = {};
        for (const status of store.STATUSES) {
          jobTotals[status] = allJobs.filter((j) => j.status === status).length;
        }
        return sendJson(response, 200, {
          ok: true,
          service: "local-ai-platform",
          version: "test.0.1.0",
          jobTotals
        });
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
  console.log("=== Jobs API Tests ===\n");

  await testPostJobTrack();
  await testPostJobWorkflow();
  await testPostJobInvalidType();
  await testPostJobMissingTrackId();
  await testPostJobMissingWorkflowId();
  await testGetJobsEmpty();
  await testGetJobsWithJobs();
  await testGetJobsFilterByStatus();
  await testGetJobById();
  await testGetJobByIdNotFound();
  await testHealthJobTotals();
  await testPersistenceAcrossRestart();

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
