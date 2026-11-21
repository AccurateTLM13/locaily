#!/usr/bin/env node
/**
 * Acceptance test suite for CORE-06 (Part A):
 * Workflow Pack Contract, Path Isolation, Dynamic Registration, and Starter SDK CLI.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { validateResult } = require("../companion/core/result-validator");
const { createPermissionManager } = require("../companion/core/permissions");
const { createModelQualificationLoader } = require("../companion/core/model-qualification-loader");
const { createQualificationResolver } = require("../companion/core/qualification-resolver");
const {
  resolveInsidePack,
  validateWorkflowPack,
  createWorkflowPackRegistry,
  evaluatePackPermissions,
  evaluatePackQualificationReadiness,
  reloadDefaultWorkflowPacks
} = require("../companion/packs");
const { createToolRegistry } = require("../companion/tools/registry");
const { listTracks, loadTrack } = require("../companion/crew/decomposer");
const { buildPrompt } = require("../companion/crew/prompts");
const { createMockRuntime } = require("../companion/providers/router");
const {
  listWorkflows,
  listTrackRegistry,
  buildRunPlan,
  executeRunPlan
} = require("../companion/orchestration");

const ROOT = path.resolve(__dirname, "..");
const PACK_SCHEMA = require("../companion/schemas/workflow-pack-manifest.schema.json");
const INCIDENT_PACK_DIR = path.join(ROOT, "workflow-packs", "incident-triage-pack");
const SDK_PATH = path.join(ROOT, "scripts", "workflow-pack-sdk.js");

let passed = 0;
let failed = 0;

async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`PASS: ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL: ${name}\n  ${err.stack || err.message}`);
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

async function main() {
  console.log("=== CORE-06 Workflow Pack Contract & Starter SDK Tests ===\n");

  await check("AC1: workflow-pack-manifest.schema.json validates official pack and rejects invalid manifests", () => {
    const validManifest = JSON.parse(fs.readFileSync(path.join(INCIDENT_PACK_DIR, "pack.json"), "utf8"));
    const okRes = validateResult(validManifest, PACK_SCHEMA, "pack");
    assert.equal(okRes.ok, true, `Expected valid manifest: ${okRes.errors.join("; ")}`);

    const badId = { ...validManifest, id: "Invalid_UpperCase" };
    assert.equal(validateResult(badId, PACK_SCHEMA, "pack").ok, false);

    const badTrust = { ...validManifest, trust: "untrusted_internet" };
    assert.equal(validateResult(badTrust, PACK_SCHEMA, "pack").ok, false);

    const emptyWf = { ...validManifest, workflows: [] };
    assert.equal(validateResult(emptyWf, PACK_SCHEMA, "pack").ok, false);
  });

  await check("AC2: Path containment blocks directory traversal and absolute paths with WORKFLOW_PACK_PATH_ESCAPE", () => {
    assert.throws(
      () => resolveInsidePack(INCIDENT_PACK_DIR, "../package.json"),
      (err) => err.code === "WORKFLOW_PACK_PATH_ESCAPE"
    );
    assert.throws(
      () => resolveInsidePack(INCIDENT_PACK_DIR, path.join(ROOT, "package.json")),
      (err) => err.code === "WORKFLOW_PACK_PATH_ESCAPE"
    );

    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "locaily-pack-escape-"));
    try {
      const evilPack = path.join(tmpRoot, "evil-pack");
      writeJson(path.join(evilPack, "pack.json"), {
        schema: "locaily.workflow_pack.v1",
        id: "evil-pack",
        name: "Evil Pack",
        version: "0.1.0",
        trust: "experimental",
        description: "Tests traversal containment.",
        workflows: [
          {
            workflow_id: "evil_wf",
            name: "Evil Workflow",
            description: "Should fail validation.",
            track_id: "core.summarize",
            input_type: "text",
            output_type: "summary",
            status: "experimental"
          }
        ],
        schemas: ["../../package.json"]
      });

      const val = validateWorkflowPack(evilPack);
      assert.equal(val.ok, false);
      assert(val.errorCodes.includes("WORKFLOW_PACK_PATH_ESCAPE"), `Expected WORKFLOW_PACK_PATH_ESCAPE, got ${val.errorCodes}`);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  await check("AC3: ID collision with built-in workflow or track fails with WORKFLOW_PACK_ID_CONFLICT without breaking built-ins", () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "locaily-pack-conflict-"));
    try {
      const wfConflictDir = path.join(tmpRoot, "dup-wf-pack");
      writeJson(path.join(wfConflictDir, "pack.json"), {
        schema: "locaily.workflow_pack.v1",
        id: "dup-wf-pack",
        name: "Duplicate Workflow Pack",
        version: "0.1.0",
        trust: "experimental",
        description: "Collides with built-in repo_review.",
        workflows: [
          {
            workflow_id: "repo_review",
            name: "Shadow Repo Review",
            description: "Conflict test.",
            track_id: "core.summarize",
            input_type: "text",
            output_type: "summary",
            status: "experimental"
          }
        ]
      });

      const trackConflictDir = path.join(tmpRoot, "dup-track-pack");
      writeJson(path.join(trackConflictDir, "pack.json"), {
        schema: "locaily.workflow_pack.v1",
        id: "dup-track-pack",
        name: "Duplicate Track Pack",
        version: "0.1.0",
        trust: "experimental",
        description: "Collides with built-in core.classify.",
        workflows: [
          {
            workflow_id: "custom_non_conflicting_wf",
            name: "Custom",
            description: "Conflict test.",
            track_id: "core.classify",
            input_type: "text",
            output_type: "classification",
            status: "experimental"
          }
        ],
        tracks: ["tracks/core.classify.track.json"]
      });
      writeJson(path.join(trackConflictDir, "tracks", "core.classify.track.json"), {
        track_id: "core.classify",
        version: "1.0.0",
        name: "Hijack Classify",
        steps: [
          {
            id: "s1",
            input_map: { text: "$input.text" },
            executor: { type: "tool", tool: "text.classify", task: "run" }
          }
        ]
      });

      const isolatedRegistry = createWorkflowPackRegistry({ packDirs: [wfConflictDir, trackConflictDir] });
      assert.equal(isolatedRegistry.listPacks().length, 0);
      const errors = isolatedRegistry.getLoadErrors();
      assert.equal(errors.length, 2);
      assert(errors.every((e) => e.code === "WORKFLOW_PACK_ID_CONFLICT"));

      // Built-ins remain completely intact
      const builtInIds = listWorkflows().map((w) => w.workflow_id);
      assert(builtInIds.includes("repo_review"));
      assert(loadTrack("core.classify").track_id === "core.classify");
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  await check("AC4: incident-triage-pack registers dynamically across workflows, tracks, tools, prompts, and executes end-to-end", async () => {
    const val = validateWorkflowPack(INCIDENT_PACK_DIR);
    assert.equal(val.ok, true, `Validation failed: ${val.errors.join("; ")}`);

    // Even when enabledTools restricts built-ins, Workflow Pack tools register automatically
    const toolRegistry = createToolRegistry({ enabledTools: ["deal-sniper", "text.classify", "text.summarize"] });
    assert.equal(toolRegistry.has("incident-parser"), true, "incident-parser should register automatically");
    assert.equal(toolRegistry.supportsTask("incident-parser", "parse"), true);
    assert.equal(toolRegistry.supportsTask("incident-parser", "assemble_brief"), true);

    const wfIds = listWorkflows().map((w) => w.workflow_id);
    assert(wfIds.includes("incident_triage"), "incident_triage workflow should register");

    const trackIds = listTracks().map((t) => t.track_id);
    assert(trackIds.includes("incident_triage.parse"));
    assert(trackIds.includes("incident_triage.brief"));

    const regTrackIds = listTrackRegistry().map((t) => t.track_id);
    assert(regTrackIds.includes("incident_triage.parse"));
    assert(regTrackIds.includes("incident_triage.brief"));

    const renderedPrompt = buildPrompt(
      "incident_triage_summary",
      { input: { service: "checkout-api", environment: "production", severity: "sev1" } },
      { service: "checkout-api", environment: "production", severity: "sev1", parsed: { code: "HTTP_503" } }
    );
    assert(renderedPrompt.includes("checkout-api"));
    assert(renderedPrompt.includes("HTTP_503"));

    const fixture = JSON.parse(
      fs.readFileSync(path.join(INCIDENT_PACK_DIR, "fixtures", "sample-outage.json"), "utf8")
    );
    const plan = buildRunPlan({ workflowId: "incident_triage", input: fixture.input });
    const execution = await executeRunPlan({
      plan,
      runtime: createMockRuntime(),
      toolRegistry,
      recordOpts: { enabled: false }
    });

    assert.equal(execution.plan.status, "completed");
    assert.equal(execution.schemaValid, true);
    assert.equal(execution.result.final.service, "checkout-api");
    assert.equal(execution.result.final.severity, "sev1");
    assert(execution.result.final.error_codes.includes("HTTP_503"));
    assert(execution.result.final.markdown.includes("checkout-api"));
  });

  await check("AC5: Permission and qualification readiness checks evaluate pack declarations accurately", () => {
    const reg = createWorkflowPackRegistry();
    const pack = reg.getPack("incident-triage-pack");
    assert(pack, "incident-triage-pack should be loaded");

    const defaultPerms = createPermissionManager();
    const permOk = evaluatePackPermissions(pack, defaultPerms);
    assert.equal(permOk.ok, true);
    assert(permOk.approved.includes("model.run"));

    const restrictedPerms = createPermissionManager({ denied: ["model.run"] });
    const permDenied = evaluatePackPermissions(pack, restrictedPerms);
    assert.equal(permDenied.ok, false);
    assert(permDenied.denied.includes("model.run"));

    const loader = createModelQualificationLoader();
    const latestCore = Math.max(
      ...loader.list()
        .filter((r) => r.generatedAt && Array.isArray(r.qualifiedFor) && r.qualifiedFor.some((q) => String(q.trackId || "").startsWith("core.")))
        .map((r) => Date.parse(r.generatedAt))
        .filter(Number.isFinite)
    );
    const freshResolver = createQualificationResolver({ loader, now: () => new Date(latestCore + 60_000) });
    const qualReady = evaluatePackQualificationReadiness(pack, freshResolver);
    assert.equal(qualReady.ready, true);

    const staleResolver = createQualificationResolver({ loader, ttlMs: 1, now: () => new Date(latestCore + 60_000) });
    const qualStale = evaluatePackQualificationReadiness(pack, staleResolver);
    assert.equal(qualStale.ready, false);
  });

  await check("AC6: Starter SDK CLI scaffolds (pack:init), validates (pack:validate), and executes (pack:test) a fresh pack", () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "locaily-sdk-test-"));
    try {
      const initRun = spawnSync(
        process.execPath,
        [SDK_PATH, "init", "--id", "sdk-demo-pack", "--name", "SDK Demo Pack", "--dir", tmpRoot],
        { cwd: ROOT, encoding: "utf8", shell: false }
      );
      assert.equal(initRun.status, 0, `pack:init failed: ${initRun.stderr || initRun.stdout}`);
      const packDir = path.join(tmpRoot, "sdk-demo-pack");
      assert(fs.existsSync(path.join(packDir, "pack.json")));

      const valRun = spawnSync(
        process.execPath,
        [SDK_PATH, "validate", packDir],
        { cwd: ROOT, encoding: "utf8", shell: false }
      );
      assert.equal(valRun.status, 0, `pack:validate failed: ${valRun.stderr || valRun.stdout}`);
      const valJson = JSON.parse(valRun.stdout);
      assert.equal(valJson.ok, true);

      const testRun = spawnSync(
        process.execPath,
        [SDK_PATH, "test", packDir],
        { cwd: ROOT, encoding: "utf8", shell: false }
      );
      assert.equal(testRun.status, 0, `pack:test failed: ${testRun.stderr || testRun.stdout}`);
      const testJson = JSON.parse(testRun.stdout);
      assert.equal(testJson.ok, true);
      assert.equal(testJson.passed, 1);
    } finally {
      reloadDefaultWorkflowPacks();
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  await check("AC7: buildPrompt rejects prototype-inherited method names safely", () => {
    for (const unsafeKey of ["toString", "constructor", "__proto__", "valueOf", "hasOwnProperty"]) {
      assert.throws(
        () => buildPrompt(unsafeKey, {}, {}),
        /Unknown prompt template/,
        `Expected buildPrompt('${unsafeKey}') to reject inherited property`
      );
    }
  });

  console.log(`\n========================================`);
  console.log(`Passed: ${passed}, Failed: ${failed}`);
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test suite crashed:", err);
  process.exit(1);
});
