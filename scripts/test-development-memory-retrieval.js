const assert = require("node:assert");
const { mkdtempSync, rmSync, writeFileSync, mkdirSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { createVaultAdapter } = require("../companion/memory/vault-adapter");
const { createDevelopmentCandidateStore } = require("../companion/memory/events/candidate-store");
const { createDevelopmentCandidateReviewStore } = require("../companion/memory/events/candidate-review-store");
const { createDevelopmentMaintainerStore } = require("../companion/memory/events/maintainer-store");
const { createDevelopmentMemoryRetrieval } = require("../companion/memory/retrieval/index");
const { buildContextPack } = require("../companion/memory/context-pack-builder");

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

function makeRetrievalVault() {
  const root = mkdtempSync(join(tmpdir(), "locaily-dm-retrieval-"));
  writeFileSync(join(root, "index.md"), "# Vault\n\n## Current state\n- Active development memory loop.\n");
  writeFileSync(join(root, "log.md"), "# Log\n\n- Session notes.\n");

  const projectDir = join(root, "projects", "locaily");
  mkdirSync(join(projectDir, "updates"), { recursive: true });
  mkdirSync(join(projectDir, "evidence", "sessions"), { recursive: true });

  writeFileSync(join(projectDir, "PROJECT.md"), "# Project\n\nLocaily local brain.\n");
  writeFileSync(join(projectDir, "STATUS.md"), "# Status\n\n## Current state\n- DM8 retrieval integration in progress.\n");
  writeFileSync(join(projectDir, "DECISIONS.md"), "# Decisions\n\n## Decisions\n- Keep writeback proposal-only by default.\n");
  writeFileSync(join(projectDir, "BLOCKERS.md"), "# Blockers\n\n## Open questions\n- None currently.\n");
  writeFileSync(join(projectDir, "LESSONS.md"), "# Lessons\n\n- Prefer canonical pages over raw logs.\n");
  writeFileSync(join(projectDir, "updates", "2026-07-18-session.md"), "# Session\n\nRaw session dump with lots of detail.\n".repeat(50));
  writeFileSync(join(projectDir, "evidence", "sessions", "sess_001.md"), "# Evidence\n\nSession evidence.\n");
  mkdirSync(join(root, "topics"), { recursive: true });
  writeFileSync(join(root, "topics", "memory-bridge.md"), "# Memory Bridge\n\nTopic page.\n");

  return createVaultAdapter({
    enabled: true,
    vaultPath: root,
    allowApply: true,
    writebackMode: "proposal_only",
    allowedPaths: ["index.md", "log.md", "projects/", "topics/"],
    blockedPaths: ["raw/", "private/", ".memory-bridge/writeback-inbox/"]
  });
}

function seedCandidate(store, reviewStore, candidate, reviewStatus = "pending") {
  store.saveCandidate(candidate);

  if (reviewStatus) {
    reviewStore.saveReview({
      reviewId: `rev_${candidate.candidateId}`,
      schemaVersion: "1.0",
      candidateId: candidate.candidateId,
      status: reviewStatus,
      action: reviewStatus === "approved" ? "approve" : null,
      reviewer: reviewStatus === "approved" ? "test" : null,
      reviewedAt: reviewStatus === "approved" ? new Date().toISOString() : null,
      editedStatement: null,
      mergeTargetId: null,
      proposalId: null,
      proposalPath: null,
      notes: null,
      writebackDeliveryMode: "proposal_only",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }
}

function makeMaintainerRun(overrides = {}) {
  return {
    runId: "maint_retrieval_test_001",
    schemaVersion: "1.0",
    project: "locaily",
    status: "applied",
    items: [{
      candidateId: "cand_retrieval_approved_001",
      targetVaultPath: "projects/locaily/STATUS.md",
      suggestedOperation: "update_section",
      proposedStatement: "DM8 retrieval integration complete.",
      driftStatus: "content_drift",
      plannedAction: "append_section",
      applyAllowed: true,
      evidenceEventIds: ["evt_retrieval_001"]
    }],
    summary: {
      approvedCandidates: 1,
      plannedUpdates: 1,
      skippedDuplicates: 0,
      driftDetected: 1,
      reviewRequired: 0
    },
    createdAt: new Date().toISOString(),
    ...overrides
  };
}

async function run() {
  const checks = [
    ["prefers canonical project pages over raw session logs", async () => {
      const dir = mkdtempSync(join(tmpdir(), "locaily-dm-retrieval-suite-"));
      const adapter = makeRetrievalVault();
      const retrieval = createDevelopmentMemoryRetrieval({
        candidatesRoot: join(dir, "candidates"),
        maintainerRoot: join(dir, "maintainer")
      });

      const packResult = buildContextPack(adapter, {
        project: "locaily",
        task: "Implement retrieval integration decisions",
        maxFiles: 6,
        include: ["current_state", "known_decisions"],
        retrieval
      });

      assert.strictEqual(packResult.ok, true);
      assert.ok(packResult.result.filesUsed.includes("projects/locaily/STATUS.md"));
      assert.ok(packResult.result.filesUsed.includes("projects/locaily/DECISIONS.md"));
      assert.ok(!packResult.result.filesUsed.some((filePath) => filePath.includes("/updates/")));
      assert.ok(!packResult.result.filesUsed.some((filePath) => filePath.includes("/evidence/")));
      assert.ok(packResult.result.filesUsed.length <= 6);

      rmSync(dir, { recursive: true, force: true });
      rmSync(adapter.getVaultRoot(), { recursive: true, force: true });
    }],
    ["surfaces evidence references for approved and pending candidates", async () => {
      const dir = mkdtempSync(join(tmpdir(), "locaily-dm-retrieval-suite-"));
      const adapter = makeRetrievalVault();
      const candidatesRoot = join(dir, "candidates");
      const store = createDevelopmentCandidateStore({ rootDir: candidatesRoot });
      const reviewStore = createDevelopmentCandidateReviewStore({ rootDir: candidatesRoot });

      seedCandidate(store, reviewStore, {
        candidateId: "cand_retrieval_approved_001",
        schemaVersion: "1.0",
        candidateType: "status_update",
        proposedStatement: "Retrieval uses canonical STATUS page.",
        confidence: 0.9,
        evidenceEventIds: ["evt_retrieval_001"],
        targetProject: "locaily",
        suggestedVaultPath: "projects/locaily/STATUS.md",
        suggestedOperation: "update_section",
        contradictionStatus: "none",
        reviewRisk: "low",
        generatedBy: { method: "deterministic" },
        createdAt: new Date().toISOString()
      }, "approved");

      seedCandidate(store, reviewStore, {
        candidateId: "cand_retrieval_pending_001",
        schemaVersion: "1.0",
        candidateType: "decision",
        proposedStatement: "Pending decision not yet in vault.",
        confidence: 0.8,
        evidenceEventIds: ["evt_retrieval_002"],
        targetProject: "locaily",
        suggestedVaultPath: "projects/locaily/DECISIONS.md",
        suggestedOperation: "append",
        contradictionStatus: "none",
        reviewRisk: "high",
        generatedBy: { method: "deterministic" },
        createdAt: new Date().toISOString()
      }, "pending");

      const retrieval = createDevelopmentMemoryRetrieval({
        candidatesRoot,
        maintainerRoot: join(dir, "maintainer")
      });

      const packResult = buildContextPack(adapter, {
        project: "locaily",
        task: "Review decisions and accepted project knowledge",
        maxFiles: 8,
        include: ["known_decisions", "current_state"],
        retrieval
      });

      assert.strictEqual(packResult.ok, true);
      assert.ok(packResult.result.filesUsed.includes("projects/locaily/DECISIONS.md"));
      assert.ok(Array.isArray(packResult.result.evidenceReferences));
      assert.ok(packResult.result.evidenceReferences.some((entry) => entry.candidateId === "cand_retrieval_approved_001"));
      assert.ok(packResult.result.evidenceReferences.some((entry) => entry.candidateId === "cand_retrieval_pending_001"));

      rmSync(dir, { recursive: true, force: true });
      rmSync(adapter.getVaultRoot(), { recursive: true, force: true });
    }],
    ["emits stale and contradiction warnings from candidate and maintainer state", async () => {
      const dir = mkdtempSync(join(tmpdir(), "locaily-dm-retrieval-suite-"));
      const adapter = makeRetrievalVault();
      const candidatesRoot = join(dir, "candidates");
      const maintainerRoot = join(dir, "maintainer");
      const store = createDevelopmentCandidateStore({ rootDir: candidatesRoot });
      const reviewStore = createDevelopmentCandidateReviewStore({ rootDir: candidatesRoot });
      const maintainerStore = createDevelopmentMaintainerStore({ rootDir: maintainerRoot });

      seedCandidate(store, reviewStore, {
        candidateId: "cand_retrieval_contradiction_001",
        schemaVersion: "1.0",
        candidateType: "decision",
        proposedStatement: "Conflicting decision statement.",
        confidence: 0.7,
        evidenceEventIds: ["evt_retrieval_003"],
        targetProject: "locaily",
        suggestedVaultPath: "projects/locaily/DECISIONS.md",
        suggestedOperation: "append",
        contradictionStatus: "possible",
        reviewRisk: "high",
        generatedBy: { method: "deterministic" },
        createdAt: new Date().toISOString()
      }, "pending");

      maintainerStore.saveRun(makeMaintainerRun());

      const retrieval = createDevelopmentMemoryRetrieval({ candidatesRoot, maintainerRoot });
      const packResult = buildContextPack(adapter, {
        project: "locaily",
        task: "Check decision consistency",
        maxFiles: 8,
        include: ["known_decisions", "current_state"],
        retrieval
      });

      assert.strictEqual(packResult.ok, true);
      assert.ok(packResult.result.filesUsed.includes("projects/locaily/DECISIONS.md"));
      assert.ok(packResult.result.warnings.some((warning) => warning.includes("Stale context")));
      assert.ok(packResult.result.warnings.some((warning) => warning.includes("Contradiction risk")));
      assert.ok(packResult.result.warnings.some((warning) => warning.includes("Content drift detected")));
      assert.ok(packResult.result.retrieval.staleWarnings.length >= 2);
      assert.ok(packResult.result.retrieval.contradictionWarnings.length >= 1);

      rmSync(dir, { recursive: true, force: true });
      rmSync(adapter.getVaultRoot(), { recursive: true, force: true });
    }],
    ["enforces context budget without full vault dump", async () => {
      const dir = mkdtempSync(join(tmpdir(), "locaily-dm-retrieval-suite-"));
      const adapter = makeRetrievalVault();
      const retrieval = createDevelopmentMemoryRetrieval({
        candidatesRoot: join(dir, "candidates"),
        maintainerRoot: join(dir, "maintainer")
      });

      const packResult = buildContextPack(adapter, {
        project: "locaily",
        task: "Budget constrained retrieval",
        maxFiles: 12,
        contextBudgetChars: 120,
        excerptCharLimit: 200,
        retrieval
      });

      assert.strictEqual(packResult.ok, true);
      assert.ok(packResult.result.retrieval.contextBudget.used <= 120);
      assert.ok(packResult.result.filesUsed.length < adapter.listMarkdownFiles().length);
      assert.ok(packResult.result.warnings.some((warning) => warning.includes("Context budget reached")));

      const combinedLength = packResult.result.excerpts.map((entry) => entry.text.length).reduce((sum, value) => sum + value, 0);
      assert.ok(combinedLength <= 120);

      rmSync(dir, { recursive: true, force: true });
      rmSync(adapter.getVaultRoot(), { recursive: true, force: true });
    }],
    ["respects maintainer-backed page budget", async () => {
      const dir = mkdtempSync(join(tmpdir(), "locaily-dm-retrieval-suite-"));
      const adapter = makeRetrievalVault();
      const maintainerRoot = join(dir, "maintainer");
      const maintainerStore = createDevelopmentMaintainerStore({ rootDir: maintainerRoot });

      maintainerStore.saveRun(makeMaintainerRun({
        runId: "maint_retrieval_test_status",
        items: [{
          candidateId: "cand_retrieval_approved_001",
          targetVaultPath: "projects/locaily/STATUS.md",
          suggestedOperation: "update_section",
          proposedStatement: "Status update.",
          driftStatus: "none",
          plannedAction: "append_section",
          applyAllowed: true,
          evidenceEventIds: ["evt_retrieval_001"]
        }]
      }));

      maintainerStore.saveRun(makeMaintainerRun({
        runId: "maint_retrieval_test_decisions",
        items: [{
          candidateId: "cand_retrieval_approved_002",
          targetVaultPath: "projects/locaily/DECISIONS.md",
          suggestedOperation: "append",
          proposedStatement: "Decision update.",
          driftStatus: "none",
          plannedAction: "append_section",
          applyAllowed: true,
          evidenceEventIds: ["evt_retrieval_002"]
        }]
      }));

      const retrieval = createDevelopmentMemoryRetrieval({
        candidatesRoot: join(dir, "candidates"),
        maintainerRoot
      });

      const packResult = buildContextPack(adapter, {
        project: "locaily",
        task: "Maintainer budget test",
        maxFiles: 10,
        maintainerPageBudget: 1,
        retrieval
      });

      assert.strictEqual(packResult.ok, true);
      const maintainerBacked = packResult.result.filesUsed.filter((filePath) =>
        filePath === "projects/locaily/STATUS.md" || filePath === "projects/locaily/DECISIONS.md"
      );
      assert.ok(maintainerBacked.length <= 1);
      assert.ok(packResult.result.warnings.some((warning) => warning.includes("Maintainer-backed page budget reached")));

      rmSync(dir, { recursive: true, force: true });
      rmSync(adapter.getVaultRoot(), { recursive: true, force: true });
    }]
  ];

  for (const [name, fn] of checks) {
    await check(name, fn);
  }

  console.log(`\nRetrieval tests: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
