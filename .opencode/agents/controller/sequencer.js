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
const CONFIG_PATH = path.join(HERE, "config.json");
const SUPERVISOR_PATH = path.join(HERE, "supervisor.js");
const INVARIANTS_PATH = path.join(HERE, "invariants.js");
const HISTORY_DIR = path.join(AGENTS_DIR, "history");

const SEQUENCER_BRANCH = "agents/sequencer/base";

// Load invariants module
let invariants = null;
try { invariants = require(INVARIANTS_PATH); } catch { console.error("[sequencer] invariants.js not found — identity checks skipped."); }

let developmentMemory = null;
try { developmentMemory = require("./development-memory-capture"); } catch { developmentMemory = null; }

let developmentSession = null;
try {
  const { createDevelopmentSessionManager } = require(path.join(PROJECT_ROOT, "companion", "memory", "events", "session-manager"));
  developmentSession = createDevelopmentSessionManager({
    eventsDir: path.join(PROJECT_ROOT, "data", "memory", "development-events"),
    sessionsRoot: path.join(PROJECT_ROOT, "data", "memory", "development-sessions")
  });
} catch { developmentSession = null; }

const DEFAULT_STATE = {
  objective: "",
  status: "running",
  phase: "plan",
  iteration: 0,
  corrections_for_task: 0,
  consecutive_failures: 0,
  current_task: null,
  recommended_worker_agent: null,
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

function checkout(branch, create = false, force = false) {
  const args = create ? ["checkout", "-b", branch] : ["checkout", branch];
  if (force) args.push("--force");
  const r = git(args, { shell: process.platform === "win32" });
  return r.status === 0;
}

function branchExists(branch) {
  const r = git(["rev-parse", "--verify", branch], { shell: process.platform === "win32" });
  return r.status === 0;
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function removeIfExists(p) {
  try {
    const stat = fs.statSync(p);
    if (stat.isDirectory()) fs.rmSync(p, { recursive: true, force: true });
    else fs.unlinkSync(p);
  } catch {}
}

function restoreFromFailed() {
  const failedDir = path.join(QUEUE_DIR, "failed");
  if (!fs.existsSync(failedDir)) return;
  for (const f of fs.readdirSync(failedDir)) {
    const src = path.join(failedDir, f);
    if (!fs.statSync(src).isFile()) continue;
    const dst = path.join(QUEUE_DIR, f);
    console.error(`[sequencer] restoring ${f} from failed/`);
    try { fs.renameSync(src, dst); } catch (e) { fs.copyFileSync(src, dst); fs.unlinkSync(src); }
  }
  removeIfExists(failedDir);
}

function cleanRuntimeArtifacts() {
  const agentsDir = AGENTS_DIR;
  // Remove stale objective and task files (regenerated per milestone)
  removeIfExists(OBJECTIVE_PATH);
  removeIfExists(path.join(agentsDir, "tasks", "active-task.md"));
  // Remove abort-history noise from prior failed runs
  if (fs.existsSync(HISTORY_DIR)) {
    for (const f of fs.readdirSync(HISTORY_DIR)) {
      if (f.includes("abort")) removeIfExists(path.join(HISTORY_DIR, f));
    }
  }
  // Do NOT delete failed/ — it holds archived milestones that must persist
  // across iterations. If a previous milestone failed, it stays in failed/
  // until restoreFromFailed() moves it back to queue/ on the next sequencer run.
}

function ensureBaseBranch(protectedBranches, startBranch) {
  const isTransient = startBranch.startsWith("agents/worker/") || startBranch.startsWith("agents/sequencer/");
  const needsBase = protectedBranches.includes(startBranch) || isTransient;

  if (!needsBase) return startBranch; // user feature branch, use as-is

  if (branchExists(SEQUENCER_BRANCH)) {
    console.error(`[sequencer] switching to ${SEQUENCER_BRANCH} (was on ${startBranch})`);
    if (!checkout(SEQUENCER_BRANCH)) return null;
    return SEQUENCER_BRANCH;
  }

  // Create SEQUENCER_BRANCH — first get to a clean non-transient commit
  const source = protectedBranches.includes(startBranch) ? startBranch : "main";
  console.error(`[sequencer] creating ${SEQUENCER_BRANCH} from ${source}`);
  if (currentBranch() !== source && !checkout(source)) return null;
  if (!checkout(SEQUENCER_BRANCH, true)) return null;
  return SEQUENCER_BRANCH;
}

function main() {
  return runSequencer();
}

async function runSequencer() {
  const cfg = readJson(CONFIG_PATH, {});
  const protectedBranches = (cfg.git && cfg.git.protected_branches) || ["main", "master"];

  const trueStartBranch = currentBranch();
  if (!trueStartBranch) {
    console.error("[sequencer] cannot determine current branch");
    process.exit(1);
  }
  console.error(`[sequencer] starting from branch: ${trueStartBranch}`);

  // Determine and switch to the working base branch
  const baseBranch = ensureBaseBranch(protectedBranches, trueStartBranch);
  if (!baseBranch) {
    console.error("[sequencer] cannot establish a working base branch — aborting");
    process.exit(1);
  }
  console.error(`[sequencer] working from branch: ${baseBranch}`);

  // Restore any failed milestones from a prior run BEFORE collecting queue
  const completedDir = path.join(QUEUE_DIR, "completed");
  const failedDir = path.join(QUEUE_DIR, "failed");
  ensureDir(completedDir);
  ensureDir(failedDir);
  restoreFromFailed();

  // Collect queue entries (sorted, exclude .gitkeep and non-objective files)
  const all = fs.readdirSync(QUEUE_DIR)
    .filter(f => f.endsWith(".md") && !f.startsWith("BULK_") && f !== ".gitkeep" && f !== "TEMPLATE.md")
    .sort();
  if (all.length === 0) {
    console.error("[sequencer] no objectives in queue/ — nothing to do");
    if (currentBranch() !== trueStartBranch) checkout(trueStartBranch);
    return;
  }
  console.error(`[sequencer] found ${all.length} queued objectives:\n  ${all.join("\n  ")}`);

  // ---- queue completeness preflight ----
  if (invariants) {
    const qc = invariants.validateQueueCompleteness(QUEUE_DIR);
    if (!qc.valid) {
      console.error(`[sequencer] QUEUE INCOMPLETE — refusing to run.`);
      console.error(`  Expected: ${(qc.expected || []).join(", ")}`);
      console.error(`  Missing:  ${(qc.missing || []).join(", ")}`);
      process.exit(1);
    }
    console.error(`[sequencer] queue completeness: OK (${(qc.found || []).length} files present)`);
  }

  const results = [];

  for (const file of all) {
    const sourcePath = path.join(QUEUE_DIR, file);
    const objectiveSlug = file.replace(/\.md$/i, "");

    console.error(`\n${"=".repeat(60)}`);
    console.error(`[sequencer] starting objective: ${file}`);

    // Force back to base branch
    const onBranch = currentBranch();
    if (onBranch !== baseBranch) {
      console.error(`[sequencer] resetting to ${baseBranch} (currently on ${onBranch})`);
      if (!checkout(baseBranch, false, true)) {
        console.error(`[sequencer] cannot checkout ${baseBranch} — aborting`);
        results.push({ file, status: "failed", reason: "checkout_failed" });
        break;
      }
    }

    // Ensure queue file still exists
    if (!fs.existsSync(sourcePath)) {
      console.error(`[sequencer] ${file} not found in queue/ — skipping`);
      results.push({ file, status: "skipped", reason: "not_found" });
      continue;
    }

    // Reset tracked files, discard worker's uncommitted changes
    git(["checkout", "--", "."], { shell: process.platform === "win32" });

    // Clean runtime artifacts from prior runs
    cleanRuntimeArtifacts();

    // Remove stale worker branch from prior failed run
    const cfg2 = readJson(CONFIG_PATH, {});
    const prefix = (cfg2.git && cfg2.git.worker_branch_prefix) || "agents/worker";
    const workerBranchName = `${prefix}/${objectiveSlug}`;
    if (branchExists(workerBranchName)) {
      console.error(`[sequencer] removing stale worker branch ${workerBranchName}`);
      git(["branch", "-D", workerBranchName], { shell: process.platform === "win32" });
    }

    // Copy queue file to active-objective.md
    const content = fs.readFileSync(sourcePath, "utf8");
    fs.writeFileSync(OBJECTIVE_PATH, content);

    // Reset run state for this milestone
    writeJson(STATE_PATH, { ...DEFAULT_STATE, objective: objectiveSlug });

    if (developmentSession) {
      try {
        const sessionStart = developmentSession.startSession({
          objectiveId: objectiveSlug,
          runId: readJson(STATE_PATH, {}).run_id,
          branch: currentBranch()
        });
        if (!sessionStart.ok) {
          console.error(`[sequencer] development session start failed: ${sessionStart.error && sessionStart.error.message ? sessionStart.error.message : "unknown error"}`);
        }
      } catch (e) {
        console.error(`[sequencer] development session start failed: ${e.message}`);
      }
    }

    // Create durable milestone record
    if (invariants) {
      try {
        const baseCommit = git(["rev-parse", "HEAD"], { shell: process.platform === "win32" });
        const commit = baseCommit.status === 0 ? (baseCommit.stdout || "").trim() : "";
        invariants.createMilestoneRecord(objectiveSlug, workerBranchName, commit);
        console.error(`[sequencer] durable milestone record created: ${objectiveSlug}`);
        if (developmentMemory) {
          developmentMemory.emitObjectiveStarted({
            projectRoot: PROJECT_ROOT,
            objectiveId: objectiveSlug,
            runId: readJson(STATE_PATH, {}).run_id,
            baseCommit: commit
          });
        }
      } catch (e) { console.error(`[sequencer] durable record create failed: ${e.message}`); }
    }

    // Run supervisor (SEQUENCER_MODE env tells supervisor to skip dirty-tree check)
    console.error(`[sequencer] launching supervisor for ${file}...`);
    const childEnv = { ...process.env, SEQUENCER_MODE: "1" };
    const result = spawnSync(`"${process.execPath}"`, [SUPERVISOR_PATH], {
      cwd: PROJECT_ROOT,
      timeout: 0,
      shell: process.platform === "win32",
      stdio: ["inherit", "inherit", "inherit"],
      env: childEnv
    });
    console.error(`[sequencer] supervisor exit code: ${result.status}`);

    // Check for unexpected-exit diagnostic from supervisor
    if (result.status !== 0 || (result.error && result.error.code)) {
      const exitErr = result.error ? ` (${result.error.code || result.error.message})` : "";
      console.error(`[sequencer] supervisor may have crashed${exitErr}. Check .opencode/agents/runs/*-exit.log`);
    }

    // Check final state
    const finalState = readJson(STATE_PATH, {});
    const complete = finalState.status === "complete" || finalState.objective_complete === true;

    // Update durable milestone record and manifest
    if (developmentSession) {
      try {
        const sessionClose = await developmentSession.closeSession({
          interrupted: !complete
        });
        if (!sessionClose.ok) {
          console.error(`[sequencer] development session close failed: ${sessionClose.error && sessionClose.error.message ? sessionClose.error.message : "unknown error"}`);
        }
      } catch (e) {
        console.error(`[sequencer] development session close failed: ${e.message}`);
      }
    }

    if (invariants) {
      try {
        if (complete) {
          const manifest = invariants.buildMilestoneManifest(objectiveSlug, STATE_PATH);
          const testsRun = (finalState.last_worker_status === "complete" ? ["see worker result"] : []);
          invariants.finalizeMilestone(objectiveSlug, manifest, testsRun, true);
          console.error(`[sequencer] milestone manifest validated: ${objectiveSlug}`);
          invariants.markMilestoneComplete(objectiveSlug);
          if (developmentMemory) {
            const record = invariants.readMilestoneRecord(objectiveSlug);
            developmentMemory.emitObjectiveCompleted({
              projectRoot: PROJECT_ROOT,
              objectiveId: objectiveSlug,
              runId: finalState.run_id,
              acceptedTaskCount: record && record.accepted_task_count ? record.accepted_task_count : 0
            });
          }
        } else {
          invariants.markMilestoneFailed(objectiveSlug, finalState.blocker || `supervisor exit code ${result.status}`);
          if (developmentMemory) {
            developmentMemory.emitObjectiveBlocked({
              projectRoot: PROJECT_ROOT,
              objectiveId: objectiveSlug,
              runId: finalState.run_id,
              blocker: finalState.blocker || `supervisor exit code ${result.status}`,
              adapter: "controller"
            });
          }
        }
        console.error(`[sequencer] durable milestone record: ${objectiveSlug} → ${complete ? "complete" : "failed"}`);
      } catch (e) { console.error(`[sequencer] durable record finalize failed: ${e.message}`); }
    }

    // Archive queue file. Non-fatal — a failed archive must not crash the sequencer.
    const destDir = complete ? completedDir : failedDir;
    const destPath = path.join(destDir, file);
    ensureDir(destDir);
    try {
      if (fs.existsSync(sourcePath)) {
        try { fs.renameSync(sourcePath, destPath); } catch (e) {
          try { fs.copyFileSync(sourcePath, destPath); fs.unlinkSync(sourcePath); } catch {}
        }
        console.error(`[sequencer] archived ${file} → ${complete ? "completed" : "failed"}/`);
      } else {
        console.error(`[sequencer] ${file} disappeared from queue/ — marking ${complete ? "complete" : "failed"} without archiving`);
      }
    } catch (e) {
      console.error(`[sequencer] archive failed for ${file}: ${e.message} — continuing`);
    }

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

  // Return to original starting branch
  const finalBranch = currentBranch();
  if (finalBranch !== trueStartBranch) {
    console.error(`[sequencer] returning to ${trueStartBranch}...`);
    checkout(trueStartBranch);
  }
  console.error(`\n[sequencer] done — returned to branch: ${trueStartBranch}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
