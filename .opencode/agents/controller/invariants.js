#!/usr/bin/env node
/**
 * .opencode/agents/controller/invariants.js
 *
 * Objective identity, branch enforcement, queue completeness, milestone
 * manifests, durable milestone records, and resume support.
 */

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const AGENTS_DIR = path.resolve(__dirname, "..");
const PROJECT_ROOT = path.resolve(AGENTS_DIR, "..", "..");

// ---- helpers ----

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return fallback; }
}
function readText(p) {
  try { return fs.readFileSync(p, "utf8"); } catch { return ""; }
}
function git(args, opts = {}) {
  return spawnSync("git", args, { cwd: PROJECT_ROOT, encoding: "utf8", maxBuffer: 1024 * 1024, ...opts });
}
function gitOk(args) {
  const r = git(args, { shell: process.platform === "win32" });
  return r.status === 0 ? (r.stdout || "").trim() : null;
}
function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

// ---- Objective identity ----

function readActiveObjectiveSlug() {
  const objPath = path.join(AGENTS_DIR, "objectives", "active-objective.md");
  const text = readText(objPath);
  const match = text.match(/^#\s+(.+)/m);
  if (!match) return null;
  return match[1].trim().replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

function validateObjectiveIdentity(statePath) {
  const activeSlug = readActiveObjectiveSlug();
  const state = readJson(statePath, {});
  const stateObjective = state.objective || "";
  if (!activeSlug) return { valid: false, reason: "objective_state_mismatch", details: "active-objective.md has no parseable title" };
  if (!stateObjective) return { valid: false, reason: "objective_state_mismatch", details: "run-state.json has no objective field" };

  const normalizeId = (s) => s.replace(/^\d+-?/, "").replace(/-/g, "");
  if (normalizeId(stateObjective) !== normalizeId(activeSlug)) {
    return { valid: false, reason: "objective_state_mismatch", details: `active-objective.md slug "${activeSlug}" vs run-state "${stateObjective}"` };
  }

  const branch = gitOk(["rev-parse", "--abbrev-ref", "HEAD"]);
  if (branch && (branch.startsWith("agents/worker/") || branch.startsWith("agents/sequencer/"))) {
    const branchSlug = branch.replace(/^agents\/worker\//, "").replace(/^agents\/sequencer\//, "");
    if (normalizeId(branchSlug) !== normalizeId(stateObjective)) {
      return { valid: false, reason: "branch_objective_mismatch", details: `branch "${branch}" slug "${branchSlug}" vs objective "${stateObjective}"` };
    }
  }
  return { valid: true };
}

function expectedWorkerBranch(statePath) {
  const state = readJson(statePath, {});
  const objective = state.objective || readActiveObjectiveSlug() || "";
  const cfg = readJson(path.join(__dirname, "config.json"), {});
  const prefix = (cfg.git && cfg.git.worker_branch_prefix) || "agents/worker";
  return `${prefix}/${objective}`;
}

function validateWorkerBranch(statePath) {
  const expected = expectedWorkerBranch(statePath);
  const actual = gitOk(["rev-parse", "--abbrev-ref", "HEAD"]);
  if (!actual) return { valid: false, reason: "cannot_determine_branch", expected };
  if (actual !== expected) return { valid: false, reason: "worker_branch_objective_mismatch", expected, actual };
  return { valid: true, expected, actual };
}

// ---- Queue completeness ----

function validateQueueCompleteness(queueDir) {
  const bulkGuidePath = path.join(queueDir, "BULK_MILESTONE_GUIDE.md");
  if (!fs.existsSync(bulkGuidePath)) return { valid: true, expected: [], found: [], missing: [] };

  const guideText = readText(bulkGuidePath);
  const expectedFiles = [];
  const fileRegex = /[-*]\s+`([\w-]+\.md)`/g;
  let match;
  while ((match = fileRegex.exec(guideText)) !== null) expectedFiles.push(match[1]);
  if (expectedFiles.length === 0) return { valid: true, expected: [], found: [], missing: [] };

  const found = [];
  const missing = [];
  if (fs.existsSync(queueDir)) {
    const existing = fs.readdirSync(queueDir).filter(f => f.endsWith(".md"));
    for (const expected of expectedFiles) {
      if (existing.includes(expected)) found.push(expected);
      else missing.push(expected);
    }
  } else { missing.push(...expectedFiles); }

  return { valid: missing.length === 0, expected: expectedFiles, found, missing };
}

// ---- Durable milestone records ----

const MILESTONE_DIR = path.join(AGENTS_DIR, "state", "milestones");

function milestoneRecordPath(slug) {
  ensureDir(MILESTONE_DIR);
  return path.join(MILESTONE_DIR, `${slug}.json`);
}

function readMilestoneRecord(slug) {
  return readJson(milestoneRecordPath(slug), null);
}

function writeMilestoneRecord(slug, record) {
  ensureDir(MILESTONE_DIR);
  record.objective_id = slug;
  record.updated_at = new Date().toISOString();
  fs.writeFileSync(milestoneRecordPath(slug), JSON.stringify(record, null, 2) + "\n");
}

function createMilestoneRecord(slug, branchName, baseCommit) {
  const record = {
    objective_id: slug, status: "in_progress", branch: branchName,
    base_commit: baseCommit || "", completed_tasks: [], next_task: null,
    started_at: new Date().toISOString(), completed_at: null,
    accepted_task_count: 0, rejected_task_count: 0, iteration_count: 0,
  };
  writeMilestoneRecord(slug, record);
  return record;
}

function markMilestoneComplete(slug) {
  const record = readMilestoneRecord(slug) || {};
  record.status = "complete";
  record.completed_at = new Date().toISOString();
  writeMilestoneRecord(slug, record);
  return record;
}

function markMilestoneFailed(slug, blocker) {
  const record = readMilestoneRecord(slug) || {};
  record.status = "failed";
  record.blocker = blocker || "unknown";
  record.completed_at = new Date().toISOString();
  writeMilestoneRecord(slug, record);
  return record;
}

function recordAcceptedTask(slug, taskId, commit) {
  const record = readMilestoneRecord(slug);
  if (!record) return null;
  record.completed_tasks.push({ id: taskId, commit: commit || "", accepted: true, accepted_at: new Date().toISOString() });
  record.accepted_task_count = (record.accepted_task_count || 0) + 1;
  writeMilestoneRecord(slug, record);
  return record;
}

function resumeState(slug) {
  const record = readMilestoneRecord(slug);
  if (!record) return { exists: false, can_resume: false, reason: "no_record" };
  if (record.status === "complete") return { exists: true, can_resume: false, reason: "already_complete" };
  if (record.status === "failed") return { exists: true, can_resume: false, reason: "previously_failed", blocker: record.blocker };
  const branchExists = record.branch ? gitOk(["rev-parse", "--verify", record.branch]) !== null : false;
  return {
    exists: true, can_resume: record.status === "in_progress",
    reason: record.status === "in_progress" ? (branchExists ? "resumable" : "branch_missing") : record.status,
    objective_id: slug, status: record.status, branch: record.branch,
    branch_exists: branchExists, completed_tasks: record.completed_tasks || [],
    accepted_task_count: record.accepted_task_count || 0, next_task: record.next_task || null,
  };
}

function checkMilestoneCompleted(slug, completionConditions = []) {
  const record = readMilestoneRecord(slug);
  if (!record) return { complete: false, reason: "no_record" };
  if (record.accepted_task_count === 0) return { complete: false, reason: "no_accepted_tasks" };
  const acceptedIds = new Set((record.completed_tasks || []).map(t => t.id));
  const unmet = completionConditions.filter(c => !acceptedIds.has(c));
  if (unmet.length > 0) return { complete: false, reason: "unmet_conditions", unmet };
  return { complete: true };
}

// ---- Milestone manifest (atomic completion record) ----

const MANIFEST_DIR = path.join(AGENTS_DIR, "state", "manifests");

function buildMilestoneManifest(slug, statePath) {
  const record = readMilestoneRecord(slug);
  const state = readJson(statePath, {});
  const branch = record?.branch || state.worker_branch || "";
  const baseSha = record?.base_commit || "";
  const headSha = gitOk(["rev-parse", "HEAD"]) || "";

  let uniqueCommits = 0;
  if (baseSha && headSha) {
    try {
      const count = git(["rev-list", "--count", `${baseSha}..${headSha}`]);
      if (count.status === 0) uniqueCommits = parseInt((count.stdout || "0").trim(), 10) || 0;
    } catch {}
  }

  let changedFiles = [];
  if (baseSha) {
    try {
      const diff = git(["diff", "--name-only", baseSha, headSha]);
      if (diff.status === 0) changedFiles = (diff.stdout || "").split(/\r?\n/).filter(Boolean);
    } catch {}
  }

  return {
    manifest_version: "1.0.0", objective: slug, objective_file: `${slug}.md`,
    baseSha, headSha, branch, unique_commits: uniqueCommits, changed_files: changedFiles,
    accepted_task_count: record?.accepted_task_count || 0,
    completed_tasks: (record?.completed_tasks || []).map(t => ({ id: t.id, commit: t.commit, accepted: t.accepted })),
    supervisor_accepted: state.status === "complete" || state.objective_complete === true,
    tests_run: [], tests_passed: false, completion_conditions_reviewed: false,
    integration_status: "pending", generated_at: new Date().toISOString(),
  };
}

function validateMilestoneManifest(manifest) {
  const failures = [];
  if (!manifest.unique_commits || manifest.unique_commits === 0) failures.push("no_unique_commits");
  if (!manifest.changed_files || manifest.changed_files.length === 0) failures.push("no_changed_files");
  if (!manifest.supervisor_accepted) failures.push("supervisor_not_accepted");
  if (manifest.accepted_task_count === 0) failures.push("no_accepted_tasks");
  if (!manifest.tests_passed) failures.push("tests_not_passed");
  if (!manifest.completion_conditions_reviewed) failures.push("conditions_not_reviewed");
  return { valid: failures.length === 0, failures };
}

function finalizeMilestone(slug, manifest, testsRun, testsPassed) {
  manifest.tests_run = testsRun || [];
  manifest.tests_passed = testsPassed === true;
  manifest.completion_conditions_reviewed = true;
  manifest.integration_status = "complete";
  ensureDir(MANIFEST_DIR);
  fs.writeFileSync(path.join(MANIFEST_DIR, `${slug}.json`), JSON.stringify(manifest, null, 2) + "\n");
  const validation = validateMilestoneManifest(manifest);
  if (!validation.valid) return { success: false, reason: "manifest_validation_failed", failures: validation.failures, manifest };
  markMilestoneComplete(slug);
  return { success: true, manifest };
}

module.exports = {
  readActiveObjectiveSlug, validateObjectiveIdentity, expectedWorkerBranch, validateWorkerBranch,
  validateQueueCompleteness, createMilestoneRecord, readMilestoneRecord, writeMilestoneRecord,
  markMilestoneComplete, markMilestoneFailed, recordAcceptedTask, resumeState, checkMilestoneCompleted,
  buildMilestoneManifest, validateMilestoneManifest, finalizeMilestone,
  MILESTONE_DIR, MANIFEST_DIR,
};
