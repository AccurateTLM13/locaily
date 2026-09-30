const assert = require("node:assert");
const path = require("node:path");
const { createToolRegistry } = require("../companion/tools/registry");
const { createMockRuntime } = require("../companion/providers/router");
const { runTrack } = require("../companion/crew/orchestrator");
const { buildRunPlan, executeRunPlan } = require("../companion/orchestration");
const { getCapability } = require("../companion/orchestration/capability-registry");

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

function opportunitiesFromFixture(report) {
  const lr = report.lighthouseResult || report;
  const opportunities = [];

  for (const [auditId, audit] of Object.entries(lr.audits || {})) {
    if (typeof audit.score !== "number" || audit.score >= 1) {
      continue;
    }

    const savingsMs = audit.details && typeof audit.details.overallSavingsMs === "number"
      ? audit.details.overallSavingsMs
      : (typeof audit.numericSavings === "number" ? audit.numericSavings : 0);
    const savingsBytes = audit.details && typeof audit.details.overallSavingsBytes === "number"
      ? audit.details.overallSavingsBytes
      : 0;

    opportunities.push({
      id: auditId,
      title: audit.title,
      score: audit.score,
      overallSavingsMs: savingsMs,
      overallSavingsBytes: savingsBytes
    });
  }

  return opportunities;
}

async function main() {
  const fixture = require(path.join(__dirname, "..", "examples", "lighthouse-handoff", "lemonteed-pagespeed-raw.fixture.json"));
  const opportunities = opportunitiesFromFixture(fixture);
  assert(opportunities.length >= 3, `fixture should yield opportunities, got ${opportunities.length}`);

  await check("prioritize parity: shared core.prioritize reproduces Lighthouse domain ranking exactly", async () => {
    const classify = toolRegistry.get("lighthouse.classify_audits");
    const domain = await classify.handle({ task: "run", input: { opportunities } });
    assert(domain.rankedOpportunities.length >= 3, "domain ranking produced");

    const generic = await runTrack({
      trackId: "core.prioritize",
      input: {
        items: domain.rankedOpportunities,
        score_fields: [
          { field: "savingsMs", weight: 10 },
          { field: "savingsBytes", weight: 1 / 1024 },
          { field: "score", weight: -100 }
        ]
      },
      runtime,
      toolRegistry,
      meta: { source: "test-core01-phase7" }
    });

    assert.strictEqual(generic.result.strategy, "deterministic_score_sum_v1");
    const domainOrder = domain.rankedOpportunities.map((item) => item.id);
    const genericOrder = generic.result.ranked.map((item) => item.id);
    assert.deepStrictEqual(genericOrder, domainOrder, "shared prioritize must match the domain ranking order");
  });

  await check("classification capability: shared core.classify consumes Lighthouse-derived findings", async () => {
    const classify = toolRegistry.get("lighthouse.classify_audits");
    const domain = await classify.handle({ task: "run", input: { opportunities } });
    const text = domain.issues
      .map((issue, index) => `${index + 1}. ${issue.title} (severity ${issue.severity}, category ${issue.category})`)
      .join("\n");

    const result = await runTrack({
      trackId: "core.classify",
      input: {
        text,
        categories: ["performance", "accessibility", "seo", "best-practices"]
      },
      runtime,
      toolRegistry,
      meta: { source: "test-core01-phase7" }
    });

    assert(result.result.category, "shared classify produced a category on Lighthouse input");
    assert(!/lemon|pagespeed/i.test(JSON.stringify(result.result)), "shared track output must not carry domain leakage");
  });

  await check("summarization capability: shared core.summarize consumes Lighthouse findings", async () => {
    const classify = toolRegistry.get("lighthouse.classify_audits");
    const domain = await classify.handle({ task: "run", input: { opportunities } });
    const result = await runTrack({
      trackId: "core.summarize",
      input: {
        text: domain.issues.map((issue) => issue.title).join(". "),
        style: "operator-brief",
        max_points: 3
      },
      runtime,
      toolRegistry,
      meta: { source: "test-core01-phase7" }
    });
    assert(typeof result.result.summary === "string", "shared summarize produced a summary");
  });

  await check("validation capability: shared core.validate checks a Lighthouse-path artifact", async () => {
    const classify = toolRegistry.get("lighthouse.classify_audits");
    const domain = await classify.handle({ task: "run", input: { opportunities } });

    const ok = await runTrack({
      trackId: "core.validate",
      input: {
        data: { issues: domain.issues, rankedOpportunities: domain.rankedOpportunities },
        schema: {
          type: "object",
          required: ["issues", "rankedOpportunities"]
        }
      },
      runtime,
      toolRegistry,
      meta: { source: "test-core01-phase7" }
    });
    assert.strictEqual(ok.result.valid, true, "well-formed Lighthouse artifact validates");

    const bad = await runTrack({
      trackId: "core.validate",
      input: {
        data: { issues: domain.issues },
        schema: { type: "object", required: ["rankedOpportunities"] }
      },
      runtime,
      toolRegistry,
      meta: { source: "test-core01-phase7" }
    });
    assert.strictEqual(bad.result.valid, false, "missing key reported invalid");
    assert.strictEqual(bad.schemaValid, false, "shared gate marks the run schema-invalid");
    assert(bad.result.meta.verification.errors.length > 0, "verification errors carried");
  });

  await check("classify capability contract lists both domain and generic providers", async () => {
    const contract = getCapability("classify");
    const generic = contract.providers.filter((p) => p.scope === "generic");
    const domain = contract.providers.filter((p) => p.scope === "domain");
    assert(generic.some((p) => p.id === "core.classify"), "generic provider registered");
    assert(domain.some((p) => p.domains && p.domains.includes("website_audit")), "domain provider registered");
  });

  await check("repo_review and lighthouse data share the same prioritize track instance", async () => {
    const { loadTrack } = require("../companion/crew/decomposer");
    const trackA = loadTrack("core.prioritize");
    const plan = buildRunPlan({
      workflowId: "repo_review",
      input: {
        files: [{ path: "README.md", lines: 5 }],
        findings: [{ id: "x1", title: "t", kind: "k", severity: 3, effort: 1 }]
      }
    });
    const prioritize = plan.tracks.find((entry) => entry.as === "prioritize");
    assert.strictEqual(prioritize.track_id, trackA.track_id);
    const execution = await executeRunPlan({ plan, runtime, toolRegistry, meta: { source: "test-core01-phase7" } });
    assert.strictEqual(execution.plan.status, "completed");
  });

  console.log(`\n## Results: ${passed} passed, ${failed} failed`);
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch((error) => {
  console.error("PHASE7 SUITE CRASHED:", error);
  process.exitCode = 1;
});
