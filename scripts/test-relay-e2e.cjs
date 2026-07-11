const assert = require("node:assert");
const { spawn } = require("node:child_process");
const { join } = require("node:path");

const PORT_A = 31313;
const PORT_B = 31314;
const BASE_A = `http://127.0.0.1:${PORT_A}`;
const BASE_B = `http://127.0.0.1:${PORT_B}`;

const LIGHTHOUSE_INPUT = {
  url: "https://example.com",
  scores: { performance: 72, accessibility: 96, bestPractices: 100, seo: 92 },
  opportunities: [{ title: "Reduce render-blocking resources" }],
  diagnostics: []
};

const B_CAPABILITIES = [
  "default_worker",
  "developer_task_writer",
  "guardrail_writer",
  "testing_checklist_writer"
];

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

async function api(base, path, method = "GET", body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
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

function startServer(port) {
  const child = spawn(process.execPath, ["companion/server.js"], {
    env: { ...process.env, LOCAL_AI_HOST: "127.0.0.1", LOCAL_AI_PORT: String(port) },
    stdio: ["ignore", "ignore", "ignore"]
  });
  children.push(child);
  return child;
}

async function setMockProvider(base) {
  const res = await api(base, "/providers/set", "POST", { provider: "mock" });
  assert.strictEqual(res.status, 200, `provider set failed on ${base}: ${JSON.stringify(res.body)}`);
}

async function main() {
  console.log("Starting relay node B...");
  startServer(PORT_B);
  console.log("Starting orchestrator A...");
  startServer(PORT_A);

  await waitForHealth(BASE_A);
  await waitForHealth(BASE_B);
  console.log("Both servers healthy.");

  await setMockProvider(BASE_A);
  await setMockProvider(BASE_B);

  // Discovery + capability advertisement: register B with A.
  const reg = await api(BASE_A, "/relay/register", "POST", {
    nodeId: "relay-b",
    baseUrl: BASE_B,
    label: "Machine B",
    capabilities: B_CAPABILITIES
  });
  check("relay node registration succeeds", reg.status === 200 && reg.body.ok === true, JSON.stringify(reg.body));
  check("registered node listed in registry", reg.body.node.nodeId === "relay-b");

  const nodes = await api(BASE_A, "/relay/nodes");
  check("GET /relay/nodes shows healthy node", nodes.body.stats.healthy === 1, JSON.stringify(nodes.body.stats));

  // End-to-end: Lighthouse Handoff on A with model steps routed to B.
  const run1 = await api(BASE_A, "/workflows/run", "POST", {
    workflow_id: "lighthouse_handoff",
    input: LIGHTHOUSE_INPUT,
    options: { execution_mode: "workflow_orchestrated", useDag: true, relay_policy: "prefer_relay" }
  });

  check("workflow run returns 200", run1.status === 200, JSON.stringify(run1.body).slice(0, 300));
  check("workflow plan completed", run1.body && run1.body.result && run1.body.result.plan && run1.body.result.plan.status === "completed", JSON.stringify(run1.body && run1.body.result && run1.body.result.plan && run1.body.result.plan.status));

  const steps = (run1.body && run1.body.meta && run1.body.meta.steps) || [];
  check("workflow produced step metadata", steps.length > 0, `steps=${steps.length}`);

  const relayedSteps = steps.filter((s) => s.worker_used && s.worker_used.routed_via === "relay");
  check("at least one model step executed on relay node B", relayedSteps.length > 0, `relayed=${relayedSteps.length}`);
  check("relayed step reports node_b", relayedSteps.every((s) => s.worker_used.node_id === "relay-b"), JSON.stringify(relayedSteps.map((s) => s.worker_used)));

  // Failure + local fallback: kill B, expect fallback to local with audit trail.
  console.log("Killing relay node B to test fallback...");
  const childB = children.find((c) => c && !c.killed);
  // kill the B process specifically by port match is hard; kill both known children, restart A is overkill.
  // We track which child is B by order: B started first.
  const bChild = children[0];
  bChild.kill("SIGKILL");

  const run2 = await api(BASE_A, "/workflows/run", "POST", {
    workflow_id: "lighthouse_handoff",
    input: LIGHTHOUSE_INPUT,
    options: { execution_mode: "workflow_orchestrated", useDag: true, relay_policy: "prefer_relay" }
  });

  check("workflow still completes after relay failure", run2.status === 200 && run2.body && run2.body.result && run2.body.result.plan && run2.body.result.plan.status === "completed", JSON.stringify(run2.body && run2.body.result && run2.body.result.plan && run2.body.result.plan.status));

  const steps2 = (run2.body && run2.body.meta && run2.body.meta.steps) || [];
  const stillRelayed = steps2.filter((s) => s.worker_used && s.worker_used.routed_via === "relay");
  check("no step routed to dead relay node (fell back locally)", stillRelayed.length === 0, `stillRelayed=${stillRelayed.length}`);

  const audit = await api(BASE_A, "/audit?tool=relay-router");
  const fallbackEvents = (audit.body && audit.body.events) || [];
  check("relay fallback audit event recorded", fallbackEvents.some((e) => e.error_code === "RELAY_FALLBACK"), `fallbackEvents=${fallbackEvents.length}`);

  console.log(`\n${passed}/${passed + failed} relay e2e tests passed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("Relay e2e harness error:", error);
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
