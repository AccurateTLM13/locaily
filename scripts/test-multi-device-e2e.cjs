const assert = require("node:assert");
const { spawn } = require("node:child_process");

const PORT_A = 41313;
const PORT_B = 41314;
const PORT_C = 41315;
const BASE_A = `http://127.0.0.1:${PORT_A}`;
const BASE_B = `http://127.0.0.1:${PORT_B}`;
const BASE_C = `http://127.0.0.1:${PORT_C}`;

const LIGHTHOUSE_INPUT = {
  url: "https://example.com",
  scores: { performance: 72, accessibility: 96, bestPractices: 100, seo: 92 },
  opportunities: [{ title: "Reduce render-blocking resources" }],
  diagnostics: []
};

const B_CAPABILITIES = ["default_worker", "priority_helper", "role:priority_helper"];
const C_CAPABILITIES = [
  "default_worker",
  "developer_task_writer",
  "guardrail_writer",
  "testing_checklist_writer",
  "role:developer_task_writer",
  "role:guardrail_writer",
  "role:testing_checklist_writer"
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

function stepMeta(body) {
  return (body && body.meta && body.meta.steps) || [];
}

function relayedTo(steps, nodeId) {
  return steps.filter((s) => s.worker_used && s.worker_used.routed_via === "relay" && s.worker_used.node_id === nodeId);
}

function stopAllChildren() {
  return Promise.all(children.map((child) => new Promise((resolve) => {
    if (!child || child.exitCode !== null) {
      resolve();
      return;
    }

    const timer = setTimeout(resolve, 5000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });

    try {
      child.kill("SIGTERM");
      setTimeout(() => {
        try {
          if (child.exitCode === null) {
            child.kill("SIGKILL");
          }
        } catch (_error) {
          // ignore
        }
      }, 1000);
    } catch (_error) {
      clearTimeout(timer);
      resolve();
    }
  })));
}

async function main() {
  console.log("Starting relay node B (priority_helper)...");
  startServer(PORT_B);
  console.log("Starting relay node C (developer/guardrail/testing writers)...");
  startServer(PORT_C);
  console.log("Starting orchestrator A...");
  startServer(PORT_A);

  await waitForHealth(BASE_A);
  await waitForHealth(BASE_B);
  await waitForHealth(BASE_C);
  console.log("All three servers healthy.");

  await setMockProvider(BASE_A);
  await setMockProvider(BASE_B);
  await setMockProvider(BASE_C);

  // Discovery: register B and C with A.
  const regB = await api(BASE_A, "/relay/register", "POST", {
    nodeId: "relay-b",
    baseUrl: BASE_B,
    label: "Machine B",
    capabilities: B_CAPABILITIES
  });
  check("relay node B registration succeeds", regB.status === 200 && regB.body.ok === true, JSON.stringify(regB.body));

  const regC = await api(BASE_A, "/relay/register", "POST", {
    nodeId: "relay-c",
    baseUrl: BASE_C,
    label: "Machine C",
    capabilities: C_CAPABILITIES
  });
  check("relay node C registration succeeds", regC.status === 200 && regC.body.ok === true, JSON.stringify(regC.body));

  const nodes = await api(BASE_A, "/relay/nodes");
  check("GET /relay/nodes shows 2 healthy nodes", nodes.body.stats.healthy === 2, JSON.stringify(nodes.body.stats));

  // Placement preview endpoint.
  const preview = await api(BASE_A, "/relay/plan", "POST", {
    track_id: "website_audit.lighthouse_handoff",
    relay_policy: "distribute"
  });
  check("placement preview returns ok", preview.status === 200 && preview.body.ok === true, JSON.stringify(preview.body).slice(0, 300));
  check("preview splits priority_helper to relay-b", preview.body.assignments.prioritize_fixes.nodeId === "relay-b", JSON.stringify(preview.body.assignments.prioritize_fixes));
  check("preview splits developer_task_writer to relay-c", preview.body.assignments.write_developer_tasks.nodeId === "relay-c", JSON.stringify(preview.body.assignments.write_developer_tasks));
  check("preview keeps tool steps local", preview.body.assignments.extract_metrics.target === "local", JSON.stringify(preview.body.assignments.extract_metrics));

  // End-to-end: Lighthouse Handoff on A, distributed across B and C.
  const run1 = await api(BASE_A, "/workflows/run", "POST", {
    workflow_id: "lighthouse_handoff",
    input: LIGHTHOUSE_INPUT,
    options: { execution_mode: "workflow_orchestrated", useDag: true, relay_policy: "distribute" }
  });

  check("workflow run returns 200", run1.status === 200, JSON.stringify(run1.body).slice(0, 300));
  check("workflow plan completed", run1.body && run1.body.result && run1.body.result.plan && run1.body.result.plan.status === "completed", JSON.stringify(run1.body && run1.body.result && run1.body.result.plan && run1.body.result.plan.status));
  check("workflow result schema valid", run1.body && run1.body.result && run1.body.result.plan && run1.body.result.plan.status === "completed" && run1.body.relay_placement, "missing relay_placement");

  const placement = run1.body.relay_placement;
  check("relay_placement has planned and actual", placement && placement.planned && Array.isArray(placement.actual), JSON.stringify(placement));
  check("relay_placement planned routed 4 model steps", placement.planned.counts.relay === 4, JSON.stringify(placement.planned.counts));
  check("relay_placement planned kept tool steps local", placement.planned.counts.local >= 1, JSON.stringify(placement.planned.counts));
  check("relay_placement planned uses both devices", placement.planned.byNode["relay-b"] >= 1 && placement.planned.byNode["relay-c"] >= 1, JSON.stringify(placement.planned.byNode));
  check("relay_placement actual entries have expected shape", placement.actual.every((e) => typeof e.stepId === "string" && typeof e.target === "string" && "nodeId" in e && typeof e.matched === "boolean"), JSON.stringify(placement.actual));
  check("relay_placement actual has relay entries with valid nodeId", placement.actual.some((e) => e.target === "relay" && typeof e.nodeId === "string" && e.nodeId.length > 0), JSON.stringify(placement.actual));
  check("relay_placement actual has local tool entries", placement.actual.filter((e) => e.target === "local").length >= 1, JSON.stringify(placement.actual));

  const steps1 = stepMeta(run1.body);
  check("workflow produced step metadata", steps1.length > 0, `steps=${steps1.length}`);
  check("at least one model step executed on relay node B", relayedTo(steps1, "relay-b").length > 0, JSON.stringify(relayedTo(steps1, "relay-b")));
  check("at least one model step executed on relay node C", relayedTo(steps1, "relay-c").length > 0, JSON.stringify(relayedTo(steps1, "relay-c")));
  check("tool steps stayed local", steps1.filter((s) => s.worker_used && s.worker_used.type === "tool").every((s) => s.worker_used.routed_via === "local"), JSON.stringify(steps1.filter((s) => s.worker_used && s.worker_used.type === "tool")));

  // Failure + local fallback: kill C, expect its steps to fall back locally with audit trail.
  console.log("Killing relay node C to test multi-device fallback...");
  children[1].kill("SIGKILL");

  const run2 = await api(BASE_A, "/workflows/run", "POST", {
    workflow_id: "lighthouse_handoff",
    input: LIGHTHOUSE_INPUT,
    options: { execution_mode: "workflow_orchestrated", useDag: true, relay_policy: "distribute" }
  });

  check("workflow still completes after relay node C dies", run2.status === 200 && run2.body && run2.body.result && run2.body.result.plan && run2.body.result.plan.status === "completed", JSON.stringify(run2.body && run2.body.result && run2.body.result.plan && run2.body.result.plan.status));

  const steps2 = stepMeta(run2.body);
  check("no step routed to dead relay node C", relayedTo(steps2, "relay-c").length === 0, `relayedToC=${relayedTo(steps2, "relay-c").length}`);
  check("priority_helper still routed to alive relay node B", relayedTo(steps2, "relay-b").length > 0, `relayedToB=${relayedTo(steps2, "relay-b").length}`);

  const placement2 = run2.body.relay_placement;
  check("run2 relay_placement actual shows unmatched entries after fallback", placement2 && Array.isArray(placement2.actual) && placement2.actual.some((e) => e.matched === false), JSON.stringify(placement2 && placement2.actual));

  const audit = await api(BASE_A, "/audit?tool=relay-router");
  const fallbackEvents = (audit.body && audit.body.events) || [];
  check("relay fallback audit event recorded for node C", fallbackEvents.some((e) => e.error_code === "RELAY_FALLBACK"), `fallbackEvents=${fallbackEvents.length}`);

  console.log(`\n${passed}/${passed + failed} multi-device e2e tests passed`);
  return failed === 0 ? 0 : 1;
}

main()
  .catch((error) => {
    console.error("Multi-device e2e harness error:", error);
    return 1;
  })
  .finally(async () => {
    await stopAllChildren();
  })
  .then((code) => {
    process.exit(code ?? 1);
  });
