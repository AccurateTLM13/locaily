/**
 * Development Memory end-to-end proof for a second registered project.
 *
 * Exercises the DM1–DM10 loop on a non-Locaily namespaced project:
 * register → vault → capture → session → candidates → review → retrieval
 *
 * Proof passes when every durable claim traces to source evidence and
 * locaily legacy storage remains isolated from the second project.
 */

const assert = require("node:assert");
const { mkdtempSync, rmSync, existsSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const capture = require("../companion/memory/events/capture");
const { createVaultAdapter } = require("../companion/memory/vault-adapter");
const { buildContextPack } = require("../companion/memory/context-pack-builder");
const { createDevelopmentProjectRegistry } = require("../companion/memory/projects/project-registry");
const { createDevelopmentMemoryServices } = require("../companion/memory/projects/memory-services");
const { runProjectSetupStep } = require("../companion/memory/projects/project-setup");
const { createDevelopmentSessionManager } = require("../companion/memory/events/session-manager");
const { createDevelopmentCandidateManager } = require("../companion/memory/events/candidate-manager");
const { createDevelopmentMemoryRetrieval } = require("../companion/memory/retrieval/index");
const { getLegacyMemoryPaths } = require("../companion/memory/projects/project-paths");

const SECOND_PROJECT_SLUG = "pilot-workspace";
const SECOND_PROJECT_DISPLAY = "Pilot Workspace";
const PROOF_DECISION_TITLE = "Use namespaced storage for non-Locaily projects";
const PROOF_DECISION_REASON = "Second-project E2E proof requires isolated development memory paths.";

const ROOT = join(__dirname, "..");

let passed = 0;
let failed = 0;

function check(name, fn) {
  return (async () => {
    try {
      await fn();
      passed += 1;
      console.log(`PASS: ${name}`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL: ${name}`);
      console.error(`  ${error.message}`);
    }
  })();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildVaultAdapter(vaultPath, project) {
  return createVaultAdapter({
    enabled: true,
    vaultPath,
    allowApply: false,
    writebackMode: "proposal_only",
    allowedPaths: project.allowedPaths,
    blockedPaths: project.blockedPaths || []
  });
}

async function runProofScenario(root) {
  const registry = createDevelopmentProjectRegistry({
    repoRoot: root,
    registryRoot: join(root, "data", "memory", "projects")
  });

  const registered = registry.registerProject({
    slug: SECOND_PROJECT_SLUG,
    displayName: SECOND_PROJECT_DISPLAY,
    workspaceRoot: root,
    setActive: true
  });
  assert.strictEqual(registered.ok, true);
  assert.strictEqual(registered.result.storageLayout, "namespaced");

  const vaultPath = join(root, "vaults", SECOND_PROJECT_SLUG);
  const generated = runProjectSetupStep(registry, "generate-vault", {
    slug: SECOND_PROJECT_SLUG,
    vaultPath,
    layout: "canonical"
  });
  assert.strictEqual(generated.ok, true);
  assert.ok(existsSync(join(vaultPath, "projects", SECOND_PROJECT_SLUG, "DECISIONS.md")));

  const enabled = runProjectSetupStep(registry, "enable-capture", { slug: SECOND_PROJECT_SLUG });
  assert.strictEqual(enabled.ok, true);

  const project = registry.getProject(SECOND_PROJECT_SLUG);
  const adapter = buildVaultAdapter(vaultPath, project);
  const services = createDevelopmentMemoryServices(registry, {
    repoRoot: root,
    getVaultAdapter: () => adapter
  }).forProject(SECOND_PROJECT_SLUG);

  const paths = services.paths;
  assert.ok(paths.eventsDir.includes(join("projects", SECOND_PROJECT_SLUG)));
  assert.ok(paths.candidatesRoot.includes(join("projects", SECOND_PROJECT_SLUG)));

  const sessionManager = createDevelopmentSessionManager({
    project: SECOND_PROJECT_SLUG,
    eventsDir: paths.eventsDir,
    sessionsRoot: paths.sessionsRoot
  });

  const objectiveId = "dm-e2e-second-project";
  const runId = "run_e2e_pilot_workspace";
  const started = sessionManager.startSession({
    objectiveId,
    runId,
    branch: "main",
    label: "Second project E2E proof session"
  });
  assert.strictEqual(started.ok, true);

  capture.init({
    project: SECOND_PROJECT_SLUG,
    dataDir: paths.eventsDir,
    sessionsRoot: paths.sessionsRoot
  });

  capture.emitTaskAccepted({
    projectRoot: root,
    objectiveId,
    taskId: "task-schema-check",
    runId,
    iteration: 0
  });
  capture.emitTaskAccepted({
    projectRoot: root,
    objectiveId,
    taskId: "task-retrieval-check",
    runId,
    iteration: 1
  });
  capture.emitTestCompleted({
    projectRoot: root,
    objectiveId,
    taskId: "task-retrieval-check",
    runId,
    passed: true,
    commandCount: 1
  });
  capture.emitDecisionRecorded({
    projectRoot: root,
    projectSlug: SECOND_PROJECT_SLUG,
    title: PROOF_DECISION_TITLE,
    reason: PROOF_DECISION_REASON
  });

  await sleep(400);

  const closed = await sessionManager.closeSession({ sessionId: started.result.sessionId });
  assert.strictEqual(closed.ok, true);
  assert.strictEqual(closed.result.status, "closed");
  assert.ok(closed.result.metrics.tasksCompleted >= 2);

  const candidateManager = createDevelopmentCandidateManager({
    project: SECOND_PROJECT_SLUG,
    eventsDir: paths.eventsDir,
    sessionsRoot: paths.sessionsRoot,
    candidatesRoot: paths.candidatesRoot
  });

  const extracted = await candidateManager.extractFromSession({
    sessionId: started.result.sessionId
  });
  assert.strictEqual(extracted.ok, true);
  assert.ok(extracted.result.savedCount >= 1);

  const listed = candidateManager.listCandidates({ sessionId: started.result.sessionId });
  const decision = listed.result.candidates.find((item) => item.candidateType === "decision");
  assert.ok(decision, "expected decision candidate from decision_recorded event");
  assert.ok(decision.proposedStatement.includes("namespaced storage"));

  const inboxBefore = await services.reviewInbox.listInbox({
    project: SECOND_PROJECT_SLUG,
    status: "pending"
  });
  assert.strictEqual(inboxBefore.ok, true);
  assert.ok(inboxBefore.result.count >= 1);

  const approved = await services.reviewInbox.performAction({
    candidateId: decision.candidateId,
    action: "approve",
    reviewer: "e2e-proof",
    notes: "Approved during second-project end-to-end proof."
  });
  assert.strictEqual(approved.ok, true);
  assert.strictEqual(approved.result.review.status, "approved");

  const retrieval = createDevelopmentMemoryRetrieval({
    candidatesRoot: paths.candidatesRoot,
    maintainerRoot: paths.maintainerRoot
  });

  const contextPack = buildContextPack(adapter, {
    project: SECOND_PROJECT_SLUG,
    task: "Continue development with accepted project memory",
    maxFiles: 8,
    include: ["current_state", "known_decisions"],
    retrieval
  });

  assert.strictEqual(contextPack.ok, true);

  const decisionsPath = `projects/${SECOND_PROJECT_SLUG}/DECISIONS.md`;
  assert.ok(
    contextPack.result.filesUsed.includes(decisionsPath),
    "context pack should include canonical DECISIONS page for the second project"
  );

  const evidenceRef = (contextPack.result.evidenceReferences || []).find(
    (ref) => ref.candidateId === decision.candidateId
  );
  assert.ok(evidenceRef, "context pack should reference approved candidate evidence");
  assert.strictEqual(evidenceRef.reviewStatus, "approved");
  assert.ok(
    (contextPack.result.retrieval && contextPack.result.retrieval.evidenceCount >= 1),
    "retrieval metadata should report surfaced evidence"
  );

  return {
    registry,
    services,
    paths,
    decision,
    sessionId: started.result.sessionId
  };
}

async function run() {
  const checks = [
    ["registers and activates a non-Locaily second project", async () => {
      const root = mkdtempSync(join(tmpdir(), "locaily-dm-e2e-"));
      const registry = createDevelopmentProjectRegistry({
        repoRoot: root,
        registryRoot: join(root, "data", "memory", "projects")
      });

      const result = registry.registerProject({
        slug: SECOND_PROJECT_SLUG,
        displayName: SECOND_PROJECT_DISPLAY,
        workspaceRoot: root,
        setActive: true
      });

      assert.strictEqual(result.ok, true);
      assert.notStrictEqual(result.result.slug, "locaily");
      assert.strictEqual(result.result.storageLayout, "namespaced");
      assert.strictEqual(registry.getActiveProjectSlug(), SECOND_PROJECT_SLUG);

      rmSync(root, { recursive: true, force: true });
    }],
    ["runs capture → session → candidate → review → retrieval on second project", async () => {
      const root = mkdtempSync(join(tmpdir(), "locaily-dm-e2e-"));
      await runProofScenario(root);
      rmSync(root, { recursive: true, force: true });
    }],
    ["keeps locaily legacy storage isolated from the second project", async () => {
      const root = mkdtempSync(join(tmpdir(), "locaily-dm-e2e-"));
      const proof = await runProofScenario(root);

      const legacyPaths = getLegacyMemoryPaths(root);
      const locailyServices = proof.registry.resolveMemoryPaths("locaily");
      assert.strictEqual(locailyServices.storageLayout, "legacy");
      assert.notStrictEqual(legacyPaths.eventsDir, proof.paths.eventsDir);
      assert.notStrictEqual(legacyPaths.candidatesRoot, proof.paths.candidatesRoot);

      const locailyEvents = await createDevelopmentMemoryServices(proof.registry)
        .forProject("locaily")
        .eventStore.queryEvents({ project: "locaily" });
      const pilotEvents = await proof.services.eventStore.queryEvents({ project: SECOND_PROJECT_SLUG });

      assert.strictEqual(locailyEvents.result.count, 0);
      assert.ok(pilotEvents.result.count >= 1);
      assert.ok(
        pilotEvents.result.events.every((event) => event.project === SECOND_PROJECT_SLUG),
        "pilot-workspace events must not be stored under locaily legacy paths"
      );

      rmSync(root, { recursive: true, force: true });
    }],
    ["stores second-project evidence under namespaced paths only", async () => {
      const root = mkdtempSync(join(tmpdir(), "locaily-dm-e2e-"));
      const proof = await runProofScenario(root);

      assert.ok(existsSync(proof.paths.eventsDir));
      assert.ok(existsSync(proof.paths.candidatesRoot));
      assert.ok(existsSync(join(proof.paths.candidatesRoot, "reviews")));
      assert.ok(existsSync(join(proof.paths.sessionsRoot, "manifests")));

      const legacyCandidatesRoot = getLegacyMemoryPaths(root).candidatesRoot;
      assert.notStrictEqual(proof.paths.candidatesRoot, legacyCandidatesRoot);

      rmSync(root, { recursive: true, force: true });
    }]
  ];

  for (const [name, fn] of checks) {
    await check(name, fn);
  }

  console.log(`\nDevelopment Memory E2E (second project) tests: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
