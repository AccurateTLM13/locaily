const path = require("node:path");
const { readJson } = require("../benchmark-lab/engine/fs-utils");
const { validateSchema } = require("../benchmark-lab/engine/schema-validator");

const ROOT = path.resolve(__dirname, "..");

const FIXTURES = [
  {
    label: "development memory event",
    schema: "companion/schemas/development-memory-event.schema.json",
    valid: "companion/schemas/fixtures/development-memory/event.valid.json",
    invalid: "companion/schemas/fixtures/development-memory/event.invalid.json",
    expectedInvalidFragments: ["eventType", "extraField"]
  },
  {
    label: "development memory candidate",
    schema: "companion/schemas/development-memory-candidate.schema.json",
    valid: "companion/schemas/fixtures/development-memory/candidate.valid.json",
    invalid: "companion/schemas/fixtures/development-memory/candidate.invalid.json",
    expectedInvalidFragments: ["confidence", "evidenceEventIds", "createdAt"]
  },
  {
    label: "development memory session",
    schema: "companion/schemas/development-memory-session.schema.json",
    valid: "companion/schemas/fixtures/development-memory/session.valid.json",
    invalid: "companion/schemas/fixtures/development-memory/session.invalid.json",
    expectedInvalidFragments: ["schemaVersion", "linkedEventIds"]
  },
  {
    label: "development memory capture policy",
    schema: "companion/schemas/development-memory-capture-policy.schema.json",
    valid: "companion/schemas/fixtures/development-memory/capture-policy.valid.json",
    invalid: "companion/schemas/fixtures/development-memory/capture-policy.invalid.json",
    expectedInvalidFragments: ["mode", "autoApplyRiskLevels", "rawEventDays"]
  },
  {
    label: "development memory candidate review",
    schema: "companion/schemas/development-memory-candidate-review.schema.json",
    valid: "companion/schemas/fixtures/development-memory/candidate-review.valid.json",
    invalid: "companion/schemas/fixtures/development-memory/candidate-review.invalid.json",
    expectedInvalidFragments: ["schemaVersion", "status", "writebackDeliveryMode"]
  },
  {
    label: "development memory maintainer run",
    schema: "companion/schemas/development-memory-maintainer-run.schema.json",
    valid: "companion/schemas/fixtures/development-memory/maintainer-run.valid.json",
    invalid: "companion/schemas/fixtures/development-memory/maintainer-run.invalid.json",
    expectedInvalidFragments: ["schemaVersion", "status", "approvedCandidates"]
  },
  {
    label: "development memory project",
    schema: "companion/schemas/development-memory-project.schema.json",
    valid: "companion/schemas/fixtures/development-memory/project.valid.json",
    invalid: "companion/schemas/fixtures/development-memory/project.invalid.json",
    expectedInvalidFragments: ["storageLayout", "extraField", "updatedAt"]
  },
  {
    label: "development memory project registry",
    schema: "companion/schemas/development-memory-project-registry.schema.json",
    valid: "companion/schemas/fixtures/development-memory/project-registry.valid.json",
    invalid: "companion/schemas/fixtures/development-memory/project-registry.invalid.json",
    expectedInvalidFragments: ["schemaVersion", "extraField", "updatedAt"]
  }
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  for (const fixture of FIXTURES) {
    const schema = await readJson(path.join(ROOT, fixture.schema));

    const valid = await readJson(path.join(ROOT, fixture.valid));
    const validResult = validateSchema(valid, schema, fixture.valid);
    assert(validResult.ok, `${fixture.label}: valid should pass. Errors: ${validResult.errors.join(" ")}`);
    console.log(`ok ${fixture.label} (valid)`);

    const invalid = await readJson(path.join(ROOT, fixture.invalid));
    const invalidResult = validateSchema(invalid, schema, fixture.invalid);
    assert(!invalidResult.ok, `${fixture.label}: invalid should fail.`);

    if (fixture.expectedInvalidFragments) {
      for (const fragment of fixture.expectedInvalidFragments) {
        const found = invalidResult.errors.some((error) => error.includes(fragment));
        assert(found, `${fixture.label}: expected error mentioning "${fragment}" in: ${invalidResult.errors.join(" | ")}`);
      }
    }
    console.log(`ok ${fixture.label} (invalid fails as expected)`);
  }

  console.log("ok all development memory schema fixtures");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
