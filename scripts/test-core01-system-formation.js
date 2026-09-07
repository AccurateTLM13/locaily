const assert = require("node:assert");
const { createToolRegistry } = require("../companion/tools/registry");
const { createMockRuntime } = require("../companion/providers/router");
const { buildRunPlan, executeRunPlan } = require("../companion/orchestration");
const { runTrack } = require("../companion/crew/orchestrator");
const { listCapabilities, getCapability, getGenericProviderTracks, validateCapabilityContracts } = require("../companion/orchestration/capability-registry");
const { resolveInputMap } = require("../companion/crew/input-map-resolver");

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

function repoReviewInput(overrides = {}) {
  return {
    files: [
      { path: "src/app.js", lines: 1200 },
      { path: "src/util.js", lines: 50, todo_count: 4 }
    ],
    findings: [
      { id: "f1", title: "SQL injection risk", kind: "security", severity: 9, effort: 4 },
      { id: "f2", title: "Missing cache headers", kind: "performance", severity: 5, effort: 2 }
    ],
    ...overrides
  };
}

async function runComposition(workflowId, input, options = {}) {
  const plan = buildRunPlan({ workflowId, input, options });
  const execution = await executeRunPlan({ plan, runtime, toolRegistry, meta: { source: "test-core01" } });
  return { plan, execution };
}

async function expectPlanError(name, workflowId, input, expectedCode) {
  let threw = null;
  try {
    buildRunPlan({ workflowId, input });
  } catch (error) {
    threw = error;
  }
  assert(threw, `${name} should throw at plan build time.`);
  assert.strictEqual(threw.code, expectedCode, `expected ${expectedCode}, got ${threw.code}: ${threw.message}`);
  return threw;
}

const tests = [
  ["capability registry contracts validate", async () => {
    const registry = require("../companion/orchestration/registry/capabilities.json");
    const validation = validateCapabilityContracts(registry);
    assert(validation.ok, `registry invalid: ${validation.errors.join("; ")}`);
    assert.strictEqual(registry.capabilities.length, 8, "all eight capability ids must be declared");
  }],

  ["capability registry status honesty", async () => {
    const statuses = Object.fromEntries(listCapabilities().map((entry) => [entry.capability_id, entry.status]));
    assert.strictEqual(statuses.extract, "reusable");
    assert.strictEqual(statuses.classify, "reusable");
    assert.strictEqual(statuses.summarize, "reusable");
    assert.strictEqual(statuses.prioritize, "reusable");
    assert.strictEqual(statuses.validate, "reusable");
    assert.strictEqual(statuses.route, "infrastructure");
    assert.strictEqual(statuses.transform, "workflow-specific");
    assert.strictEqual(statuses.export, "workflow-specific");
    assert.deepStrictEqual(getGenericProviderTracks("classify"), ["core.classify"]);
  }],

  ["input_map resolver: $literal passthrough and chain semantics preserved", async () => {
    const ctx = { input: { a: 1 }, artifacts: { s: { b: 2 } } };
    assert.deepStrictEqual(
      resolveInputMap({ list: { $literal: [1, 2, 3] } }, ctx),
      { list: [1, 2, 3] }
    );
    assert.deepStrictEqual(
      resolveInputMap({ chain: ["$artifacts.missing", { $literal: ["fallback"] }] }, ctx),
      { chain: ["fallback"] }
    );
    assert.deepStrictEqual(
      resolveInputMap({ ref: "$input.a" }, ctx),
      { ref: 1 }
    );
  }],

  ["workflow resolves multiple tracks and orders them topologically", async () => {
    const plan = buildRunPlan({ workflowId: "repo_review", input: repoReviewInput() });
    assert.strictEqual(plan.plan_version, 2);
    assert.strictEqual(plan.tracks.length, 5);
    assert.deepStrictEqual(plan.execution_order, ["scan", "classify", "prioritize", "summarize", "handoff"]);
    assert.strictEqual(plan.final_alias, "handoff");
    const stepCount = plan.tracks.reduce((total, entry) => total + entry.steps.length, 0);
    assert.strictEqual(stepCount, 5, "each composed track contributes its declared steps");
  }],

  ["tracks execute in expected order and artifacts pass between tracks", async () => {
    const { plan, execution } = await runComposition("repo_review", repoReviewInput());
    assert.strictEqual(execution.plan.status, "completed");
    assert.strictEqual(execution.result.composition.strategy, "declared_topological_v1");
    assert.strictEqual(execution.result.tracks.scan.file_count, 2);
    const rankedTitles = execution.result.tracks.prioritize.ranked.map((item) => item.title);
    assert(rankedTitles.includes("SQL injection risk"), "caller findings flow scan -> prioritize");
    assert(rankedTitles.includes("Large file: src/app.js"), "heuristic findings from scan flow into prioritize");
    assert.strictEqual(rankedTitles[0], "SQL injection risk", "9*2 - 4*1 = 14 beats others");
    assert(execution.result.final.markdown.includes("Repo Review"), "handoff consumes upstream artifacts");
    for (const trackPlan of plan.tracks) {
      assert.strictEqual(trackPlan.status, "completed", `${trackPlan.as} did not complete`);
    }
  }],

  ["invalid workflow input rejected declaratively", async () => {
    const error = await expectPlanError(
      "wrong input type",
      "repo_review",
      { files: "not-an-array" },
      "INVALID_INPUT"
    );
    assert(error.message.includes("files"), `message should name the field: ${error.message}`);
    const error2 = await expectPlanError(
      "text_qa missing required field",
      "text_qa",
      { categories: ["a"], expected_schema: {} },
      "INVALID_INPUT"
    );
    assert(error2.message.includes("text"));
  }],

  ["invalid composition is rejected at build time", async () => {
    const workflowRegistry = require("../companion/orchestration/workflow-registry");
    const original = workflowRegistry.getWorkflow;
    const compose = require("../companion/orchestration/run-plan-builder").buildCompositionRunPlan;

    const cases = [
      ["cycle", [{ as: "a", track_id: "core.classify", input_map: { text: "$artifacts.b.category", categories: { $literal: ["x"] } } }, { as: "b", track_id: "core.classify", input_map: { text: "$artifacts.a.category", categories: { $literal: ["x"] } } }], "WORKFLOW_COMPOSITION_CYCLE"],
      ["unknown reference", [{ as: "a", track_id: "core.classify", input_map: { text: "$artifacts.ghost.category", categories: { $literal: ["x"] } } }], "WORKFLOW_COMPOSITION_INVALID"],
      ["duplicate alias", [{ as: "dup", track_id: "core.classify" }, { as: "dup", track_id: "core.summarize" }], "WORKFLOW_COMPOSITION_INVALID"],
      ["self reference", [{ as: "me", track_id: "core.classify", input_map: { text: "$artifacts.me.category" } }], "WORKFLOW_COMPOSITION_INVALID"],
      ["unknown requires", [{ as: "a", track_id: "core.classify", requires: ["nope"] }], "WORKFLOW_COMPOSITION_INVALID"],
      ["bad schema (uppercase alias)", [{ as: "Bad", track_id: "core.classify" }], "WORKFLOW_COMPOSITION_INVALID"],
      ["unknown track", [{ as: "a", track_id: "core.does_not_exist" }], "TRACK_NOT_FOUND"]
    ];

    for (const [label, composition, expectedCode] of cases) {
      const fakeWorkflow = { workflow_id: `synthetic.${label}`, input_requirements: [], composition };
      let threw = null;
      try {
        compose({ workflow: fakeWorkflow, input: {} });
      } catch (error) {
        threw = error;
      }
      assert(threw, `${label} should be rejected`);
      assert.strictEqual(threw.code, expectedCode, `${label}: expected ${expectedCode}, got ${threw.code} (${threw.message})`);
    }
    assert.strictEqual(workflowRegistry.getWorkflow, original, "registry module must not be mutated");
  }],

  ["missing capability fails cleanly (unknown tool)", async () => {
    const emptyRegistry = { get: () => null, has: () => false, list: () => [], listIds: () => [], listPublic: () => [], supportsTask: () => false };
    const plan = buildRunPlan({ workflowId: "repo_review", input: repoReviewInput() });
    let threw = null;
    try {
      await executeRunPlan({ plan, runtime, toolRegistry: emptyRegistry, meta: {} });
    } catch (error) {
      threw = error;
    }
    assert(threw, "unknown tool must fail");
    assert.strictEqual(threw.code, "TOOL_NOT_FOUND");
    assert.strictEqual(plan.status, "failed");
    assert.strictEqual(plan.tracks[0].status, "failed");
    assert.strictEqual(plan.tracks[0].error.code, "TOOL_NOT_FOUND");
  }],

  ["track output validation occurs (verification gate fails closed)", async () => {
    const plan = buildRunPlan({
      workflowId: "text_qa",
      input: {
        text: "Some content to validate.",
        categories: ["a"],
        expected_schema: { type: "object", required: ["impossible_key"], properties: { impossible_key: { type: "string" } } }
      }
    });
    let threw = null;
    try {
      await executeRunPlan({ plan, runtime, toolRegistry, meta: {} });
    } catch (error) {
      threw = error;
    }
    assert(threw, "core.validate gate with valid=false must abort the composition");
    assert(threw.code === "STEP_VERIFICATION_FAILED" || threw.code === "COMPOSITION_TRACK_RESULT_INVALID", `unexpected code ${threw.code}`);
    const checkEntry = plan.tracks.find((entry) => entry.as === "check");
    assert.strictEqual(checkEntry.status, "failed");
    assert.strictEqual(plan.status, "failed");
  }],

  ["fallback behavior: skipped optional track recorded as warning, workflow completes", async () => {
    const { plan, execution } = await runComposition("repo_review", {
      files: [{ path: "README.md", lines: 10 }, { path: "src/a.js", lines: 20 }],
      findings: []
    });
    void plan;
    assert.strictEqual(execution.plan.status, "completed");
    const prioritize = execution.plan.tracks.find((entry) => entry.as === "prioritize");
    assert.strictEqual(prioritize.status, "failed", "rank.items rejects empty items");
    assert.strictEqual(prioritize.on_failure, "skip");
    assert.strictEqual(execution.result.composition.warnings.length, 1);
    assert.strictEqual(execution.result.composition.warnings[0].alias, "prioritize");
    assert(Array.isArray(execution.result.final.priorities), "handoff falls back to scan findings");
  }],

  ["text_qa proves pure generic multi-track composition", async () => {
    const { execution } = await runComposition("text_qa", {
      text: "Release note: v2 ships offline mode.",
      categories: ["announcement", "tutorial"],
      expected_schema: { type: "object" }
    });
    assert.strictEqual(execution.plan.status, "completed");
    assert.deepStrictEqual(
      execution.plan.tracks.map((entry) => entry.as),
      ["extract", "classify", "check"],
      "extract and classify are independent; check follows extract"
    );
    assert.strictEqual(execution.result.final.valid, true);
  }],

  ["shared capability used by multiple unrelated workflows without modification", async () => {
    const repo = buildRunPlan({ workflowId: "repo_review", input: repoReviewInput() });
    const repoClassify = repo.tracks.find((entry) => entry.as === "classify");
    const qa = buildRunPlan({ workflowId: "text_qa", input: { text: "x y z", categories: ["a"], expected_schema: {} } });
    const qaClassify = qa.tracks.find((entry) => entry.as === "classify");
    assert.strictEqual(repoClassify.track_id, qaClassify.track_id);
    assert.strictEqual(repoClassify.track_id, "core.classify");
    const { loadTrack } = require("../companion/crew/decomposer");
    const classifyTrack = loadTrack("core.classify");
    assert.deepStrictEqual(
      classifyTrack.steps[0].input_map,
      { text: "$input.text", categories: "$input.categories" },
      "generic track must remain domain-neutral"
    );
    const serialized = JSON.stringify(classifyTrack);
    assert(!/lighthouse|website_audit|operator|deal/i.test(serialized), "core track must not reference any domain");
  }],

  ["core tracks execute standalone too (single-capability consumers)", async () => {
    const result = await runTrack({
      trackId: "core.classify",
      input: {
        text: "Render blocking scripts dominate the audit findings for lighthouse categories.",
        categories: ["performance", "accessibility", "seo"]
      },
      runtime,
      toolRegistry,
      meta: { source: "test-core01" }
    });
    assert.strictEqual(result.result.meta.track_id, "core.classify");
    assert(result.result.category, "classification produced");
    const prioritized = await runTrack({
      trackId: "core.prioritize",
      input: {
        items: [{ id: "a", impact: 8, cost: 1 }, { id: "b", impact: 4, cost: 8 }],
        score_fields: [{ field: "impact" }, { field: "cost", weight: -1 }]
      },
      runtime,
      toolRegistry,
      meta: { source: "test-core01" }
    });
    assert.deepStrictEqual(prioritized.result.ranked.map((item) => item.id), ["a", "b"], "deterministic order: a=9, b=-12");
    assert.strictEqual(prioritized.result.strategy, "deterministic_score_sum_v1");
  }],

  ["rank.items is deterministic and validates inputs", async () => {
    const tool = toolRegistry.get("rank.items");
    assert(tool, "rank.items registered");
    assert.strictEqual(tool.requiresRuntime, false, "rank.items is deterministic");
    const first = await tool.handle({ task: "run", input: { items: [{ x: 1, k: "b" }, { x: 3, k: "a" }, { x: 3, k: "c" }], score_fields: [{ field: "x" }], tie_break: "k" } });
    assert.deepStrictEqual(first.ranked.map((i) => i.k), ["a", "c", "b"], "ties broken by key, then stable");
    const limited = await tool.handle({ task: "run", input: { items: [{ x: 2 }, { x: 5 }, { x: 1 }], score_fields: [{ field: "x" }], limit: 2 } });
    assert.strictEqual(limited.ranked.length, 2);
    assert(limited.ranked[0].score === 5 && limited.ranked[1].score === 2);
    assert.strictEqual(tool.validateInput({ items: [], score_fields: [{ field: "x" }] }).code, "INVALID_INPUT");
    assert.strictEqual(tool.validateInput({ items: [{ x: "not-a-number" }], score_fields: [{ field: "x" }] }).code, "INVALID_INPUT");
  }],

  ["repo-scan scans real directories read-only with caps", async () => {
    const tool = toolRegistry.get("repo-scan");
    const output = await tool.handle({ task: "scan", input: { path: require("node:path").resolve(__dirname, "..", "companion", "orchestration"), max_files: 50 } });
    assert(output.file_count >= 4, "orchestration dir has files");
    assert(output.summary_text.includes("Repository"), "summary text generated");
    assert(output.repo_name === "orchestration");
    let threw = null;
    try {
      await tool.handle({ task: "scan", input: { path: "Z:\\definitely\\not\\here" } });
    } catch (error) {
      threw = error;
    }
    assert(threw && threw.code === "REPO_PATH_NOT_FOUND");
  }],

  ["capability registry evidence lists real compositions", async () => {
    const classify = getCapability("classify");
    assert(classify.providers.some((p) => p.kind === "track" && p.id === "core.classify"));
    assert(classify.providers.some((p) => p.kind === "tool" && p.id === "lighthouse.classify_audits" && p.scope === "domain"));
    const prioritize = getCapability("prioritize");
    assert(prioritize.model_roles.length === 0, "prioritize is deterministic-first");
    assert(prioritize.required_tools.includes("rank.items"));
  }],

  ["legacy single-track workflow behavior unchanged", async () => {
    const plan = buildRunPlan({
      workflowId: "dealsniper",
      input: { title: "Vintage desk lamp", price: 15 }
    });
    assert(plan.plan_version === undefined, "legacy plans keep workflow-plan v1 shape");
    assert.strictEqual(typeof plan.track_id, "string");
    assert(Array.isArray(plan.steps));
    const execution = await executeRunPlan({ plan, runtime, toolRegistry, meta: { source: "test-core01" } });
    assert.strictEqual(execution.plan.status, "completed");
  }],

  ["dev-lifecycle resume continues an active milestone after session:close", async () => {
    const src = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "scripts", "dev-lifecycle.js"), "utf8");
    assert(
      src.includes("milestone.status === \"paused\" || milestone.status === \"active\""),
      "resume must reopen a session for an active milestone with no open session"
    );
    const sessions = require("node:fs").readdirSync(require("node:path").join(__dirname, "..", "development", "sessions"))
      .filter((f) => f.startsWith("session-") && f.endsWith(".json"));
    const activeSessions = sessions.filter((f) => {
      const s = require(`../development/sessions/${f}`);
      return s.status === "active";
    });
    assert(activeSessions.length <= 1, "at most one active session in the ledger");
  }]
];

(async () => {
  for (const [name, fn] of tests) {
    await check(name, fn);
  }

  console.log(`\n## Results: ${passed} passed, ${failed} failed`);
  process.exitCode = failed > 0 ? 1 : 0;
})();
