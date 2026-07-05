const { mkdir, rm, readdir, readFile } = require("node:fs/promises");
const { join } = require("node:path");
const { randomUUID } = require("node:crypto");
const { createMockRuntime } = require("../companion/providers/router");
const { createToolRegistry } = require("../companion/tools/registry");
const { runTrack } = require("../companion/crew/orchestrator");
const { executeRunPlan, buildRunPlan } = require("../companion/orchestration");
const { loadTrack } = require("../companion/crew/decomposer");
const {
  storeRecord,
  loadRecord,
  loadRecordsByParent,
  loadRecordsByWorkflow,
  listAllRecords
} = require("../companion/evidence/track-run-record-store");
const { validateSchema } = require("../benchmark-lab/engine/schema-validator");
const { readJson } = require("../benchmark-lab/engine/fs-utils");
const {
  recordDirectTrackRun,
  recordWorkflowRun,
  recordFailedExecution,
  buildInputSummary,
  buildOutputSummary
} = require("../companion/crew/runtime-track-run-recorder");

const ROOT = join(__dirname, "..");
const SCHEMA_PATH = "companion/evidence/schemas/track-run-record.schema.json";
const STORE_PATH = join(ROOT, "data", "evidence", "track-run-records");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || "Assertion failed");
  }
}

function assertOk(result, label) {
  if (result && result.ok === false) {
    throw new Error(`${label}: expected ok, got: ${JSON.stringify(result.error || result)}`);
  }
}

const MOCK_LIGHTHOUSE_INPUT = {
  url: "https://example.com",
  scores: { performance: 72, accessibility: 96, bestPractices: 100, seo: 92 },
  opportunities: [{ title: "Reduce render-blocking resources", impact: "high" }],
  diagnostics: []
};

const MOCK_DEALSNIPER_INPUT = {
  title: "Used MacBook Pro 2021",
  price: 1200,
  description: "M1 Pro, 16GB RAM, 512GB SSD",
  location: "Portland, OR",
  sellerInfo: { rating: 4.8 },
  source: "craigslist"
};

async function cleanStore() {
  try {
    await rm(STORE_PATH, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

async function loadSchema() {
  return readJson(join(ROOT, SCHEMA_PATH));
}

async function validateRecord(record) {
  const schema = await loadSchema();
  const result = validateSchema(record, schema, record.recordId);
  if (!result.ok) {
    throw new Error(`Schema validation failed for ${record.recordId}: ${result.errors.join("; ")}`);
  }
  return result;
}

function getTestRuntime() {
  return createMockRuntime({ provider: "mock", baseUrl: "http://localhost:11434", model: "mock-local-model" });
}

function getTestToolRegistry() {
  return createToolRegistry({ enabledTools: [] });
}

// ---- Test: record store ----

async function testStoreSaveAndLoad() {
  await cleanStore();
  const record = {
    schemaVersion: "locaily.track_run_record.v1",
    recordId: `test-${randomUUID()}`,
    trackId: "test.track",
    timestamps: { createdAt: new Date().toISOString() },
    routing: { executorType: "tool", capabilityId: "test-tool" },
    execution: { status: "success", durationMs: 10, retryCount: 0, fallbackUsed: false },
    childRuns: []
  };

  const { filePath } = await storeRecord(record);
  assert(typeof filePath === "string", "Expected filePath from storeRecord");

  const loaded = await loadRecord(record.recordId);
  assert(loaded !== null, "Expected loaded record");
  assert(loaded.recordId === record.recordId, "Expected matching recordId");
  assert(loaded.execution.status === "success", "Expected success status");

  const loadedNotFound = await loadRecord("nonexistent-id-" + randomUUID());
  assert(loadedNotFound === null, "Expected null for nonexistent record");
}

async function testStoreNoOverwrite() {
  await cleanStore();
  const recordId = `test-nooverwrite-${randomUUID()}`;
  const record = {
    schemaVersion: "locaily.track_run_record.v1",
    recordId,
    trackId: "test.track",
    timestamps: { createdAt: new Date().toISOString() },
    routing: { executorType: "tool", capabilityId: "test-tool" },
    execution: { status: "success", durationMs: 10, retryCount: 0, fallbackUsed: false },
    childRuns: []
  };

  await storeRecord(record);

  try {
    await storeRecord(record);
    assert(false, "Expected RECORD_ALREADY_EXISTS error");
  } catch (error) {
    assert(error.code === "RECORD_ALREADY_EXISTS", `Expected RECORD_ALREADY_EXISTS, got ${error.code}`);
  }
}

async function testStoreSchemaValidation() {
  await cleanStore();
  const invalidRecord = {
    recordId: `test-invalid-${randomUUID()}`,
    trackId: "test.track"
  };

  try {
    await storeRecord(invalidRecord);
    assert(false, "Expected RECORD_SCHEMA_INVALID error");
  } catch (error) {
    assert(error.code === "RECORD_SCHEMA_INVALID", `Expected RECORD_SCHEMA_INVALID, got ${error.code}`);
  }
}

async function testRecordsByParent() {
  await cleanStore();
  const parentId = `parent-${randomUUID()}`;
  const childId = `child-${randomUUID()}`;

  const parent = {
    schemaVersion: "locaily.track_run_record.v1",
    recordId: parentId,
    trackId: "test.track",
    timestamps: { createdAt: new Date().toISOString() },
    routing: { executorType: "hybrid", capabilityId: "test" },
    execution: { status: "success", durationMs: 10, retryCount: 0, fallbackUsed: false },
    childRuns: []
  };

  const child = {
    schemaVersion: "locaily.track_run_record.v1",
    recordId: childId,
    trackId: "test.track",
    parentRunId: parentId,
    timestamps: { createdAt: new Date().toISOString() },
    routing: { executorType: "tool", capabilityId: "test-tool" },
    execution: { status: "success", durationMs: 5, retryCount: 0, fallbackUsed: false },
    childRuns: []
  };

  await storeRecord(parent);
  await storeRecord(child);

  const children = await loadRecordsByParent(parentId);
  assert(children.length === 1, `Expected 1 child, got ${children.length}`);
  assert(children[0].recordId === childId, "Expected child recordId match");
}

async function testRecordsByWorkflow() {
  await cleanStore();
  const wfId = `wf-${randomUUID()}`;

  const r1 = {
    schemaVersion: "locaily.track_run_record.v1",
    recordId: `wf-r1-${randomUUID()}`,
    trackId: "test.track",
    workflowId: wfId,
    timestamps: { createdAt: new Date().toISOString() },
    routing: { executorType: "tool", capabilityId: "test-tool" },
    execution: { status: "success", durationMs: 10, retryCount: 0, fallbackUsed: false },
    childRuns: []
  };

  const r2 = {
    schemaVersion: "locaily.track_run_record.v1",
    recordId: `wf-r2-${randomUUID()}`,
    trackId: "test.track",
    correlationId: wfId,
    timestamps: { createdAt: new Date().toISOString() },
    routing: { executorType: "tool", capabilityId: "test-tool" },
    execution: { status: "success", durationMs: 10, retryCount: 0, fallbackUsed: false },
    childRuns: []
  };

  await storeRecord(r1);
  await storeRecord(r2);

  const found = await loadRecordsByWorkflow(wfId);
  assert(found.length >= 2, `Expected at least 2 records, got ${found.length}`);
}

// ---- Test: recorder service ----

async function testRecordDirectTrackRun() {
  await cleanStore();
  const result = await recordDirectTrackRun({
    trackId: "test.track.direct",
    input: { url: "https://test.com" },
    result: { issues: 3, summary: "Test completed" },
    steps: [
      { name: "step1", executor: "tool", tool: "test-tool", task: "run", durationMs: 5, output: { processed: true } },
      { name: "step2", executor: "model", model: "test-model", role: "tester", durationMs: 10, output: { analysis: "ok" } }
    ],
    durationMs: 15,
    schemaValid: true,
    fallbacksUsed: [],
    correlationId: "corr-direct",
    options: { provider: "mock" }
  });

  assert(result.parentRecordId, "Expected parentRecordId");
  assert(result.childRecordIds.length === 2, `Expected 2 child record IDs, got ${result.childRecordIds.length}`);
  assert(result.storeResult, "Expected storeResult");

  const parentRecord = await loadRecord(result.parentRecordId);
  assert(parentRecord !== null, "Expected parent record to be stored");
  await validateRecord(parentRecord);
  assert(parentRecord.routing.executorType === "hybrid", "Expected hybrid executor type for model+tool mix");
  assert(parentRecord.execution.status === "success", "Expected success status");
  assert(Array.isArray(parentRecord.childRuns), "Expected childRuns array");
  assert(parentRecord.childRuns.length === 2, "Expected 2 child runs in parent");

  for (const child of parentRecord.childRuns) {
    assert(child.parentRunId === result.parentRecordId, "Expected child parentRunId to match parent");
    await validateRecord(child);
  }
}

async function testRecordFailedDirectTrackRun() {
  await cleanStore();
  const result = await recordDirectTrackRun({
    trackId: "test.track.fail",
    input: { url: "https://fail.com" },
    result: null,
    steps: [],
    durationMs: 5,
    schemaValid: false,
    fallbacksUsed: [],
    error: { code: "TRACK_EXECUTION_FAILED", message: "Track execution failed intentionally" },
    correlationId: "corr-fail",
    options: { provider: "mock" }
  });

  assert(result.parentRecordId, "Expected parentRecordId for failed run");
  const record = await loadRecord(result.parentRecordId);
  assert(record !== null, "Expected failed record to be stored");
  await validateRecord(record);
  assert(record.execution.status === "failure", "Expected failure status");
  assert(record.error, "Expected error object");
  assert(record.error.type === "TRACK_EXECUTION_FAILED", "Expected error type");
}

async function testRecordWorkflowRun() {
  await cleanStore();
  const wfId = `test-workflow-${randomUUID()}`;
  const planSteps = [
    { step_id: "step1", track_id: "test.track", status: "completed", duration_ms: 5, worker_used: { type: "tool", tool: "test-tool", task: "run" } },
    { step_id: "step2", track_id: "test.track", status: "completed", duration_ms: 10, worker_used: { type: "model", model: "test-model", role: "worker" } }
  ];

  const result = await recordWorkflowRun({
    workflowId: wfId,
    trackId: "test.track",
    input: { query: "test" },
    planSteps,
    planResult: { status: "completed" },
    durationMs: 15,
    schemaValid: true,
    correlationId: "corr-wf",
    options: { provider: "mock" }
  });

  assert(result.parentRecordId, "Expected parentRecordId");
  assert(result.childRecordIds.length === 2, `Expected 2 child IDs, got ${result.childRecordIds.length}`);

  const parent = await loadRecord(result.parentRecordId);
  assert(parent !== null, "Expected parent record stored");
  await validateRecord(parent);
  assert(parent.workflowId === wfId, "Expected workflowId match");
  assert(parent.routing.executorType === "hybrid", "Expected hybrid for mixed tool+model workflow");
  assert(parent.execution.status === "success", "Expected success status");
  assert(Array.isArray(parent.childRuns), "Expected childRuns array");
  assert(parent.childRuns.length === 2, "Expected 2 child runs");

  for (const child of parent.childRuns) {
    assert(child.parentRunId === result.parentRecordId, "Expected child parentRunId");
    await validateRecord(child);
  }
}

async function testRecordFailedWorkflowRun() {
  await cleanStore();
  const result = await recordWorkflowRun({
    workflowId: "test-wf-fail",
    trackId: "test.track",
    input: { query: "fail" },
    planSteps: [],
    planResult: { status: "failed" },
    durationMs: 3,
    schemaValid: false,
    error: { code: "WORKFLOW_EXECUTION_FAILED", message: "Workflow failed intentionally" },
    correlationId: "corr-wf-fail",
    options: { provider: "mock" }
  });

  assert(result.parentRecordId, "Expected parentRecordId for failed workflow");
  const record = await loadRecord(result.parentRecordId);
  assert(record !== null, "Expected failed record stored");
  await validateRecord(record);
  assert(record.execution.status === "failure", "Expected failure status");
  assert(record.error, "Expected error object");
}

async function testRecordFailedExecution() {
  await cleanStore();
  const result = await recordFailedExecution({
    trackId: "test.track.fatal",
    input: { url: "http://fatal.com" },
    error: { code: "PROVIDER_UNAVAILABLE", message: "Provider is not running." },
    durationMs: 0,
    correlationId: "corr-fatal",
    options: { provider: "mock" }
  });

  assert(result.parentRecordId, "Expected parentRecordId for failed execution");
  const record = await loadRecord(result.parentRecordId);
  assert(record !== null, "Expected failed execution record stored");
  await validateRecord(record);
  assert(record.execution.status === "failure", "Expected failure status");
  assert(record.error, "Expected error object");
  assert(record.validation.status === "not_validated", "Expected not_validated validation");
}

// ---- Test: Direct Track Execution through orchestrator ----

async function testDirectTrackExecutionEmission() {
  await cleanStore();
  const runtime = getTestRuntime();
  const toolRegistry = getTestToolRegistry();

  const trackResult = await runTrack({
    trackId: "marketplace.dealsniper",
    input: MOCK_DEALSNIPER_INPUT,
    runtime,
    toolRegistry,
    options: { provider: "mock" },
    meta: { run_id: `run-test-${randomUUID()}` },
    recordOpts: { provider: "mock", enabled: true }
  });

  assert(trackResult.evidence, "Expected evidence from track execution");
  assert(trackResult.evidence.parentRecordId, "Expected parentRecordId");
  assert(trackResult.evidence.childRecordIds.length > 0, "Expected child record IDs");

  const parentRecord = await loadRecord(trackResult.evidence.parentRecordId);
  assert(parentRecord !== null, "Expected parent record stored");
  await validateRecord(parentRecord);
  assert(parentRecord.trackId === "marketplace.dealsniper", "Expected trackId match");

  for (const child of parentRecord.childRuns) {
    await validateRecord(child);
    assert(child.parentRunId === trackResult.evidence.parentRecordId, "Expected child parentRunId");
  }

  assert(trackResult.track_id === "marketplace.dealsniper", "Expected track_id unchanged");
  assert(trackResult.result, "Expected result unchanged");
  assert(Array.isArray(trackResult.steps), "Expected steps unchanged");
}

async function testLighthouseHandoffEmission() {
  await cleanStore();
  const runtime = getTestRuntime();
  const toolRegistry = getTestToolRegistry();

  const trackResult = await runTrack({
    trackId: "website_audit.lighthouse_handoff",
    input: MOCK_LIGHTHOUSE_INPUT,
    runtime,
    toolRegistry,
    options: { provider: "mock" },
    meta: { run_id: `run-lh-${randomUUID()}` },
    recordOpts: { provider: "mock", enabled: true }
  });

  assert(trackResult.evidence, "Expected evidence from Lighthouse Handoff track");
  assert(trackResult.evidence.parentRecordId, "Expected parentRecordId");
  assert(trackResult.evidence.childRecordIds.length > 0, "Expected child record IDs");

  const parentRecord = await loadRecord(trackResult.evidence.parentRecordId);
  assert(parentRecord !== null, "Expected parent record stored");
  await validateRecord(parentRecord);
  assert(parentRecord.trackId === "website_audit.lighthouse_handoff", "Expected trackId match");

  assert(trackResult.result, "Expected result unchanged");
  assert(trackResult.result.markdown, "Expected markdown in Lighthouse result");
}

// ---- Test: Workflow execution emission ----

async function testWorkflowExecutionEmission() {
  await cleanStore();
  const runtime = getTestRuntime();
  const toolRegistry = getTestToolRegistry();

  const plan = buildRunPlan({
    workflowId: "lighthouse_handoff",
    input: MOCK_LIGHTHOUSE_INPUT,
    taskId: `task-wf-test-${randomUUID()}`
  });

  const execution = await executeRunPlan({
    plan,
    runtime,
    toolRegistry,
    options: { provider: "mock" },
    meta: { run_id: `run-wf-${randomUUID()}` },
    recordOpts: { provider: "mock", enabled: true }
  });

  assert(execution.evidence, "Expected evidence from workflow execution");
  assert(execution.evidence.parentRecordId, "Expected parentRecordId");
  assert(execution.evidence.childRecordIds.length > 0, "Expected child record IDs");

  const parentRecord = await loadRecord(execution.evidence.parentRecordId);
  assert(parentRecord !== null, "Expected parent record stored");
  await validateRecord(parentRecord);
  assert(parentRecord.workflowId === "lighthouse_handoff", "Expected workflowId match");

  for (const child of parentRecord.childRuns) {
    await validateRecord(child);
    assert(child.parentRunId === execution.evidence.parentRecordId, "Expected child parentRunId");
  }
}

// ---- Test: DealSniper record emission ----

async function testDealSniperRecordEmission() {
  await cleanStore();
  const runtime = getTestRuntime();
  const toolRegistry = getTestToolRegistry();

  const trackResult = await runTrack({
    trackId: "marketplace.dealsniper",
    input: MOCK_DEALSNIPER_INPUT,
    runtime,
    toolRegistry,
    options: { provider: "mock" },
    meta: { run_id: `run-ds-${randomUUID()}` },
    recordOpts: { provider: "mock", enabled: true }
  });

  assert(trackResult.evidence, "Expected evidence from DealSniper");
  const parentRecord = await loadRecord(trackResult.evidence.parentRecordId);
  assert(parentRecord !== null, "Expected parent record stored");
  await validateRecord(parentRecord);

  assert(trackResult.track_id === "marketplace.dealsniper", "Expected track_id unchanged");
  assert(trackResult.result, "Expected result unchanged");
  assert(typeof trackResult.result.dealScore === "number", "Expected dealScore in DealSniper result");
}

// ---- Test: Parent-child linkage ----

async function testParentChildLinkage() {
  await cleanStore();
  const runtime = getTestRuntime();
  const toolRegistry = getTestToolRegistry();

  const trackResult = await runTrack({
    trackId: "marketplace.dealsniper",
    input: MOCK_DEALSNIPER_INPUT,
    runtime,
    toolRegistry,
    options: { provider: "mock" },
    meta: { run_id: `run-pc-${randomUUID()}` },
    recordOpts: { provider: "mock", enabled: true }
  });

  const parentRecord = await loadRecord(trackResult.evidence.parentRecordId);
  assert(parentRecord !== null, "Expected parent record stored");
  assert(Array.isArray(parentRecord.childRuns), "Expected childRuns array");

  for (const child of parentRecord.childRuns) {
    assert(child.parentRunId === parentRecord.recordId,
      `Expected child ${child.recordId} parentRunId to match ${parentRecord.recordId}`);
  }

  assert(parentRecord.childRuns.length > 0, "Expected children in parent record");
  assert(trackResult.evidence.childRecordIds.length > 0, "Expected childRecordIds in evidence");
  assert(trackResult.evidence.childRecordIds.length === parentRecord.childRuns.length,
    "Expected childRecordIds count matches childRuns count");
}

// ---- Test: Record ID uniqueness ----

async function testRecordIdUniqueness() {
  await cleanStore();
  const recordIds = new Set();

  for (let i = 0; i < 10; i++) {
    const result = await recordDirectTrackRun({
      trackId: "test.unique",
      input: { iteration: i },
      result: { done: true },
      steps: [],
      durationMs: 1,
      schemaValid: true,
      fallbacksUsed: [],
      correlationId: `unique-test-${i}`,
      options: { provider: "mock" }
    });

    assert(!recordIds.has(result.parentRecordId), `Duplicate parentRecordId detected: ${result.parentRecordId}`);
    recordIds.add(result.parentRecordId);
  }
}

// ---- Test: Input/output summary safety ----

async function testSummarySafety() {
  const input = { url: "https://example.com", scores: { performance: 72 }, secret: "should-not-appear" };
  const summary = buildInputSummary(input);
  assert(typeof summary === "string", "Expected string summary");
  assert(!summary.includes("should-not-appear"), "Summary should not include raw sensitive values by default");
  assert(summary.includes("url:string"), "Summary should include type info for fields");

  const output = { analysis: "completed", issues: [{ critical: 1 }] };
  const outputSummary = buildOutputSummary(output);
  assert(typeof outputSummary === "string", "Expected string output summary");
  assert(outputSummary.includes("analysis"), "Summary should include top-level keys");
}

// ---- Test: No Pit Crew terminology ----

async function testNoPitCrewTerminology() {
  const source = await readFile(join(ROOT, "companion", "crew", "runtime-track-run-recorder.js"), "utf8");
  assert(!source.includes("pit-crew") && !source.includes("pit_crew") && !source.includes("pitCrew"),
    "runtime-track-run-recorder should not contain Pit Crew terminology");

  const storeSource = await readFile(join(ROOT, "companion", "evidence", "track-run-record-store.js"), "utf8");
  assert(!storeSource.includes("pit-crew") && !storeSource.includes("pit_crew") && !storeSource.includes("pitCrew"),
    "track-run-record-store should not contain Pit Crew terminology");
}

// ---- Main runner ----

async function main() {
  const tests = [
    testStoreSaveAndLoad,
    testStoreNoOverwrite,
    testStoreSchemaValidation,
    testRecordsByParent,
    testRecordsByWorkflow,
    testRecordDirectTrackRun,
    testRecordFailedDirectTrackRun,
    testRecordWorkflowRun,
    testRecordFailedWorkflowRun,
    testRecordFailedExecution,
    testDirectTrackExecutionEmission,
    testLighthouseHandoffEmission,
    testWorkflowExecutionEmission,
    testDealSniperRecordEmission,
    testParentChildLinkage,
    testRecordIdUniqueness,
    testSummarySafety,
    testNoPitCrewTerminology
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      await test();
      console.log(`ok ${test.name}`);
      passed++;
    } catch (error) {
      console.log(`FAIL ${test.name}: ${error.message}`);
      console.error(error.stack);
      failed++;
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main();
