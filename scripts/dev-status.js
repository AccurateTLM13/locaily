#!/usr/bin/env node
/**
 * scripts/dev-status.js
 *
 * Universal development status command. Inspects repository reality and reports:
 *   - Current branch, HEAD, dirty/staged/untracked files
 *   - Active milestone, session references
 *   - Latest validation state
 *   - Blockers and next action
 *   - Integrity contradictions with severity levels
 *
 * Usage:
 *   node scripts/dev-status.js              # human-readable
 *   node scripts/dev-status.js --json       # machine-readable JSON
 *   node scripts/dev-status.js --strict     # exit 1 for any contradiction (not just critical)
 *   node scripts/dev-status.js --json --strict
 */

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const DEVELOPMENT_DIR = path.join(PROJECT_ROOT, "development");
const PROJECT_STATE_PATH = path.join(DEVELOPMENT_DIR, "project-state.json");
const MILESTONES_DIR = path.join(DEVELOPMENT_DIR, "milestones");
const SESSIONS_DIR = path.join(DEVELOPMENT_DIR, "sessions");
const AGENTS_STATE_DIR = path.join(PROJECT_ROOT, ".opencode", "agents", "state");
const OBJECTIVES_DIR = path.join(PROJECT_ROOT, ".opencode", "agents", "objectives");

// ---- helpers ----

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return fallback; }
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
  return result.status === 0 ? (result.stdout || "").trim() : null;
}

function listJson(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith(".json"));
}

// ---- git state inspection ----

function inspectGit() {
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
  const head = git(["rev-parse", "--short", "HEAD"]);
  const isDirty = (git(["status", "--porcelain"]) || "").length > 0;

  const staged = (git(["diff", "--cached", "--name-only"]) || "").split(/\r?\n/).filter(Boolean);
  const modified = (git(["diff", "--name-only"]) || "").split(/\r?\n/).filter(Boolean);
  const untracked = (git(["ls-files", "--others", "--exclude-standard"]) || "").split(/\r?\n/).filter(Boolean);

  const defaultBranch = git(["rev-parse", "--verify", "main"]) ? "main" : "master";
  const isDefault = branch === defaultBranch;
  const isMilestoneBranch = branch && branch.startsWith("milestone/");

  return {
    branch,
    head,
    isDefault,
    defaultBranch,
    isDirty,
    isMilestoneBranch,
    staged,
    modified,
    untracked,
    totalDirty: staged.length + modified.length + untracked.length,
  };
}

// ---- project state inspection ----

function inspectProjectState() {
  const state = readJson(PROJECT_STATE_PATH, null);
  if (!state) {
    return { exists: false, valid: false, error: "development/project-state.json not found" };
  }

  const errors = [];
  if (state.schema !== "locaily.development.project_state.v1") errors.push(`Wrong schema: ${state.schema}`);
  if (!state.project) errors.push("Missing project");
  if (!state.status) errors.push("Missing status");
  if (!state.defaultBranch) errors.push("Missing defaultBranch");
  if (!state.updatedAt) errors.push("Missing updatedAt");

  return { exists: true, valid: errors.length === 0, errors, data: state };
}

// ---- milestone inspection ----

function inspectMilestones() {
  const files = listJson(MILESTONES_DIR);
  const milestones = files.map(f => readJson(path.join(MILESTONES_DIR, f), null)).filter(Boolean);
  return {
    count: milestones.length,
    active: milestones.filter(m => m.status === "active"),
    planned: milestones.filter(m => m.status === "planned"),
    ready: milestones.filter(m => m.status === "ready"),
    paused: milestones.filter(m => m.status === "paused"),
    blocked: milestones.filter(m => m.status === "blocked"),
    validating: milestones.filter(m => m.status === "validating"),
    readyForDelivery: milestones.filter(m => m.status === "ready-for-delivery"),
    delivered: milestones.filter(m => m.status === "delivered"),
    completed: milestones.filter(m => m.status === "completed" || m.status === "merged"),
    cancelled: milestones.filter(m => m.status === "cancelled"),
  };
}

// ---- session inspection ----

function inspectSessions() {
  const files = listJson(SESSIONS_DIR);
  const sessions = files.map(f => readJson(path.join(SESSIONS_DIR, f), null)).filter(Boolean);
  return {
    count: sessions.length,
    active: sessions.filter(s => s.status === "active"),
    paused: sessions.filter(s => s.status === "paused"),
    closed: sessions.filter(s => s.status === "closed"),
    interrupted: sessions.filter(s => s.status === "interrupted"),
  };
}

// ---- legacy state inspection ----

function inspectLegacyState() {
  const runState = readJson(path.join(AGENTS_STATE_DIR, "run-state.json"), null);
  const activeObjective = readText(path.join(OBJECTIVES_DIR, "active-objective.md")).trim();
  const closeout = readJson(path.join(PROJECT_ROOT, "docs", "07-progress", "work-closeout.json"), null);

  const objectiveActive = activeObjective &&
    !activeObjective.includes("No objective is currently active");

  const milestoneFiles = listJson(path.join(AGENTS_STATE_DIR, "milestones"));
  const milestones = milestoneFiles.map(f =>
    readJson(path.join(AGENTS_STATE_DIR, "milestones", f), null)
  ).filter(Boolean);

  const staleMilestones = milestones.filter(m =>
    m.status === "in_progress" || m.status === "running"
  );

  return {
    runState: runState ? {
      objective: runState.objective || null,
      status: runState.status || null,
      objectiveComplete: runState.objective_complete || false,
      blocker: runState.blocker || null,
    } : null,
    activeObjective: objectiveActive ? activeObjective : null,
    closeout: closeout ? {
      workId: closeout.work_id,
      status: closeout.status,
      safeToStart: closeout.safe_to_start_unrelated_work,
    } : null,
    legacyMilestones: {
      total: milestones.length,
      active: milestones.filter(m => m.status === "in_progress").length,
      stale: staleMilestones.length,
      staleRecords: staleMilestones.map(m => ({
        id: m.objective_id,
        status: m.status,
        branch: m.branch,
      })),
    },
  };
}

// ---- contradiction detection with severity ----

/**
 * Contradiction severity levels:
 *   "info"      — informational, no action required
 *   "warning"   — should be addressed but does not block work
 *   "error"     — must be resolved before proceeding
 *   "critical"  — repository state is corrupt or dangerous
 *
 * Default mode: info+warning → exit 0, error → exit 1, critical → exit 2
 * Strict mode:  warning+error → exit 1, critical → exit 2
 */
function detectContradictions(projectState, gitState, legacyState, milestones, sessions) {
  const contradictions = [];

  function add(severity, code, message, fix) {
    contradictions.push({ severity, code, message, fix });
  }

  // --- ERROR: project-state says active but no milestone is active ---
  if (projectState.data && projectState.data.status === "active" && milestones.active.length === 0) {
    add("error", "CP_ACTIVE_NO_MILESTONE",
      "project-state says 'active' but no milestone has status 'active'",
      "Set project-state status to 'idle' or create an active milestone");
  }

  // --- ERROR: project-state says idle but a milestone is active ---
  if (projectState.data && projectState.data.status === "idle" && milestones.active.length > 0) {
    add("error", "CP_IDLE_ACTIVE_MILESTONE",
      "project-state says 'idle' but a milestone has status 'active'",
      "Update project-state status to 'active' and set currentMilestone");
  }

  // --- ERROR: project-state has activeSession but no active session file exists ---
  if (projectState.data && projectState.data.activeSession) {
    const sessionPath = path.join(SESSIONS_DIR, `${projectState.data.activeSession}.json`);
    if (!fs.existsSync(sessionPath)) {
      add("error", "CP_SESSION_MISSING",
        `project-state references activeSession '${projectState.data.activeSession}' but session file not found`,
        "Remove activeSession from project-state or create the session file");
    }
  }

  // --- Roadmap drift detection ---
  const roadmap = readJson(path.join(DEVELOPMENT_DIR, "roadmap.json"), null);
  if (roadmap && roadmap.areas) {
    // Collect milestone IDs referenced in roadmap
    const roadmapMilestoneIds = new Set();
    for (const area of roadmap.areas) {
      for (const init of (area.initiatives || [])) {
        for (const mid of (init.milestoneIds || [])) {
          roadmapMilestoneIds.add(mid);
        }
      }
    }

    // Collect all milestone record IDs
    const allMilestoneIds = new Set();
    for (const file of listJson(MILESTONES_DIR)) {
      const m = readJson(path.join(MILESTONES_DIR, file), null);
      if (m) allMilestoneIds.add(m.id);
    }

    // Milestones in records but not in roadmap
    for (const mid of allMilestoneIds) {
      if (!roadmapMilestoneIds.has(mid) && !mid.startsWith("dcp-")) {
        add("info", "DRIFT_RECORD_NOT_IN_ROADMAP",
          `Milestone '${mid}' exists in records but is not referenced in roadmap.json`,
          "Add milestone to roadmap.json or document why it is not tracked");
      }
    }

    // Milestones in roadmap but not in records
    for (const mid of roadmapMilestoneIds) {
      if (!allMilestoneIds.has(mid)) {
        add("info", "DRIFT_ROADMAP_NOT_IN_RECORDS",
          `Roadmap references milestone '${mid}' but no milestone record exists`,
          "Create milestone record or remove from roadmap.json");
      }
    }
  }

  // --- Non-default branch classification ---
  if (!gitState.isDefault) {
    // Check if current branch matches any milestone's prepared or completion branch
    const milestoneFiles = listJson(MILESTONES_DIR);
    const allMilestones = milestoneFiles.map(f => readJson(path.join(MILESTONES_DIR, f), null)).filter(Boolean);
    const branchOwner = allMilestones.find(m =>
      m.preparedBranch === gitState.branch || m.completionBranch === gitState.branch
    );

    if (branchOwner) {
      // Branch is owned by a milestone — info level
      const milestoneStatus = branchOwner.status;
      if (milestoneStatus === "active") {
        add("info", "BRANCH_OWNED_BY_ACTIVE",
          `On branch '${gitState.branch}' owned by active milestone '${branchOwner.id}'`,
          null);
      } else if (milestoneStatus === "ready-for-delivery") {
        add("info", "BRANCH_OWNED_BY_READY",
          `On branch '${gitState.branch}' owned by milestone '${branchOwner.id}' (ready for delivery)`,
          null);
      } else if (milestoneStatus === "delivered" || milestoneStatus === "merged" || milestoneStatus === "completed") {
        add("info", "BRANCH_OWNED_BY_COMPLETED",
          `On branch '${gitState.branch}' owned by completed milestone '${branchOwner.id}'`,
          "Consider merging or deleting this branch");
      } else {
        add("info", "BRANCH_OWNED",
          `On branch '${gitState.branch}' owned by milestone '${branchOwner.id}' (status: ${milestoneStatus})`,
          null);
      }
    } else if (!gitState.isMilestoneBranch && milestones.active.length === 0) {
      // No milestone owns this branch and no active milestone
      const hasReadyOrDelivered = allMilestones.some(m =>
        m.status === "ready-for-delivery" || m.status === "delivered"
      );
      if (hasReadyOrDelivered) {
        add("info", "BRANCH_NO_MILESTONE_BUT_DELIVERABLE",
          `On non-default branch '${gitState.branch}' but no milestone owns it (deliverable milestones exist)`,
          "This branch may be a pre-control-plane legacy branch");
      } else {
        add("warning", "BRANCH_NO_MILESTONE",
          `On non-default branch '${gitState.branch}' but no active milestone or session`,
          "Commit/discard work, merge branch, or create a milestone for this branch");
      }
    } else if (gitState.isMilestoneBranch && milestones.active.length === 0) {
      add("warning", "MILESTONE_BRANCH_NO_ACTIVE",
        `On milestone branch '${gitState.branch}' but no milestone has status 'active'`,
        "Start the milestone with dev:milestone:start or switch branches");
    }
  }

  // --- WARNING: legacy run-state shows running but project-state says idle ---
  if (legacyState.runState && legacyState.runState.status === "running" &&
      projectState.data && projectState.data.status === "idle") {
    add("warning", "LEGACY_RUNNING_CP_IDLE",
      "Legacy run-state shows 'running' but project-state says 'idle'",
      "Reset legacy run-state to idle (node scripts/dev-status.js --fix-legacy-run-state)");
  }

  // --- WARNING: legacy run-state shows objective_complete but not archived ---
  if (legacyState.runState && legacyState.runState.objectiveComplete) {
    add("warning", "LEGACY_COMPLETE_NOT_ARCHIVED",
      "Legacy run-state shows objective_complete=true but milestone not archived",
      "Archive the completed objective");
  }

  // --- WARNING: stale legacy milestones ---
  if (legacyState.legacyMilestones.stale > 0) {
    add("warning", "LEGACY_STALE_MILESTONES",
      `${legacyState.legacyMilestones.stale} legacy milestone(s) stuck in_progress/running`,
      "Finalize or reset stale milestones via objective-lifecycle.js");
  }

  // --- INFO: project-state exists but is stale (older than 7 days) ---
  if (projectState.data && projectState.data.updatedAt) {
    const age = Date.now() - new Date(projectState.data.updatedAt).getTime();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    if (age > sevenDays) {
      add("info", "CP_STALE",
        `project-state.json last updated ${Math.floor(age / (24 * 60 * 60 * 1000))} days ago`,
        "Update project-state.json with current status");
    }
  }

  // --- INFO: session exists but has been active too long (> 24h) ---
  for (const s of sessions.active) {
    if (s.startedAt) {
      const age = Date.now() - new Date(s.startedAt).getTime();
      const twentyFourHours = 24 * 60 * 60 * 1000;
      if (age > twentyFourHours) {
        add("info", "SESSION_LONG_RUNNING",
          `Session '${s.id}' has been active for ${Math.floor(age / (60 * 60 * 1000))} hours`,
          "Consider pausing or closing the session");
      }
    }
  }

  return contradictions;
}

// ---- next action recommendation ----

function recommendNextAction(projectState, gitState, milestones, sessions, legacyState) {
  if (milestones.active.length > 0) {
    const m = milestones.active[0];
    if (sessions.active.length > 0) {
      return `Continue session '${sessions.active[0].id}' on milestone '${m.id}'`;
    }
    return `Start a session for active milestone '${m.id}' (dev:resume or dev:milestone:start)`;
  }

  if (milestones.paused.length > 0) {
    const m = milestones.paused[0];
    return `Resume paused milestone '${m.id}' (dev:resume)`;
  }

  if (milestones.planned.length > 0 || milestones.ready.length > 0) {
    const count = milestones.planned.length + milestones.ready.length;
    return `Select and start one of ${count} planned/ready milestone(s) (dev:milestone:start)`;
  }

  if (gitState.isDirty && !gitState.isDefault) {
    return `Resolve ${gitState.totalDirty} dirty file(s) on branch '${gitState.branch}' (commit, discard, or stash)`;
  }

  if (!gitState.isDefault) {
    return `On branch '${gitState.branch}' — merge, delete, or document purpose`;
  }

  return "Select next milestone from sprint candidates";
}

// ---- format output ----

function formatHuman(result) {
  const lines = [];
  const s = result.projectState.data || {};

  lines.push("=== Locaily Development Status ===");
  lines.push("");

  lines.push(`Project:        ${s.project || "unknown"}`);
  lines.push(`Status:         ${s.status || "unknown"}`);
  lines.push(`Default branch: ${result.git.defaultBranch}`);
  lines.push(`Current branch: ${result.git.branch}${result.git.isDefault ? " (default)" : ""}`);
  lines.push(`HEAD:           ${result.git.head}`);
  lines.push("");

  // Git state
  if (result.git.isDirty) {
    lines.push("--- Working Tree ---");
    if (result.git.staged.length > 0) {
      lines.push(`  Staged:    ${result.git.staged.length} file(s)`);
      for (const f of result.git.staged.slice(0, 5)) lines.push(`    ${f}`);
      if (result.git.staged.length > 5) lines.push(`    ... and ${result.git.staged.length - 5} more`);
    }
    if (result.git.modified.length > 0) {
      lines.push(`  Modified:  ${result.git.modified.length} file(s)`);
      for (const f of result.git.modified.slice(0, 5)) lines.push(`    ${f}`);
      if (result.git.modified.length > 5) lines.push(`    ... and ${result.git.modified.length - 5} more`);
    }
    if (result.git.untracked.length > 0) {
      lines.push(`  Untracked: ${result.git.untracked.length} file(s)`);
      for (const f of result.git.untracked.slice(0, 5)) lines.push(`    ${f}`);
      if (result.git.untracked.length > 5) lines.push(`    ... and ${result.git.untracked.length - 5} more`);
    }
    lines.push("");
  } else {
    lines.push("Working tree: clean");
    lines.push("");
  }

  // Milestones
  lines.push("--- Milestones ---");
  if (result.milestones.active.length > 0) {
    for (const m of result.milestones.active) lines.push(`  ACTIVE:          ${m.id} — ${m.title}`);
  }
  if (result.milestones.paused.length > 0) {
    for (const m of result.milestones.paused) lines.push(`  PAUSED:          ${m.id} — ${m.title}`);
  }
  if (result.milestones.blocked.length > 0) {
    for (const m of result.milestones.blocked) lines.push(`  BLOCKED:         ${m.id} — ${m.title}`);
  }
  if (result.milestones.readyForDelivery.length > 0) {
    for (const m of result.milestones.readyForDelivery) lines.push(`  READY/DELIVERY:  ${m.id} — ${m.title}`);
  }
  if (result.milestones.active.length === 0 && result.milestones.paused.length === 0 &&
      result.milestones.blocked.length === 0 && result.milestones.readyForDelivery.length === 0) {
    lines.push("  No active, paused, blocked, or ready-for-delivery milestones.");
  }
  lines.push(`  Planned: ${result.milestones.planned.length} | Ready: ${result.milestones.ready.length} | Completed: ${result.milestones.completed.length}`);
  lines.push("");

  // Sessions
  lines.push("--- Sessions ---");
  if (result.sessions.active.length > 0) {
    for (const s of result.sessions.active) {
      lines.push(`  ACTIVE:  ${s.id} — ${s.objective}`);
      lines.push(`           Branch: ${s.branch} | Started: ${s.startedAt}`);
    }
  }
  if (result.sessions.paused.length > 0) {
    for (const s of result.sessions.paused) {
      lines.push(`  PAUSED:  ${s.id} — ${s.objective}`);
    }
  }
  if (result.sessions.active.length === 0 && result.sessions.paused.length === 0) {
    lines.push("  No active or paused sessions.");
  }
  lines.push(`  Total: ${result.sessions.count}`);
  lines.push("");

  // Legacy state
  if (result.legacy.runState) {
    lines.push("--- Legacy State (.opencode) ---");
    lines.push(`  Run-state objective: ${result.legacy.runState.objective || "(empty)"}`);
    lines.push(`  Run-state status:    ${result.legacy.runState.status}`);
    if (result.legacy.runState.blocker) lines.push(`  Blocker:             ${result.legacy.runState.blocker}`);
    if (result.legacy.activeObjective) lines.push(`  Active objective:    present`);
    if (result.legacy.closeout) {
      lines.push(`  Last closeout:       ${result.legacy.closeout.workId} (${result.legacy.closeout.status})`);
      lines.push(`  Safe to start:       ${result.legacy.closeout.safeToStart}`);
    }
    lines.push("");
  }

  // Contradictions
  if (result.contradictions.length > 0) {
    lines.push("--- Contradictions ---");
    for (const c of result.contradictions) {
      const icon = c.severity === "critical" ? "!!" : c.severity === "error" ? "X" : c.severity === "warning" ? "!" : "i";
      lines.push(`  [${icon}] [${c.severity.toUpperCase()}] ${c.message}`);
      if (c.fix) lines.push(`      Fix: ${c.fix}`);
    }
    lines.push("");
  }

  // Warnings from project state
  if (s.warnings && s.warnings.length > 0) {
    lines.push("--- Warnings ---");
    for (const w of s.warnings) lines.push(`  ! ${w}`);
    lines.push("");
  }

  // Next action
  lines.push("--- Next Action ---");
  lines.push(`  ${result.nextAction}`);
  lines.push("");

  return lines.join("\n");
}

// ---- main ----

function main() {
  const args = process.argv.slice(2);
  const isJson = args.includes("--json");
  const isStrict = args.includes("--strict");

  const gitState = inspectGit();
  const projectState = inspectProjectState();
  const milestones = inspectMilestones();
  const sessions = inspectSessions();
  const legacyState = inspectLegacyState();
  const contradictions = detectContradictions(projectState, gitState, legacyState, milestones, sessions);
  const nextAction = recommendNextAction(projectState, gitState, milestones, sessions, legacyState);

  const warnings = [];
  if (projectState.data && projectState.data.warnings) {
    warnings.push(...projectState.data.warnings);
  }
  if (gitState.isDirty) {
    warnings.push(`${gitState.totalDirty} uncommitted file(s) on branch '${gitState.branch}'`);
  }

  const criticalCount = contradictions.filter(c => c.severity === "critical").length;
  const errorCount = contradictions.filter(c => c.severity === "error").length;
  const warningCount = contradictions.filter(c => c.severity === "warning").length;
  const infoCount = contradictions.filter(c => c.severity === "info").length;

  const result = {
    schema: "locaily.development.status.v1",
    timestamp: new Date().toISOString(),
    project: projectState.data?.project || "locaily",
    status: projectState.data?.status || "unknown",
    git: gitState,
    projectState: {
      exists: projectState.exists,
      valid: projectState.valid,
      errors: projectState.errors,
      data: projectState.data,
    },
    milestones,
    sessions,
    legacy: legacyState,
    contradictions,
    warnings,
    nextAction,
    summary: {
      contradictions: contradictions.length,
      critical: criticalCount,
      errors: errorCount,
      warnings: warningCount,
      info: infoCount,
    },
  };

  if (isJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatHuman(result));
  }

  // Exit codes: default: info+warning→0, error→1, critical→2
  //            strict: warning+error→1, critical→2
  if (criticalCount > 0) process.exit(2);
  if (errorCount > 0) process.exit(1);
  if (isStrict && warningCount > 0) process.exit(1);
  process.exit(0);
}

main();
