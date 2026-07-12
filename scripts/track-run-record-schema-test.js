const path = require("node:path");
const { readJson } = require("../benchmark-lab/engine/fs-utils");
const { validateSchema } = require("../benchmark-lab/engine/schema-validator");
const { buildTrackRunRecord } = require("../companion/evidence/track-run-record-builder");

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

  const schema = await readJson(path.join(ROOT, "companion/evidence/schemas/track-run-record.schema.json"));

  function stripNulls(obj) {
    if (Array.isArray(obj)) return obj.map(stripNulls);
    if (obj && typeof obj === "object") {
      const result = {};
      for (const [k, v] of Object.entries(obj)) {
        if (v === null || v === undefined) continue;
        result[k] = stripNulls(v);
      }
      return result;
    }
    return obj;
  }

  const withPlacement = stripNulls(buildTrackRunRecord({
    trackId: "placement-test",
    executorType: "model",
    status: "success",
    durationMs: 100,
    plannedPlacement: { target: "relay", nodeId: "node-a" },
    actualPlacement: { target: "relay", nodeId: "node-a" }
  }));
  const withPlacementResult = validateSchema(withPlacement, schema, "built-record-with-placement");
  assert(withPlacementResult.ok, `built record with placement should pass. Errors: ${withPlacementResult.errors.join(" ")}`);
  console.log("ok built record with plannedPlacement and actualPlacement (valid)");

  const withoutPlacement = stripNulls(buildTrackRunRecord({
    trackId: "no-placement-test",
    executorType: "tool",
    status: "success",
    durationMs: 50
  }));
  const withoutPlacementResult = validateSchema(withoutPlacement, schema, "built-record-without-placement");
  assert(withoutPlacementResult.ok, `built record without placement should pass. Errors: ${withoutPlacementResult.errors.join(" ")}`);
  console.log("ok built record without plannedPlacement/actualPlacement (valid, backward compatible)");
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
