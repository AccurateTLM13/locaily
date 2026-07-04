const path = require("node:path");
const { readJson } = require("../benchmark-lab/engine/fs-utils");
const { validateSchema } = require("../benchmark-lab/engine/schema-validator");

const ROOT = path.resolve(__dirname, "..");

const FIXTURES = [
  {
    schema: "benchmark-suite.schema.json",
    valid: "benchmark-suite.valid.json",
    invalid: "benchmark-suite.invalid.json",
    expectedInvalidFragment: "schemaVersion"
  },
  {
    schema: "benchmark-case.schema.json",
    valid: "benchmark-case.valid.json",
    invalid: "benchmark-case.invalid.json",
    expectedInvalidFragment: "difficulty"
  },
  {
    schema: "benchmark-run-summary.schema.json",
    valid: "benchmark-run-summary.valid.json",
    invalid: "benchmark-run-summary.invalid.json",
    expectedInvalidFragment: "startedAt"
  },
  {
    schema: "approved-evidence-summary.schema.json",
    valid: "approved-evidence-summary.valid.json",
    invalid: "approved-evidence-summary.invalid.json",
    expectedInvalidFragment: "approvedAt"
  },
  {
    schema: "model-card-source-data.schema.json",
    valid: "model-card-source-data.valid.json",
    invalid: "model-card-source-data.invalid.json",
    expectedInvalidFragment: "status"
  },
  {
    schema: "qualification-record.schema.json",
    valid: "qualification-record.valid.json",
    invalid: "qualification-record.invalid.json",
    expectedInvalidFragment: "recordId"
  },
  {
    schema: "benchmark-review.schema.json",
    valid: "benchmark-review.valid.json",
    invalid: "benchmark-review.invalid.json",
    expectedInvalidFragment: "reviewedAt"
  },
  {
    schema: "promoted-evidence.schema.json",
    valid: "promoted-evidence.valid.json",
    invalid: "promoted-evidence.invalid.json",
    expectedInvalidFragment: "evidenceId"
  },
  {
    schema: "benchmark-comparison.schema.json",
    valid: "benchmark-comparison.valid.json",
    invalid: "benchmark-comparison.invalid.json",
    expectedInvalidFragment: "comparisonId"
  },
  {
    schema: "benchmark-matrix.schema.json",
    valid: "benchmark-matrix.valid.json",
    invalid: "benchmark-matrix.invalid.json",
    expectedInvalidFragment: "matrixId"
  },
  {
    schema: "model-manifest.schema.json",
    valid: "model-manifest.valid.json",
    invalid: "model-manifest.invalid.json",
    expectedInvalidFragment: "modelId"
  },
  {
    schema: "hardware-profile.schema.json",
    valid: "hardware-profile.valid.json",
    invalid: "hardware-profile.invalid.json",
    expectedInvalidFragment: "capturedAt"
  },
  {
    schema: "benchmark-report-source.schema.json",
    valid: "benchmark-report-source.valid.json",
    invalid: "benchmark-report-source.invalid.json",
    expectedInvalidFragment: "reportId"
  }
];

async function main() {
  for (const fixture of FIXTURES) {
    const schema = await readJson(path.join(ROOT, "benchmark-lab", "schemas", fixture.schema));
    const valid = await readJson(path.join(ROOT, "benchmark-lab", "schemas", "fixtures", fixture.valid));
    const invalid = await readJson(path.join(ROOT, "benchmark-lab", "schemas", "fixtures", fixture.invalid));

    const validResult = validateSchema(valid, schema, fixture.valid);
    assert(validResult.ok, `${fixture.valid} should pass: ${validResult.errors.join(" ")}`);

    const invalidResult = validateSchema(invalid, schema, fixture.invalid);
    assert(!invalidResult.ok, `${fixture.invalid} should fail.`);
    assert(
      invalidResult.errors.some((error) => error.includes(fixture.expectedInvalidFragment)),
      `${fixture.invalid} should fail for ${fixture.expectedInvalidFragment}; got ${invalidResult.errors.join(" ")}`
    );

    console.log(`ok ${fixture.schema}`);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
