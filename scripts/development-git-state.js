const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const EXCLUDED_PATH_PREFIXES = Object.freeze(["development/", ".opencode/"]);

function runGit(cwd, args) {
  return spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
    shell: process.platform === "win32",
  });
}

function gitText(cwd, args) {
  const result = runGit(cwd, args);
  return result.status === 0 ? (result.stdout || "").trim() : null;
}

function isExcludedPath(filePath) {
  return EXCLUDED_PATH_PREFIXES.some(prefix => filePath.startsWith(prefix));
}

function parseStatusPaths(statusOutput) {
  return statusOutput
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => {
      const rawPath = line.slice(3);
      const renameParts = rawPath.split(" -> ");
      return {
        path: renameParts[renameParts.length - 1],
        state: line.slice(0, 2).trim() || "?",
      };
    });
}

function sourceTreeListing(cwd, head) {
  if (!head) return "";
  const result = runGit(cwd, ["ls-tree", "-r", "--full-tree", head, "--", "."]);
  if (result.status !== 0) return "";

  return (result.stdout || "")
    .split(/\r?\n/)
    .filter(Boolean)
    .filter(line => {
      const filePath = line.slice(line.indexOf("\t") + 1);
      return !isExcludedPath(filePath);
    })
    .join("\n");
}

function updateHash(hash, label, value) {
  hash.update(`${label}\0`);
  hash.update(value || "");
  hash.update("\0");
}

function computeGitFingerprint({ cwd = process.cwd() } = {}) {
  const branch = gitText(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const headCommit = gitText(cwd, ["rev-parse", "HEAD"]);
  const statusResult = runGit(cwd, ["status", "--porcelain"]);
  const statusPaths = statusResult.status === 0 ? parseStatusPaths(statusResult.stdout || "") : [];
  const changedFiles = statusPaths.filter(file => !isExcludedPath(file.path));

  const diffArgs = ["diff", "--", ":(exclude)development/", ":(exclude).opencode/"];
  const diffResult = runGit(cwd, diffArgs);
  const indexResult = runGit(cwd, ["diff", "--cached", ...diffArgs.slice(1)]);
  const untrackedResult = runGit(cwd, ["ls-files", "--others", "--exclude-standard"]);
  const untrackedFiles = untrackedResult.status === 0
    ? (untrackedResult.stdout || "").split(/\r?\n/).filter(file => file && !isExcludedPath(file))
    : [];

  const fingerprint = crypto.createHash("sha256");
  updateHash(fingerprint, "source-tree", sourceTreeListing(cwd, headCommit));
  updateHash(fingerprint, "working-tree-diff", diffResult.status === 0 ? diffResult.stdout : "");
  updateHash(fingerprint, "index-diff", indexResult.status === 0 ? indexResult.stdout : "");
  for (const filePath of untrackedFiles) {
    updateHash(fingerprint, "untracked-path", filePath);
    try {
      fingerprint.update(fs.readFileSync(path.join(cwd, filePath)));
    } catch {
      fingerprint.update("unreadable");
    }
  }

  return {
    branch,
    headCommit,
    fingerprint: `sha256:${fingerprint.digest("hex").slice(0, 16)}`,
    changedFiles,
  };
}

function getChangedPathsBetweenCommits({ cwd = process.cwd(), from, to } = {}) {
  if (!from || !to || from === to) return [];

  const ancestor = runGit(cwd, ["merge-base", "--is-ancestor", from, to]);
  if (ancestor.status !== 0) return null;

  const result = runGit(cwd, ["diff", "--name-only", `${from}..${to}`]);
  if (result.status !== 0) return null;
  return (result.stdout || "")
    .split(/\r?\n/)
    .filter(Boolean);
}

function isAllowedMetadataOnlyChange(changedPaths) {
  return Array.isArray(changedPaths)
    && changedPaths.length > 0
    && changedPaths.every(isExcludedPath);
}

function validateValidationRecordReference({ milestoneId, validationId, validation, validationIndex }) {
  if (!validationId || !validation) {
    return { ok: false, code: "NO_VALIDATION", message: "No validation record found" };
  }
  if (validation.id !== validationId) {
    return { ok: false, code: "VALIDATION_ID_MISMATCH", message: "Validation record ID does not match the milestone reference" };
  }
  if (validation.milestoneId !== milestoneId) {
    return {
      ok: false,
      code: "VALIDATION_WRONG_MILESTONE",
      message: `Validation is for milestone '${validation.milestoneId}', not '${milestoneId}'`,
    };
  }
  if (validationIndex?.latestByMilestone?.[milestoneId] !== validationId) {
    return {
      ok: false,
      code: "VALIDATION_UNREACHABLE",
      message: `Validation '${validationId}' is not reachable from the validation index for milestone '${milestoneId}'`,
    };
  }
  return { ok: true };
}

function compareValidationGitState(validationGitState, currentGitState, changedPathsBetweenHeads) {
  const errors = [];
  if (!validationGitState || !currentGitState) {
    return [{ code: "VALIDATION_GIT_STATE_MISSING", message: "Validation git state is missing" }];
  }

  if (validationGitState.branch !== currentGitState.branch) {
    errors.push({ code: "FINGERPRINT_BRANCH", message: "Validation branch != current branch" });
  }

  const fingerprintMatches = validationGitState.fingerprint === currentGitState.fingerprint;
  if (!fingerprintMatches) {
    errors.push({ code: "FINGERPRINT_CONTENT", message: "Validation fingerprint != current fingerprint" });
  }

  if (validationGitState.headCommit !== currentGitState.headCommit) {
    const metadataOnly = fingerprintMatches && isAllowedMetadataOnlyChange(changedPathsBetweenHeads);
    if (!metadataOnly) {
      errors.push({ code: "FINGERPRINT_HEAD", message: "Validation HEAD != current HEAD" });
    }
  }

  return errors;
}

module.exports = {
  EXCLUDED_PATH_PREFIXES,
  computeGitFingerprint,
  compareValidationGitState,
  getChangedPathsBetweenCommits,
  isAllowedMetadataOnlyChange,
  isExcludedPath,
  validateValidationRecordReference,
};
