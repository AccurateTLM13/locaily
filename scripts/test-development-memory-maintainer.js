const assert = require("node:assert");
const { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { createVaultAdapter } = require("../companion/memory/vault-adapter");
const { createDevelopmentCandidateStore } = require("../companion/memory/events/candidate-store");
const { createDevelopmentCandidateReviewStore } = require("../companion/memory/events/candidate-review-store");
const { createDevelopmentMaintainerManager } = require("../companion/memory/events/maintainer-manager");
const { detectVaultDrift } = require("../companion/memory/events/maintainer-drift");

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

function makeVault() {
  const root = mkdtempSync(join(tmpdir(), "locaily-dm-maintainer-"));
  writeFileSync(join(root, "index.md"), "# Test Vault\n");
  mkdirSync(join(root, "projects", "locaily"), { recursive: true });
  writeFileSync(
    join(root, "projects", "locaily", "STATUS.md"),
    "# Status\n\nObjective dm7-test started earlier.\n"
  );
  return createVaultAdapter({
    enabled: true,
    vaultPath: root,
    allowApply: true,
    writebackMode: "apply",
    allowedPaths: ["index.md", "projects/"],
    blockedPaths: ["raw/", "private/", ".memory-bridge/writeback-inbox/"]
  });
}

function seedApprovedCandidate(store, reviewStore, overrides = {}) {
  const candidate = {
    candidateId: "cand_maintainer_low_001",
    schemaVersion: "1.0",
    candidateType: "status_update",
    proposedStatement: "Objective dm7-test completed with maintainer coverage.",
    confidence: 0.85,
    evidenceEventIds: ["evt_maintainer_001"],
    targetProject: "locaily",
    suggestedVaultPath: "projects/locaily/STATUS.md",
    suggestedOperation: "update_section",
    contradictionStatus: "none",
    reviewRisk: "low",
    generatedBy: { method: "deterministic" },
    createdAt: new Date().toISOString(),
    ...overrides
  };

  store.saveCandidate(candidate);
  reviewStore.saveReview({
    reviewId: "rev_maintainer_low_001",
    schemaVersion: "1.0",
    candidateId: candidate.candidateId,
    status: "approved",
    action: "approve",
    reviewer: "test",
    reviewedAt: new Date().toISOString(),
    editedStatement: null,
    mergeTargetId: null,
    proposalId: null,
    proposalPath: null,
    notes: null,
    writebackDeliveryMode: "proposal_only",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  return candidate;
}

async function run() {
  const checks = [
    ["planRun creates deterministic maintainer manifest without mutating vault", async () => {
      const dir = mkdtempSync(join(tmpdir(), "locaily-dm-maintainer-suite-"));
      const candidatesRoot = join(dir, "candidates");
      const maintainerRoot = join(dir, "maintainer");
      const adapter = makeVault();
      const store = createDevelopmentCandidateStore({ rootDir: candidatesRoot });
      const reviewStore = createDevelopmentCandidateReviewStore({ rootDir: candidatesRoot });
      seedApprovedCandidate(store, reviewStore);

      const manager = createDevelopmentMaintainerManager({
        candidatesRoot,
        maintainerRoot,
        vaultAdapter: adapter
      });

      const before = readFileSync(join(adapter.getVaultRoot(), "projects", "locaily", "STATUS.md"), "utf8");
      const planned = manager.planRun({ project: "locaily" });
      const after = readFileSync(join(adapter.getVaultRoot(), "projects", "locaily", "STATUS.md"), "utf8");

      assert.strictEqual(planned.ok, true);
      assert.strictEqual(before, after);
      assert.ok(planned.result.summary.plannedUpdates >= 1);
      assert.ok(planned.result.items[0].driftStatus === "content_drift" || planned.result.items[0].driftStatus === "none");

      rmSync(dir, { recursive: true, force: true });
      rmSync(adapter.getVaultRoot(), { recursive: true, force: true });
    }],
    ["drift detection flags existing statement duplicates", async () => {
      const drift = detectVaultDrift({
        statement: "Objective dm7-test started earlier.",
        vaultContent: "# Status\n\nObjective dm7-test started earlier.\n",
        vaultReadable: true,
        targetVaultPath: "projects/locaily/STATUS.md"
      });

      assert.strictEqual(drift.driftStatus, "statement_already_present");
    }],
    ["applyRun requires explicit low-risk opt-in and writes rollback manifest", async () => {
      const dir = mkdtempSync(join(tmpdir(), "locaily-dm-maintainer-suite-"));
      const candidatesRoot = join(dir, "candidates");
      const maintainerRoot = join(dir, "maintainer");
      const adapter = makeVault();
      const store = createDevelopmentCandidateStore({ rootDir: candidatesRoot });
      const reviewStore = createDevelopmentCandidateReviewStore({ rootDir: candidatesRoot });
      seedApprovedCandidate(store, reviewStore);

      const manager = createDevelopmentMaintainerManager({
        candidatesRoot,
        maintainerRoot,
        vaultAdapter: adapter
      });

      const planned = manager.planRun({ project: "locaily" });
      const blocked = manager.applyRun({ runId: planned.result.runId });
      assert.strictEqual(blocked.ok, false);

      const applied = manager.applyRun({
        runId: planned.result.runId,
        allowApplyLowRisk: true
      });
      assert.strictEqual(applied.ok, true);
      assert.ok(applied.result.rollback.snapshots.length >= 1);

      const statusContent = readFileSync(join(adapter.getVaultRoot(), "projects", "locaily", "STATUS.md"), "utf8");
      assert.ok(statusContent.includes("Objective dm7-test completed with maintainer coverage."));

      rmSync(dir, { recursive: true, force: true });
      rmSync(adapter.getVaultRoot(), { recursive: true, force: true });
    }],
    ["high-risk approved candidates remain review_required in maintainer plan", async () => {
      const dir = mkdtempSync(join(tmpdir(), "locaily-dm-maintainer-suite-"));
      const candidatesRoot = join(dir, "candidates");
      const maintainerRoot = join(dir, "maintainer");
      const adapter = makeVault();
      const store = createDevelopmentCandidateStore({ rootDir: candidatesRoot });
      const reviewStore = createDevelopmentCandidateReviewStore({ rootDir: candidatesRoot });
      seedApprovedCandidate(store, reviewStore, {
        candidateId: "cand_maintainer_high_001",
        candidateType: "decision",
        reviewRisk: "high",
        suggestedVaultPath: "projects/locaily/DECISIONS.md",
        suggestedOperation: "append",
        proposedStatement: "Never auto-apply high-risk maintainer updates."
      });
      reviewStore.saveReview({
        reviewId: "rev_maintainer_high_001",
        schemaVersion: "1.0",
        candidateId: "cand_maintainer_high_001",
        status: "approved",
        action: "approve",
        reviewer: "test",
        reviewedAt: new Date().toISOString(),
        editedStatement: null,
        mergeTargetId: null,
        proposalId: null,
        proposalPath: null,
        notes: null,
        writebackDeliveryMode: "proposal_only",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      const manager = createDevelopmentMaintainerManager({
        candidatesRoot,
        maintainerRoot,
        vaultAdapter: adapter
      });
      const planned = manager.planRun({ project: "locaily" });
      const highItem = planned.result.items.find((item) => item.candidateId === "cand_maintainer_high_001");

      assert.strictEqual(highItem.plannedAction, "review_required");
      assert.strictEqual(highItem.applyAllowed, false);

      rmSync(dir, { recursive: true, force: true });
      rmSync(adapter.getVaultRoot(), { recursive: true, force: true });
    }]
  ];

  for (const [name, fn] of checks) {
    await check(name, fn);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
