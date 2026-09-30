const assert = require("node:assert");
const path = require("node:path");
const { createToolRegistry } = require("../companion/tools/registry");
const { createMockRuntime } = require("../companion/providers/router");
const { buildRunPlan, executeRunPlan } = require("../companion/orchestration");
const { listTracks } = require("../companion/crew/decomposer");

const toolRegistry = createToolRegistry();
const runtime = createMockRuntime();

let passed = 0;
let failed = 0;

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      console.log(`PASS: ${name}`);
    })
    .catch((error) => {
      failed += 1;
      console.error(`FAIL: ${name}\n      ${error.code ? `[${error.code}] ` : ""}${error.message}`);
    });
}

const inlineDoc = {
  content: "# Release Notes\n\nShip v3 with offline mode.\n\n## Details\n\nRetries were added.\n\n\n\n\n## Migration\n\nRun the migrate script.",
  doc_name: "release-notes",
  doc_categories: ["announcement", "tutorial", "reference"],
  document_schema: { type: "object" }
};

async function run(input, meta = {}) {
  const plan = buildRunPlan({ workflowId: "document_review", input, options: meta.options || {} });
  const execution = await executeRunPlan({ plan, runtime, toolRegistry, meta: { source: "test-core01-document-review", ...meta } });
  return { plan, execution };
}

async function main() {
  await check("document_review composes 6 tracks: 2 domain + 4 shared core", async () => {
    const plan = buildRunPlan({ workflowId: "document_review", input: inlineDoc });
    assert.strictEqual(plan.plan_version, 2);
    assert.deepStrictEqual(
      plan.tracks.map((entry) => entry.track_id),
      [
        "document_review.ingest",
        "core.extract",
        "core.classify",
        "core.summarize",
        "core.validate",
        "document_review.report"
      ]
    );
  });

  await check("document_review completes with cross-track artifact passing", async () => {
    const { execution } = await run(inlineDoc);
    assert.strictEqual(execution.plan.status, "completed");
    const ingest = execution.result.tracks.ingest;
    assert.strictEqual(ingest.word_count > 5, true);
    assert.strictEqual(ingest.section_count, 3, "heading split: top/Release-Notes style sections merged (top has preamble only when nonempty)");
    assert(!/\n\n\n/.test(ingest.cleaned_text), "3+ blank lines collapsed deterministically");
    const report = execution.result.final;
    assert(report.markdown.includes("Document Review — release-notes"));
    assert(report.sections.some((s) => s.heading === "Classification"));
    assert(report.sections.some((s) => s.heading === "Validation"));
  });

  await check("document_review ingests a real local markdown file read-only", async () => {
    const target = path.resolve(__dirname, "..", "docs", "00-start-here", "current-state.md");
    const { execution } = await run({
      path: target,
      doc_categories: ["status", "guide"],
      document_schema: { type: "object" }
    });
    assert.strictEqual(execution.plan.status, "completed");
    assert.strictEqual(execution.result.tracks.ingest.doc_name, "current-state");
    assert(execution.result.tracks.ingest.source_type === "file");
  });

  await check("image/PDF input fails closed with OCR_ADAPTER_REQUIRED (no silent behavior)", async () => {
    let threw = null;
    try {
      await run({ ...inlineDoc, content: undefined, path: "contracts/scan-page.png" });
    } catch (error) {
      threw = error;
    }
    assert(threw, "OCR input must fail");
    assert.strictEqual(threw.code, "OCR_ADAPTER_REQUIRED");
    assert(/adapter/i.test(threw.nextStep), "error must name the missing adapter decision");
  });

  await check("shared validate fails the composition closed on schema-mismatched extraction", async () => {
    let threw = null;
    try {
      await run({ ...inlineDoc, document_schema: { type: "object", required: ["never_extracted_key"] } });
    } catch (error) {
      threw = error;
    }
    assert(threw, "strict schema against mock extraction must abort");
    assert(threw.code === "STEP_VERIFICATION_FAILED" || threw.code === "COMPOSITION_TRACK_RESULT_INVALID", `unexpected code ${threw.code}`);
  });

  await check("declarative input contract rejects missing caller fields", async () => {
    let threw = null;
    try {
      buildRunPlan({ workflowId: "document_review", input: { content: "x" } });
    } catch (error) {
      threw = error;
    }
    assert(threw && threw.code === "INVALID_INPUT");
    assert(/doc_categories/.test(threw.message));
  });

  await check("core tracks are shared across three or more distinct workflows", async () => {
    const usage = {};
    const workflowsFile = require("../companion/orchestration/registry/workflows.json");
    for (const workflow of workflowsFile.workflows) {
      for (const entry of workflow.composition || []) {
        (usage[entry.track_id] = usage[entry.track_id] || new Set()).add(workflow.workflow_id);
      }
    }
    const coreTracks = listTracks().map((t) => t.track_id).filter((id) => id.startsWith("core."));
    assert(coreTracks.length >= 5 && coreTracks.includes("core.transform"), `core tracks: ${coreTracks.join(",")}`);
    assert(usage["core.classify"].size >= 2, `core.classify reused by: ${[...usage["core.classify"]]}`);
    assert(usage["core.summarize"].size >= 2, `core.summarize reused by: ${[...usage["core.summarize"]]}`);
    assert(usage["core.extract"].size >= 2, `core.extract reused by: ${[...usage["core.extract"]]}`);
    assert(usage["core.validate"].size >= 2, `core.validate reused by: ${[...usage["core.validate"]]}`);
  });

  console.log(`\n## Results: ${passed} passed, ${failed} failed`);
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch((error) => {
  console.error("DOCUMENT REVIEW SUITE CRASHED:", error);
  process.exitCode = 1;
});
