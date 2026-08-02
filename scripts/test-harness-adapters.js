#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const http = require("node:http");
const { validateResult } = require("../companion/core/result-validator");
const { buildHarnessSnapshot, getHarnessSchema } = require("../companion/harness");

const ROOT = path.join(__dirname, "..");
const HARNESS_SCHEMA = path.join(ROOT, "companion", "schemas", "harness-operations-snapshot.schema.json");
const HARNESS_VALID_FIXTURE = path.join(ROOT, "companion", "schemas", "fixtures", "harness-operations-snapshot", "valid.json");
const HARNESS_INVALID_FIXTURE = path.join(ROOT, "companion", "schemas", "fixtures", "harness-operations-snapshot", "invalid.json");
let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    passed += 1;
    console.log(`  PASS: ${label}`);
  } else {
    failed += 1;
    console.error(`  FAIL: ${label}`);
  }
}

function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sameShape(left, right) {
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((value, index) => sameShape(value, right[index]));
  }
  if (left && typeof left === "object" || right && typeof right === "object") {
    if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return JSON.stringify(leftKeys) === JSON.stringify(rightKeys)
      && leftKeys.every((key) => sameShape(left[key], right[key]));
  }
  return true;
}

function findEvidence(snapshot, field) {
  return snapshot.evidence.records.find((record) => record.field === field);
}

function makeRequest(baseUrl, requestPath) {
  return new Promise((resolve, reject) => {
    const url = new URL(requestPath, baseUrl);
    const request = http.request({
      method: "GET",
      hostname: url.hostname,
      port: url.port,
      path: `${url.pathname}${url.search}`
    }, (response) => {
      let body = "";
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => {
        let parsed = null;
        try { parsed = JSON.parse(body); } catch {}
        resolve({ status: response.statusCode, body: parsed });
      });
    });
    request.on("error", reject);
    request.end();
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(baseUrl, child) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`server exited with code ${child.exitCode}`);
    try {
      const response = await makeRequest(baseUrl, "/health");
      if (response.status === 200 && response.body && response.body.ok) return;
    } catch {}
    await sleep(250);
  }
  throw new Error("server did not become healthy in time");
}

async function testServerEndpoint() {
  const port = 31417;
  const child = spawn(process.execPath, [path.join(ROOT, "companion", "server.js")], {
    cwd: ROOT,
    env: { ...process.env, LOCAL_AI_PORT: String(port), DEVELOPMENT_MEMORY_CAPTURE: "0" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout.on("data", () => {});
  child.stderr.on("data", () => {});
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await waitForServer(baseUrl, child);
    const valid = await makeRequest(baseUrl, "/harness/status?fixture=opencode");
    assert(valid.status === 200, "GET /harness/status returns 200");
    assert(valid.body && valid.body.ok === true, "harness endpoint returns an ok envelope");
    assert(valid.body.result.harness.id === "opencode", "harness endpoint selects requested fixture");
    assert(valid.body.result.readOnly === true && valid.body.meta.readOnly === true, "harness endpoint is explicitly read-only");
    assert(Array.isArray(valid.body.result.evidence.records), "harness endpoint exposes evidence records");

    const invalid = await makeRequest(baseUrl, "/harness/status?fixture=unsupported");
    assert(invalid.status === 400, "unsupported fixture returns 400");
    assert(invalid.body && invalid.body.code === "UNSUPPORTED_HARNESS_FIXTURE", "unsupported fixture has deterministic error code");
  } finally {
    child.kill();
    await sleep(300);
  }
}

async function main() {
  console.log("=== Harness Adapter Tests ===\n");
  const beforeState = readText("development/project-state.json");
  const beforeSession = readText("development/sessions/session-20260802-001.json");
  const codex = buildHarnessSnapshot({ fixture: "codex", repoRoot: ROOT });
  const opencode = buildHarnessSnapshot({ fixture: "opencode", repoRoot: ROOT });

  assert(codex.ok, "Codex fixture normalizes successfully");
  assert(opencode.ok, "OpenCode fixture normalizes successfully");
  assert(codex.ok && validateResult(codex.result, getHarnessSchema(), "codex").ok, "Codex snapshot matches strict schema");
  assert(opencode.ok && validateResult(opencode.result, getHarnessSchema(), "opencode").ok, "OpenCode snapshot matches strict schema");
  const canonicalFixture = readJson(HARNESS_VALID_FIXTURE);
  const canonicalInvalidFixture = readJson(HARNESS_INVALID_FIXTURE);
  assert(fs.existsSync(HARNESS_SCHEMA), "canonical harness schema fixture references the checked-in schema");
  assert(validateResult(canonicalFixture, getHarnessSchema(), "canonicalFixture").ok, "checked-in canonical valid fixture matches strict schema");
  const invalidFixtureValidation = validateResult(canonicalInvalidFixture, getHarnessSchema(), "canonicalInvalidFixture");
  assert(!invalidFixtureValidation.ok && invalidFixtureValidation.errors.some((error) => error.includes("unexpected")), "checked-in canonical invalid fixture is rejected");
  assert(codex.ok && opencode.ok && sameShape(codex.result, opencode.result), "Codex and OpenCode produce equivalent canonical shapes");
  assert(codex.ok && opencode.ok && codex.result.provenance.sourceHarness !== opencode.result.provenance.sourceHarness, "source harness provenance remains distinct");
  assert(codex.ok && opencode.ok && codex.result.provenance.sourceId !== opencode.result.provenance.sourceId, "fixture provenance remains distinct");

  for (const snapshot of [codex.result, opencode.result]) {
    assert(snapshot.workers[0].model === null, `${snapshot.harness.id} redacted model remains null`);
    assert(findEvidence(snapshot, "workers.worker-1.model").status === "redacted", `${snapshot.harness.id} redacted model evidence is explicit`);
    assert(snapshot.hud.cost.amount === null && snapshot.hud.cost.availability === "unsupported", `${snapshot.harness.id} unsupported cost is not inferred`);
    assert(snapshot.hud.sync.status === "unknown" && snapshot.hud.sync.lastSyncedAt === null, `${snapshot.harness.id} unavailable sync remains unknown`);
    assert(snapshot.locailyLinks.projectState.readOnly && snapshot.locailyLinks.milestone.readOnly && snapshot.locailyLinks.session.readOnly, `${snapshot.harness.id} Locaily links are read-only`);
  }

  const invalid = JSON.parse(JSON.stringify(codex.result));
  invalid.unexpected = true;
  const invalidValidation = validateResult(invalid, getHarnessSchema(), "invalid");
  assert(!invalidValidation.ok && invalidValidation.errors.some((error) => error.includes("unexpected")), "schema rejects unexpected canonical fields");
  assert(readText("development/project-state.json") === beforeState, "snapshot collection does not mutate project state");
  assert(readText("development/sessions/session-20260802-001.json") === beforeSession, "snapshot collection does not mutate development session");

  const cli = spawnSync(process.execPath, [path.join(ROOT, "scripts", "harness-status.js"), "--fixture", "opencode", "--json"], {
    cwd: ROOT,
    encoding: "utf8"
  });
  const cliSnapshot = JSON.parse(cli.stdout);
  assert(cli.status === 0 && cliSnapshot.harness.id === "opencode", "harness-status CLI emits JSON snapshot");

  await testServerEndpoint();

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(`Test runner error: ${error.stack || error.message}`);
  process.exit(1);
});
