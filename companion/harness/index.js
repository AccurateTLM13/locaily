const fs = require("node:fs");
const path = require("node:path");
const { validateResult } = require("../core/result-validator");
const schema = require("../schemas/harness-operations-snapshot.schema.json");
const { normalizeCodex, normalizeOpenCode } = require("./adapters");

const FIXTURES = Object.freeze({
  codex: "codex-session.json",
  opencode: "opencode-session.json"
});

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function listHarnessFixtures() {
  return Object.keys(FIXTURES);
}

function resolveFixturePath(fixture, repoRoot = path.join(__dirname, "..", "..")) {
  const fileName = FIXTURES[fixture];
  if (!fileName) return null;
  return path.join(repoRoot, "development", "fixtures", "harness", fileName);
}

function buildHarnessSnapshot({ fixture = "codex", repoRoot = path.join(__dirname, "..", "..") } = {}) {
  const fixturePath = resolveFixturePath(fixture, repoRoot);
  if (!fixturePath) {
    return {
      ok: false,
      error: {
        code: "UNSUPPORTED_HARNESS_FIXTURE",
        message: `Harness fixture '${fixture}' is not supported.`,
        nextStep: `Use one of: ${listHarnessFixtures().join(", ")}.`
      }
    };
  }

  let raw;
  try {
    raw = readJson(fixturePath);
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "HARNESS_FIXTURE_UNREADABLE",
        message: `Harness fixture '${fixture}' could not be read.`,
        nextStep: "Verify the local fixture file is valid JSON."
      },
      cause: error.message
    };
  }

  const relativeFixturePath = path.relative(repoRoot, fixturePath).split(path.sep).join("/");
  const snapshot = fixture === "codex"
    ? normalizeCodex(raw, { repoRoot, fixturePath: relativeFixturePath })
    : normalizeOpenCode(raw, { repoRoot, fixturePath: relativeFixturePath });
  const validation = validateResult(snapshot, schema, "harnessSnapshot");
  if (!validation.ok) {
    return {
      ok: false,
      error: {
        code: "HARNESS_SNAPSHOT_SCHEMA_INVALID",
        message: "Normalized harness snapshot did not match the canonical schema.",
        nextStep: "Fix the fixture adapter mapping before exposing the snapshot."
      },
      validation
    };
  }

  return {
    ok: true,
    result: snapshot,
    warnings: [
      "This snapshot is fixture-derived and read-only; it is not evidence of live harness integration.",
      "Unavailable, unsupported, and redacted values remain explicit in evidence.records."
    ]
  };
}

function getHarnessSchema() {
  return schema;
}

module.exports = {
  FIXTURES,
  buildHarnessSnapshot,
  getHarnessSchema,
  listHarnessFixtures,
  resolveFixturePath
};
