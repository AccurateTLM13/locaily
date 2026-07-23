#!/usr/bin/env node
/**
 * scripts/deliver-milestone.js
 *
 * Phase 2C delivery: pushes validated commit and creates draft PR.
 * Consumes canonical milestone, validation, and closeout records.
 *
 * Required lifecycle:
 *   start → checkpoint → session:close → prepare → validate → complete → deliver
 *
 * Usage:
 *   node scripts/deliver-milestone.js --slug <slug> --dry-run
 *   node scripts/deliver-milestone.js --slug <slug> --execute
 *   node scripts/deliver-milestone.js --slug <slug> --pr
 *   node scripts/deliver-milestone.js --slug <slug> --all
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const readline = require("node:readline");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const DEVELOPMENT_DIR = path.join(PROJECT_ROOT, "development");
const MILESTONES_DIR = path.join(DEVELOPMENT_DIR, "milestones");
const SESSIONS_DIR = path.join(DEVELOPMENT_DIR, "sessions");
const VALIDATION_RESULTS_DIR = path.join(DEVELOPMENT_DIR, "validation-results");
const DELIVERY_DIR = path.join(DEVELOPMENT_DIR, "delivery");
const CLOSEOUT_PATH = path.join(PROJECT_ROOT, "docs", "07-progress", "work-closeout.json");

// ---- helpers ----

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return fallback; }
}

function writeJson(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + "\n");
}

function readText(p) {
  try { return fs.readFileSync(p, "utf8"); } catch { return ""; }
}

function git(args) {
  const result = spawnSync("git", args, {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    shell: process.platform === "win32",
  });
  return result;
}

function gitOk(args) {
  const r = git(args);
  return r.status === 0 ? (r.stdout || "").trim() : null;
}

function gh(args) {
  return spawnSync("gh", args, {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    shell: process.platform === "win32",
  });
}

function extractArg(args, name) {
  const idx = args.indexOf(name);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1];
}

function hasFlag(args, name) {
  return args.includes(name);
}

function now() {
  return new Date().toISOString();
}

// ---- git fingerprint ----

function computeGitFingerprint() {
  const branch = gitOk(["rev-parse", "--abbrev-ref", "HEAD"]);
  const head = gitOk(["rev-parse", "HEAD"]);
  const treeHash = gitOk(["rev-parse", "HEAD^{tree}"]) || "";

  const statusOutput = (git(["status", "--porcelain"]) || { stdout: "" }).stdout || "";
  const lines = statusOutput.split(/\r?\n/).filter(Boolean);
  const excludedPrefixes = ["development/", ".opencode/"];
  const changedFiles = [];
  for (const line of lines) {
    const gitStatus = line.slice(0, 2).trim();
    const filePath = line.slice(3);
    const isExcluded = excludedPrefixes.some(p => filePath.startsWith(p));
    if (!isExcluded) {
      changedFiles.push({ path: filePath, state: gitStatus || "?" });
    }
  }

  const diffHash = (git(["diff", "--", ":(exclude)development/", ":(exclude).opencode/"]) || { stdout: "" }).stdout || "";
  const indexHash = (git(["diff", "--cached", ":(exclude)development/", ":(exclude).opencode/"]) || { stdout: "" }).stdout || "";
  const untrackedFiles = ((git(["ls-files", "--others", "--exclude-standard"]) || { stdout: "" }).stdout || "")
    .split(/\r?\n/)
    .filter(f => f && !excludedPrefixes.some(p => f.startsWith(p)))
    .join("\n");

  const fp = crypto.createHash("sha256");
  fp.update(treeHash);
  fp.update(diffHash);
  fp.update(indexHash);
  fp.update(untrackedFiles);

  return {
    branch,
    headCommit: head,
    treeHash,
    fingerprint: `sha256:${fp.digest("hex").slice(0, 16)}`,
    changedFiles,
  };
}

// ---- milestone / validation / delivery ----

function readMilestone(slug) {
  return readJson(path.join(MILESTONES_DIR, `${slug}.json`), null);
}

function writeMilestone(milestone) {
  writeJson(path.join(MILESTONES_DIR, `${milestone.id}.json`), milestone);
}

function readValidationResult(id) {
  if (!id) return null;
  return readJson(path.join(VALIDATION_RESULTS_DIR, `${id}.json`), null);
}

function readCloseout() {
  return readJson(CLOSEOUT_PATH, null);
}

function deliveryPath(slug) {
  return path.join(DELIVERY_DIR, `${slug}.json`);
}

function readDelivery(slug) {
  return readJson(deliveryPath(slug), null);
}

function writeDelivery(delivery) {
  fs.mkdirSync(DELIVERY_DIR, { recursive: true });
  writeJson(deliveryPath(delivery.milestoneId), delivery);
}

// ---- preflight ----

function preflight(slug) {
  const errors = [];
  const warnings = [];

  // 1. Milestone exists and is ready-for-delivery
  const milestone = readMilestone(slug);
  if (!milestone) {
    errors.push({ code: "MILESTONE_NOT_FOUND", message: `Milestone '${slug}' not found` });
    return { ok: false, errors, warnings, milestone: null, validation: null, closeout: null, git: null };
  }
  if (milestone.status !== "ready-for-delivery") {
    errors.push({ code: "NOT_READY", message: `Milestone status is '${milestone.status}', expected 'ready-for-delivery'` });
  }

  // 2. Branch matches
  const currentBranch = gitOk(["rev-parse", "--abbrev-ref", "HEAD"]);
  if (milestone.completionBranch && currentBranch !== milestone.completionBranch) {
    errors.push({ code: "BRANCH_MISMATCH", message: `Current branch '${currentBranch}' != milestone branch '${milestone.completionBranch}'` });
  }

  // 3. HEAD matches
  const currentHead = gitOk(["rev-parse", "HEAD"]);
  if (milestone.completionHead && currentHead !== milestone.completionHead) {
    errors.push({ code: "HEAD_MISMATCH", message: `Current HEAD ${currentHead?.slice(0, 8)} != milestone completion HEAD ${milestone.completionHead?.slice(0, 8)}` });
  }

  // 4. Prepared commit matches HEAD
  if (milestone.preparedCommit && currentHead !== milestone.preparedCommit) {
    errors.push({ code: "PREPARED_COMMIT_MISMATCH", message: `Current HEAD ${currentHead?.slice(0, 8)} != prepared commit ${milestone.preparedCommit?.slice(0, 8)}` });
  }

  // 5. Clean working tree (exclude development/ and .opencode/ — control plane state)
  const status = (git(["status", "--porcelain"]) || { stdout: "" }).stdout || "";
  const excludedPrefixes = ["development/", ".opencode/"];
  const sourceChanges = status.split(/\r?\n/).filter(Boolean).filter(line => {
    const file = line.slice(3);
    return !excludedPrefixes.some(p => file.startsWith(p));
  });
  if (sourceChanges.length > 0) {
    errors.push({ code: "DIRTY_TREE", message: "Working tree has uncommitted source changes" });
  }

  // 6. Validation passed and fingerprint matches
  const validation = readValidationResult(milestone.latestValidationId);
  if (!validation) {
    errors.push({ code: "NO_VALIDATION", message: "No validation record found" });
  } else if (validation.status !== "passed") {
    errors.push({ code: "VALIDATION_FAILED", message: `Validation status is '${validation.status}'` });
  } else {
    // Check fingerprint
    const currentFingerprint = computeGitFingerprint();
    if (validation.gitState) {
      if (validation.gitState.branch !== currentFingerprint.branch) {
        errors.push({ code: "FINGERPRINT_BRANCH", message: "Validation branch != current branch" });
      }
      if (validation.gitState.headCommit !== currentFingerprint.headCommit) {
        errors.push({ code: "FINGERPRINT_HEAD", message: "Validation HEAD != current HEAD" });
      }
      if (validation.gitState.fingerprint !== currentFingerprint.fingerprint) {
        errors.push({ code: "FINGERPRINT_CONTENT", message: "Validation fingerprint != current fingerprint" });
      }
    }
    // Check expiration (120 min default)
    if (validation.completedAt) {
      const ageMs = Date.now() - new Date(validation.completedAt).getTime();
      if (ageMs > 120 * 60 * 1000) {
        errors.push({ code: "VALIDATION_EXPIRED", message: `Validation is ${Math.floor(ageMs / 60000)} minutes old` });
      }
    }
  }

  // 7. Closeout complete
  const closeout = readCloseout();
  if (!closeout) {
    errors.push({ code: "NO_CLOSEOUT", message: "No work-closeout.json found" });
  } else if (closeout.status !== "complete") {
    errors.push({ code: "CLOSEOUT_INCOMPLETE", message: `Closeout status is '${closeout.status}'` });
  }

  // 8. No unresolved blockers
  if (milestone.blockers && milestone.blockers.length > 0) {
    errors.push({ code: "HAS_BLOCKERS", message: `${milestone.blockers.length} unresolved blocker(s)` });
  }

  // 9. No undeferred remaining work
  const closedSessions = fs.readdirSync(SESSIONS_DIR)
    .filter(f => f.endsWith(".json"))
    .map(f => readJson(path.join(SESSIONS_DIR, f), null))
    .filter(s => s && s.milestoneId === slug);
  const lastSession = closedSessions.sort((a, b) => (b.closedAt || "").localeCompare(a.closedAt || ""))[0];
  if (lastSession && lastSession.remainingWork && lastSession.remainingWork.length > 0) {
    const undeferred = lastSession.remainingWork.filter(w => {
      if (typeof w === "string") return true;
      if (w.disposition === "deferred" && w.targetMilestoneId && w.approvedBy) return false;
      return true;
    });
    if (undeferred.length > 0) {
      errors.push({ code: "REMAINING_WORK", message: `${undeferred.length} undeferred remaining work item(s)` });
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    milestone,
    validation,
    closeout,
    git: { branch: currentBranch, head: currentHead },
  };
}

// ---- delivery record ----

function createDeliveryRecord(slug, milestone) {
  return {
    schema: "locaily.development.delivery.v1",
    milestoneId: slug,
    status: "pending",
    branch: milestone.preparedBranch || milestone.completionBranch,
    commit: milestone.preparedCommit || milestone.completionHead,
    pushedAt: null,
    pushSuccess: null,
    pushError: null,
    remoteBranch: null,
    prNumber: null,
    prUrl: null,
    prCreated: null,
    prError: null,
    attempts: [],
    createdAt: now(),
    updatedAt: now(),
  };
}

// ---- commands ----

function cmdDryRun(slug) {
  const result = preflight(slug);
  if (!result.ok) {
    console.log(JSON.stringify({
      ok: false,
      phase: "dry-run",
      errors: result.errors,
      warnings: result.warnings,
      message: "Preflight failed. Resolve errors before delivery.",
    }, null, 2));
    process.exit(1);
  }

  const m = result.milestone;
  const v = result.validation;
  const closeout = result.closeout;

  const lines = [];
  lines.push("=== Milestone Delivery Preflight ===");
  lines.push(`Slug:     ${slug}`);
  lines.push(`Branch:   ${result.git.branch}`);
  lines.push(`HEAD:     ${result.git.head?.slice(0, 8)}`);
  lines.push(`Commit:   ${m.preparedCommit?.slice(0, 8) || "none"}`);
  lines.push(`Validation: ${v?.id || "none"} (${v?.status || "unknown"})`);
  lines.push(`Fingerprint: ${v?.gitState?.fingerprint || "none"}`);
  lines.push(`Closeout: ${closeout?.status || "missing"}`);
  lines.push(`Blockers: ${m.blockers?.length || 0}`);
  lines.push("");
  lines.push("Ready to push and create PR.");
  lines.push("");

  console.log(lines.join("\n"));
  console.log(JSON.stringify({ ok: true, phase: "dry-run", slug, branch: result.git.branch }, null, 2));
}

function cmdExecute(slug) {
  const result = preflight(slug);
  if (!result.ok) {
    console.log(JSON.stringify({
      ok: false,
      phase: "execute",
      errors: result.errors,
      message: "Preflight failed.",
    }, null, 2));
    process.exit(1);
  }

  const m = result.milestone;
  const branch = result.git.branch;
  const commit = result.git.head;

  // Load or create delivery record
  let delivery = readDelivery(slug);
  if (!delivery) {
    delivery = createDeliveryRecord(slug, m);
  }

  // Check if already pushed matching commit
  if (delivery.pushSuccess && delivery.commit === commit) {
    console.log(JSON.stringify({
      ok: true,
      phase: "execute",
      message: `Commit ${commit?.slice(0, 8)} already pushed`,
      remoteBranch: delivery.remoteBranch,
      commit,
    }, null, 2));
    return;
  }

  // Push
  const pushAttempt = {
    timestamp: now(),
    commit,
    branch,
    success: false,
    error: null,
  };

  const push = git(["push", "-u", "origin", branch]);
  if (push.status !== 0) {
    pushAttempt.error = (push.stderr || push.stdout || "").trim().slice(0, 500);
    delivery.attempts.push(pushAttempt);
    delivery.status = "push-failed";
    delivery.pushSuccess = false;
    delivery.pushError = pushAttempt.error;
    delivery.updatedAt = now();
    writeDelivery(delivery);

    console.log(JSON.stringify({
      ok: false,
      phase: "execute",
      error: pushAttempt.error,
      message: "Push failed. Milestone remains ready-for-delivery.",
    }, null, 2));
    process.exit(1);
  }

  pushAttempt.success = true;
  delivery.attempts.push(pushAttempt);
  delivery.status = "pushed";
  delivery.pushSuccess = true;
  delivery.pushedAt = now();
  delivery.remoteBranch = branch;
  delivery.commit = commit;
  delivery.updatedAt = now();
  writeDelivery(delivery);

  console.log(JSON.stringify({
    ok: true,
    phase: "execute",
    commit,
    branch,
    remoteBranch: branch,
    message: `Pushed ${commit?.slice(0, 8)} to origin/${branch}`,
  }, null, 2));
}

function cmdPR(slug) {
  const result = preflight(slug);
  if (!result.ok) {
    console.log(JSON.stringify({
      ok: false,
      phase: "pr",
      errors: result.errors,
      message: "Preflight failed.",
    }, null, 2));
    process.exit(1);
  }

  const m = result.milestone;
  const v = result.validation;
  const closeout = result.closeout;
  const branch = result.git.branch;
  const commit = result.git.head;

  // Load or create delivery record
  let delivery = readDelivery(slug);
  if (!delivery) {
    delivery = createDeliveryRecord(slug, m);
  }

  // Check if PR already exists for this commit
  if (delivery.prNumber && delivery.prUrl && delivery.commit === commit) {
    console.log(JSON.stringify({
      ok: true,
      phase: "pr",
      message: `PR #${delivery.prNumber} already exists`,
      prUrl: delivery.prUrl,
      prNumber: delivery.prNumber,
    }, null, 2));

    // Transition milestone to delivered
    m.status = "delivered";
    m.deliveredAt = now();
    m.prNumber = delivery.prNumber;
    m.prUrl = delivery.prUrl;
    writeMilestone(m);
    return;
  }

  // Check gh CLI - look for "Logged in" in output, not exit code (second account failure is ok)
  const ghAuth = gh(["auth", "status"]);
  const authOutput = (ghAuth.stdout || "") + (ghAuth.stderr || "");
  if (!authOutput.includes("Logged in")) {
    console.error("Error: gh CLI not authenticated. Run: gh auth login");
    process.exit(1);
  }

  // Build PR body
  const area = deriveAreaFromFiles(v?.gitState?.changedFiles?.map(f => f.path) || []);
  const title = `feat(${area}): complete ${slug}`;
  const bodyLines = [];
  bodyLines.push(`## Milestone: ${slug}`);
  bodyLines.push("");
  if (closeout && closeout.original_goal) {
    bodyLines.push(closeout.original_goal);
    bodyLines.push("");
  }
  bodyLines.push("### What Changed");
  bodyLines.push("");
  if (v?.gitState?.changedFiles) {
    for (const f of v.gitState.changedFiles) {
      bodyLines.push(`- \`${f.path}\` (${f.state})`);
    }
  }
  bodyLines.push("");
  bodyLines.push("### Validation");
  bodyLines.push("");
  bodyLines.push(`- Status: ${v?.status || "unknown"}`);
  bodyLines.push(`- Fingerprint: ${v?.gitState?.fingerprint || "unknown"}`);
  bodyLines.push(`- Commit: ${commit?.slice(0, 8)}`);
  bodyLines.push("");
  bodyLines.push("### Acceptance Checklist");
  bodyLines.push("");
  bodyLines.push("- [ ] All acceptance criteria met");
  bodyLines.push("- [ ] CI passes");
  bodyLines.push("- [ ] Documentation updated");
  bodyLines.push("- [ ] Operator review complete");
  const body = bodyLines.join("\n");

  // Create draft PR
  const prAttempt = {
    timestamp: now(),
    success: false,
    error: null,
    prNumber: null,
    prUrl: null,
  };

  const prResult = gh([
    "pr", "create",
    "--draft",
    "--title", title,
    "--body", body,
    "--base", "main",
    "--head", branch,
    "--label", "milestone",
  ]);

  if (prResult.status !== 0) {
    prAttempt.error = (prResult.stderr || prResult.stdout || "").trim().slice(0, 500);
    delivery.attempts.push(prAttempt);
    delivery.status = "pr-failed";
    delivery.prError = prAttempt.error;
    delivery.updatedAt = now();
    writeDelivery(delivery);

    console.log(JSON.stringify({
      ok: false,
      phase: "pr",
      error: prAttempt.error,
      message: "PR creation failed.",
    }, null, 2));
    process.exit(1);
  }

  // Parse PR URL
  const prOutput = (prResult.stdout || "").trim();
  const urlMatch = prOutput.match(/https:\/\/github\.com\/[^\s]+/);
  const prUrl = urlMatch ? urlMatch[0] : prOutput;
  const prNumberMatch = prUrl.match(/\/pull\/(\d+)/);
  const prNumber = prNumberMatch ? parseInt(prNumberMatch[1]) : null;

  prAttempt.success = true;
  prAttempt.prNumber = prNumber;
  prAttempt.prUrl = prUrl;
  delivery.attempts.push(prAttempt);
  delivery.status = "delivered";
  delivery.prNumber = prNumber;
  delivery.prUrl = prUrl;
  delivery.prCreated = now();
  delivery.commit = commit;
  delivery.updatedAt = now();
  writeDelivery(delivery);

  // Transition milestone to delivered
  m.status = "delivered";
  m.deliveredAt = now();
  m.prNumber = prNumber;
  m.prUrl = prUrl;
  writeMilestone(m);

  console.log(JSON.stringify({
    ok: true,
    phase: "pr",
    prNumber,
    prUrl,
    commit,
    branch,
    message: `Draft PR #${prNumber} created`,
    nextAction: "Mark PR ready for review, then merge",
  }, null, 2));
}

function deriveAreaFromFiles(files) {
  if (!files || files.length === 0) return "core";
  const areas = new Map();
  for (const f of files) {
    const parts = f.split("/");
    if (parts.length >= 2) {
      const area = parts[0] === "companion" ? (parts[1] || "core") : parts[0];
      areas.set(area, (areas.get(area) || 0) + 1);
    }
  }
  if (areas.size === 0) return "core";
  let best = null;
  let bestCount = 0;
  for (const [area, count] of areas) {
    if (count > bestCount) { best = area; bestCount = count; }
  }
  return best || "core";
}

// ---- main ----

async function main() {
  const args = process.argv.slice(2);
  const slug = extractArg(args, "--slug");
  const isDryRun = hasFlag(args, "--dry-run");
  const isExecute = hasFlag(args, "--execute");
  const isPr = hasFlag(args, "--pr");
  const isAll = hasFlag(args, "--all");

  if (!slug) {
    console.error("Error: --slug <milestone-slug> is required.\n");
    console.error("Usage:");
    console.error("  node scripts/deliver-milestone.js --slug <slug> --dry-run");
    console.error("  node scripts/deliver-milestone.js --slug <slug> --execute");
    console.error("  node scripts/deliver-milestone.js --slug <slug> --pr");
    console.error("  node scripts/deliver-milestone.js --slug <slug> --all");
    process.exit(1);
  }

  if (!isDryRun && !isExecute && !isPr && !isAll) {
    console.error("Error: One of --dry-run, --execute, --pr, or --all is required.\n");
    process.exit(1);
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    if (isDryRun || isAll) {
      cmdDryRun(slug);
      if (isDryRun) process.exit(0);
      const proceed = await new Promise(resolve => {
        rl.question("\nProceed to push? [y/N]: ", answer => resolve(answer.trim().toLowerCase() === "y"));
      });
      if (!proceed) { console.log("Aborted."); process.exit(1); }
    }

    if (isExecute || isAll) {
      cmdExecute(slug);
      if (isExecute) process.exit(0);
      const proceed = await new Promise(resolve => {
        rl.question("\nProceed to create PR? [y/N]: ", answer => resolve(answer.trim().toLowerCase() === "y"));
      });
      if (!proceed) { console.log("Aborted after push. PR not created."); process.exit(0); }
    }

    if (isPr || isAll) {
      cmdPR(slug);
    }
  } finally {
    rl.close();
  }
}

main().catch(err => {
  console.error(`Unexpected error: ${err.message}`);
  process.exit(1);
});
