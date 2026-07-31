#!/usr/bin/env node
/**
 * Canonical unattended milestone runner.
 *
 * The development control plane is the only queue. This command selects one
 * active milestone, or the highest-priority ready milestone, and hands it to
 * the existing sequencer/supervisor/worker loop. It never pushes or merges.
 *
 * Usage:
 *   npm run dev:loop
 *   npm run dev:loop -- --dry-run
 *   npm run dev:loop -- --slug <milestone-id>
 */

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { validateResult } = require("../companion/core/result-validator");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const MILESTONES_DIR = path.join(PROJECT_ROOT, "development", "milestones");
const SESSIONS_DIR = path.join(PROJECT_ROOT, "development", "sessions");
const PROJECT_STATE_PATH = path.join(PROJECT_ROOT, "development", "project-state.json");
const RUN_STATE_PATH = path.join(PROJECT_ROOT, ".opencode", "agents", "state", "run-state.json");
const REVIEW_PATH = path.join(PROJECT_ROOT, ".opencode", "agents", "state", "latest-review.json");
const SEQUENCER_PATH = path.join(PROJECT_ROOT, ".opencode", "agents", "controller", "sequencer.js");
const MILESTONE_SCHEMA = readJson(path.join(PROJECT_ROOT, "development", "schemas", "milestone.schema.json"), null);

const PRIORITY_ORDER = new Map([
  ["critical", 0],
  ["high", 1],
  ["medium", 2],
  ["low", 3],
]);
const DEPENDENCY_COMPLETE = new Set(["ready-for-delivery", "delivered", "merged", "completed"]);
const STOP_STATUSES = new Set(["blocked", "failed", "held", "paused", "budget_exhausted", "capped"]);

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n");
}

function listMilestones(root = PROJECT_ROOT) {
  const dir = path.join(root, "development", "milestones");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(file => file.endsWith(".json"))
    .map(file => readJson(path.join(dir, file), null))
    .filter(Boolean);
}

function dependencyProblems(milestone, byId) {
  const problems = [];
  for (const dependencyId of milestone.dependencies || []) {
    const dependency = byId.get(dependencyId);
    if (!dependency) {
      problems.push({ id: dependencyId, reason: "missing" });
    } else if (!DEPENDENCY_COMPLETE.has(dependency.status)) {
      problems.push({ id: dependencyId, reason: `status:${dependency.status}` });
    }
  }
  return problems;
}

function eligibility(milestone, byId) {
  if (!["active", "ready"].includes(milestone.status)) {
    return { eligible: false, reason: `status:${milestone.status}` };
  }
  const validation = MILESTONE_SCHEMA ? validateResult(milestone, MILESTONE_SCHEMA) : { ok: false, errors: ["schema_missing"] };
  if (!validation.ok) {
    return { eligible: false, reason: "invalid_manifest", errors: validation.errors };
  }
  if ((milestone.blockers || []).length > 0) {
    return { eligible: false, reason: "blocked" };
  }
  const dependencyIssues = dependencyProblems(milestone, byId);
  if (dependencyIssues.length > 0) {
    return { eligible: false, reason: "dependencies", dependencyIssues };
  }
  return { eligible: true, reason: null, dependencyIssues: [] };
}

function compareReady(a, b) {
  const priority = (PRIORITY_ORDER.get(a.priority) ?? 99) - (PRIORITY_ORDER.get(b.priority) ?? 99);
  if (priority !== 0) return priority;
  const created = String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
  return created !== 0 ? created : a.id.localeCompare(b.id);
}

function selectMilestone(milestones, requestedId = null) {
  const byId = new Map(milestones.map(milestone => [milestone.id, milestone]));
  const active = milestones.filter(milestone => milestone.status === "active");
  if (active.length > 1) {
    return { ok: false, stopReason: "multiple_active", ids: active.map(milestone => milestone.id).sort() };
  }

  if (requestedId) {
    const requested = byId.get(requestedId);
    if (!requested) return { ok: false, stopReason: "not_found", id: requestedId };
    if (active.length === 1 && active[0].id !== requestedId) {
      return { ok: false, stopReason: "different_active", id: active[0].id };
    }
    const check = eligibility(requested, byId);
    return check.eligible
      ? { ok: true, milestone: requested, source: requested.status }
      : { ok: false, stopReason: check.reason, id: requested.id, dependencyIssues: check.dependencyIssues || [] };
  }

  if (active.length === 1) {
    const check = eligibility(active[0], byId);
    return check.eligible
      ? { ok: true, milestone: active[0], source: "active" }
      : { ok: false, stopReason: check.reason, id: active[0].id, dependencyIssues: check.dependencyIssues || [] };
  }

  const ready = milestones
    .filter(milestone => milestone.status === "ready")
    .filter(milestone => eligibility(milestone, byId).eligible)
    .sort(compareReady);
  return ready.length > 0
    ? { ok: true, milestone: ready[0], source: "ready" }
    : { ok: false, stopReason: "no_eligible_work" };
}

function classifyRunState(runState) {
  if (!runState) return { complete: false, stopReason: "missing_run_state" };
  if (runState.status === "complete" || runState.objective_complete === true) {
    return { complete: true, stopReason: "approval_required" };
  }
  if (STOP_STATUSES.has(runState.status)) {
    return { complete: false, stopReason: runState.status, blocker: runState.blocker || null };
  }
  return { complete: false, stopReason: "hand_back", blocker: runState.blocker || null };
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd || PROJECT_ROOT,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 64,
    timeout: options.timeout || 0,
    stdio: options.stdio || "pipe",
    env: options.env || process.env,
  });
}

function gitStatus(root = PROJECT_ROOT) {
  const result = run("git", ["status", "--porcelain"], { cwd: root, timeout: 30000 });
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || "git status failed").trim());
  return (result.stdout || "").trim();
}

function currentBranch(root = PROJECT_ROOT) {
  const result = run("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: root, timeout: 30000 });
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || "cannot determine branch").trim());
  return (result.stdout || "").trim();
}

function ensureRunnerBranch(milestoneId, root = PROJECT_ROOT) {
  const branch = currentBranch(root);
  const config = readJson(path.join(root, ".opencode", "agents", "controller", "config.json"), {});
  const protectedBranches = config.git?.protected_branches || ["main", "master"];
  if (branch.startsWith("agents/worker/")) {
    throw new Error(`Refusing to start a new milestone from worker branch '${branch}'.`);
  }
  if (!protectedBranches.includes(branch)) return branch;

  const runnerBranch = `agents/sequencer/${milestoneId}`;
  const exists = run("git", ["show-ref", "--verify", "--quiet", `refs/heads/${runnerBranch}`], {
    cwd: root,
    timeout: 30000,
  });
  if (exists.status === 0) {
    throw new Error(`Runner branch '${runnerBranch}' already exists; inspect or resume it explicitly.`);
  }
  const create = run("git", ["switch", "-c", runnerBranch], { cwd: root, timeout: 30000 });
  if (create.status !== 0) {
    throw new Error((create.stderr || create.stdout || `cannot create ${runnerBranch}`).trim());
  }
  return runnerBranch;
}

function activeSession(root, milestoneId) {
  const dir = path.join(root, "development", "sessions");
  if (!fs.existsSync(dir)) return null;
  for (const file of fs.readdirSync(dir).filter(name => name.endsWith(".json"))) {
    const session = readJson(path.join(dir, file), null);
    if (session && session.status === "active" && session.milestoneId === milestoneId) return session;
  }
  return null;
}

function runLifecycle(args, options = {}) {
  return run(process.execPath, [path.join(PROJECT_ROOT, "scripts", "dev-lifecycle.js"), ...args], {
    timeout: options.timeout || 300000,
  });
}

function ensureSuccessful(label, result) {
  if (result.status === 0) return;
  const detail = (result.stderr || result.stdout || result.error?.message || "").trim();
  throw new Error(`${label} failed${detail ? `: ${detail}` : ""}`);
}

function recordCanonicalStop(milestoneId, outcome) {
  const milestonePath = path.join(MILESTONES_DIR, `${milestoneId}.json`);
  const milestone = readJson(milestonePath, null);
  const projectState = readJson(PROJECT_STATE_PATH, null);
  const now = new Date().toISOString();
  const blockerId = `dev-loop-${String(outcome.stopReason).replace(/[^a-z0-9-]/g, "-")}`;
  if (milestone) {
    milestone.status = outcome.stopReason === "paused" || outcome.stopReason === "held" ? "paused" : "blocked";
    milestone.blockers = milestone.blockers || [];
    if (!milestone.blockers.some(blocker => blocker.id === blockerId)) {
      milestone.blockers.push({
        id: blockerId,
        type: "decision-required",
        description: outcome.blocker || `Runner stopped with outcome '${outcome.stopReason}'.`,
        owner: "project owner",
        resolutionCondition: "Inspect the preserved worker branch and run evidence, resolve the stop condition, then resume explicitly.",
        createdAt: now,
      });
    }
    writeJson(milestonePath, milestone);
  }
  if (projectState) {
    projectState.status = milestone?.status || "blocked";
    projectState.currentMilestone = milestoneId;
    projectState.nextRecommendedAction = `Inspect DEV loop stop '${outcome.stopReason}' for '${milestoneId}' and resume explicitly.`;
    projectState.updatedAt = now;
    projectState.updatedBy = { type: "agent", name: "dev-loop", platform: "system" };
    writeJson(PROJECT_STATE_PATH, projectState);
  }
}

function writeCloseout(milestone, runState, review, branch) {
  const closeoutPath = path.join(PROJECT_ROOT, "docs", "07-progress", "work-closeout.json");
  const completeReview = review && review.status === "accepted" && review.objective_complete === true;
  const closeout = {
    work_id: `${milestone.id}-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`,
    objective_id: milestone.id,
    status: completeReview ? "complete" : "blocked",
    closed_at: new Date().toISOString(),
    original_goal: milestone.purpose,
    completed: completeReview
      ? ["Existing supervisor/worker loop completed the canonical milestone and its final review was accepted."]
      : [],
    remaining: completeReview ? [] : ["Supervisor final review was not accepted as objective-complete."],
    blockers: completeReview ? [] : ["Accepted objective-complete supervisor review is required."],
    safe_to_start_unrelated_work: false,
    working_branch: branch,
    last_commit: null,
    validation: {
      passed: [],
      failed: [],
      not_run: ["Pre-delivery validation runs after prepare and review closeout."],
    },
    runner: {
      run_id: runState.run_id || null,
      iteration: runState.iteration || 0,
      final_status: runState.status || null,
      review_status: review?.status || null,
    },
    recommended_next_agent: completeReview ? "reviewer" : "project owner",
  };
  writeJson(closeoutPath, closeout);
  return completeReview;
}

function finalizeCompletedMilestone(milestone, runState) {
  const review = readJson(REVIEW_PATH, null);
  const branchResult = run("git", ["rev-parse", "--abbrev-ref", "HEAD"], { timeout: 30000 });
  ensureSuccessful("Read worker branch", branchResult);
  const branch = (branchResult.stdout || "").trim();
  if (!writeCloseout(milestone, runState, review, branch)) {
    throw new Error("Final supervisor review is not accepted and objective-complete.");
  }

  ensureSuccessful("Checkpoint", runLifecycle(["checkpoint", "--message", "Canonical supervisor loop completed with accepted final review."]));
  ensureSuccessful("Session close", runLifecycle(["session:close", "--summary", "Canonical queue runner completed the milestone and preserved review evidence."]));
  ensureSuccessful("Code review", run(process.execPath, [path.join(PROJECT_ROOT, "scripts", "agent-review.js"), "--slug", milestone.id], { timeout: 300000 }));
  ensureSuccessful("Prepare", runLifecycle(["prepare"]));
  ensureSuccessful("Validation", runLifecycle([
    "validate",
    "--acknowledge-manual",
    "review-gate,closeout-verified",
    "--acknowledged-by",
    "dev-loop",
  ], { timeout: 600000 }));
  ensureSuccessful("Completion gate", runLifecycle(["complete"]));
  const add = run("git", ["add", "development"], { timeout: 30000 });
  ensureSuccessful("Stage completion evidence", add);
  const staged = run("git", ["diff", "--cached", "--name-only"], { timeout: 30000 });
  ensureSuccessful("Inspect completion evidence", staged);
  const stagedFiles = (staged.stdout || "").split(/\r?\n/).filter(Boolean);
  if (stagedFiles.some(file => !file.startsWith("development/"))) {
    throw new Error("Completion evidence staging included a non-development file.");
  }
  if (stagedFiles.length > 0) {
    ensureSuccessful("Commit completion evidence", run("git", [
      "commit",
      "-m",
      `chore(development): record ${milestone.id} completion`,
    ], { timeout: 30000 }));
  }
}

function parseCliArgs(argv) {
  const slugIndex = argv.indexOf("--slug");
  return {
    dryRun: argv.includes("--dry-run"),
    slug: slugIndex >= 0 ? argv[slugIndex + 1] : null,
  };
}

function main() {
  const options = parseCliArgs(process.argv.slice(2));
  const milestones = listMilestones();
  const selection = selectMilestone(milestones, options.slug);
  if (!selection.ok) {
    console.log(JSON.stringify({ ok: false, ...selection }, null, 2));
    process.exit(selection.stopReason === "no_eligible_work" ? 0 : 2);
  }

  if (options.dryRun) {
    console.log(JSON.stringify({
      ok: true,
      dryRun: true,
      selected: selection.milestone.id,
      source: selection.source,
      action: selection.source === "ready" ? "activate_then_run" : "resume_then_run",
      automaticDelivery: false,
    }, null, 2));
    return;
  }

  const dirty = gitStatus();
  if (dirty) {
    console.error("DEV loop refused to start because the working tree is dirty. No files were changed or discarded.");
    process.exit(2);
  }

  const milestone = selection.milestone;
  ensureRunnerBranch(milestone.id);
  if (selection.source === "ready") {
    const begin = run(process.execPath, [path.join(PROJECT_ROOT, "scripts", "dev-begin.js"), "--slug", milestone.id], { timeout: 30000 });
    ensureSuccessful("Milestone activation", begin);
  } else if (!activeSession(PROJECT_ROOT, milestone.id)) {
    throw new Error(`Active milestone '${milestone.id}' has no active session; resume or repair it explicitly.`);
  }

  const sequencer = run(process.execPath, [SEQUENCER_PATH, "--milestone", milestone.id, "--stay-on-worker"], {
    timeout: 0,
    stdio: "inherit",
    env: { ...process.env, DEV_LOOP_MODE: "1" },
  });
  const runState = readJson(RUN_STATE_PATH, null);
  let outcome = classifyRunState(runState);
  if (sequencer.status !== 0 && outcome.complete) {
    outcome = {
      complete: false,
      stopReason: "held",
      blocker: `sequencer_exit_${sequencer.status ?? "unknown"}`,
    };
  }
  if (sequencer.status !== 0 || !outcome.complete) {
    recordCanonicalStop(milestone.id, outcome);
    console.log(JSON.stringify({ ok: false, milestoneId: milestone.id, ...outcome }, null, 2));
    process.exit(2);
  }

  finalizeCompletedMilestone(readJson(path.join(MILESTONES_DIR, `${milestone.id}.json`), milestone), runState);
  console.log(JSON.stringify({
    ok: true,
    milestoneId: milestone.id,
    status: "ready-for-delivery",
    stopReason: "approval_required",
    automaticDelivery: false,
  }, null, 2));
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[dev-loop] ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  classifyRunState,
  dependencyProblems,
  eligibility,
  ensureRunnerBranch,
  listMilestones,
  parseCliArgs,
  selectMilestone,
};
