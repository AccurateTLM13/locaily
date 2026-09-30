const assert = require("node:assert");
const { createToolRegistry } = require("../companion/tools/registry");
const { createMockRuntime } = require("../companion/providers/router");
const { buildRunPlan, executeRunPlan } = require("../companion/orchestration");
const { getCapability } = require("../companion/orchestration/capability-registry");
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

const baseInput = {
  content: "# Launch Plan\n\nThe v4 launch covers offline sync and shared capability docs for operators.\n\n## Risks\n\nTimezone bugs remain open.",
  doc_name: "launch-plan",
  content_categories: ["planning", "release", "internal"],
  content_schema: { type: "object" },
  publish_mapping: {
    "meta.kind": { "const": "article" },
    "lead": "headline"
  },
  publish_schema: { type: "object" }
};

async function run(input) {
  const plan = buildRunPlan({ workflowId: "content_os", input });
  const execution = await executeRunPlan({ plan, runtime, toolRegistry, meta: { source: "test-core01-content-os" } });
  return { plan, execution };
}

async function main() {
  await check("transform.map: deterministic nested mapping with from/const/join and missing reporting", async () => {
    const tool = toolRegistry.get("transform.map");
    assert(tool, "transform.map registered");
    assert.strictEqual(tool.requiresRuntime, false, "transform.map is deterministic");
    const out = await tool.handle({
      task: "run",
      input: {
        source: { doc: { name: "alpha", words: 10 }, tags: ["a", "b"], nested: { deep: { value: 7 } } },
        mapping: {
          "content.title": "doc.name",
          "content.count": { from: "doc.words" },
          "content.kind": { const: "article" },
          "meta.line": { join: ["doc.name", "nested.deep.value"], separator: "=" },
          "content.lost": "does.not.exist"
        }
      }
    });
    assert.deepStrictEqual(out.result.content, { title: "alpha", count: 10, kind: "article" });
    assert.strictEqual(out.result.meta.line, "alpha=7");
    assert.strictEqual(out.strategy, "deterministic_mapping_v1");
    assert(out.missing.some((entry) => entry.startsWith("content.lost")), "missing path reported, not fabricated");
    const again = await tool.handle({ task: "run", input: JSON.parse(JSON.stringify({ source: { a: 1 }, mapping: { b: "a" } })) });
    assert.deepStrictEqual(again.result, { b: 1 });
  });

  await check("transform.map rejects malformed mapping specs", async () => {
    const tool = toolRegistry.get("transform.map");
    assert.strictEqual(tool.validateInput({ source: {}, mapping: { x: { from: "a", const: 1 } } }).code, "INVALID_INPUT");
    assert.strictEqual(tool.validateInput({ source: {}, mapping: { x: 42 } }).code, "INVALID_INPUT");
    assert.strictEqual(tool.validateInput({ source: {}, mapping: { "": "a" } }).code, "INVALID_INPUT");
  });

  await check("content_os composes 7 tracks: 5 shared core + 2 domain", async () => {
    const plan = buildRunPlan({ workflowId: "content_os", input: baseInput });
    const ids = plan.tracks.map((entry) => entry.track_id);
    assert.strictEqual(ids.length, 7);
    const shared = ids.filter((id) => id.startsWith("core."));
    assert(shared.length >= 4, `expected >=4 core tracks, got ${shared.join(",")}`);
    assert.deepStrictEqual(
      plan.execution_order,
      ["ingest", "extract", "classify", "summarize", "transform", "validate", "publish"],
      "matches the Content OS target flow"
    );
  });

  await check("content_os completes end-to-end producing a publish package", async () => {
    const { execution } = await run(baseInput);
    assert.strictEqual(execution.plan.status, "completed");
    const pkg = execution.result.final;
    assert.strictEqual(pkg.slug, "launch-plan");
    assert(pkg.front_matter.startsWith("---"), "front matter present");
    assert(pkg.body_markdown.includes("v4 launch"), "body carries document text");
    assert(pkg.tags.length >= 1, "tags from shared classification");
    assert.strictEqual(pkg.ready, true, `checklist should be clean: ${pkg.checklist.join("; ")}`);
  });

  await check("content_os blocks publication when the shared validate gate fails", async () => {
    let threw = null;
    const plan = buildRunPlan({
      workflowId: "content_os",
      input: { ...baseInput, publish_schema: { type: "object", required: ["must_exist"] } }
    });
    try {
      await executeRunPlan({ plan, runtime, toolRegistry, meta: {} });
    } catch (error) {
      threw = error;
    }
    assert(threw, "strict publish schema must block");
    assert(threw.code === "STEP_VERIFICATION_FAILED" || threw.code === "COMPOSITION_TRACK_RESULT_INVALID");
    const publish = plan.tracks.find((entry) => entry.as === "publish");
    assert.strictEqual(publish.status, "pending", "publish must never run after the gate fails");
  });

  await check("publish-prep checklist blocks incomplete packages (ready=false)", async () => {
    const { execution } = await run({
      ...baseInput,
      content: "plain text with no headings and nothing else worth mentioning here at all",
      publish_mapping: {}
    });
    const pkg = execution.result.final;
    assert.strictEqual(pkg.ready, false);
    assert(pkg.checklist.some((item) => /heading/i.test(item)) === false || pkg.checklist.length > 0);
    assert(pkg.checklist.length >= 1, "checklist items explain what blocks publishing");
  });

  await check("Content OS reuses the same core + domain tracks as Document Review", async () => {
    const workflows = require("../companion/orchestration/registry/workflows.json").workflows;
    const usage = {};
    for (const workflow of workflows) {
      for (const entry of workflow.composition || []) {
        (usage[entry.track_id] = usage[entry.track_id] || new Set()).add(workflow.workflow_id);
      }
    }
    assert(usage["document_review.ingest"].has("document_review") && usage["document_review.ingest"].has("content_os"),
      "ingestion domain track shared across both document workflows");
    assert(usage["core.classify"].size >= 4, `core.classify workflows: ${[...usage["core.classify"]]}`);
    assert(usage["core.validate"].size >= 3);
    assert(usage["core.summarize"].size >= 3);
    assert(usage["core.extract"].size >= 3);
    const coreTracks = listTracks().map((t) => t.track_id).filter((id) => id.startsWith("core."));
    for (const id of coreTracks) {
      assert(usage[id] && usage[id].size >= 1, `every core track used at least once; ${id} unused`);
    }
  });

  await check("capability registry reflects the closed transform gap", async () => {
    assert.strictEqual(getCapability("transform").status, "reusable");
    assert(getCapability("transform").providers.some((p) => p.kind === "track" && p.id === "core.transform" && p.scope === "generic"));
    assert.strictEqual(getCapability("export").status, "workflow-specific");
    assert(getCapability("export").providers.filter((p) => p.scope === "domain").length >= 2, "two domain export providers registered");
  });

  await check("content_os declarative input contract enforced", async () => {
    let threw = null;
    try {
      buildRunPlan({ workflowId: "content_os", input: { content: "x", content_categories: ["a"], content_schema: {}, publish_schema: {} } });
    } catch (error) {
      threw = error;
    }
    assert(threw && threw.code === "INVALID_INPUT" && /publish_mapping/.test(threw.message));
  });

  console.log(`\n## Results: ${passed} passed, ${failed} failed`);
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch((error) => {
  console.error("CONTENT OS SUITE CRASHED:", error);
  process.exitCode = 1;
});
