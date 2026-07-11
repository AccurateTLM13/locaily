const assert = require("node:assert");
const { createPlacementPlanner, PLACEMENT_POLICIES } = require("../companion/relay/placement");
const { createRelayRegistry } = require("../companion/relay/registry");

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

  console.log(`\n${passed}/${passed + failed} relay placement tests passed`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
