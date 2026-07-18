const assert = require("node:assert");
const { spawn } = require("node:child_process");

const PORT = 31320;
const BASE = `http://127.0.0.1:${PORT}`;
const RELAY_TOKEN = "test-secret-token";

let passed = 0;
let failed = 0;
const children = [];

function check(name, cond, detail) {
  if (cond) {
    passed += 1;
    console.log(`PASS: ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL: ${name}`);
    if (detail) console.error(`  ${detail}`);
  }
}

async function waitForHealth(base, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${base}/health`);
      if (res.ok) return true;
    } catch (_error) {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Server at ${base} did not become healthy in ${timeoutMs}ms`);
}

async function api(base, path, method = "GET", body, headers = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let parsed = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch (_error) {
    parsed = { raw: text };
  }
  return { status: res.status, body: parsed };
}

function startServerWithToken() {
  const child = spawn(process.execPath, ["companion/server.js"], {
    env: {
      ...process.env,
      LOCAL_AI_HOST: "127.0.0.1",
      LOCAL_AI_PORT: String(PORT),
      RELAY_TOKEN
    },
    stdio: ["ignore", "ignore", "ignore"]
  });
  children.push(child);
  return child;
}

async function main() {
  console.log("Starting server with RELAY_TOKEN configured...");
  startServerWithToken();
  await waitForHealth(BASE);
  console.log("Server healthy with RELAY_TOKEN set.");

  // Test: GET /relay/nodes rejects without auth
  const nodesNoAuth = await api(BASE, "/relay/nodes");
  check("GET /relay/nodes rejects without auth (401)", nodesNoAuth.status === 401, JSON.stringify(nodesNoAuth.body));
  check("GET /relay/nodes error has RELAY_AUTH_MISSING code", nodesNoAuth.body.error && nodesNoAuth.body.error.code === "RELAY_AUTH_MISSING", JSON.stringify(nodesNoAuth.body));

  // Test: GET /relay/nodes rejects with wrong token
  const nodesWrongToken = await api(BASE, "/relay/nodes", "GET", undefined, { Authorization: "Bearer wrong-token" });
  check("GET /relay/nodes rejects with wrong token (401)", nodesWrongToken.status === 401, JSON.stringify(nodesWrongToken.body));
  check("GET /relay/nodes error has RELAY_AUTH_INVALID code", nodesWrongToken.body.error && nodesWrongToken.body.error.code === "RELAY_AUTH_INVALID", JSON.stringify(nodesWrongToken.body));

  // Test: GET /relay/nodes succeeds with valid token
  const nodesValid = await api(BASE, "/relay/nodes", "GET", undefined, { Authorization: `Bearer ${RELAY_TOKEN}` });
  check("GET /relay/nodes succeeds with valid token", nodesValid.status === 200 && nodesValid.body.ok === true, JSON.stringify(nodesValid.body));

  // Test: POST /relay/register rejects without auth
  const regNoAuth = await api(BASE, "/relay/register", "POST", { nodeId: "test", baseUrl: "http://test:1" });
  check("POST /relay/register rejects without auth (401)", regNoAuth.status === 401, JSON.stringify(regNoAuth.body));
  check("POST /relay/register error has RELAY_AUTH_MISSING code", regNoAuth.body.error && regNoAuth.body.error.code === "RELAY_AUTH_MISSING", JSON.stringify(regNoAuth.body));

  // Test: POST /relay/heartbeat rejects without auth
  const hbNoAuth = await api(BASE, "/relay/heartbeat", "POST", { nodeId: "test" });
  check("POST /relay/heartbeat rejects without auth (401)", hbNoAuth.status === 401, JSON.stringify(hbNoAuth.body));
  check("POST /relay/heartbeat error has RELAY_AUTH_MISSING code", hbNoAuth.body.error && hbNoAuth.body.error.code === "RELAY_AUTH_MISSING", JSON.stringify(hbNoAuth.body));

  // Test: POST /relay/step rejects without auth
  const stepNoAuth = await api(BASE, "/relay/step", "POST", { step: { executor: { type: "model" } } });
  check("POST /relay/step rejects without auth (401)", stepNoAuth.status === 401, JSON.stringify(stepNoAuth.body));
  check("POST /relay/step error has RELAY_AUTH_MISSING code", stepNoAuth.body.error && stepNoAuth.body.error.code === "RELAY_AUTH_MISSING", JSON.stringify(stepNoAuth.body));

  // Test: POST /relay/unregister rejects without auth
  const unregNoAuth = await api(BASE, "/relay/unregister", "POST", { nodeId: "test" });
  check("POST /relay/unregister rejects without auth (401)", unregNoAuth.status === 401, JSON.stringify(unregNoAuth.body));

  // Test: POST /relay/plan rejects without auth
  const planNoAuth = await api(BASE, "/relay/plan", "POST", { track_id: "test" });
  check("POST /relay/plan rejects without auth (401)", planNoAuth.status === 401, JSON.stringify(planNoAuth.body));
  check("POST /relay/plan error has RELAY_AUTH_MISSING code", planNoAuth.body.error && planNoAuth.body.error.code === "RELAY_AUTH_MISSING", JSON.stringify(planNoAuth.body));

  // Test: POST /relay/plan rejects with wrong token
  const planWrongToken = await api(BASE, "/relay/plan", "POST", { track_id: "test" }, { Authorization: "Bearer wrong" });
  check("POST /relay/plan rejects with wrong token (401)", planWrongToken.status === 401, JSON.stringify(planWrongToken.body));
  check("POST /relay/plan error has RELAY_AUTH_INVALID code", planWrongToken.body.error && planWrongToken.body.error.code === "RELAY_AUTH_INVALID", JSON.stringify(planWrongToken.body));

  console.log(`\n${passed}/${passed + failed} relay auth e2e tests passed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("Relay auth e2e harness error:", error);
  process.exit(1);
}).finally(() => {
  for (const child of children) {
    try {
      if (child && !child.killed) child.kill("SIGKILL");
    } catch (_error) {
      // ignore
    }
  }
});
