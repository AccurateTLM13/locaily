const dag = require("../companion/core/dag-graph");
const { validateDag, executeDag, createDagContext } = require("../companion/core/dag-executor");

async function main() {
const track = {
  steps: [
    { id: "extract_metrics", input_map: { audits: "$input.audits" }, executor: { type: "tool" } },
    { id: "classify_issues", input_map: { audits: "$artifacts.extract_metrics.audits" }, executor: { type: "tool" } },
    { id: "prioritize_fixes", input_map: { issues: "$artifacts.classify_issues.issues" }, executor: { type: "model" } },
    { id: "validate_priority_fixes", input_map: { fixes: "$artifacts.prioritize_fixes.fixes" }, executor: { type: "tool" } },
    { id: "write_developer_tasks", input_map: { validated: "$artifacts.validate_priority_fixes" }, executor: { type: "model" } },
    { id: "write_guardrails", input_map: { tasks: "$artifacts.write_developer_tasks" }, executor: { type: "model" } },
    { id: "write_testing_checklist", input_map: { tasks: "$artifacts.write_developer_tasks" }, executor: { type: "model" } },
    { id: "write_handoff", input_map: { fixes: "$artifacts.validate_priority_fixes", tasks: "$artifacts.write_developer_tasks", guardrails: "$artifacts.write_guardrails", checklist: "$artifacts.write_testing_checklist" }, executor: { type: "tool" } },
    { id: "verify_output", input_map: { handoff: "$artifacts.write_handoff" }, executor: { type: "tool" } }
  ]
};

let passed = 0, failed = 0;

// Test 1: Dependency graph computation
const graph = dag.computeDependencyGraph(track);
if (graph.valid) { console.log("PASS: Graph is valid"); passed++; }
else { console.log("FAIL: Graph should be valid"); failed++; }

if (graph.sorted.length === 9) { console.log("PASS: 9 steps in sorted order"); passed++; }
else { console.log("FAIL: Expected 9 sorted steps, got", graph.sorted.length); failed++; }

if (graph.cycles.length === 0) { console.log("PASS: No cycles detected"); passed++; }
else { console.log("FAIL: Cycles detected:", graph.cycles); failed++; }

if (graph.entryPoints.includes("extract_metrics")) { console.log("PASS: extract_metrics is entry point"); passed++; }
else { console.log("FAIL: extract_metrics should be entry point, got:", graph.entryPoints); failed++; }

// Test 2: Topological sort respects dependencies
const idx = (id) => graph.sorted.indexOf(id);
if (idx("classify_issues") > idx("extract_metrics")) { console.log("PASS: classify_issues after extract_metrics"); passed++; }
else { console.log("FAIL: ordering"); failed++; }
if (idx("write_guardrails") > idx("write_developer_tasks")) { console.log("PASS: write_guardrails after write_developer_tasks"); passed++; }
else { console.log("FAIL: ordering"); failed++; }
if (idx("write_handoff") > idx("write_developer_tasks")) { console.log("PASS: write_handoff after write_developer_tasks"); passed++; }
else { console.log("FAIL: ordering"); failed++; }

// Test 3: Level computation
const levels = dag.groupByLevel(graph.stepIds, graph.edges);
const levelCount = Object.keys(levels).length;
if (levelCount > 1) { console.log("PASS: Multiple levels (DAG parallelism):", levelCount, "levels"); passed++; }
else { console.log("FAIL: Expected multiple levels for DAG, got", levelCount); failed++; }

console.log("Level groups:", JSON.stringify(levels));

// Test 4: Cycle detection
const cyclicTrack = {
  steps: [
    { id: "a", input_map: { x: "$artifacts.b" }, executor: { type: "tool" } },
    { id: "b", input_map: { x: "$artifacts.c" }, executor: { type: "tool" } },
    { id: "c", input_map: { x: "$artifacts.a" }, executor: { type: "tool" } }
  ]
};
const cycleGraph = dag.computeDependencyGraph(cyclicTrack);
if (cycleGraph.cycles.length > 0) { console.log("PASS: Cycle detected in cyclic track"); passed++; }
else { console.log("FAIL: Should detect cycle"); failed++; }

// Test 5: Missing step detection
const missingTrack = {
  steps: [
    { id: "a", input_map: { x: "$artifacts.nonexistent" }, executor: { type: "tool" } }
  ]
};
const missingGraph = dag.computeDependencyGraph(missingTrack);
if (missingGraph.missing.length > 0) { console.log("PASS: Missing step detected"); passed++; }
else { console.log("FAIL: Should detect missing step"); failed++; }

// Test 6: DAG validation
const validation = validateDag(track);
if (validation.valid) { console.log("PASS: DAG validation passes"); passed++; }
else { console.log("FAIL: DAG validation should pass"); failed++; }

const invalidValidation = validateDag(cyclicTrack);
if (!invalidValidation.valid) { console.log("PASS: DAG validation catches cycles"); passed++; }
else { console.log("FAIL: DAG validation should catch cycles"); failed++; }

// Test 7: DAG executor with mock
const executor = async (step, ctx) => {
  return { ok: true, output: { result: step.id + "_done" } };
};
const dagResult = await executeDag({ track, context: createDagContext({}), stepExecutor: executor, options: { abortOnError: true } });
if (dagResult.ok) { console.log("PASS: DAG execution succeeded"); passed++; }
else { console.log("FAIL: DAG execution should succeed"); failed++; }
if (dagResult.completed === 9) { console.log("PASS: All 9 steps completed"); passed++; }
else { console.log("FAIL: Expected 9 completed, got", dagResult.completed); failed++; }

console.log(`\n${passed}/${passed + failed} tests passed`);
process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
