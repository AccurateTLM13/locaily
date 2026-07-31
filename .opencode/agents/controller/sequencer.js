#!/usr/bin/env node
// .opencode/agents/controller/sequencer.js
// Drives the existing supervisor/worker loop for canonical development
// milestones. Legacy Markdown queue support remains for manual compatibility,
// but `npm run dev:loop` selects work only from development/milestones/.
//
// Usage:
//   node .opencode/agents/controller/sequencer.js --milestone <id> --stay-on-worker
//   node .opencode/agents/controller/sequencer.js # legacy Markdown queue

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
const DEVELOPMENT_MILESTONES_DIR = path.join(PROJECT_ROOT, "development", "milestones");

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

function checkout(branch, create = false) {
  const args = create ? ["checkout", "-b", branch] : ["checkout", branch];
  const r = git(args);
  return r.status === 0;
}

function branchExists(branch) {
  const r = git(["rev-parse", "--verify", branch]);
  return r.status === 0;
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function archiveRuntimeFile(filePath, label) {
  if (!fs.existsSync(filePath)) return;
  ensureDir(HISTORY_DIR);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const destination = path.join(HISTORY_DIR, `${stamp}-${label}`);
  fs.copyFileSync(filePath, destination);
  fs.unlinkSync(filePath);
}

function cleanRuntimeArtifacts() {
  const agentsDir = AGENTS_DIR;
  // Runtime pointers are regenerated per milestone. History, failed work,
  // tracked source, and branches are never deleted here.
  archiveRuntimeFile(OBJECTIVE_PATH, "replaced-active-objective.md");
  archiveRuntimeFile(path.join(agentsDir, "tasks", "active-task.md"), "replaced-active-task.md");
  // Do NOT delete failed/ — it holds archived milestones that must persist
  // across iterations.
}

function parseArgs(argv) {
  const milestoneIndex = argv.indexOf("--milestone");
  return {
    milestoneId: milestoneIndex >= 0 ? argv[milestoneIndex + 1] : null,
    stayOnWorker: argv.includes("--stay-on-worker"),
  };
}

function renderDevelopmentObjective(milestone) {
  const lines = [
    `# ${milestone.title}`,
    "",
    `Objective ID: ${milestone.id}`,
    "",
    milestone.purpose,
  ];
  if (milestone.problem) lines.push("", "## Problem", "", milestone.problem);
  lines.push("", "## Included Scope", "");
  for (const item of milestone.scope?.included || []) lines.push(`- ${item}`);
  lines.push("", "## Excluded Scope", "");
  for (const item of milestone.scope?.excluded || []) lines.push(`- ${item}`);
  lines.push("", "## Acceptance Criteria", "");
  for (const criterion of milestone.acceptanceCriteria || []) {
    lines.push(`- ${typeof criterion === "string" ? criterion : criterion.description}`);
  }
  lines.push(
    "",
    "## Stop and Hand Back",
    "",
    "- Stop on any milestone blocker, failed or held work, missing dependency, or approval requirement.",
    "- Do not push, merge, or broaden scope without explicit approval.",
    "- Preserve the worker branch, run state, reviews, tests, and provenance for inspection.",
    ""
  );
  return lines.join("\n");
}

function collectDevelopmentEntries(milestoneId) {
  if (!milestoneId || !/^[a-z0-9][a-z0-9-]*$/.test(milestoneId)) {
    throw new Error("A valid --milestone <id> is required for canonical development mode.");
  }
  const sourcePath = path.join(DEVELOPMENT_MILESTONES_DIR, `${milestoneId}.json`);
  const milestone = readJson(sourcePath, null);
  if (!milestone) throw new Error(`Canonical milestone '${milestoneId}' was not found.`);
  if (milestone.status !== "active") {
    throw new Error(`Canonical milestone '${milestoneId}' must be active, found '${milestone.status}'.`);
  }
  if ((milestone.blockers || []).length > 0) {
    throw new Error(`Canonical milestone '${milestoneId}' has unresolved blockers.`);
  }
  return [{
    file: `${milestoneId}.json`,
    objectiveSlug: milestoneId,
    sourcePath,
    content: renderDevelopmentObjective(milestone),
    canonical: true,
  }];
}

function collectLegacyEntries() {
  return fs.readdirSync(QUEUE_DIR)
    .filter(f => f.endsWith(".md") && !f.startsWith("BULK_") && f !== ".gitkeep" && f !== "TEMPLATE.md")
    .sort()
    .map(file => ({
      file,
      objectiveSlug: file.replace(/\.md$/i, ""),
      sourcePath: path.join(QUEUE_DIR, file),
      content: null,
      canonical: false,
    }));
}

function ensureBaseBranch(protectedBranches, startBranch) {
  const isTransient = startBranch.startsWith("agents/worker/");
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

async function main() {
  const results = await runSequencer(parseArgs(process.argv.slice(2)));
  if (results.some(result => result.status !== "complete")) process.exitCode = 2;
  return results;
}

async function runSequencer(options = {}) {
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
  const entries = options.milestoneId
    ? collectDevelopmentEntries(options.milestoneId)
    : collectLegacyEntries();
  if (entries.length === 0) {
    console.error("[sequencer] no objectives in queue/ — nothing to do");
    if (currentBranch() !== trueStartBranch) checkout(trueStartBranch);
    return [];
  }
  console.error(`[sequencer] found ${entries.length} objective(s):\n  ${entries.map(entry => entry.file).join("\n  ")}`);

  // ---- queue completeness preflight ----
  if (invariants && !options.milestoneId) {
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

  for (const entry of entries) {
    const { file, sourcePath, objectiveSlug } = entry;

    console.error(`\n${"=".repeat(60)}`);
    console.error(`[sequencer] starting objective: ${file}`);

    // Force back to base branch
    const onBranch = currentBranch();
    if (onBranch !== baseBranch) {
      console.error(`[sequencer] resetting to ${baseBranch} (currently on ${onBranch})`);
      if (!checkout(baseBranch)) {
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

    // Existing worker branches contain inspectable work. Never delete them.
    const cfg2 = readJson(CONFIG_PATH, {});
    const prefix = (cfg2.git && cfg2.git.worker_branch_prefix) || "agents/worker";
    const workerBranchName = `${prefix}/${objectiveSlug}`;
    if (branchExists(workerBranchName)) {
      console.error(`[sequencer] worker branch '${workerBranchName}' already exists; hand-back required.`);
      results.push({ file, status: "held", reason: "worker_branch_exists", blocker: workerBranchName });
      break;
    }

    const priorState = readJson(STATE_PATH, null);
    if (priorState && priorState.status === "running") {
      console.error(`[sequencer] prior run '${priorState.run_id || "unknown"}' is still active; hand-back required.`);
      results.push({ file, status: "held", reason: "active_run_exists", blocker: priorState.run_id || null });
      break;
    }

    // Clean only replaceable runtime pointers after safety preflight passes.
    cleanRuntimeArtifacts();

    // Materialize the canonical milestone or legacy objective for the supervisor.
    const content = entry.content || fs.readFileSync(sourcePath, "utf8");
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
    if (!entry.canonical) {
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

    }

    results.push({
      file,
      status: complete ? "complete" : finalState.status || "failed",
      blocker: finalState.blocker || null,
      iteration: finalState.iteration
    });
    if (!complete) break;
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
  if (!options.stayOnWorker && finalBranch !== trueStartBranch) {
    console.error(`[sequencer] returning to ${trueStartBranch}...`);
    checkout(trueStartBranch);
  }
  console.error(`\n[sequencer] done — returned to branch: ${trueStartBranch}`);
  return results;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}

module.exports = {
  collectDevelopmentEntries,
  collectLegacyEntries,
  parseArgs,
  renderDevelopmentObjective,
  runSequencer,
};
