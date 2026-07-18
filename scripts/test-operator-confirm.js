const assert = require("node:assert");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { evaluateExecutionOutcome } = require("../companion/jobs/job-outcome");

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`PASS: ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL: ${name}`);
    console.error(`  ${error.message}`);
  }
}

function run() {
  const appJs = readFileSync(join(__dirname, "..", "companion", "operator", "app.js"), "utf8");

  check("operator app checks confirmResult.confirmed before destructive actions", () => {
    assert.match(appJs, /if\s*\(\s*!confirmResult\.confirmed\s*\)\s*return/);
    assert.doesNotMatch(appJs, /if\s*\(\s*!confirmed\s*\)\s*return/);
  });

  check("operator enqueue payload uses executionType contract", () => {
    assert.match(appJs, /executionType:\s*type/);
    assert.doesNotMatch(appJs, /\{\s*type:\s*type,\s*input:\s*input\s*\}/);
  });

  check("showConfirm resolves confirmed false on cancel", () => {
    assert.match(appJs, /resolve\(\{\s*confirmed:\s*false\s*\}\)/);
  });

  check("showConfirm resolves confirmed true with optional reason on ok", () => {
    assert.match(appJs, /resolve\(\{\s*confirmed:\s*true,\s*reason:/);
  });

  check("Escape key routes to cancel handler", () => {
    assert.match(appJs, /if\s*\(\s*e\.key\s*===\s*"Escape"\s*\)\s*onCancel\(\)/);
  });

  check("evaluateExecutionOutcome fails failed workflow status", () => {
    const outcome = evaluateExecutionOutcome({
      plan: { status: "failed" },
      schemaValid: true,
      validation: { ok: true }
    }, "workflow");
    assert.strictEqual(outcome.ok, false);
    assert.strictEqual(outcome.code, "WORKFLOW_FAILED");
  });

  check("evaluateExecutionOutcome fails invalid workflow schema", () => {
    const outcome = evaluateExecutionOutcome({
      plan: { status: "completed" },
      schemaValid: false,
      validation: { ok: true }
    }, "workflow");
    assert.strictEqual(outcome.ok, false);
    assert.strictEqual(outcome.code, "SCHEMA_VALIDATION_FAILED");
  });

  check("evaluateExecutionOutcome fails invalid track schema", () => {
    const outcome = evaluateExecutionOutcome({
      track_id: "test.track",
      schemaValid: false,
      result: { meta: { verification: { valid: true } } }
    }, "track");
    assert.strictEqual(outcome.ok, false);
    assert.strictEqual(outcome.code, "SCHEMA_VALIDATION_FAILED");
  });

  check("evaluateExecutionOutcome fails track verification errors", () => {
    const outcome = evaluateExecutionOutcome({
      track_id: "test.track",
      schemaValid: true,
      result: { meta: { verification: { valid: false, errors: ["bad field"] } } }
    }, "track");
    assert.strictEqual(outcome.ok, false);
    assert.strictEqual(outcome.code, "OUTPUT_VALIDATION_FAILED");
  });

  check("evaluateExecutionOutcome accepts successful workflow", () => {
    const outcome = evaluateExecutionOutcome({
      plan: { status: "completed" },
      schemaValid: true,
      validation: { ok: true }
    }, "workflow");
    assert.strictEqual(outcome.ok, true);
  });

  check("evaluateExecutionOutcome accepts successful track", () => {
    const outcome = evaluateExecutionOutcome({
      track_id: "test.track",
      schemaValid: true,
      result: { meta: { verification: { valid: true } } }
    }, "track");
    assert.strictEqual(outcome.ok, true);
  });

  console.log(`\nOperator confirm/outcome tests: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
