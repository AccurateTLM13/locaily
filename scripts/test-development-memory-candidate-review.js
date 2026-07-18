const assert = require("node:assert");
const { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { createVaultAdapter } = require("../companion/memory/vault-adapter");
const { createDevelopmentCandidateStore } = require("../companion/memory/events/candidate-store");
const { createDevelopmentCandidateReviewInbox } = require("../companion/memory/events/candidate-review-inbox");
const { resolveCandidateWritebackPolicy } = require("../companion/memory/events/candidate-review-policy");

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

function makeVault({ allowApply = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), "locaily-dm-review-"));
  writeFileSync(join(root, "index.md"), "# Test Vault\n");
  mkdirSync(join(root, "projects", "locaily"), { recursive: true });
  writeFileSync(join(root, "projects", "locaily", "DECISIONS.md"), "# Decisions\n");
  return createVaultAdapter({
    enabled: true,
    vaultPath: root,
    allowApply,
    writebackMode: allowApply ? "apply" : "proposal_only",
    allowedPaths: ["index.md", "projects/"],
    blockedPaths: ["raw/", "private/", ".memory-bridge/writeback-inbox/"]
  });
}

function makeCandidate(overrides = {}) {
  return {
    candidateId: "cand_review_test_001",
    schemaVersion: "1.0",
    candidateType: "decision",
    proposedStatement: "Keep proposal-only writeback as the default Memory Bridge behavior.",
    confidence: 0.95,
    evidenceEventIds: ["evt_review_test_001"],
    targetProject: "locaily",
    suggestedVaultPath: "projects/locaily/DECISIONS.md",
    suggestedOperation: "append",
    contradictionStatus: "none",
    reviewRisk: "high",
    generatedBy: { method: "deterministic" },
    createdAt: new Date().toISOString(),
    ...overrides
  };
}

async function run() {
  const checks = [
    ["inbox lists pending candidates with evidence metadata", async () => {
      const dir = mkdtempSync(join(tmpdir(), "locaily-dm-review-suite-"));
      const candidatesRoot = join(dir, "candidates");
      const store = createDevelopmentCandidateStore({ rootDir: candidatesRoot });
      store.saveCandidate(makeCandidate());

      const inbox = createDevelopmentCandidateReviewInbox({ candidatesRoot });
      const listed = await inbox.listInbox({ status: "pending" });
      assert.strictEqual(listed.ok, true);
      assert.strictEqual(listed.result.count, 1);
      assert.strictEqual(listed.result.items[0].reviewStatus, "pending");
      assert.ok(listed.result.items[0].suggestedVaultPath.includes("DECISIONS.md"));

      rmSync(dir, { recursive: true, force: true });
    }],
    ["approve creates proposal_only writeback and never auto-applies vault content", async () => {
      const dir = mkdtempSync(join(tmpdir(), "locaily-dm-review-suite-"));
      const candidatesRoot = join(dir, "candidates");
      const adapter = makeVault({ allowApply: true });
      const store = createDevelopmentCandidateStore({ rootDir: candidatesRoot });
      store.saveCandidate(makeCandidate());

      const inbox = createDevelopmentCandidateReviewInbox({
        candidatesRoot,
        vaultAdapter: adapter
      });

      const approved = await inbox.performAction({
        candidateId: "cand_review_test_001",
        action: "approve",
        reviewer: "test"
      });

      assert.strictEqual(approved.ok, true);
      assert.strictEqual(approved.result.review.status, "approved");
      assert.strictEqual(approved.result.writebackPolicy.autoApplyAllowed, false);
      assert.ok(approved.result.proposal.proposalPath.includes(".memory-bridge/writeback-inbox/"));

      const target = join(adapter.getVaultRoot(), "projects", "locaily", "DECISIONS.md");
      const decisionsContent = readFileSync(target, "utf8");
      assert.ok(!decisionsContent.includes("Keep proposal-only writeback"));

      rmSync(dir, { recursive: true, force: true });
      rmSync(adapter.getVaultRoot(), { recursive: true, force: true });
    }],
    ["reject and defer transitions persist without proposals", async () => {
      const dir = mkdtempSync(join(tmpdir(), "locaily-dm-review-suite-"));
      const candidatesRoot = join(dir, "candidates");
      const store = createDevelopmentCandidateStore({ rootDir: candidatesRoot });
      store.saveCandidate(makeCandidate({ candidateId: "cand_review_reject" }));
      store.saveCandidate(makeCandidate({ candidateId: "cand_review_defer", candidateType: "blocker", reviewRisk: "medium" }));

      const inbox = createDevelopmentCandidateReviewInbox({ candidatesRoot });

      const rejected = await inbox.performAction({
        candidateId: "cand_review_reject",
        action: "reject",
        reviewer: "test"
      });
      const deferred = await inbox.performAction({
        candidateId: "cand_review_defer",
        action: "defer",
        reviewer: "test"
      });

      assert.strictEqual(rejected.result.review.status, "rejected");
      assert.strictEqual(deferred.result.review.status, "deferred");
      assert.strictEqual(rejected.result.proposal, null);

      rmSync(dir, { recursive: true, force: true });
    }],
    ["merge marks candidate merged without deleting source candidate", async () => {
      const dir = mkdtempSync(join(tmpdir(), "locaily-dm-review-suite-"));
      const candidatesRoot = join(dir, "candidates");
      const store = createDevelopmentCandidateStore({ rootDir: candidatesRoot });
      store.saveCandidate(makeCandidate({ candidateId: "cand_merge_target" }));
      store.saveCandidate(makeCandidate({ candidateId: "cand_merge_source", proposedStatement: "Duplicate wording variant." }));

      const inbox = createDevelopmentCandidateReviewInbox({ candidatesRoot });
      const merged = await inbox.performAction({
        candidateId: "cand_merge_source",
        action: "merge",
        reviewer: "test",
        mergeTargetId: "cand_merge_target"
      });

      assert.strictEqual(merged.ok, true);
      assert.strictEqual(merged.result.review.status, "merged");
      assert.strictEqual(merged.result.review.mergeTargetId, "cand_merge_target");
      assert.ok(store.readCandidate("cand_merge_source"));

      rmSync(dir, { recursive: true, force: true });
    }],
    ["writeback policy keeps proposal_only even when vault apply is enabled", () => {
      const policy = resolveCandidateWritebackPolicy(makeCandidate(), {
        writebackMode: "apply",
        allowApply: true
      });

      assert.strictEqual(policy.deliveryMode, "proposal_only");
      assert.strictEqual(policy.autoApplyAllowed, false);
      assert.strictEqual(policy.requiresHumanReview, true);
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
