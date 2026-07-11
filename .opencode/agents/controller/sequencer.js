#!/usr/bin/env node
// .opencode/agents/controller/sequencer.js
// Drives the supervisor/worker loop across multiple queued objectives.
// Reads .md files from objectives/queue/, processes each sequentially,
// archives them to completed/ or failed/ based on outcome.
//
// Usage: node .opencode/agents/controller/sequencer.js

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const HERE = __dirname;
const AGENTS_DIR = path.resolve(HERE, "..");
const PROJECT_ROOT = path.resolve(AGENTS_DIR, "..", "..");
const QUEUE_DIR = path.join(AGENTS_DIR, "objectives", "queue");
const OBJECTIVE_PATH = path.join(AGENTS_DIR, "objectives", "active-objective.md");
const STATE_PATH = path.join(AGENTS_DIR, "state", "run-state.json");
const SUPERVISOR_PATH = path.join(HERE, "supervisor.js");

const DEFAULT_STATE = {
  objective: "",
  status: "running",
  phase: "plan",
  iteration: 0,
  corrections_for_task: 0,
  consecutive_failures: 0,
  current_task: null,
  worker_branch: null,
  last_worker_status: "idle",
  last_review_status: null,
  objective_complete: false,
  blocker: null,
  run_id: null
};

function git(args, opts = {}) {
  return spawnSync("git", args, { cwd: PROJECT_ROOT, encoding: "utf8", maxBuffer: 1024 * 1024 * 16, ...opts });
}

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return fallback; }
}

function writeJson(p, obj) {
  obj.updatedAt = new Date().toISOString();
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n");
}

function currentBranch() {
  const r = git(["rev-parse", "--abbrev-ref", "HEAD"]);
  return r.status === 0 ? (r.stdout || "").trim() : null;
}

function checkout(branch) {
  const r = git(["checkout", branch], { shell: process.platform === "win32" });
  return r.status === 0;
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function main() {
  const startBranch = currentBranch();
  if (!startBranch) {
    console.error("[sequencer] cannot determine current branch");
    process.exit(1);
  }
  console.error(`[sequencer] starting from branch: ${startBranch}`);

  // Collect queue entries (sorted, exclude .gitkeep)
  const all = fs.readdirSync(QUEUE_DIR)
    .filter(f => f.endsWith(".md") && !f.startsWith("BULK_") && f !== ".gitkeep" && f !== "TEMPLATE.md")
    .sort();
  if (all.length === 0) {
    console.error("[sequencer] no objectives in queue/ — nothing to do");
    return;
  }
  console.error(`[sequencer] found ${all.length} queued objectives:\n  ${all.join("\n  ")}`);

  const completedDir = path.join(QUEUE_DIR, "completed");
  const failedDir = path.join(QUEUE_DIR, "failed");
  ensureDir(completedDir);
  ensureDir(failedDir);

  const results = [];

  for (const file of all) {
    const sourcePath = path.join(QUEUE_DIR, file);
    const objectiveSlug = file.replace(/\.md$/i, "");

    console.error(`\n${"=".repeat(60)}`);
    console.error(`[sequencer] starting objective: ${file}`);

    // 1. Return to starting branch
    const onBranch = currentBranch();
    if (onBranch !== startBranch) {
      console.error(`[sequencer] returning to ${startBranch} (currently on ${onBranch})`);
      if (!checkout(startBranch)) {
        console.error(`[sequencer] cannot checkout ${startBranch} — aborting`);
        results.push({ file, status: "failed", reason: "checkout_failed" });
        break;
      }
    }

    // 2. Copy queue file to active-objective.md
    const content = fs.readFileSync(sourcePath, "utf8");
    fs.writeFileSync(OBJECTIVE_PATH, content);

    // 3. Reset run state for this milestone
    writeJson(STATE_PATH, { ...DEFAULT_STATE, objective: objectiveSlug });

    // 4. Run supervisor
    console.error(`[sequencer] launching supervisor for ${file}...`);
    const result = spawnSync(`"${process.execPath}"`, [SUPERVISOR_PATH], {
      cwd: PROJECT_ROOT,
      timeout: 0,
      shell: process.platform === "win32",
      stdio: ["inherit", "inherit", "inherit"]
    });
    console.error(`[sequencer] supervisor exit code: ${result.status}`);

    // 5. Check final state
    const finalState = readJson(STATE_PATH, {});
    const complete = finalState.status === "complete" || finalState.objective_complete === true;

    // 6. Archive queue file
    const destDir = complete ? completedDir : failedDir;
    const destPath = path.join(destDir, file);
    try { fs.renameSync(sourcePath, destPath); } catch (e) {
      // If rename fails (e.g., cross-device), fall back to copy + delete
      fs.copyFileSync(sourcePath, destPath);
      fs.unlinkSync(sourcePath);
    }
    console.error(`[sequencer] archived ${file} → ${complete ? "completed" : "failed"}/`);

    results.push({
      file,
      status: complete ? "complete" : finalState.status || "failed",
      blocker: finalState.blocker || null,
      iteration: finalState.iteration
    });
  }

  // Summary
  console.error(`\n${"=".repeat(60)}`);
  console.error("[sequencer] all objectives processed\n");
  for (const r of results) {
    const icon = r.status === "complete" ? " OK" : " !!";
    console.error(`  ${icon}  ${r.file} — ${r.status}${r.blocker ? ` (blocker: ${r.blocker})` : ""} (${r.iteration} iterations)`);
  }

  // Return to starting branch
  const finalBranch = currentBranch();
  if (finalBranch !== startBranch) {
    console.error(`[sequencer] returning to ${startBranch}...`);
    checkout(startBranch);
  }
  console.error(`\n[sequencer] done — returned to branch: ${startBranch}`);
}

main();
