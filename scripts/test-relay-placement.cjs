const assert = require("node:assert");
const { createPlacementPlanner, PLACEMENT_POLICIES } = require("../companion/relay/placement");
const { createRelayRegistry } = require("../companion/relay/registry");
const { createRelayRouter, ROUTING_POLICY } = require("../companion/relay/router");

let passed = 0;
let failed = 0;

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

const asyncChecks = [];

function checkAsync(name, fn) {
  const promise = (async () => {
    try {
      await fn();
      passed += 1;
      console.log(`PASS: ${name}`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL: ${name}`);
      console.error(`  ${error.message}`);
    }
  })();
  asyncChecks.push(promise);
  return promise;
}

function makeRegistry(nodes) {
  const registry = createRelayRegistry();
  for (const node of nodes) {
    registry.register(node);
    registry.heartbeat(node.nodeId);
  }
  return registry;
}

const STEPS = [
  { stepId: "extract_metrics", executorType: "tool" },
  { stepId: "prioritize_fixes", role: "priority_helper", executorType: "model" },
  { stepId: "write_developer_tasks", role: "developer_task_writer", executorType: "model" },
  { stepId: "write_guardrails", role: "guardrail_writer", executorType: "model" },
  { stepId: "write_testing_checklist", role: "testing_checklist_writer", executorType: "model" }
];

function main() {
  // Two relay nodes with complementary roles.
  const registry = makeRegistry([
    { nodeId: "relay-b", baseUrl: "http://127.0.0.1:31314", capabilities: ["role:priority_helper", "default_worker"] },
    { nodeId: "relay-c", baseUrl: "http://127.0.0.1:31315", capabilities: ["role:developer_task_writer", "role:guardrail_writer", "role:testing_checklist_writer"] }
  ]);

  const planner = createPlacementPlanner({ registry });

  // distribute: model steps route to capable nodes, tool steps stay local.
  const distributed = planner.plan({ steps: STEPS, policy: "distribute", localCapableRoles: null });
  check("distribute assigns priority_helper to relay-b", distributed.assignments.prioritize_fixes.target === "relay" && distributed.assignments.prioritize_fixes.nodeId === "relay-b");
  check("distribute assigns developer_task_writer to relay-c", distributed.assignments.write_developer_tasks.target === "relay" && distributed.assignments.write_developer_tasks.nodeId === "relay-c");
  check("distribute assigns guardrail_writer to relay-c", distributed.assignments.write_guardrails.target === "relay" && distributed.assignments.write_guardrails.nodeId === "relay-c");
  check("distribute assigns testing_checklist_writer to relay-c", distributed.assignments.write_testing_checklist.target === "relay" && distributed.assignments.write_testing_checklist.nodeId === "relay-c");
  check("distribute keeps tool step local", distributed.assignments.extract_metrics.target === "local" && distributed.assignments.extract_metrics.nodeId === null);
  check("distribute summary reports relayed steps", distributed.summary.counts.relay === 4 && distributed.summary.counts.local === 1, JSON.stringify(distributed.summary.counts));
  check("distribute summary splits by node", distributed.summary.byNode["relay-b"] === 1 && distributed.summary.byNode["relay-c"] === 3, JSON.stringify(distributed.summary.byNode));

  // local_first with local capable: all model steps local.
  const localFirst = planner.plan({ steps: STEPS, policy: "local_first", localCapableRoles: null });
  check("local_first keeps all steps local when local capable", Object.values(localFirst.assignments).every((a) => a.target === "local"), JSON.stringify(localFirst.assignments));

  // local_first with local NOT capable: routes to nodes.
  const localFirstRemote = planner.plan({ steps: STEPS, policy: "local_first", localCapableRoles: [] });
  check("local_first routes when local not capable", localFirstRemote.assignments.prioritize_fixes.target === "relay", JSON.stringify(localFirstRemote.assignments.prioritize_fixes));

  // local_only forces everything local.
  const localOnly = planner.plan({ steps: STEPS, policy: "local_only", localCapableRoles: null });
  check("local_only forces all steps local", Object.values(localOnly.assignments).every((a) => a.target === "local"), JSON.stringify(localOnly.assignments));

  // Unmatched role falls back to local.
  const registryNoMatch = makeRegistry([
    { nodeId: "relay-x", baseUrl: "http://127.0.0.1:31316", capabilities: ["role:seo_writer"] }
  ]);
  const plannerX = createPlacementPlanner({ registry: registryNoMatch });
  const noMatch = plannerX.plan({ steps: STEPS, policy: "distribute", localCapableRoles: null });
  check("unmatched role falls back to local", noMatch.assignments.write_developer_tasks.target === "local", JSON.stringify(noMatch.assignments.write_developer_tasks));

  // Unhealthy node is not selected.
  registry.markUnhealthy("relay-c");
  const afterFail = planner.plan({ steps: STEPS, policy: "distribute", localCapableRoles: null });
  check("unhealthy node not selected (guardrail_writer falls back local)", afterFail.assignments.write_guardrails.target === "local", JSON.stringify(afterFail.assignments.write_guardrails));

  // Summarize handles empty plan.
  check("summarize null-safe", planner.summarize(null) === null);

  // Dedupe: a node advertising both `role` and `role:role` must not be double-counted,
  // and two distinct capable nodes should split load (least-loaded).
  const balanced = makeRegistry([
    { nodeId: "relay-x", baseUrl: "http://127.0.0.1:31316", capabilities: ["priority_helper"] },
    { nodeId: "relay-y", baseUrl: "http://127.0.0.1:31317", capabilities: ["role:priority_helper"] }
  ]);
  const plannerB = createPlacementPlanner({ registry: balanced });
  const balancedSteps = [
    { stepId: "a", role: "priority_helper", executorType: "model" },
    { stepId: "b", role: "priority_helper", executorType: "model" },
    { stepId: "c", role: "priority_helper", executorType: "model" }
  ];
  const balancedPlan = plannerB.plan({ steps: balancedSteps, policy: "distribute", localCapableRoles: null });
  check("distribute splits load across two distinct nodes", balancedPlan.summary.byNode["relay-x"] === 2 && balancedPlan.summary.byNode["relay-y"] === 1, JSON.stringify(balancedPlan.summary.byNode));

  checkAsync("placement router returns plannedTarget and plannedNodeId in meta on relay success", async () => {
    const reg = createRelayRegistry();
    reg.register({ nodeId: "relay-p1", baseUrl: "http://127.0.0.1:31320", capabilities: ["role:priority_helper"] });
    reg.heartbeat("relay-p1");
    const connector = {
      async executeRemoteStep({ node }) {
        return { ok: true, output: { routed: true }, meta: { role: "priority_helper", model: "mock" } };
      }
    };
    const router = createRelayRouter({ registry: reg, connector });
    const result = await router.executeStepWithAssignedNode({
      step: { id: "s1", executor: { type: "model", role: "priority_helper" } },
      context: {},
      options: { relay: { enabled: true } },
      assignedNodeId: "relay-p1",
      assignmentTarget: "relay",
      localExecute: async () => ({ output: { local: true }, meta: {} })
    });
    assert.strictEqual(result.meta.plannedTarget, "relay");
    assert.strictEqual(result.meta.plannedNodeId, "relay-p1");
    assert.strictEqual(result.meta.relay, true);
  });

  checkAsync("placement router returns planned info in fallback meta", async () => {
    const reg = createRelayRegistry();
    reg.register({ nodeId: "relay-p2", baseUrl: "http://127.0.0.1:31321", capabilities: ["role:priority_helper"] });
    reg.heartbeat("relay-p2");
    reg.markUnhealthy("relay-p2");
    const connector = {
      async executeRemoteStep() { return { ok: true, output: {}, meta: {} }; }
    };
    const router = createRelayRouter({ registry: reg, connector });
    const result = await router.executeStepWithAssignedNode({
      step: { id: "s1", executor: { type: "model", role: "priority_helper" } },
      context: {},
      options: { relay: { enabled: true } },
      assignedNodeId: "relay-p2",
      assignmentTarget: "relay",
      localExecute: async () => ({ output: { local: true }, meta: { role: "priority_helper" } })
    });
    assert.strictEqual(result.meta.plannedTarget, "relay");
    assert.strictEqual(result.meta.plannedNodeId, "relay-p2");
    assert.strictEqual(result.meta.fallback, true);
  });

  checkAsync("placement router returns plannedTarget: local when no relay assigned", async () => {
    const reg = createRelayRegistry();
    reg.register({ nodeId: "relay-p3", baseUrl: "http://127.0.0.1:31322", capabilities: ["role:seo_writer"] });
    reg.heartbeat("relay-p3");
    const connector = {
      async executeRemoteStep() { return { ok: true, output: {}, meta: {} }; }
    };
    const router = createRelayRouter({ registry: reg, connector });
    const result = await router.executeStepWithFallback({
      step: { id: "s1", executor: { type: "model", role: "nonexistent_role" } },
      context: {},
      options: { relay: { enabled: true, policy: ROUTING_POLICY.PREFER_RELAY } },
      localExecute: async () => ({ output: { local: true }, meta: { role: "nonexistent_role" } })
    });
    assert.strictEqual(result.meta.plannedTarget, "local");
    assert.strictEqual(result.meta.plannedNodeId, null);
  });

  checkAsync("placement router returns actualTarget and actualNodeId in meta on relay success", async () => {
    const reg = createRelayRegistry();
    reg.register({ nodeId: "relay-a1", baseUrl: "http://127.0.0.1:31323", capabilities: ["role:priority_helper"] });
    reg.heartbeat("relay-a1");
    const connector = {
      async executeRemoteStep({ node }) {
        return { ok: true, output: { routed: true }, meta: { role: "priority_helper", model: "mock" } };
      }
    };
    const router = createRelayRouter({ registry: reg, connector });
    const result = await router.executeStepWithAssignedNode({
      step: { id: "s1", executor: { type: "model", role: "priority_helper" } },
      context: {},
      options: { relay: { enabled: true } },
      assignedNodeId: "relay-a1",
      assignmentTarget: "relay",
      localExecute: async () => ({ output: { local: true }, meta: {} })
    });
    assert.strictEqual(result.meta.actualTarget, "relay");
    assert.strictEqual(typeof result.meta.actualNodeId, "string");
    assert.strictEqual(result.meta.actualNodeId, "relay-a1");
  });

  checkAsync("placement router returns actualTarget: local with actualNodeId: null on local-only execution", async () => {
    const reg = createRelayRegistry();
    const connector = {
      async executeRemoteStep() { return { ok: true, output: {}, meta: {} }; }
    };
    const router = createRelayRouter({ registry: reg, connector });
    const result = await router.executeStepWithFallback({
      step: { id: "s1", executor: { type: "model", role: "any_role" } },
      context: {},
      options: { relay: { enabled: false } },
      localExecute: async () => ({ output: { local: true }, meta: { role: "any_role" } })
    });
    assert.strictEqual(result.meta.actualTarget, "local");
    assert.strictEqual(result.meta.actualNodeId, null);
  });
}

main();

Promise.all(asyncChecks).then(() => {
  console.log(`\n${passed}/${passed + failed} relay placement tests passed`);
  process.exit(failed === 0 ? 0 : 1);
}).catch(() => {
  process.exit(1);
});
