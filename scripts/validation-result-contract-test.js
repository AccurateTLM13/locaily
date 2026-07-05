const assert = require("node:assert/strict");
const { validateResult } = require("../companion/core/result-validator");
const {
  isVerificationGateStep,
  validateStepOutput
} = require("../companion/orchestration/run-plan-validator");
const { loadTrack } = require("../companion/crew/decomposer");
const { dealSniperTool } = require("../companion/tools/deal-sniper");
const lighthouseParser = require("../tool-packs/lighthouse-parser-pack/index");
const standardText = require("../tool-packs/standard-text-pack/index");
const dealSniperOutputSchema = require("../companion/schemas/deal-sniper.schema.json");

const workflowVerificationSchema = require("../companion/schemas/internal/workflow-verification-result.schema.json");
const engineSchemaValidationSchema = require("../companion/schemas/internal/engine-schema-validation-result.schema.json");
const priorityFixReviewSchema = require("../companion/schemas/internal/priority-fix-review-result.schema.json");
const orchestrationStepGateSchema = require("../companion/schemas/internal/orchestration-step-gate-result.schema.json");
const deprecatedValidationAlias = require("../companion/schemas/internal/validation-result.schema.json");

function assertSchemaValid(label, value, schema) {
  const validation = validateResult(value, schema, label);
  assert(validation.ok, `${label} failed schema validation: ${validation.errors.join("; ")}`);
}

async function checkWorkflowVerificationProducers() {
  const verifyHandoff = await lighthouseParser["lighthouse.verify_handoff"].handle({
    input: {
      handoff: {
        clientSummary: "ok",
        developerSummary: "ok",
        priorityFixes: [],
        handoffChecklist: [],
        estimatedImpact: "low"
      }
    }
  });
  assertSchemaValid("lighthouse.verify_handoff", verifyHandoff, workflowVerificationSchema);

  const validateAnalysis = dealSniperTool.handle({
    task: "validate-analysis",
    input: {
      analysis: {
        dealScore: 72,
        riskLevel: "medium",
        summary: "Test listing",
        redFlags: [],
        positiveSignals: ["Good price"],
        negotiationTip: "Offer below ask",
        nextAction: "negotiate"
      }
    },
    runtime: null,
    options: {}
  });
  assertSchemaValid("deal-sniper.validate-analysis", await validateAnalysis, workflowVerificationSchema);

  const textValidate = await standardText["text.validate_schema"].handle({
    input: {
      data: { title: "Example" },
      schema: {
        type: "object",
        required: ["title"],
        properties: { title: { type: "string" } }
      }
    }
  });
  assertSchemaValid("text.validate_schema", textValidate, workflowVerificationSchema);
}

async function checkPriorityFixReviewProducer() {
  const review = await lighthouseParser["lighthouse.validate_priority_fixes"].handle({
    input: {
      thinking: "Review priorities against fixture audits.",
      priorityFixes: [
        {
          title: "Reduce unused JavaScript",
          priority: "high",
          reason: "Large unused bundle."
        }
      ],
      opportunities: [
        {
          id: "unused-javascript",
          title: "Reduce unused JavaScript",
          score: 0.5,
          category: "performance"
        }
      ]
    }
  });

  assertSchemaValid("lighthouse.validate_priority_fixes", review, priorityFixReviewSchema);
  assert(Array.isArray(review.needsReview), "Expected needsReview array on content review result.");
  assert(!Object.prototype.hasOwnProperty.call(review, "valid"), "Priority fix review must not use verification valid flag.");
}

function checkEngineSchemaValidationShape() {
  const pass = validateResult({ summary: "ok" }, {
    type: "object",
    required: ["summary"],
    properties: { summary: { type: "string" } }
  });
  assertSchemaValid("validateResult.pass", pass, engineSchemaValidationSchema);

  const fail = validateResult({}, {
    type: "object",
    required: ["summary"],
    properties: { summary: { type: "string" } }
  });
  assertSchemaValid("validateResult.fail", fail, engineSchemaValidationSchema);
  assert(fail.ok === false, "Expected failed engine validation.");
}

function checkOrchestrationStepGateShape() {
  const lighthouseTrack = loadTrack("website_audit.lighthouse_handoff");
  const dealsniperTrack = loadTrack("marketplace.dealsniper");
  const verifyTrackStep = lighthouseTrack.steps.find((step) => step.id === "verify_output");
  const validateAnalysisTrackStep = dealsniperTrack.steps.find((step) => step.id === "validate_analysis");
  const priorityFixTrackStep = lighthouseTrack.steps.find((step) => step.id === "validate_priority_fixes");

  const verificationPass = validateStepOutput(
    { step_id: "verify_output" },
    { valid: true, errors: [] },
    verifyTrackStep,
    lighthouseTrack
  );
  assertSchemaValid("validateStepOutput.verification-pass", verificationPass, orchestrationStepGateSchema);
  assert(verificationPass.ok, "Expected valid verification output to pass step gate.");

  const verificationFail = validateStepOutput(
    { step_id: "verify_output" },
    { valid: false, errors: ["handoff.clientSummary is required."] },
    verifyTrackStep,
    lighthouseTrack
  );
  assertSchemaValid("validateStepOutput.verification-fail", verificationFail, orchestrationStepGateSchema);
  assert.equal(verificationFail.code, "STEP_VERIFICATION_FAILED", "Expected legitimate verification failure code.");
  assert.notEqual(verificationFail.code, "WORKFLOW_VERIFICATION_RESULT_INVALID");

  const malformedMissingValid = validateStepOutput(
    { step_id: "verify_output" },
    { errors: [] },
    verifyTrackStep,
    lighthouseTrack
  );
  assert.equal(malformedMissingValid.code, "WORKFLOW_VERIFICATION_RESULT_INVALID");
  assert(malformedMissingValid.validation && malformedMissingValid.validation.ok === false);

  const malformedErrorsShape = validateStepOutput(
    { step_id: "validate_analysis" },
    { valid: true, errors: "not-an-array" },
    validateAnalysisTrackStep,
    dealsniperTrack
  );
  assert.equal(malformedErrorsShape.code, "WORKFLOW_VERIFICATION_RESULT_INVALID");
  assert.equal(malformedErrorsShape.toolId, "deal-sniper");

  const priorityFixReview = validateStepOutput(
    { step_id: "validate_priority_fixes" },
    { thinking: "review", priorityFixes: [], needsReview: [] },
    priorityFixTrackStep,
    lighthouseTrack
  );
  assert(priorityFixReview.ok, "validate_priority_fixes must not be checked as workflow verification.");
  assert(!isVerificationGateStep({ step_id: "validate_priority_fixes" }, lighthouseTrack));

  const schemaGate = validateStepOutput(
    { step_id: "prioritize_fixes" },
    { thinking: "x", priorityFixes: [] },
    {
      executor: {
        type: "model",
        schema: "companion/crew/schemas/prioritize-fixes.schema.json"
      }
    },
    lighthouseTrack
  );
  assertSchemaValid("validateStepOutput.model-pass", schemaGate, orchestrationStepGateSchema);
}

function checkDeprecatedAliasMatchesWorkflowVerification() {
  const sample = { valid: true, errors: [] };
  assertSchemaValid("deprecated-alias", sample, deprecatedValidationAlias);
}

function checkContractsAreDistinct() {
  const engine = validateResult({}, dealSniperOutputSchema);
  assert(!Object.prototype.hasOwnProperty.call(engine, "valid"), "Engine result uses ok, not valid.");
  assert(typeof engine.ok === "boolean", "Engine result must expose ok boolean.");
}

async function main() {
  await checkWorkflowVerificationProducers();
  await checkPriorityFixReviewProducer();
  checkEngineSchemaValidationShape();
  checkOrchestrationStepGateShape();
  checkDeprecatedAliasMatchesWorkflowVerification();
  checkContractsAreDistinct();
  console.log("Validation result contract tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
