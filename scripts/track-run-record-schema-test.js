const path = require("node:path");
const { readJson } = require("../benchmark-lab/engine/fs-utils");
const { validateSchema } = require("../benchmark-lab/engine/schema-validator");

const ROOT = path.resolve(__dirname, "..");

const FIXTURES = [
  {
    label: "model execution record",
    schema: "companion/evidence/schemas/track-run-record.schema.json",
    valid: "companion/evidence/schemas/fixtures/track-run-record.valid.json",
    invalid: "companion/evidence/schemas/fixtures/track-run-record.invalid.json",
    expectedInvalidFragments: ["recordId", "trackId", "executorType", "status", "timestamps.createdAt", "extraField"]
  },
  {
    label: "transform execution record",
    schema: "companion/evidence/schemas/track-run-record.schema.json",
    valid: "companion/evidence/schemas/fixtures/track-run-record.transform.valid.json"
  },
  {
    label: "hybrid record with children",
    schema: "companion/evidence/schemas/track-run-record.schema.json",
    valid: "companion/evidence/schemas/fixtures/track-run-record.hybrid.valid.json"
  }
];

async function main() {
  for (const fixture of FIXTURES) {
    const schema = await readJson(path.join(ROOT, fixture.schema));

    // Valid
    const valid = await readJson(path.join(ROOT, fixture.valid));
    const validResult = validateSchema(valid, schema, fixture.valid);
    assert(validResult.ok, `${fixture.label}: valid should pass. Errors: ${validResult.errors.join(" ")}`);
    console.log(`ok ${fixture.label} (valid)`);

    // Invalid (if provided)
    if (fixture.invalid) {
      const invalid = await readJson(path.join(ROOT, fixture.invalid));
      const invalidResult = validateSchema(invalid, schema, fixture.invalid);
      assert(!invalidResult.ok, `${fixture.label}: invalid should fail.`);

      if (fixture.expectedInvalidFragments) {
        for (const fragment of fixture.expectedInvalidFragments) {
          const found = invalidResult.errors.some((e) => e.includes(fragment));
          assert(found, `${fixture.label}: expected error mentioning "${fragment}" in: ${invalidResult.errors.join(" | ")}`);
        }
      }
      console.log(`ok ${fixture.label} (invalid fails as expected)`);
    }
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
