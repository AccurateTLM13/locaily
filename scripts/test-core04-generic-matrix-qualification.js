#!/usr/bin/env node
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { runSuite } = require("../benchmark-lab/engine/runners/suite-runner");
const { createModelQualificationLoader } = require("../companion/core/model-qualification-loader");
const { createQualificationResolver } = require("../companion/core/qualification-resolver");
const { createShadowRouter } = require("../companion/core/shadow-routing");
const { createToolRegistry } = require("../companion/tools/registry");
const { createMockRuntime } = require("../companion/providers/router");
const { buildRunPlan, executeRunPlan } = require("../companion/orchestration");
const { validateResult } = require("../companion/core/result-validator");

const ROOT = path.resolve(__dirname, "..");
const LAB_ROOT = path.join(ROOT, "benchmark-lab");

const PROMOTED_SCHEMA = require("../benchmark-lab/schemas/promoted-evidence.schema.json");
const APPROVED_SCHEMA = require("../benchmark-lab/schemas/approved-evidence-summary.schema.json");

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
  console.log("=== CORE-04 Complete Generic Capability Matrix Qualification Tests ===\n");

  const loader = createModelQualificationLoader();
  const resolver = createQualificationResolver({ loader });
  const shadowRouter = createShadowRouter({ resolver });
  const toolRegistry = createToolRegistry();

  const getModelQualificationEvidence = ({ model, role, trackId, contractId }) => {
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
  };

  // AC 1: lfm25-1p2b-thinking-local on core-extract-v1
  await check("AC1: core-extract-v1 suite evaluates lfm25-1p2b-thinking-local and generates approved evidence", async () => {
    const suitePath = path.join(LAB_ROOT, "locaily", "tracks", "core-extract", "suite.json");
    const runResult = await runSuite({
      suitePath,
      modelManifest: "lfm25-1p2b-thinking-local"
    });
    assert(runResult.summary, "Suite should produce summary");
    assert.equal(runResult.summary.passed, 3, "All 3 strata should pass");
    assert.equal(runResult.summary.failed, 0);

    const evidencePath = path.join(LAB_ROOT, "evidence", "summaries", "lfm25-1p2b-core-extract-v1.json");
    assert(fs.existsSync(evidencePath), "Promoted evidence should exist");
    const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
    const val = validateResult(evidence, PROMOTED_SCHEMA, "promoted evidence");
    assert(val.ok, `Evidence schema invalid: ${val.errors.join("; ")}`);
    assert.equal(evidence.trackId, "core.extract");

    const approvedPath = path.join(LAB_ROOT, "evidence", "approved", "lfm25-1p2b-core-extract-v1.json");
    assert(fs.existsSync(approvedPath), "Approved summary should exist");
    const approved = JSON.parse(fs.readFileSync(approvedPath, "utf8"));
    const appVal = validateResult(approved, APPROVED_SCHEMA, "approved summary");
    assert(appVal.ok, `Approved summary schema invalid: ${appVal.errors.join("; ")}`);
  });

  // AC 2: lfm25-1p2b-instruct-local on core.classify, core.summarize, core.extract
  await check("AC2: lfm25-1p2b-instruct-local passes all 3 generic suites with approved evidence", async () => {
    const suites = [
      { track: "core.classify", file: "core-classify", id: "lfm25-1p2b-instruct-core-classify-v1" },
      { track: "core.summarize", file: "core-summarize", id: "lfm25-1p2b-instruct-core-summarize-v1" },
      { track: "core.extract", file: "core-extract", id: "lfm25-1p2b-instruct-core-extract-v1" }
    ];

    for (const s of suites) {
      const suitePath = path.join(LAB_ROOT, "locaily", "tracks", s.file, "suite.json");
      const runResult = await runSuite({
        suitePath,
        modelManifest: "lfm25-1p2b-instruct-local"
      });
      assert.equal(runResult.summary.passed, 3, `Suite ${s.file} should pass 3/3`);

      const evPath = path.join(LAB_ROOT, "evidence", "summaries", `${s.id}.json`);
      assert(fs.existsSync(evPath), `Promoted evidence for ${s.id} should exist`);
      const ev = JSON.parse(fs.readFileSync(evPath, "utf8"));
      assert.equal(ev.trackId, s.track);

      const appPath = path.join(LAB_ROOT, "evidence", "approved", `${s.id}.json`);
      assert(fs.existsSync(appPath), `Approved summary for ${s.id} should exist`);
    }
  });

  // AC 3: lfm25-350m-local on core.classify
  await check("AC3: lfm25-350m-local passes core-classify-v1 with approved evidence (edge worker)", async () => {
    const suitePath = path.join(LAB_ROOT, "locaily", "tracks", "core-classify", "suite.json");
    const runResult = await runSuite({
      suitePath,
      modelManifest: "lfm25-350m-local"
    });
    assert.equal(runResult.summary.passed, 3, "lfm25-350m-local should pass 3/3");

    const evPath = path.join(LAB_ROOT, "evidence", "summaries", "lfm25-350m-core-classify-v1.json");
    assert(fs.existsSync(evPath));
    const appPath = path.join(LAB_ROOT, "evidence", "approved", "lfm25-350m-core-classify-v1.json");
    assert(fs.existsSync(appPath));
  });

  // AC 4: Model Qualifications & Manifest Integrity
  await check("AC4: Qualification records loaded with verified checksums and updated model manifests", async () => {
    const status = loader.getStatus();
    assert.equal(status.checksumVerification.failed, 0, "No checksum failures allowed");

    // lfm25-1p2b-thinking-local on core.extract
    const resThinkingExtract = resolver.resolveForCapability({
      modelId: "lfm25-1p2b-thinking-local",
      role: "default_worker",
      trackId: "core.extract"
    });
    assert.equal(resThinkingExtract.state, "qualified");

    // lfm25-1p2b-instruct-local on all 3 generic tracks
    for (const trackId of ["core.classify", "core.summarize", "core.extract"]) {
      const resInstruct = resolver.resolveForCapability({
        modelId: "lfm25-1p2b-instruct-local",
        role: "fast_worker",
        trackId
      });
      assert.equal(resInstruct.state, "qualified", `${trackId} fast_worker should be qualified for instruct`);
    }

    // lfm25-350m-local on core.classify edge_worker
    const res350m = resolver.resolveForCapability({
      modelId: "lfm25-350m-local",
      role: "edge_worker",
      trackId: "core.classify"
    });
    assert.equal(res350m.state, "qualified", "lfm25-350m should be qualified as edge_worker on core.classify");

    // Manifests check
    const mThinking = JSON.parse(fs.readFileSync(path.join(LAB_ROOT, "models", "manifests", "lfm25-1p2b-thinking-local.json"), "utf8"));
    assert(mThinking.capabilities.includes("generic-extraction"));
    assert.equal(mThinking.qualifications["core.extract"].default_worker, "qualified");

    const mInstruct = JSON.parse(fs.readFileSync(path.join(LAB_ROOT, "models", "manifests", "lfm25-1p2b-instruct-local.json"), "utf8"));
    assert(mInstruct.capabilities.includes("generic-extraction"));
    assert.equal(mInstruct.qualifications["core.extract"].fast_worker, "qualified");

    const m350m = JSON.parse(fs.readFileSync(path.join(LAB_ROOT, "models", "manifests", "lfm25-350m-local.json"), "utf8"));
    assert(m350m.capabilities.includes("generic-classification"));
    assert.equal(m350m.qualifications["core.classify"].edge_worker, "qualified");
  });

  // AC 5: core.extract runtime fallback
  await check("AC5: Execution of core.extract automatically falls back when primary model fails", async () => {
    const baseRuntime = createMockRuntime();

    let llamaAttempts = 0;
    let fallbackAttempts = 0;

    const failingRuntime = {
      async generateJson(prompt, schema, options = {}) {
        if (options.model === "llama3.2-local") {
          llamaAttempts += 1;
          const err = new Error("Primary model llama3.2-local is unavailable (simulated timeout/out-of-memory).");
          err.code = "MODEL_RUNTIME_ERROR";
          throw err;
        }
        fallbackAttempts += 1;
        return baseRuntime.generateJson(prompt, schema, options);
      }
    };

    const routingOptionsWithFallback = {
      model: "llama3.2-local",
      resolveModelForRole: (role) => ({ ok: true, model: "llama3.2-local" }),
      shadowRouter: (params) => shadowRouter.computeShadowRecommendation(params),
      getModelQualificationEvidence
    };

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
      runtime: failingRuntime,
      toolRegistry,
      options: routingOptionsWithFallback,
      recordOpts: { enabled: true }
    });

    assert.equal(execution.plan.status, "completed", "Plan should complete despite primary model failure");
    assert(llamaAttempts > 0, "Primary model should have been attempted");
    assert(fallbackAttempts > 0, "Fallback model should have been invoked");

    const extractTrack = execution.plan.tracks.find((t) => t.as === "extract");
    assert(extractTrack, "extract track should be in text_qa");
    const extractStep = extractTrack.steps[0];

    assert.equal(extractStep.worker_used.fallback, true, "extract step should use fallback");
    assert(extractStep.worker_used.fallbackReason.includes("failed"), "fallbackReason should be recorded");
    assert(
      ["lfm25-1p2b-thinking-local", "lfm25-1p2b-instruct-local"].includes(extractStep.worker_used.model),
      "Step should have fallen back to a qualified model"
    );
    assert(extractStep.worker_used.qualification.recordId.includes("core-extract-v1"), "Qualification should link to core-extract");

    // Parent evidence
    assert(execution.evidence, "Parent evidence should be recorded");
    assert.equal(execution.evidence.fallbackUsed, true, "Workflow run should record fallbackUsed: true");
  });

  console.log("\n========================================");
  console.log(`Passed: ${passed}, Failed: ${failed}`);
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
