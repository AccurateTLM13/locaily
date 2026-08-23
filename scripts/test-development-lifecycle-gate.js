#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const {
  compareValidationGitState,
  computeGitFingerprint,
  getChangedPathsBetweenCommits,
  validateValidationRecordReference,
} = require("./development-git-state");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed += 1;
  } catch (error) {
    console.log(`  FAIL  ${name}`);
    console.log(`        ${error.message}`);
    failed += 1;
  }
}

function runGit(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${(result.stderr || result.stdout || "").trim()}`);
  }
  return (result.stdout || "").trim();
}

function commit(cwd, message) {
  runGit(cwd, ["add", "."]);
  runGit(cwd, ["commit", "-m", message]);
  return runGit(cwd, ["rev-parse", "HEAD"]);
}

function errorCodes(errors) {
  return errors.map(error => error.code);
}

test("validation profile checks run before milestone metadata is persisted", () => {
  const lifecycleSource = fs.readFileSync(path.join(__dirname, "dev-lifecycle.js"), "utf8");
  const validatingIndex = lifecycleSource.indexOf('milestone.status = "validating"');
  const requiredChecksIndex = lifecycleSource.indexOf(
    "for (const check of (profile.required || []))",
    validatingIndex
  );
  const persistedMilestoneIndex = lifecycleSource.indexOf("writeMilestone(milestone)", validatingIndex);

  assert.notEqual(validatingIndex, -1);
  assert.ok(requiredChecksIndex > validatingIndex);
  assert.ok(persistedMilestoneIndex > requiredChecksIndex);
});

const repo = fs.mkdtempSync(path.join(os.tmpdir(), "locaily-lifecycle-gate-"));

try {
  runGit(repo, ["init", "-b", "main"]);
  runGit(repo, ["config", "user.email", "codex@example.invalid"]);
  runGit(repo, ["config", "user.name", "Codex Test"]);
  fs.mkdirSync(path.join(repo, "development"), { recursive: true });
  fs.writeFileSync(path.join(repo, "source.txt"), "source-v1\n");
  fs.writeFileSync(path.join(repo, "development", "metadata.json"), "{\"state\":1}\n");
  const validatedHead = commit(repo, "source baseline");
  const validatedGitState = computeGitFingerprint({ cwd: repo });

  test("development metadata commit preserves the source fingerprint", () => {
    fs.writeFileSync(path.join(repo, "development", "metadata.json"), "{\"state\":2}\n");
    const metadataHead = commit(repo, "development metadata");
    const currentGitState = computeGitFingerprint({ cwd: repo });
    const changedPaths = getChangedPathsBetweenCommits({ cwd: repo, from: validatedHead, to: metadataHead });

    assert.equal(currentGitState.fingerprint, validatedGitState.fingerprint);
    assert.notEqual(currentGitState.headCommit, validatedGitState.headCommit);
    assert.deepEqual(changedPaths, ["development/metadata.json"]);
    assert.deepEqual(compareValidationGitState(validatedGitState, currentGitState, changedPaths), []);
  });

  const metadataHead = runGit(repo, ["rev-parse", "HEAD"]);

  test("source changes fail even when the validation head is reachable", () => {
    fs.writeFileSync(path.join(repo, "source.txt"), "source-v2\n");
    const sourceHead = commit(repo, "source change");
    const currentGitState = computeGitFingerprint({ cwd: repo });
    const changedPaths = getChangedPathsBetweenCommits({ cwd: repo, from: metadataHead, to: sourceHead });
    const errors = compareValidationGitState(validatedGitState, currentGitState, changedPaths);

    assert(errorCodes(errors).includes("FINGERPRINT_CONTENT"));
    assert(errorCodes(errors).includes("FINGERPRINT_HEAD"));
  });

  test("branch changes fail independently of source content", () => {
    runGit(repo, ["switch", "-c", "other-branch"]);
    const currentGitState = computeGitFingerprint({ cwd: repo });
    const errors = compareValidationGitState(
      { ...currentGitState, branch: "main", headCommit: currentGitState.headCommit },
      currentGitState,
      []
    );

    assert.deepEqual(errorCodes(errors), ["FINGERPRINT_BRANCH"]);
    runGit(repo, ["switch", "main"]);
  });

  test("fingerprint changes fail even when branch and head match", () => {
    const currentGitState = computeGitFingerprint({ cwd: repo });
    const errors = compareValidationGitState(
      { ...currentGitState, fingerprint: "sha256:forged-evidence" },
      currentGitState,
      []
    );

    assert.deepEqual(errorCodes(errors), ["FINGERPRINT_CONTENT"]);
  });

  test("metadata-only allowance fails when commit ancestry cannot be proven", () => {
    const currentGitState = computeGitFingerprint({ cwd: repo });
    const errors = compareValidationGitState(
      { ...currentGitState, headCommit: "unreachable-validation-head" },
      currentGitState,
      null
    );

    assert.deepEqual(errorCodes(errors), ["FINGERPRINT_HEAD"]);
  });

  test("validation records must be reachable from the canonical index", () => {
    const result = validateValidationRecordReference({
      milestoneId: "gate-test",
      validationId: "validation-1",
      validation: { id: "validation-1", milestoneId: "gate-test", status: "passed" },
      validationIndex: { latestByMilestone: {} },
    });

    assert.equal(result.ok, false);
    assert.equal(result.code, "VALIDATION_UNREACHABLE");
  });
} finally {
  fs.rmSync(repo, { recursive: true, force: true });
}

console.log(`\n## Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
