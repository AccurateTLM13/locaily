const assert = require("node:assert/strict");
const { test } = require("node:test");
const { validateResult } = require("../companion/core/result-validator");
const { validateSchema } = require("../benchmark-lab/engine/schema-validator");

const nullableObject = {
  type: ["object", "null"], required: ["message"], additionalProperties: false,
  properties: { message: { type: "string" } }
};
const nullableArray = {
  type: ["array", "null"], minItems: 1,
  items: { type: "object", required: ["score"], properties: { score: { type: "number" } } }
};

for (const [name, validate] of [["runtime", validateResult], ["benchmark", validateSchema]]) {
  const cases = [
    ["accepts nullable object null", null, nullableObject, true],
    ["accepts valid nullable object", { message: "ok" }, nullableObject, true],
    ["rejects missing nested field", {}, nullableObject, false],
    ["rejects incorrect nested type", { message: 42 }, nullableObject, false],
    ["rejects extra nested field", { message: "ok", extra: true }, nullableObject, false],
    ["accepts nullable array null", null, nullableArray, true],
    ["accepts valid nullable array", [{ score: 0.5 }], nullableArray, true],
    ["checks nullable array length", [], nullableArray, false],
    ["checks nullable array items", [{}], nullableArray, false],
    ["checks nested array item type", [{ score: "bad" }], nullableArray, false],
    ["checks object constraints without explicit type", {}, { required: ["message"] }, false],
    ["checks array constraints without explicit type", [42], { items: { type: "string" } }, false],
    ["accepts explicit null type", null, { type: "null" }, true],
    ["rejects value for null type", {}, { type: "null" }, false],
    ...[NaN, Infinity, -Infinity].flatMap((value) => [
      [`rejects non-finite number ${value}`, value, { type: "number" }, false],
      [`rejects non-finite union number ${value}`, value, { type: ["number", "null"] }, false]
    ]),
    ["accepts finite union number", 0, { type: ["number", "null"] }, true]
  ];
  for (const [label, value, schema, expected] of cases) {
    test(`${name}: ${label}`, () => {
      const result = validate(value, schema, "payload");
      assert.equal(result.ok, expected, result.errors.join("; "));
      if (!expected) assert.ok(result.errors.some((error) => error.startsWith("payload")));
    });
  }
}

test("runtime: oneOf preserves sibling constraints", () => {
  const schema = { type: "number", minimum: 1, oneOf: [{ type: "number" }, { type: "string" }] };
  assert.equal(validateResult(2, schema).ok, true);
  assert.equal(validateResult(0, schema).ok, false);
  assert.equal(validateResult("text", schema).ok, false);
  assert.equal(validateResult(2, { oneOf: [{ type: "number" }, { type: "integer" }] }).ok, false);
});

test("runtime: nullable arrays preserve size and uniqueness constraints", () => {
  const schema = { type: ["array", "null"], maxItems: 2, uniqueItems: true, items: { type: "number" } };
  assert.equal(validateResult(null, schema).ok, true);
  assert.equal(validateResult([1, 2], schema).ok, true);
  assert.equal(validateResult([1, 1], schema).ok, false);
  assert.equal(validateResult([1, 2, 3], schema).ok, false);
});
