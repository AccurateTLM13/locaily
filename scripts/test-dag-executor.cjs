const { executeDag, validateDag, createDagContext } = require("../companion/core/dag-executor");
const dagGraph = require("../companion/core/dag-graph");

async function main() {
  let passed = 0, failed = 0;

  // Test 1: Simple linear track
  const linearTrack = {
    steps: [
      { id: "step_a", input_map: { x: "$input.x" }, executor: { type: "tool" } },
      { id: "step_b", input_map: { a: "$artifacts.step_a" }, executor: { type: "tool" } },
      { id: "step_c", input_map: { b: "$artifacts.step_b" }, executor: { type: "tool" } }
    ]
  };

  let execOrder = [];
  const exec1 = async (step, ctx) => {
    execOrder.push(step.id);
    return { ok: true, output: { result: step.id + "_done", meta: { durationMs: 5 } } };
  };

  const r1 = await executeDag({ track: linearTrack, context: createDagContext({ x: 1 }), stepExecutor: exec1 });
  if (r1.ok && r1.completed === 3) { console.log("PASS: Linear DAG: 3 steps completed"); passed++; }
  else { console.log("FAIL: Linear DAG"); failed++; }
  if (JSON.stringify(execOrder) === JSON.stringify(["step_a","step_b","step_c"])) { console.log("PASS: Linear DAG: correct order"); passed++; }
  else { console.log("FAIL: Linear DAG order:", execOrder); failed++; }

  // Test 2: DAG with parallel steps
  const parallelTrack = {
    steps: [
      { id: "root", input_map: { x: "$input.x" }, executor: { type: "tool" } },
      { id: "branch_a", input_map: { r: "$artifacts.root" }, executor: { type: "tool" } },
      { id: "branch_b", input_map: { r: "$artifacts.root" }, executor: { type: "tool" } },
      { id: "merge", input_map: { a: "$artifacts.branch_a", b: "$artifacts.branch_b" }, executor: { type: "tool" } }
    ]
  };

  execOrder = [];
  const exec2 = async (step, ctx) => {
    execOrder.push(step.id);
    return { ok: true, output: { result: step.id + "_done", meta: { durationMs: 5 } } };
  };

  const r2 = await executeDag({ track: parallelTrack, context: createDagContext({ x: 1 }), stepExecutor: exec2 });
  if (r2.ok && r2.completed === 4) { console.log("PASS: Parallel DAG: 4 steps completed"); passed++; }
  else { console.log("FAIL: Parallel DAG"); failed++; }

  const rootIdx = execOrder.indexOf("root");
  const baIdx = execOrder.indexOf("branch_a");
  const bbIdx = execOrder.indexOf("branch_b");
  const mergeIdx = execOrder.indexOf("merge");
  if (rootIdx < baIdx && rootIdx < bbIdx && baIdx < mergeIdx && bbIdx < mergeIdx) {
    console.log("PASS: Parallel DAG: dependency order respected"); passed++;
  } else {
    console.log("FAIL: Parallel DAG: order violation. Order:", execOrder); failed++;
  }

  // Test 3: DealSniper-like track
  const dealsniperTrack = {
    steps: [
      { id: "prepare_listing", input_map: { title: "$input.title", price: "$input.price" }, executor: { type: "tool", tool: "deal-sniper", task: "prepare-listing" } },
      { id: "analyze_listing", input_map: "$artifacts.prepare_listing", executor: { type: "tool", tool: "deal-sniper", task: "analyze-listing" } },
      { id: "validate_analysis", input_map: { analysis: ["$artifacts.analyze_listing", {}] }, executor: { type: "tool", tool: "deal-sniper", task: "validate-analysis" } }
    ]
  };

  execOrder = [];
  const exec3 = async (step, ctx) => {
    execOrder.push(step.id);
    return { ok: true, output: { result: step.id + "_done", meta: { tool: step.executor.tool, task: step.executor.task, durationMs: 5 } } };
  };

  const r3 = await executeDag({ track: dealsniperTrack, context: createDagContext({ title: "Test", price: "$100" }), stepExecutor: exec3 });
  if (r3.ok && r3.completed === 3) { console.log("PASS: DealSniper DAG: 3 steps completed"); passed++; }
  else { console.log("FAIL: DealSniper DAG:", r3.ok, r3.completed, r3.errors); failed++; }
  if (JSON.stringify(execOrder) === JSON.stringify(["prepare_listing","analyze_listing","validate_analysis"])) {
    console.log("PASS: DealSniper DAG: correct order"); passed++;
  } else {
    console.log("FAIL: DealSniper DAG order:", execOrder); failed++;
  }

  // Test 4: Lighthouse-like track with parallel branches
  const lighthouseTrack = {
    steps: [
      { id: "extract_metrics", input_map: { audits: "$input.audits" }, executor: { type: "tool" } },
      { id: "classify_issues", input_map: { audits: "$artifacts.extract_metrics" }, executor: { type: "tool" } },
      { id: "prioritize_fixes", input_map: { issues: "$artifacts.classify_issues" }, executor: { type: "model" } },
      { id: "validate_priority_fixes", input_map: { fixes: "$artifacts.prioritize_fixes" }, executor: { type: "tool" } },
      { id: "write_developer_tasks", input_map: { validated: "$artifacts.validate_priority_fixes" }, executor: { type: "model" } },
      { id: "write_guardrails", input_map: { tasks: "$artifacts.write_developer_tasks" }, executor: { type: "model" } },
      { id: "write_testing_checklist", input_map: { tasks: "$artifacts.write_developer_tasks" }, executor: { type: "model" } },
      { id: "write_handoff", input_map: { fixes: "$artifacts.validate_priority_fixes", tasks: "$artifacts.write_developer_tasks", guardrails: "$artifacts.write_guardrails", checklist: "$artifacts.write_testing_checklist" }, executor: { type: "tool" } },
      { id: "verify_output", input_map: { handoff: "$artifacts.write_handoff" }, executor: { type: "tool" } }
    ]
  };

  execOrder = [];
  const exec4 = async (step, ctx) => {
    execOrder.push(step.id);
    return { ok: true, output: { result: step.id + "_done", meta: { durationMs: 10 } } };
  };

  const r4 = await executeDag({ track: lighthouseTrack, context: createDagContext({ audits: {} }), stepExecutor: exec4, options: { maxConcurrency: 4 } });
  if (r4.ok && r4.completed === 9) { console.log("PASS: Lighthouse DAG: 9 steps completed"); passed++; }
  else { console.log("FAIL: Lighthouse DAG:", r4.ok, r4.completed, r4.errors); failed++; }

  // Check parallel execution ordering
  const extractIdx = execOrder.indexOf("extract_metrics");
  const devTasksIdx = execOrder.indexOf("write_developer_tasks");
  const guardrailsIdx = execOrder.indexOf("write_guardrails");
  const checklistIdx = execOrder.indexOf("write_testing_checklist");
  const handoffIdx = execOrder.indexOf("write_handoff");

  if (devTasksIdx < guardrailsIdx && devTasksIdx < checklistIdx) { console.log("PASS: Lighthouse DAG: dev tasks before guardrails and checklist"); passed++; }
  else { console.log("FAIL: Lighthouse DAG: ordering issue"); failed++; }

  // Test 5: Error handling - fail a step
  let failCount = 0;
  const exec5 = async (step, ctx) => {
    if (step.id === "prioritize_fixes") {
      failCount++;
      return { ok: false, error: { code: "STEP_FAILED", message: "Intentional failure" } };
    }
    return { ok: true, output: { result: step.id + "_done", meta: { durationMs: 5 } } };
  };

  const r5 = await executeDag({ track: lighthouseTrack, context: createDagContext({ audits: {} }), stepExecutor: exec5, options: { abortOnError: true } });
  if (!r5.ok && r5.failed > 0) { console.log("PASS: Error handling: DAG fails on step error"); passed++; }
  else { console.log("FAIL: Error handling"); failed++; }

  console.log(`\n${passed}/${passed + failed} tests passed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
