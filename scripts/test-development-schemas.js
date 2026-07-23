#!/usr/bin/env node
/**
 * scripts/test-development-schemas.js
 *
 * Validates all development control plane schemas and fixtures.
 */

const fs = require("node:fs");
const path = require("node:path");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const SCHEMAS_DIR = path.join(PROJECT_ROOT, "development", "schemas");
const FIXTURES_DIR = path.join(PROJECT_ROOT, "development", "fixtures");

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (e) {
    console.log(`  FAIL  ${name}`);
    console.log(`        ${e.message}`);
    failed++;
    failures.push({ name, message: e.message });
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || "assertion failed");
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function listJson(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith(".json"));
}

// ---- Schema structure validation ----

console.log("\n## Schema Structure");

const schemaFiles = listJson(SCHEMAS_DIR);
assert(schemaFiles.length >= 4, `Expected at least 4 schemas, found ${schemaFiles.length}`);

for (const file of schemaFiles) {
  test(`Schema ${file} has required fields`, () => {
    const schema = readJson(path.join(SCHEMAS_DIR, file));
    assert(schema.$schema === "https://json-schema.org/draft/2020-12/schema", "Missing or wrong $schema");
    assert(schema.$id && schema.$id.startsWith("https://locaily.local/schemas/"), "Missing or wrong $id");
    assert(schema.title, "Missing title");
    assert(schema.description, "Missing description");
    assert(schema.type === "object", "Missing or wrong type");
    assert(schema.additionalProperties === false, "additionalProperties must be false");
    assert(schema.required && Array.isArray(schema.required), "Missing required array");
    assert(schema.properties && typeof schema.properties === "object", "Missing properties");
  });
}

// ---- Schema-specific validation ----

console.log("\n## Schema Content");

test("project-state schema has correct status enum", () => {
  const schema = readJson(path.join(SCHEMAS_DIR, "project-state.schema.json"));
  const statusEnum = schema.properties.status.enum;
  assert(statusEnum.includes("idle"), "Missing idle");
  assert(statusEnum.includes("active"), "Missing active");
  assert(statusEnum.includes("paused"), "Missing paused");
  assert(statusEnum.includes("blocked"), "Missing blocked");
  assert(statusEnum.includes("planning"), "Missing planning");
  assert(statusEnum.includes("validating"), "Missing validating");
  assert(statusEnum.includes("ready-for-delivery"), "Missing ready-for-delivery");
  assert(statusEnum.includes("delivered"), "Missing delivered");
});

test("milestone schema has correct status enum", () => {
  const schema = readJson(path.join(SCHEMAS_DIR, "milestone.schema.json"));
  const statusEnum = schema.properties.status.enum;
  const expected = ["idea", "planned", "ready", "active", "paused", "blocked", "validating", "ready-for-delivery", "delivered", "merged", "completed", "cancelled"];
  for (const s of expected) {
    assert(statusEnum.includes(s), `Missing status: ${s}`);
  }
});

test("milestone schema has id pattern", () => {
  const schema = readJson(path.join(SCHEMAS_DIR, "milestone.schema.json"));
  assert(schema.properties.id.pattern === "^[a-z0-9][a-z0-9-]*$", "Wrong id pattern");
});

test("session schema has id pattern", () => {
  const schema = readJson(path.join(SCHEMAS_DIR, "session.schema.json"));
  assert(schema.properties.id.pattern === "^session-[0-9]{8}-[0-9]+$", "Wrong id pattern");
});

test("session schema has correct status enum", () => {
  const schema = readJson(path.join(SCHEMAS_DIR, "session.schema.json"));
  const statusEnum = schema.properties.status.enum;
  assert(statusEnum.includes("active"), "Missing active");
  assert(statusEnum.includes("paused"), "Missing paused");
  assert(statusEnum.includes("closed"), "Missing closed");
  assert(statusEnum.includes("interrupted"), "Missing interrupted");
});

test("validation-profile schema has correct level enum", () => {
  const schema = readJson(path.join(SCHEMAS_DIR, "validation-profile.schema.json"));
  const levelEnum = schema.properties.level.enum;
  assert(levelEnum.includes("quick"), "Missing quick");
  assert(levelEnum.includes("standard"), "Missing standard");
  assert(levelEnum.includes("full"), "Missing full");
  assert(levelEnum.includes("release"), "Missing release");
});

// ---- Valid fixtures ----

console.log("\n## Valid Fixtures");

const validDir = path.join(FIXTURES_DIR, "valid");
const validFiles = listJson(validDir);

for (const file of validFiles) {
  test(`Valid fixture ${file} is well-formed JSON`, () => {
    const fixture = readJson(path.join(validDir, file));
    assert(typeof fixture === "object", "Fixture is not an object");
    assert(fixture.schema, "Missing schema field");
  });
}

test("project-state-active fixture matches schema fields", () => {
  const fixture = readJson(path.join(validDir, "project-state-active.json"));
  assert(fixture.schema === "locaily.development.project_state.v1", "Wrong schema");
  assert(fixture.project === "locaily", "Wrong project");
  assert(fixture.status === "active", "Wrong status");
  assert(fixture.defaultBranch === "main", "Wrong defaultBranch");
  assert(typeof fixture.updatedAt === "string", "updatedAt not a string");
});

test("milestone-planned fixture matches schema fields", () => {
  const fixture = readJson(path.join(validDir, "milestone-planned.json"));
  assert(fixture.schema === "locaily.development.milestone.v1", "Wrong schema");
  assert(fixture.id === "development-control-plane-v1", "Wrong id");
  assert(fixture.status === "planned", "Wrong status");
  assert(fixture.scope.included.length > 0, "No included scope");
  assert(fixture.acceptanceCriteria.length > 0, "No acceptance criteria");
});

test("session-active fixture matches schema fields", () => {
  const fixture = readJson(path.join(validDir, "session-active.json"));
  assert(fixture.schema === "locaily.development.session.v1", "Wrong schema");
  assert(fixture.id.match(/^session-[0-9]{8}-[0-9]+$/), "Wrong id format");
  assert(fixture.status === "active", "Wrong status");
  assert(fixture.branch, "Missing branch");
  assert(fixture.startingCommit, "Missing startingCommit");
});

test("validation-profile fixture matches schema fields", () => {
  const fixture = readJson(path.join(validDir, "validation-profile-standard.json"));
  assert(fixture.schema === "locaily.development.validation_profile.v1", "Wrong schema");
  assert(fixture.id === "development-control-plane", "Wrong id");
  assert(fixture.level === "standard", "Wrong level");
  assert(fixture.required.length > 0, "No required checks");
});

// ---- Invalid fixtures ----

console.log("\n## Invalid Fixtures");

const invalidDir = path.join(FIXTURES_DIR, "invalid");
const invalidFiles = listJson(invalidDir);

test("Invalid fixtures exist for each schema", () => {
  assert(invalidFiles.length >= 4, `Expected at least 4 invalid fixtures, found ${invalidFiles.length}`);
});

test("project-state-bad-status fixture has invalid status", () => {
  const fixture = readJson(path.join(invalidDir, "project-state-bad-status.json"));
  const schema = readJson(path.join(SCHEMAS_DIR, "project-state.schema.json"));
  assert(!schema.properties.status.enum.includes(fixture.status), "Status should be invalid");
});

test("milestone-bad-id fixture has invalid id", () => {
  const fixture = readJson(path.join(invalidDir, "milestone-bad-id.json"));
  const schema = readJson(path.join(SCHEMAS_DIR, "milestone.schema.json"));
  const re = new RegExp(schema.properties.id.pattern);
  assert(!re.test(fixture.id), "ID should be invalid");
});

test("session-bad-id fixture has invalid id format", () => {
  const fixture = readJson(path.join(invalidDir, "session-bad-id.json"));
  const schema = readJson(path.join(SCHEMAS_DIR, "session.schema.json"));
  const re = new RegExp(schema.properties.id.pattern);
  assert(!re.test(fixture.id), "ID should be invalid");
});

test("validation-profile-bad-level fixture has invalid level", () => {
  const fixture = readJson(path.join(invalidDir, "validation-profile-bad-level.json"));
  const schema = readJson(path.join(SCHEMAS_DIR, "validation-profile.schema.json"));
  assert(!schema.properties.level.enum.includes(fixture.level), "Level should be invalid");
});

// ---- Cross-reference consistency ----

console.log("\n## Cross-Reference Consistency");

test("All fixture schemas match schema $id pattern", () => {
  const schemaIds = new Set();
  for (const file of schemaFiles) {
    const schema = readJson(path.join(SCHEMAS_DIR, file));
    // Extract the short id from $id URL
    const match = schema.$id.match(/schemas\/(.+)/);
    if (match) schemaIds.add(match[1].replace(".schema.json", ""));
  }
  for (const file of validFiles) {
    const fixture = readJson(path.join(validDir, file));
    if (fixture.schema) {
      const parts = fixture.schema.split(".");
      assert(parts.length >= 3, `Fixture ${file} has non-standard schema: ${fixture.schema}`);
    }
  }
  for (const file of invalidFiles) {
    const fixture = readJson(path.join(invalidDir, file));
    if (fixture.schema) {
      const parts = fixture.schema.split(".");
      assert(parts.length >= 3, `Fixture ${file} has non-standard schema: ${fixture.schema}`);
    }
  }
});

// ---- Summary ----

console.log(`\n## Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFailed tests:");
  for (const f of failures) {
    console.log(`  - ${f.name}: ${f.message}`);
  }
  process.exit(1);
}
process.exit(0);
