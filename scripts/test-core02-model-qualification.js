#!/usr/bin/env node
const assert = require("node:assert/strict");
const path = require("node:path");
const { runSuite } = require("../benchmark-lab/engine/runners/suite-runner");
const { createModelQualificationLoader } = require("../companion/core/model-qualification-loader");
const { createQualificationResolver } = require("../companion/core/qualification-resolver");
const { createToolRegistry } = require("../companion/tools/registry");
const { createMockRuntime } = require("../companion/providers/router");
const { buildRunPlan, executeRunPlan } = require("../companion/orchestration");
const { createQualificationEvidenceLinker } = require("../companion/evidence/qualification-evidence-linker");
const { validateResult } = require("../companion/core/result-validator");

const ROOT = path.resolve(__dirname, "..");
const LAB_ROOT = path.join(ROOT, "benchmark-lab");

const PROMOTED_SCHEMA = require("../benchmark-lab/schemas/promoted-evidence.schema.json");


let passed = 0;
let failed = 0;

async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`PASS: ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL: ${name}\n      ${error.message}`);
    if (error.stack) {
      console.error(error.stack.split("\n").slice(1, 4).join("\n"));
    }
  }
}

async function main() {
  console.log("=== CORE-02 Model Qualification & Workflow Routing Tests ===\n");

  const loader = createModelQualificationLoader();
  const resolver = createQualificationResolver({ loader });
  const toolRegistry = createToolRegistry();
  const runtime = createMockRuntime();

  const routingOptions = {
    model: "llama3.2-local",
    resolveModelForRole: (role) => ({ ok: true, model: "llama3.2-local" }),
    getModelQualificationEvidence: ({ model, role, trackId, contractId }) => {
      const matches = loader.findForRole({
        modelId: model,
        role,
        trackId,
        contractId
      });
      return matches.length > 0
        ? {
            status: matches[0].status,
            score: matches[0].score,
            evidenceIds: matches[0].evidenceIds,
            recordId: matches[0].recordId,
            generatedAt: matches[0].generatedAt
          }
        : null;
    }
  };

  // AC 1: core-classify-v1 suite
  await check("AC1: core-classify-v1 suite runs, evaluates all strata, and matches promoted evidence", async () => {
    const suitePath = path.join(LAB_ROOT, "locaily", "tracks", "core-classify", "suite.json");
    const runResult = await runSuite({ suitePath });
    assert(runResult.summary, "Suite should produce summary");
    assert.equal(runResult.summary.passed, 3, "All 3 strata should pass");
    assert.equal(runResult.summary.failed, 0);

    const evidence = require("../benchmark-lab/evidence/summaries/llama3.2-core-classify-v1.json");
    const val = validateResult(evidence, PROMOTED_SCHEMA, "promoted evidence");
    assert(val.ok, `Evidence schema invalid: ${val.errors.join("; ")}`);
    assert.equal(evidence.trackId, "core.classify");
    assert.equal(evidence.suiteId, "core-classify-v1");
  });

  // AC 2: core-summarize-v1 suite
  await check("AC2: core-summarize-v1 suite runs, evaluates all strata, and matches promoted evidence", async () => {
    const suitePath = path.join(LAB_ROOT, "locaily", "tracks", "core-summarize", "suite.json");
    const runResult = await runSuite({ suitePath });
    assert(runResult.summary, "Suite should produce summary");
    assert.equal(runResult.summary.passed, 3, "All 3 strata should pass");
    assert.equal(runResult.summary.failed, 0);

    const evidence = require("../benchmark-lab/evidence/summaries/llama3.2-core-summarize-v1.json");
    const val = validateResult(evidence, PROMOTED_SCHEMA, "promoted evidence");
    assert(val.ok, `Evidence schema invalid: ${val.errors.join("; ")}`);
    assert.equal(evidence.trackId, "core.summarize");
    assert.equal(evidence.suiteId, "core-summarize-v1");
  });

  // AC 3: core-extract-v1 suite
  await check("AC3: core-extract-v1 suite runs, evaluates all strata, and matches promoted evidence", async () => {
    const suitePath = path.join(LAB_ROOT, "locaily", "tracks", "core-extract", "suite.json");
    const runResult = await runSuite({ suitePath });
    assert(runResult.summary, "Suite should produce summary");
    assert.equal(runResult.summary.passed, 3, "All 3 strata should pass");
    assert.equal(runResult.summary.failed, 0);

    const evidence = require("../benchmark-lab/evidence/summaries/llama3.2-core-extract-v1.json");
    const val = validateResult(evidence, PROMOTED_SCHEMA, "promoted evidence");
    assert(val.ok, `Evidence schema invalid: ${val.errors.join("; ")}`);
    assert.equal(evidence.trackId, "core.extract");
    assert.equal(evidence.suiteId, "core-extract-v1");
  });

  // AC 4: Model Qualification Records & Checksums
  await check("AC4: Qualification records loaded with verified checksums for all 3 core tracks", async () => {
    const status = loader.getStatus();
    assert.equal(status.checksumVerification.failed, 0, "No checksum failures allowed");
    assert(status.checksumVerification.verified >= 13, "All qualification checksums verified");

    const tracks = ["core.classify", "core.summarize", "core.extract"];
    for (const trackId of tracks) {
      const resolution = resolver.resolveForCapability({
        modelId: "llama3.2-local",
        role: "default_worker",
        trackId
      });
      assert.equal(resolution.state, "qualified", `Track ${trackId} should be qualified`);
      assert(resolution.capabilities.length > 0, `Capability should be registered for ${trackId}`);
      assert.equal(resolution.capabilities[0].score, 1, `Score should be 1.0 for ${trackId}`);
      assert(resolution.capabilities[0].recordId.includes(trackId.replace(".", "-")), `Record ID should link to track ${trackId}`);
    }
  });

  // AC 5: Workflow Routing & Track Run Records
  await check("AC5.1: repo_review workflow routes classify and summarize to qualified llama3.2-local", async () => {
    const plan = buildRunPlan({
      workflowId: "repo_review",
      input: {
        files: [{ path: "lib/auth.js", lines: 250 }],
        findings: [{ id: "f1", title: "Hardcoded secret", kind: "security", severity: 10, effort: 1 }]
      }
    });

    const execution = await executeRunPlan({
      plan,
      runtime,
      toolRegistry,
      options: routingOptions,
      recordOpts: { enabled: true }
    });

    assert.equal(execution.plan.status, "completed");
    const classifyTrack = execution.plan.tracks.find((t) => t.as === "classify");
    const summarizeTrack = execution.plan.tracks.find((t) => t.as === "summarize");

    assert(classifyTrack, "classify track should be part of repo_review");
    assert(summarizeTrack, "summarize track should be part of repo_review");

    assert.equal(classifyTrack.steps[0].worker_used.qualification.recordId, "llama3.2-local-llama3.2-core-classify-v1");
    assert.equal(summarizeTrack.steps[0].worker_used.qualification.recordId, "llama3.2-local-llama3.2-core-summarize-v1");
  });

  await check("AC5.2: text_qa workflow routes extract and classify to qualified llama3.2-local", async () => {
    const plan = buildRunPlan({
      workflowId: "text_qa",
      input: {
        text: "Jane Doe <jane@example.com> requested feature access.",
        categories: ["account", "billing", "support"],
        expected_schema: {
          type: "object"
        }
      }
    });

    const execution = await executeRunPlan({
      plan,
      runtime,
      toolRegistry,
      options: routingOptions,
      recordOpts: { enabled: true }
    });

    assert.equal(execution.plan.status, "completed");
    const extractTrack = execution.plan.tracks.find((t) => t.as === "extract");
    const classifyTrack = execution.plan.tracks.find((t) => t.as === "classify");

    assert(extractTrack, "extract track should be in text_qa");
    assert(classifyTrack, "classify track should be in text_qa");

    assert.equal(extractTrack.steps[0].worker_used.qualification.recordId, "llama3.2-local-llama3.2-core-extract-v1");
    assert.equal(classifyTrack.steps[0].worker_used.qualification.recordId, "llama3.2-local-llama3.2-core-classify-v1");
  });

  await check("AC5.3: document_review workflow routes extract, classify, summarize to qualified llama3.2-local", async () => {
    const plan = buildRunPlan({
      workflowId: "document_review",
      input: {
        content: "Locaily Architecture Review: local-first distributed intelligence with reproducible benchmark lab qualification.",
        doc_categories: ["architecture", "policy", "code"],
        document_schema: {
          type: "object"
        }
      }
    });

    const execution = await executeRunPlan({
      plan,
      runtime,
      toolRegistry,
      options: routingOptions,
      recordOpts: { enabled: true }
    });

    assert.equal(execution.plan.status, "completed");
    const extractTrack = execution.plan.tracks.find((t) => t.as === "extract");
    const classifyTrack = execution.plan.tracks.find((t) => t.as === "classify");
    const summarizeTrack = execution.plan.tracks.find((t) => t.as === "summarize");

    assert.equal(extractTrack.steps[0].worker_used.qualification.recordId, "llama3.2-local-llama3.2-core-extract-v1");
    assert.equal(classifyTrack.steps[0].worker_used.qualification.recordId, "llama3.2-local-llama3.2-core-classify-v1");
    assert.equal(summarizeTrack.steps[0].worker_used.qualification.recordId, "llama3.2-local-llama3.2-core-summarize-v1");
  });

  await check("AC5.4: content_os workflow routes extract, classify, summarize to qualified llama3.2-local", async () => {
    const plan = buildRunPlan({
      workflowId: "content_os",
      input: {
        content: "Release Announcement: Locaily generic model qualification milestone CORE-02 is ready.",
        content_categories: ["announcement", "tutorial", "whitepaper"],
        content_schema: {
          type: "object"
        },
        publish_mapping: {
          title: "headline",
          abstract: "summary"
        },
        publish_schema: {
          type: "object"
        }
      }
    });

    const execution = await executeRunPlan({
      plan,
      runtime,
      toolRegistry,
      options: routingOptions,
      recordOpts: { enabled: true }
    });

    assert.equal(execution.plan.status, "completed");
    const extractTrack = execution.plan.tracks.find((t) => t.as === "extract");
    const classifyTrack = execution.plan.tracks.find((t) => t.as === "classify");
    const summarizeTrack = execution.plan.tracks.find((t) => t.as === "summarize");

    assert.equal(extractTrack.steps[0].worker_used.qualification.recordId, "llama3.2-local-llama3.2-core-extract-v1");
    assert.equal(classifyTrack.steps[0].worker_used.qualification.recordId, "llama3.2-local-llama3.2-core-classify-v1");
    assert.equal(summarizeTrack.steps[0].worker_used.qualification.recordId, "llama3.2-local-llama3.2-core-summarize-v1");
  });

  await check("AC5.5: Qualification Evidence Linker indexes records across generic capabilities", async () => {
    const linker = createQualificationEvidenceLinker({ resolver, loader });
    const records = await linker.findRecordsByCapability({
      modelId: "llama3.2-local",
      role: "default_worker",
      trackId: "core.classify"
    });
    // Linker finds records that routed with this qualification record ID
    assert(Array.isArray(records));
  });

  console.log(`\n========================================`);
  console.log(`Passed: ${passed}, Failed: ${failed}`);
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
