const { spawnSync } = require("node:child_process");

function git(args, projectRoot, opts = {}) {
  return spawnSync("git", args, {
    cwd: projectRoot,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 8,
    shell: process.platform === "win32",
    ...opts
  });
}

function gitOk(args, projectRoot) {
  const result = git(args, projectRoot);
  return result.status === 0 ? (result.stdout || "").trim() : null;
}

function getRepositoryIdentity(projectRoot) {
  const remote = gitOk(["config", "--get", "remote.origin.url"], projectRoot);
  const branch = gitOk(["rev-parse", "--abbrev-ref", "HEAD"], projectRoot);
  return {
    repository: sanitizeRepository(remote || "local/locaily"),
    branch: branch || "unknown"
  };
}

function sanitizeRepository(value) {
  return String(value)
    .replace(/\/\/[^@/]+@/g, "//")
    .replace(/:[^/]+@/g, ":REDACTED@");
}

function getCommitMetadata(projectRoot, commitSha) {
  const format = "%H|%s|%an|%aI";
  const line = gitOk(["show", "-s", `--format=${format}`, commitSha], projectRoot);
  if (!line) {
    return null;
  }

  const [sha, subject, author, authoredAt] = line.split("|");
  const stat = git(["show", "--numstat", "--format=", commitSha], projectRoot);
  let filesChanged = 0;
  let linesChanged = 0;

  if (stat.status === 0) {
    for (const row of (stat.stdout || "").split(/\r?\n/)) {
      if (!row.trim()) continue;
      const parts = row.split("\t");
      if (parts.length < 3) continue;
      filesChanged += 1;
      linesChanged += Number(parts[0] || 0) + Number(parts[1] || 0);
    }
  }

  const nameOnly = git(["show", "--name-only", "--format=", commitSha], projectRoot);
  const changedPaths = nameOnly.status === 0
    ? (nameOnly.stdout || "").split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean)
    : [];

  return {
    sha: sha || commitSha,
    subject: subject || "",
    author: author || "",
    authoredAt: authoredAt || new Date().toISOString(),
    filesChanged,
    linesChanged,
    changedPaths: changedPaths.slice(0, 50)
  };
}

function listCommitsSince(projectRoot, baseRef, headRef = "HEAD") {
  const range = baseRef ? `${baseRef}..${headRef}` : headRef;
  const output = gitOk(["rev-list", range], projectRoot);
  if (!output) {
    return [];
  }

  return output.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean);
}

module.exports = {
  getRepositoryIdentity,
  getCommitMetadata,
  listCommitsSince,
  gitOk
};
