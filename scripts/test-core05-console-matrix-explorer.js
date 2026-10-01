/**
 * Acceptance test suite for CORE-05:
 * Generic Workflows & Model Qualification Matrix Explorer in Companion Console
 */

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const { createConsoleController } = require("../companion/console/controller");
const { listWorkflows } = require("../companion/orchestration");
const { createModelQualificationLoader } = require("../companion/core/model-qualification-loader");
const { createQualificationResolver } = require("../companion/core/qualification-resolver");
const { createCapabilityRegistry } = require("../companion/core/capability-registry");

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS: ${name}`);
    passed += 1;
  } catch (err) {
    console.error(`FAIL: ${name}`);
    console.error(err);
    failed += 1;
  }
}

async function runAsyncTest(name, fn) {
  try {
    await fn();
    console.log(`PASS: ${name}`);
    passed += 1;
  } catch (err) {
    console.error(`FAIL: ${name}`);
    console.error(err);
    failed += 1;
  }
}

async function main() {
  console.log("=== CORE-05 Console Workflows & Model Matrix Explorer Acceptance Tests ===\n");

  // AC1: Console HTML Navigation & Views Integration
  runTest("AC1: Console HTML includes enabled navigation links and all view panels", () => {
    const htmlPath = path.join(__dirname, "..", "companion", "console", "index.html");
    const html = fs.readFileSync(htmlPath, "utf8");

    // Navigation links
    assert(html.includes('id="navRunLink"'), "navRunLink missing in index.html");
    assert(html.includes('id="navWorkflowsLink"'), "navWorkflowsLink missing in index.html");
    assert(html.includes('id="navMatrixLink"'), "navMatrixLink missing in index.html");
    assert(html.includes('id="navActivityLink"'), "navActivityLink missing in index.html");

    // Views
    assert(html.includes('id="runView"'), "runView missing in index.html");
    assert(html.includes('id="workflowsView"'), "workflowsView missing in index.html");
    assert(html.includes('id="matrixView"'), "matrixView missing in index.html");
    assert(html.includes('id="activityView"'), "activityView missing in index.html");

    // Workflow runner elements
    assert(html.includes('id="workflowCardsList"'), "workflowCardsList missing");
    assert(html.includes('id="workflowInputEditor"'), "workflowInputEditor missing");
    assert(html.includes('id="workflowModelSelect"'), "workflowModelSelect missing");
    assert(html.includes('id="btnExecuteWorkflow"'), "btnExecuteWorkflow missing");
    assert(html.includes('id="workflowOutputJson"'), "workflowOutputJson missing");
    assert(html.includes('id="pipelineTrackBadges"'), "pipelineTrackBadges missing");

    // Matrix explorer elements
    assert(html.includes('id="statTotalModels"'), "statTotalModels missing");
    assert(html.includes('id="matrixTable"'), "matrixTable missing");
    assert(html.includes('id="modelTiersGrid"'), "modelTiersGrid missing");
    assert(html.includes('id="routingTesterForm"'), "routingTesterForm missing");
    assert(html.includes('id="dryRunCapabilitySelect"'), "dryRunCapabilitySelect missing");
    assert(html.includes('id="routingResultCard"'), "routingResultCard missing");
  });

  // AC2: Console CSS Stylesheet Integrity
  runTest("AC2: Console CSS contains responsive styles for Workflows, Matrix, and Tiers", () => {
    const cssPath = path.join(__dirname, "..", "companion", "console", "styles.css");
    const css = fs.readFileSync(cssPath, "utf8");

    assert(css.includes(".view-panel"), "view-panel style missing");
    assert(css.includes(".workflow-catalog-grid"), "workflow-catalog-grid style missing");
    assert(css.includes(".workflow-card"), "workflow-card style missing");
    assert(css.includes(".pipeline-track-badge"), "pipeline-track-badge style missing");
    assert(css.includes(".matrix-table"), "matrix-table style missing");
    assert(css.includes(".tier-card"), "tier-card style missing");
    assert(css.includes(".routing-tester-surface"), "routing-tester-surface style missing");
  });

  // AC3: Console Controller Serves Static Assets Cleanly
  await runAsyncTest("AC3: Console controller serves HTML, CSS, and JS with new views", async () => {
    const controller = createConsoleController({
      runStore: { listRuns: async () => ({ ok: true, runs: [] }), getRun: async () => ({ ok: true }) },
      validationRunner: {},
      getStatusSnapshot: async () => ({ ok: true }),
      localSetupStore: {}
    });

    const indexAsset = await controller.serveStatic("/console");
    assert(indexAsset, "serveStatic(/console) returned null");
    assert.strictEqual(indexAsset.statusCode, 200);
    assert(indexAsset.body.toString().includes("workflowsView"), "HTML body missing workflowsView");

    const cssAsset = await controller.serveStatic("/console/styles.css");
    assert(cssAsset, "serveStatic(/console/styles.css) returned null");
    assert.strictEqual(cssAsset.statusCode, 200);
    assert(cssAsset.body.toString().includes("workflow-catalog-grid"), "CSS body missing workflow-catalog-grid");

    const jsAsset = await controller.serveStatic("/console/app.js");
    assert(jsAsset, "serveStatic(/console/app.js) returned null");
    assert.strictEqual(jsAsset.statusCode, 200);
    assert(jsAsset.body.toString().includes("loadWorkflows"), "JS body missing loadWorkflows");
    assert(jsAsset.body.toString().includes("loadMatrix"), "JS body missing loadMatrix");
    assert(jsAsset.body.toString().includes("dryRunRouting"), "JS body missing dryRunRouting");
  });

  // AC4: Workflows Registry Exposes Generic Core Workflows
  runTest("AC4: Workflow registry exposes repo_review, text_qa, document_review, content_os", () => {
    const workflows = listWorkflows();
    const ids = workflows.map((w) => w.workflow_id);

    assert(ids.includes("repo_review"), "repo_review missing from workflows");
    assert(ids.includes("text_qa"), "text_qa missing from workflows");
    assert(ids.includes("document_review"), "document_review missing from workflows");
    assert(ids.includes("content_os"), "content_os missing from workflows");

    for (const id of ["repo_review", "text_qa", "document_review", "content_os"]) {
      const wf = workflows.find((w) => w.workflow_id === id);
      assert(wf.name, `${id} missing name`);
      assert(wf.description, `${id} missing description`);
      assert(Array.isArray(wf.composition), `${id} missing composition array`);
      assert(wf.composition.length >= 3, `${id} composition must contain at least 3 tracks`);
    }
  });

  // AC5: Capability Registry and Shadow Routing Evaluation
  runTest("AC5: Capability registry loads all qualified models and evaluates dry-run recommendations", () => {
    const loader = createModelQualificationLoader();
    const resolver = createQualificationResolver({ loader });
    const registry = createCapabilityRegistry({ loader, resolver });

    const capabilities = registry.listCapabilities();
    const modelIds = new Set(capabilities.map((c) => c.modelId));

    assert(modelIds.has("llama3.2-local"), "llama3.2-local missing from capabilities");
    assert(modelIds.has("lfm25-1p2b-thinking-local"), "lfm25-1p2b-thinking-local missing from capabilities");
    assert(modelIds.has("lfm25-1p2b-instruct-local"), "lfm25-1p2b-instruct-local missing from capabilities");
    assert(modelIds.has("lfm25-350m-local"), "lfm25-350m-local missing from capabilities");

    // Test dry run recommendations across generic tracks
    const tracksToTest = ["core.classify", "core.summarize", "core.extract"];
    for (const trackId of tracksToTest) {
      const dryRun = registry.dryRunRecommendation({
        modelId: "llama3.2-local",
        role: "default_worker",
        trackId,
        policy: "shadow"
      });

      assert(dryRun.ok, `dryRunRecommendation failed for ${trackId}`);
      assert(dryRun.recommendation, `recommendation missing for ${trackId}`);
      assert.strictEqual(dryRun.recommendation.action, "agree", `Expected agree for qualified primary model on ${trackId}`);
      assert(dryRun.recommendation.fallbackRecommendation, `Expected fallbackRecommendation for ${trackId}`);
    }

    // Test edge worker routing for core.classify
    const edgeDryRun = registry.dryRunRecommendation({
      modelId: "lfm25-350m-local",
      role: "edge_worker",
      trackId: "core.classify",
      policy: "shadow"
    });
    assert(edgeDryRun.ok, "edge_worker dry run failed");
    assert.strictEqual(edgeDryRun.recommendation.action, "agree", "edge_worker must agree for qualified core.classify");
  });

  // AC6: Unified Shell Workflows Integration
  runTest("AC6: Unified Shell dynamically queries orchestration workflows and supports custom routes", () => {
    const shellAppPath = path.join(__dirname, "..", "companion", "shell", "app.js");
    const shellApp = fs.readFileSync(shellAppPath, "utf8");

    assert(shellApp.includes("/orchestration/workflows"), "shell/app.js must fetch /orchestration/workflows");
    assert(shellApp.includes("repo_review"), "shell/app.js must handle repo_review");
    assert(shellApp.includes("document_review"), "shell/app.js must handle document_review");
    assert(shellApp.includes("openTaskModalWithRoute"), "shell/app.js must define openTaskModalWithRoute");
  });

  console.log("\n========================================");
  console.log(`Passed: ${passed}, Failed: ${failed}\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error running tests:", err);
  process.exit(1);
});
