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
const QUAL_SCHEMA = require("../benchmark-lab/schemas/qualification-record.schema.json");

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
  console.log("=== CORE-03 Multi-Model Fallback Qualification & Routing Tests ===\n");

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

  // AC 1: core-classify-v1 suite evaluates lfm25-1p2b-thinking-local
  await check("AC1: core-classify-v1 suite evaluates lfm25-1p2b-thinking-local and generates approved evidence", async () => {
    const suitePath = path.join(LAB_ROOT, "locaily", "tracks", "core-classify", "suite.json");
    const runResult = await runSuite({
      suitePath,
      modelManifest: "lfm25-1p2b-thinking-local"
    });
    assert(runResult.summary, "Suite should produce summary");
    assert.equal(runResult.summary.passed, 3, "All 3 strata should pass");
    assert.equal(runResult.summary.failed, 0);

    const evidencePath = path.join(LAB_ROOT, "evidence", "summaries", "lfm25-1p2b-core-classify-v1.json");
    assert(fs.existsSync(evidencePath), "Promoted evidence summary should exist");
    const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
    const val = validateResult(evidence, PROMOTED_SCHEMA, "promoted evidence");
    assert(val.ok, `Evidence schema invalid: ${val.errors.join("; ")}`);
    assert.equal(evidence.trackId, "core.classify");
    assert.equal(evidence.suiteId, "core-classify-v1");

    const approvedPath = path.join(LAB_ROOT, "evidence", "approved", "lfm25-1p2b-core-classify-v1.json");
    assert(fs.existsSync(approvedPath), "Approved summary should exist");
    const approved = JSON.parse(fs.readFileSync(approvedPath, "utf8"));
    const appVal = validateResult(approved, APPROVED_SCHEMA, "approved summary");
    assert(appVal.ok, `Approved summary schema invalid: ${appVal.errors.join("; ")}`);
  });

  // AC 2: core-summarize-v1 suite evaluates lfm25-1p2b-thinking-local
  await check("AC2: core-summarize-v1 suite evaluates lfm25-1p2b-thinking-local and generates approved evidence", async () => {
    const suitePath = path.join(LAB_ROOT, "locaily", "tracks", "core-summarize", "suite.json");
    const runResult = await runSuite({
      suitePath,
      modelManifest: "lfm25-1p2b-thinking-local"
    });
    assert(runResult.summary, "Suite should produce summary");
    assert.equal(runResult.summary.passed, 3, "All 3 strata should pass");
    assert.equal(runResult.summary.failed, 0);

    const evidencePath = path.join(LAB_ROOT, "evidence", "summaries", "lfm25-1p2b-core-summarize-v1.json");
    assert(fs.existsSync(evidencePath), "Promoted evidence summary should exist");
    const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
    const val = validateResult(evidence, PROMOTED_SCHEMA, "promoted evidence");
    assert(val.ok, `Evidence schema invalid: ${val.errors.join("; ")}`);
    assert.equal(evidence.trackId, "core.summarize");
    assert.equal(evidence.suiteId, "core-summarize-v1");

    const approvedPath = path.join(LAB_ROOT, "evidence", "approved", "lfm25-1p2b-core-summarize-v1.json");
    assert(fs.existsSync(approvedPath), "Approved summary should exist");
    const approved = JSON.parse(fs.readFileSync(approvedPath, "utf8"));
    const appVal = validateResult(approved, APPROVED_SCHEMA, "approved summary");
    assert(appVal.ok, `Approved summary schema invalid: ${appVal.errors.join("; ")}`);
  });

  // AC 3: Qualification records loaded with canonical checksums for lfm25-1p2b-thinking-local
  await check("AC3: Qualification records loaded with canonical checksums for core.classify and core.summarize", async () => {
    const status = loader.getStatus();
    assert.equal(status.checksumVerification.failed, 0, "No checksum failures allowed");

    for (const trackId of ["core.classify", "core.summarize"]) {
      for (const role of ["default_worker", "fast_worker"]) {
        const resolution = resolver.resolveForCapability({
          modelId: "lfm25-1p2b-thinking-local",
          role,
          trackId
        });
        assert.equal(resolution.state, "qualified", `${trackId} (${role}) should be qualified for lfm25-1p2b-thinking-local`);
        assert(resolution.capabilities.length > 0, `Capability should be registered for ${trackId}`);
        assert.equal(resolution.capabilities[0].score, 1, `Score should be 1.0 for ${trackId}`);
      }
    }

    const manifestPath = path.join(LAB_ROOT, "models", "manifests", "lfm25-1p2b-thinking-local.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    assert(manifest.capabilities.includes("generic-classification"), "Manifest should include generic-classification");
    assert(manifest.capabilities.includes("generic-summarization"), "Manifest should include generic-summarization");
    assert.equal(manifest.qualifications["core.classify"].default_worker, "qualified");
    assert.equal(manifest.qualifications["core.summarize"].default_worker, "qualified");
  });

  // AC 4: Shadow router computes recommendations with valid fallback recommendation
  await check("AC4: Shadow router computes recommendations with valid fallback when multiple qualified models exist", async () => {
    // When primary is llama3.2-local, lfm25-1p2b-thinking-local is secondary fallback
    const recAgree = shadowRouter.computeShadowRecommendation({
      role: "default_worker",
      trackId: "core.classify",
      currentModelId: "llama3.2-local",
      currentQualification: { recordId: "llama3.2-local-llama3.2-core-classify-v1", status: "qualified", score: 1.0 }
    });

    assert.equal(recAgree.comparison, "agree");
    assert.equal(recAgree.recommendedCapabilityId, "llama3.2-local");
    assert(recAgree.fallbackRecommendation !== null, "Fallback recommendation should not be null when multiple qualified models exist");
    assert.equal(recAgree.fallbackRecommendation, "lfm25-1p2b-thinking-local", "Should recommend lfm25-1p2b-thinking-local as fallback");

    // When primary is an untested or different model
    const recDisagree = shadowRouter.computeShadowRecommendation({
      role: "default_worker",
      trackId: "core.summarize",
      currentModelId: "untested-custom-model",
      currentQualification: null
    });

    assert.equal(recDisagree.comparison, "disagree");
    assert(recDisagree.recommendedCapabilityId === "llama3.2-local" || recDisagree.recommendedCapabilityId === "lfm25-1p2b-thinking-local");
    assert(recDisagree.fallbackRecommendation !== null, "Fallback recommendation should be present");
    assert(
      recDisagree.fallbackRecommendation === "lfm25-1p2b-thinking-local" || recDisagree.fallbackRecommendation === "llama3.2-local",
      "Fallback should be one of the qualified models"
    );
  });

  // AC 5: Runtime Fallback Execution
  await check("AC5: Execution automatically falls back to secondary qualified model when primary fails", async () => {
    const baseRuntime = createMockRuntime();

    // Create a runtime where llama3.2-local throws an execution failure, but lfm25-1p2b-thinking-local succeeds
    let llamaAttempts = 0;
    let lfm25Attempts = 0;

    const failingRuntime = {
      async generateJson(prompt, schema, options = {}) {
        if (options.model === "llama3.2-local") {
          llamaAttempts += 1;
          const err = new Error("Primary model llama3.2-local is unavailable (simulated timeout/out-of-memory).");
          err.code = "MODEL_RUNTIME_ERROR";
          throw err;
        }
        if (options.model === "lfm25-1p2b-thinking-local") {
          lfm25Attempts += 1;
          return baseRuntime.generateJson(prompt, schema, options);
        }
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
      workflowId: "repo_review",
      input: {
        files: [{ path: "lib/auth.js", lines: 250 }],
        findings: [{ id: "f1", title: "Hardcoded secret", kind: "security", severity: 10, effort: 1 }]
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
    assert(lfm25Attempts > 0, "Secondary fallback model should have been invoked");

    const classifyTrack = execution.plan.tracks.find((t) => t.as === "classify");
    const summarizeTrack = execution.plan.tracks.find((t) => t.as === "summarize");

    assert(classifyTrack, "classify track should be present");
    assert(summarizeTrack, "summarize track should be present");

    const classifyStep = classifyTrack.steps[0];
    assert.equal(classifyStep.worker_used.model, "lfm25-1p2b-thinking-local", "Step should have used fallback model");
    assert.equal(classifyStep.worker_used.fallback, true, "fallback flag should be true");
    assert(classifyStep.worker_used.fallbackReason.includes("failed"), "fallbackReason should explain failure");
    assert.equal(
      classifyStep.worker_used.qualification.recordId,
      "lfm25-1p2b-thinking-local-lfm25-1p2b-core-classify-v1",
      "Qualification should update to fallback model's qualification record"
    );

    const summarizeStep = summarizeTrack.steps[0];
    assert.equal(summarizeStep.worker_used.model, "lfm25-1p2b-thinking-local");
    assert.equal(summarizeStep.worker_used.fallback, true);
    assert.equal(
      summarizeStep.worker_used.qualification.recordId,
      "lfm25-1p2b-thinking-local-lfm25-1p2b-core-summarize-v1"
    );

    // Verify emitted Track Run Record evidence
    assert(execution.evidence, "Evidence should be recorded");
    assert.equal(execution.evidence.fallbackUsed, true, "Parent workflow Track Run Record should record fallbackUsed: true");
    assert(execution.evidence.fallbackReason, "Parent workflow Track Run Record should record fallbackReason");
    assert(execution.evidence.childRuns.length > 0, "Child runs should be recorded");

    const classifyChild = execution.evidence.childRuns.find(
      (c) => (c.routing && c.routing.capabilityId === "text.classify") || c.capabilityId === "text.classify"
    );
    assert(classifyChild, "Classify child run should be present");
    assert.equal(classifyChild.execution.fallbackUsed, true, "Child step should record fallbackUsed: true");
    assert.equal(
      classifyChild.routing.qualificationRecordId,
      "lfm25-1p2b-thinking-local-lfm25-1p2b-core-classify-v1",
      "Child record should link to fallback qualification"
    );
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
