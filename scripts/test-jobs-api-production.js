const { spawn } = require("node:child_process");
const { mkdtempSync, rmSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const http = require("node:http");

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    passed += 1;
  } else {
    console.error(`  FAIL: ${label}`);
    failed += 1;
  }
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
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function isServerHealthy(baseUrl) {
  try {
    const res = await makeRequest(baseUrl, "GET", "/health");
    return res.status === 200 && res.body && res.body.ok;
  } catch {
    return false;
  }
}

async function waitForHealth(baseUrl, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isServerHealthy(baseUrl)) {
      return;
    }
    await sleep(500);
  }
  throw new Error("Production server did not become healthy in time");
}

async function startProductionServer() {
  const child = spawn(process.execPath, [join(__dirname, "..", "companion", "server.js")], {
    env: {
      ...process.env,
      LOCAILLY_PROVIDER: "mock"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  return {
    child,
    url: "http://127.0.0.1:31313",
    owned: true,
    async stop() {
      if (!child.killed) {
        child.kill("SIGTERM");
        await sleep(500);
        if (!child.killed) child.kill("SIGKILL");
      }
    }
  };
}

async function run() {
  console.log("=== Jobs API Production Route Tests ===\n");

  const baseUrl = process.env.LOCAILLY_BASE_URL || "http://127.0.0.1:31313";
  let server = null;
  let startedLocally = false;

  try {
    if (!(await isServerHealthy(baseUrl))) {
      server = await startProductionServer();
      startedLocally = true;
      await waitForHealth(baseUrl);
    }

    console.log("TEST: production POST /jobs accepts executionType track");
    const trackRes = await makeRequest(baseUrl, "POST", "/jobs", {
      executionType: "track",
      trackId: "website_audit.lighthouse_handoff",
      input: { url: "https://example.com" }
    });
    assert(trackRes.status === 200, "production track create returns 200");
    assert(trackRes.body && trackRes.body.ok === true, "production track create ok true");
    assert(trackRes.body.job.executionType === "track", "production track job has executionType");

    console.log("TEST: production POST /jobs rejects legacy type field");
    const legacyRes = await makeRequest(baseUrl, "POST", "/jobs", {
      type: "track",
      trackId: "website_audit.lighthouse_handoff",
      input: {}
    });
    assert(legacyRes.status === 400, "legacy type payload rejected with 400");
    assert(legacyRes.body && legacyRes.body.code === "INVALID_EXECUTION_TYPE", "legacy type returns INVALID_EXECUTION_TYPE");

    console.log("TEST: production POST /jobs accepts executionType workflow");
    const workflowRes = await makeRequest(baseUrl, "POST", "/jobs", {
      executionType: "workflow",
      workflowId: "lighthouse_full",
      input: { url: "https://example.com" }
    });
    assert(workflowRes.status === 200, "production workflow create returns 200");
    assert(workflowRes.body && workflowRes.body.ok === true, "production workflow create ok true");
    assert(workflowRes.body.job.executionType === "workflow", "production workflow job has executionType");
  } finally {
    if (startedLocally && server) {
      await server.stop();
    }
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((error) => {
  console.error("Test runner error:", error.message);
  process.exit(1);
});
