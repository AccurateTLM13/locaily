#!/usr/bin/env node
/**
 * scripts/generate-development-dashboard.js
 *
 * Generates read-only development dashboard from canonical state.
 * Produces: roadmap.html, roadmap-data.json, status-summary.md, next-agent-handoff.md
 *
 * Usage:
 *   node scripts/generate-development-dashboard.js
 *   npm run dev:dashboard
 */

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const DEVELOPMENT_DIR = path.join(PROJECT_ROOT, "development");
const GENERATED_DIR = path.join(DEVELOPMENT_DIR, "generated");
const MILESTONES_DIR = path.join(DEVELOPMENT_DIR, "milestones");
const SESSIONS_DIR = path.join(DEVELOPMENT_DIR, "sessions");
const VALIDATION_RESULTS_DIR = path.join(DEVELOPMENT_DIR, "validation-results");
const DELIVERY_DIR = path.join(DEVELOPMENT_DIR, "delivery");

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
  return fs.readdirSync(dir).filter(f => f.endsWith(".json")).map(f => readJson(path.join(dir, f), null)).filter(Boolean);
}

function now() {
  return new Date().toISOString();
}

function fileAge(p) {
  try {
    const stat = fs.statSync(p);
    return Date.now() - stat.mtimeMs;
  } catch {
    return Infinity;
  }
}

// ---- load canonical state ----

function loadState() {
  const projectState = readJson(path.join(DEVELOPMENT_DIR, "project-state.json"), null);
  const roadmap = readJson(path.join(DEVELOPMENT_DIR, "roadmap.json"), null);
  const milestones = listJson(MILESTONES_DIR);
  const sessions = listJson(SESSIONS_DIR);
  const validations = listJson(VALIDATION_RESULTS_DIR);
  const deliveries = listJson(DELIVERY_DIR);
  const closeout = readJson(path.join(PROJECT_ROOT, "docs", "07-progress", "work-closeout.json"), null);

  const gitBranch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
  const gitHead = git(["rev-parse", "--short", "HEAD"]);
  const gitStatus = (git(["status", "--porcelain"]) || "").length > 0;

  return {
    projectState,
    roadmap,
    milestones,
    sessions,
    validations,
    deliveries,
    closeout,
    git: { branch: gitBranch, head: gitHead, dirty: gitStatus },
    generatedAt: now(),
  };
}

// ---- staleness checks ----

function checkStaleness(state) {
  const warnings = [];
  const oneDay = 24 * 60 * 60 * 1000;
  const sevenDays = 7 * oneDay;

  // Active milestone without session
  const activeMilestones = state.milestones.filter(m => m.status === "active");
  for (const m of activeMilestones) {
    const hasSession = state.sessions.some(s => s.milestoneId === m.id && s.status === "active");
    if (!hasSession) {
      warnings.push({ severity: "warning", code: "ACTIVE_NO_SESSION", message: `Milestone '${m.id}' is active but has no active session` });
    }
  }

  // Paused work without handoff
  const pausedMilestones = state.milestones.filter(m => m.status === "paused");
  for (const m of pausedMilestones) {
    const lastSession = state.sessions.filter(s => s.milestoneId === m.id).sort((a, b) => (b.closedAt || "").localeCompare(a.closedAt || ""))[0];
    if (lastSession && !lastSession.nextRecommendedAction) {
      warnings.push({ severity: "warning", code: "PAUSED_NO_HANDOFF", message: `Milestone '${m.id}' is paused but session has no nextRecommendedAction` });
    }
  }

  // Delivered without PR metadata
  const delivered = state.milestones.filter(m => m.status === "delivered");
  for (const m of delivered) {
    if (!m.prNumber && !m.prUrl) {
      const delivery = state.deliveries.find(d => d.milestoneId === m.id);
      if (!delivery || !delivery.prNumber) {
        warnings.push({ severity: "warning", code: "DELIVERED_NO_PR", message: `Milestone '${m.id}' is delivered but has no PR metadata` });
      }
    }
  }

  // Completed milestones with blockers
  const completed = state.milestones.filter(m => m.status === "completed" || m.status === "merged");
  for (const m of completed) {
    if (m.blockers && m.blockers.length > 0) {
      warnings.push({ severity: "error", code: "COMPLETED_HAS_BLOCKERS", message: `Milestone '${m.id}' is completed but has ${m.blockers.length} blocker(s)` });
    }
  }

  // Stale project state
  if (state.projectState && state.projectState.updatedAt) {
    const age = Date.now() - new Date(state.projectState.updatedAt).getTime();
    if (age > sevenDays) {
      warnings.push({ severity: "info", code: "STALE_PROJECT_STATE", message: `project-state.json last updated ${Math.floor(age / oneDay)} days ago` });
    }
  }

  // Stale validation
  for (const v of state.validations) {
    if (v.completedAt) {
      const age = Date.now() - new Date(v.completedAt).getTime();
      if (age > sevenDays) {
        warnings.push({ severity: "info", code: "STALE_VALIDATION", message: `Validation '${v.id}' is ${Math.floor(age / oneDay)} days old` });
      }
    }
  }

  // Missing references
  if (state.projectState && state.projectState.currentMilestone) {
    const exists = state.milestones.some(m => m.id === state.projectState.currentMilestone);
    if (!exists) {
      warnings.push({ severity: "error", code: "MISSING_MILESTONE_REF", message: `project-state references milestone '${state.projectState.currentMilestone}' which does not exist` });
    }
  }

  if (state.projectState && state.projectState.activeSession) {
    const exists = state.sessions.some(s => s.id === state.projectState.activeSession);
    if (!exists) {
      warnings.push({ severity: "error", code: "MISSING_SESSION_REF", message: `project-state references session '${state.projectState.activeSession}' which does not exist` });
    }
  }

  // Generated files older than sources
  const generatedDir = GENERATED_DIR;
  if (fs.existsSync(generatedDir)) {
    const generatedFiles = fs.readdirSync(generatedDir).filter(f => f.endsWith(".json") || f.endsWith(".md") || f.endsWith(".html"));
    for (const gf of generatedFiles) {
      const gfPath = path.join(generatedDir, gf);
      const gfAge = fileAge(gfPath);
      // Check if any source file is newer
      const sourceFiles = [
        path.join(DEVELOPMENT_DIR, "project-state.json"),
        path.join(DEVELOPMENT_DIR, "roadmap.json"),
        path.join(MILESTONES_DIR, "*.json"),
      ];
      // Simple check: if generated file is older than 1 day and project state is newer
      if (gfAge > oneDay && state.projectState && state.projectState.updatedAt) {
        const stateAge = Date.now() - new Date(state.projectState.updatedAt).getTime();
        if (stateAge < gfAge) {
          warnings.push({ severity: "info", code: "STALE_GENERATED", message: `Generated file '${gf}' may be stale` });
        }
      }
    }
  }

  return warnings;
}

// ---- subsystem maturity ----

function getSubsystemMaturity(state) {
  if (!state.roadmap || !state.roadmap.areas) return [];
  return state.roadmap.areas.map(area => ({
    id: area.id,
    title: area.title,
    maturity: area.maturity,
    initiatives: (area.initiatives || []).map(init => ({
      id: init.id,
      title: init.title,
      maturity: init.maturity,
    })),
  }));
}

// ---- milestone board ----

function getMilestoneBoard(state) {
  const board = {
    idea: [], planned: [], ready: [], active: [], paused: [], blocked: [],
    validating: [], "ready-for-delivery": [], delivered: [], merged: [],
    completed: [], cancelled: [],
  };
  for (const m of state.milestones) {
    if (board[m.status]) {
      board[m.status].push({ id: m.id, title: m.title, type: m.type, priority: m.priority });
    }
  }
  return board;
}

// ---- validation scoreboard ----

function getValidationScoreboard(state) {
  return state.validations.map(v => ({
    id: v.id,
    milestoneId: v.milestoneId,
    status: v.status,
    profileId: v.profileId,
    branch: v.gitState?.branch,
    completedAt: v.completedAt,
    requiredPassed: v.results?.filter(r => r.required !== false && r.status === "passed").length || 0,
    requiredFailed: v.results?.filter(r => r.required !== false && r.status !== "passed").length || 0,
  }));
}

// ---- recent activity ----

function getRecentActivity(state) {
  const activity = [];
  for (const s of state.sessions) {
    if (s.startedAt) {
      activity.push({ type: "session", id: s.id, milestoneId: s.milestoneId, status: s.status, timestamp: s.startedAt });
    }
    if (s.closedAt) {
      activity.push({ type: "session-closed", id: s.id, milestoneId: s.milestoneId, timestamp: s.closedAt });
    }
  }
  for (const v of state.validations) {
    if (v.completedAt) {
      activity.push({ type: "validation", id: v.id, milestoneId: v.milestoneId, status: v.status, timestamp: v.completedAt });
    }
  }
  for (const d of state.deliveries) {
    if (d.pushedAt) {
      activity.push({ type: "delivery", id: d.milestoneId, status: d.status, timestamp: d.pushedAt });
    }
    if (d.prCreated) {
      activity.push({ type: "pr-created", id: d.milestoneId, prNumber: d.prNumber, timestamp: d.prCreated });
    }
  }
  return activity.sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || "")).slice(0, 20);
}

// ---- next recommended milestone ----

function getNextMilestone(state) {
  if (!state.roadmap || !state.roadmap.areas) return null;
  const active = state.milestones.filter(m => m.status === "active");
  if (active.length > 0) return { reason: "active_milestone", milestone: active[0] };

  const paused = state.milestones.filter(m => m.status === "paused");
  if (paused.length > 0) return { reason: "paused_milestone", milestone: paused[0] };

  // Find planned milestones with no unmet dependencies
  const planned = state.milestones.filter(m => m.status === "planned" || m.status === "ready");
  const deps = state.roadmap.milestoneDependencies || {};
  for (const m of planned) {
    const myDeps = deps[m.id] || [];
    const unmet = myDeps.filter(depId => {
      const dep = state.milestones.find(dm => dm.id === depId);
      return !dep || (dep.status !== "completed" && dep.status !== "merged");
    });
    if (unmet.length === 0) {
      return { reason: "next_planned", milestone: m };
    }
  }

  return null;
}

// ---- drift detection ----

function detectDrift(state) {
  const drift = [];

  if (!state.roadmap || !state.roadmap.areas) return drift;

  // Collect all milestone IDs referenced in roadmap
  const roadmapMilestoneIds = new Set();
  for (const area of state.roadmap.areas) {
    for (const init of (area.initiatives || [])) {
      for (const mid of (init.milestoneIds || [])) {
        roadmapMilestoneIds.add(mid);
      }
    }
  }

  // Collect all milestone IDs from records
  const recordMilestoneIds = new Set(state.milestones.map(m => m.id));

  // Milestones in records but not in roadmap
  for (const mid of recordMilestoneIds) {
    if (!roadmapMilestoneIds.has(mid) && !mid.startsWith("dcp-")) {
      drift.push({
        type: "record-not-in-roadmap",
        severity: "warning",
        milestoneId: mid,
        message: `Milestone '${mid}' exists in records but is not referenced in roadmap.json`,
      });
    }
  }

  // Milestones in roadmap but not in records
  for (const mid of roadmapMilestoneIds) {
    if (!recordMilestoneIds.has(mid)) {
      drift.push({
        type: "roadmap-not-in-records",
        severity: "info",
        milestoneId: mid,
        message: `Roadmap references milestone '${mid}' but no milestone record exists`,
      });
    }
  }

  // Maturity drift: completed milestones whose area maturity is still "designed" or lower
  const completedIds = new Set(
    state.milestones.filter(m => m.status === "completed" || m.status === "merged").map(m => m.id)
  );
  for (const area of state.roadmap.areas) {
    for (const init of (area.initiatives || [])) {
      const initiativeMilestones = (init.milestoneIds || []).filter(mid => completedIds.has(mid));
      if (initiativeMilestones.length > 0 && init.maturity === "designed") {
        drift.push({
          type: "maturity-lag",
          severity: "warning",
          areaId: area.id,
          initiativeId: init.id,
          message: `Initiative '${init.title}' has completed milestone(s) but maturity is still 'designed'`,
        });
      }
    }
  }

  return drift;
}

// ---- milestone dependency graph ----

function getMilestoneDependencyGraph(state) {
  const deps = (state.roadmap && state.roadmap.milestoneDependencies) || {};
  const nodes = [];
  const edges = [];

  for (const m of state.milestones) {
    nodes.push({
      id: m.id,
      status: m.status,
      title: m.title,
      type: m.type,
    });
    const myDeps = deps[m.id] || [];
    for (const depId of myDeps) {
      edges.push({ from: depId, to: m.id });
    }
  }

  return { nodes, edges };
}

// ---- human decisions ----

function getHumanDecisions(state) {
  const decisions = [];

  // Milestones with blockers requiring human action
  for (const m of state.milestones) {
    if (m.blockers && m.blockers.length > 0) {
      for (const b of m.blockers) {
        if (b.type === "human-action" || b.type === "decision-required") {
          decisions.push({
            type: "blocker",
            milestoneId: m.id,
            description: b.description || b.reason || "Human decision required",
            blockerType: b.type,
            createdAt: b.createdAt,
          });
        }
      }
    }
  }

  // Paused milestones (operator chose to pause)
  for (const m of state.milestones) {
    if (m.status === "paused") {
      const lastSession = state.sessions
        .filter(s => s.milestoneId === m.id)
        .sort((a, b) => (b.closedAt || "").localeCompare(a.closedAt || ""))[0];
      if (lastSession && lastSession.risks && lastSession.risks.length > 0) {
        decisions.push({
          type: "paused",
          milestoneId: m.id,
          description: lastSession.risks[0],
          blockerType: "operator-pause",
          createdAt: lastSession.closedAt,
        });
      }
    }
  }

  // Blocked milestones
  for (const m of state.milestones) {
    if (m.status === "blocked") {
      decisions.push({
        type: "blocked",
        milestoneId: m.id,
        description: `Milestone is blocked. ${m.blockers?.length || 0} blocker(s).`,
        blockerType: "blocked",
        createdAt: m.updatedAt,
      });
    }
  }

  return decisions;
}

// ---- generate roadmap-data.json ----

function generateRoadmapData(state) {
  const drift = detectDrift(state);
  const depGraph = getMilestoneDependencyGraph(state);
  const humanDecisions = getHumanDecisions(state);

  return {
    schema: "locaily.development.dashboard.v1",
    generatedAt: state.generatedAt,
    projectState: state.projectState,
    git: state.git,
    subsystemMaturity: getSubsystemMaturity(state),
    milestoneBoard: getMilestoneBoard(state),
    validationScoreboard: getValidationScoreboard(state),
    recentActivity: getRecentActivity(state),
    nextMilestone: getNextMilestone(state),
    staleness: checkStaleness(state),
    drift,
    milestoneDependencyGraph: depGraph,
    humanDecisions,
    stats: {
      totalMilestones: state.milestones.length,
      active: state.milestones.filter(m => m.status === "active").length,
      completed: state.milestones.filter(m => m.status === "completed" || m.status === "merged").length,
      totalSessions: state.sessions.length,
      totalValidations: state.validations.length,
      totalDeliveries: state.deliveries.length,
      driftCount: drift.length,
      humanDecisionCount: humanDecisions.length,
    },
  };
}

// ---- generate status-summary.md ----

function generateStatusSummary(data) {
  const lines = [];
  lines.push("# Development Status Summary");
  lines.push("");
  lines.push(`**Generated:** ${data.generatedAt}`);
  lines.push("");

  // Project state
  lines.push("## Project State");
  lines.push("");
  if (data.projectState) {
    lines.push(`- **Status:** ${data.projectState.status}`);
    lines.push(`- **Current Milestone:** ${data.projectState.currentMilestone || "none"}`);
    lines.push(`- **Active Session:** ${data.projectState.activeSession || "none"}`);
    lines.push(`- **Branch:** ${data.git.branch}`);
    lines.push(`- **HEAD:** ${data.git.head}`);
  }
  lines.push("");

  // Stats
  lines.push("## Statistics");
  lines.push("");
  lines.push(`- Milestones: ${data.stats.totalMilestones} total, ${data.stats.active} active, ${data.stats.completed} completed`);
  lines.push(`- Sessions: ${data.stats.totalSessions}`);
  lines.push(`- Validations: ${data.stats.totalValidations}`);
  lines.push(`- Deliveries: ${data.stats.totalDeliveries}`);
  lines.push("");

  // Subsystem maturity
  lines.push("## Subsystem Maturity");
  lines.push("");
  for (const area of data.subsystemMaturity) {
    lines.push(`### ${area.title}`);
    lines.push(`Maturity: **${area.maturity}**`);
    for (const init of area.initiatives) {
      lines.push(`- ${init.title}: ${init.maturity}`);
    }
    lines.push("");
  }

  // Staleness warnings
  if (data.staleness.length > 0) {
    lines.push("## Warnings");
    lines.push("");
    for (const w of data.staleness) {
      lines.push(`- [${w.severity.toUpperCase()}] ${w.message}`);
    }
    lines.push("");
  }

  // Drift warnings
  if (data.drift && data.drift.length > 0) {
    lines.push("## Roadmap Drift");
    lines.push("");
    for (const d of data.drift) {
      lines.push(`- [${d.severity.toUpperCase()}] ${d.message}`);
    }
    lines.push("");
  }

  // Human decisions
  if (data.humanDecisions && data.humanDecisions.length > 0) {
    lines.push("## Human Decisions Required");
    lines.push("");
    for (const d of data.humanDecisions) {
      lines.push(`- **[${d.type}]** ${d.milestoneId}: ${d.description}`);
    }
    lines.push("");
  }

  // Next milestone
  if (data.nextMilestone) {
    lines.push("## Recommended Next");
    lines.push("");
    lines.push(`- Reason: ${data.nextMilestone.reason}`);
    lines.push(`- Milestone: ${data.nextMilestone.milestone.id} — ${data.nextMilestone.milestone.title}`);
    lines.push("");
  }

  return lines.join("\n");
}

// ---- generate next-agent-handoff.md ----

function generateAgentHandoff(data) {
  const lines = [];
  lines.push("# Next Agent Handoff");
  lines.push("");
  lines.push(`**Generated:** ${data.generatedAt}`);
  lines.push("");

  lines.push("## Current State");
  lines.push("");
  if (data.projectState) {
    lines.push(`- **Project Status:** ${data.projectState.status}`);
    lines.push(`- **Current Milestone:** ${data.projectState.currentMilestone || "none"}`);
    lines.push(`- **Active Session:** ${data.projectState.activeSession || "none"}`);
    lines.push(`- **Branch:** ${data.git.branch}`);
    lines.push(`- **HEAD:** ${data.git.head}`);
    lines.push(`- **Working Tree:** ${data.git.dirty ? "dirty" : "clean"}`);
  }
  lines.push("");

  // Exact resume commands
  lines.push("## Resume Commands");
  lines.push("");
  lines.push("```bash");
  lines.push("npm run dev:status                          # Current project state");
  if (data.projectState && data.projectState.status === "active" && data.projectState.currentMilestone) {
    lines.push(`# Resume active milestone '${data.projectState.currentMilestone}':`);
    lines.push("npm run dev:resume                          # Resume paused work");
    lines.push("npm run dev:checkpoint --message \"...\"      # Record progress");
  } else if (data.projectState && data.projectState.status === "paused" && data.projectState.currentMilestone) {
    lines.push(`# Resume paused milestone '${data.projectState.currentMilestone}':`);
    lines.push("npm run dev:resume                          # Resume paused milestone");
  } else if (data.nextMilestone) {
    lines.push(`# Start next milestone '${data.nextMilestone.milestone.id}':`);
    lines.push(`npm run dev:milestone:start --slug ${data.nextMilestone.milestone.id} --title "${data.nextMilestone.milestone.title || ""}" --purpose "Continue development"`);
  } else {
    lines.push("npm run dev:milestone:start                 # Start an approved milestone");
  }
  lines.push("npm run dev:session:close --summary \"...\"   # Close implementation session");
  lines.push("npm run dev:prepare                         # Stage, commit, record prepared SHA");
  lines.push("npm run dev:validate                        # Run validation profile");
  lines.push("npm run dev:milestone:complete              # Gate check before delivery");
  lines.push("```");
  lines.push("");

  // Latest checkpoint and session summary
  if (data._activeSession) {
    const session = data._activeSession;
    lines.push("## Active Session Summary");
    lines.push("");
    lines.push(`- **Session:** ${session.id}`);
    lines.push(`- **Milestone:** ${session.milestoneId}`);
    lines.push(`- **Started:** ${session.startedAt}`);
    lines.push(`- **Branch:** ${session.branch}`);
    if (session.completedWork && session.completedWork.length > 0) {
      lines.push("");
      lines.push("### Completed Work");
      for (const item of session.completedWork) {
        lines.push(`- ${item}`);
      }
    }
    if (session.remainingWork && session.remainingWork.length > 0) {
      lines.push("");
      lines.push("### Remaining Work");
      for (const item of session.remainingWork) {
        lines.push(`- ${typeof item === "string" ? item : item.description || JSON.stringify(item)}`);
      }
    }
    if (session.checks && session.checks.length > 0) {
      const latest = session.checks[session.checks.length - 1];
      lines.push("");
      lines.push("### Latest Checkpoint");
      lines.push(`- **Time:** ${latest.timestamp}`);
      lines.push(`- **Message:** ${latest.message}`);
    }
    lines.push("");
  } else if (data._lastPausedSession) {
    const session = data._lastPausedSession;
    lines.push("## Last Paused Session");
    lines.push("");
    lines.push(`- **Session:** ${session.id}`);
    lines.push(`- **Milestone:** ${session.milestoneId}`);
    lines.push(`- **Closed:** ${session.closedAt}`);
    if (session.completedWork && session.completedWork.length > 0) {
      lines.push("");
      lines.push("### Completed Work");
      for (const item of session.completedWork) {
        lines.push(`- ${item}`);
      }
    }
    if (session.remainingWork && session.remainingWork.length > 0) {
      lines.push("");
      lines.push("### Remaining Work");
      for (const item of session.remainingWork) {
        lines.push(`- ${typeof item === "string" ? item : item.description || JSON.stringify(item)}`);
      }
    }
    if (session.nextRecommendedAction) {
      lines.push("");
      lines.push(`**Next:** ${session.nextRecommendedAction}`);
    }
    lines.push("");
  }

  // Human-required decisions
  if (data.humanDecisions && data.humanDecisions.length > 0) {
    lines.push("## Human Decisions Required");
    lines.push("");
    for (const d of data.humanDecisions) {
      lines.push(`- **[${d.type}]** ${d.milestoneId}: ${d.description}`);
    }
    lines.push("");
  }

  // Lifecycle
  lines.push("## Lifecycle");
  lines.push("");
  lines.push("```text");
  lines.push("start → checkpoint → session:close → prepare → validate → complete → ready-for-delivery → delivered → merged → completed");
  lines.push("```");
  lines.push("");

  if (data.nextMilestone) {
    lines.push("## Next Action");
    lines.push("");
    lines.push(`${data.nextMilestone.reason}: ${data.nextMilestone.milestone.id} — ${data.nextMilestone.milestone.title}`);
    lines.push("");
  }

  // Drift warnings
  if (data.drift && data.drift.length > 0) {
    lines.push("## Roadmap Drift");
    lines.push("");
    for (const d of data.drift) {
      lines.push(`- [${d.severity.toUpperCase()}] ${d.message}`);
    }
    lines.push("");
  }

  if (data.staleness.length > 0) {
    lines.push("## Warnings");
    lines.push("");
    for (const w of data.staleness) {
      lines.push(`- [${w.severity.toUpperCase()}] ${w.message}`);
    }
    lines.push("");
  }

  // Milestone dependency graph
  if (data.milestoneDependencyGraph && data.milestoneDependencyGraph.edges.length > 0) {
    lines.push("## Milestone Dependencies");
    lines.push("");
    lines.push("```text");
    for (const edge of data.milestoneDependencyGraph.edges) {
      const fromNode = data.milestoneDependencyGraph.nodes.find(n => n.id === edge.from);
      const toNode = data.milestoneDependencyGraph.nodes.find(n => n.id === edge.to);
      const fromStatus = fromNode ? ` [${fromNode.status}]` : "";
      const toStatus = toNode ? ` [${toNode.status}]` : "";
      lines.push(`${edge.from}${fromStatus} → ${edge.to}${toStatus}`);
    }
    lines.push("```");
    lines.push("");
  }

  lines.push("## Subsystem Maturity");
  lines.push("");
  for (const area of data.subsystemMaturity) {
    lines.push(`- **${area.title}**: ${area.maturity}`);
  }
  lines.push("");

  return lines.join("\n");
}

// ---- generate roadmap.html ----

function generateRoadmapHtml(data) {
  const total = data.stats.totalMilestones;
  const completedCount = data.stats.completed;
  const activeCount = data.stats.active;
  const validCount = data.stats.totalValidations;
  const progress = total > 0 ? Math.round(completedCount / total * 100) : 0;

  function getBoardItems() {
    const cols = { planned: [], active: [], blocked: [], ready: [], completed: [] };
    for (const [status, items] of Object.entries(data.milestoneBoard)) {
      for (const m of items) {
        if (status === "idea" || status === "planned" || status === "ready") cols.planned.push(m);
        else if (status === "active") cols.active.push(m);
        else if (status === "blocked" || status === "paused") cols.blocked.push(m);
        else if (status === "validating" || status === "ready-for-delivery" || status === "delivered") cols.ready.push(m);
        else if (status === "completed" || status === "merged") cols.completed.push(m);
      }
    }
    return cols;
  }
  const board = getBoardItems();

  function formatTime(ts) {
    try {
      const d = new Date(ts);
      return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    } catch { return ""; }
  }
  function formatDate(ts) {
    try {
      const d = new Date(ts);
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    } catch { return ""; }
  }
  function formatShortDate(ts) {
    try {
      const d = new Date(ts);
      const today = new Date();
      const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
      if (d.toDateString() === today.toDateString()) return "Today";
      if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    } catch { return ""; }
  }
  function formatFullDate(ts) {
    try {
      const d = new Date(ts);
      return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
    } catch { return ""; }
  }

  const todayKey = new Date().toISOString().slice(0, 10);
  const activityByDay = {};
  for (const a of data.recentActivity) {
    const key = (a.timestamp || "").slice(0, 10);
    if (!activityByDay[key]) activityByDay[key] = [];
    if (activityByDay[key].length < 30) activityByDay[key].push(a);
  }
  const sortedDays = Object.keys(activityByDay).sort().reverse().slice(0, 3);

  const maturityBadge = {
    "operational": "b-operational",
    "tested": "b-tested",
    "implemented": "b-implemented",
    "simulation-validated": "b-simulation-validated",
    "designed": "b-designed",
    "idea": "b-designed",
    "blocked": "b-blocked",
    "physically-validated": "b-tested",
    "human-accepted": "b-operational",
    "deprecated": "b-implemented",
  };

  const errors = data.staleness.filter(w => w.severity === "error");
  const warnings = data.staleness.filter(w => w.severity !== "error");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Locaily Development Dashboard</title>
<style>
  :root{
    --bg:#0a0e16;
    --panel:#111826;
    --panel-2:#161f30;
    --border:#232d40;
    --border-soft:#1b2333;
    --text:#e8ecf3;
    --text-dim:#8b95a8;
    --text-faint:#5c6579;
    --green:#34d399; --green-bg:#0f2a22; --green-text:#6ee7b7;
    --blue:#60a5fa; --blue-bg:#101f33; --blue-text:#93c5fd;
    --indigo:#a78bfa; --indigo-bg:#1e1a33; --indigo-text:#c4b5fd;
    --amber:#fbbf24; --amber-bg:#2a2210; --amber-text:#fcd34d;
    --slate:#94a3b8; --slate-bg:#1a2130; --slate-text:#cbd5e1;
    --red:#f87171; --red-bg:#2a1414; --red-text:#fca5a5;
    --teal:#2dd4bf; --teal-bg:#0e2624; --teal-text:#5eead4;
  }
  *{box-sizing:border-box;}
  body{
    margin:0; background:var(--bg); color:var(--text);
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,sans-serif;
    font-size:14px; line-height:1.5; padding:28px 32px 60px;
  }
  .mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;}
  h1{font-size:22px; font-weight:600; margin:0 0 4px;}
  h2{font-size:15px; font-weight:600; margin:0 0 12px; color:var(--text);}
  .meta{color:var(--text-faint); font-size:12.5px; margin-bottom:22px;}
  .meta span{color:var(--text-dim);}

  .kpi-row{display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:28px;}
  .kpi{background:var(--panel); border:1px solid var(--border-soft); border-radius:10px; padding:16px 18px;}
  .kpi .num{font-size:26px; font-weight:700; line-height:1;}
  .kpi .lbl{color:var(--text-dim); font-size:12px; margin-top:6px;}
  .kpi.total .num{color:var(--text);}
  .kpi.active .num{color:var(--slate);}
  .kpi.done .num{color:var(--green);}
  .kpi.valid .num{color:var(--blue);}
  .progress-track{grid-column:1/-1; background:var(--panel); border:1px solid var(--border-soft); border-radius:10px; padding:14px 18px;}
  .progress-top{display:flex; justify-content:space-between; font-size:12.5px; color:var(--text-dim); margin-bottom:8px;}
  .progress-bar{height:6px; background:var(--panel-2); border-radius:4px; overflow:hidden;}
  .progress-fill{height:100%; background:linear-gradient(90deg,var(--teal),var(--green)); border-radius:4px;}

  section{margin-bottom:30px;}

  .sub-grid{display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:12px;}
  .sub-card{background:var(--panel); border:1px solid var(--border-soft); border-radius:10px; padding:14px 16px; display:flex; flex-direction:column; gap:10px;}
  .sub-head{display:flex; align-items:center; justify-content:space-between; gap:8px;}
  .sub-name{font-weight:600; font-size:13.5px;}
  .chip-row{display:flex; flex-wrap:wrap; gap:6px;}
  .chip{font-size:11px; padding:3px 8px; border-radius:999px; border:1px solid var(--border-soft); color:var(--text-dim); background:var(--panel-2); white-space:nowrap;}

  .badge{font-size:11px; font-weight:600; padding:3px 9px; border-radius:5px; white-space:nowrap;}
  .b-operational{background:var(--green-bg); color:var(--green-text);}
  .b-tested{background:var(--blue-bg); color:var(--blue-text);}
  .b-implemented{background:var(--indigo-bg); color:var(--indigo-text);}
  .b-simulation-validated{background:var(--amber-bg); color:var(--amber-text);}
  .b-designed{background:var(--slate-bg); color:var(--slate-text);}

  .layout{display:grid; grid-template-columns:2.1fr 1fr; gap:24px; align-items:start;}
  .col-right{display:flex; flex-direction:column; gap:22px;}

  .recommend{background:var(--teal-bg); border:1px solid #14403a; border-radius:10px; padding:16px 18px;}
  .recommend .tag{color:var(--teal); font-size:11.5px; font-weight:700; letter-spacing:.03em; text-transform:uppercase; margin-bottom:6px;}
  .recommend .title{font-weight:600; font-size:14px;}
  .recommend .sub{color:var(--text-dim); font-size:12.5px; margin-top:2px;}

  .card{background:var(--panel); border:1px solid var(--border-soft); border-radius:10px; padding:16px 18px;}
  .no-blockers{color:var(--green); font-size:13px; display:flex; align-items:center; gap:8px;}
  .dot{width:7px; height:7px; border-radius:50%; background:currentColor; flex:0 0 auto;}

  .val-summary-row{display:flex; align-items:center; justify-content:space-between; gap:10px; padding:10px 0; border-bottom:1px solid var(--border-soft);}
  .val-summary-row:last-child{border-bottom:none;}
  .val-left{display:flex; flex-direction:column; gap:3px;}
  .val-id{font-weight:600; font-size:13.5px;}
  .val-profile{color:var(--text-faint); font-size:11.5px;}
  .val-right{text-align:right; display:flex; flex-direction:column; gap:3px; align-items:flex-end;}
  .val-score{font-size:13px; font-weight:600; color:var(--green);}
  .val-date{font-size:11px; color:var(--text-faint);}
  .val-note{margin-top:10px; padding-top:10px; border-top:1px dashed var(--border-soft); font-size:11.5px; color:var(--text-faint); display:flex; gap:7px;}

  .board{display:grid; grid-template-columns:repeat(4,1fr); gap:14px;}
  .col-head{display:flex; align-items:center; gap:8px; margin-bottom:10px;}
  .col-title{font-size:12px; font-weight:700; letter-spacing:.03em; text-transform:uppercase; color:var(--text-dim);}
  .col-count{font-size:11px; color:var(--text-faint); background:var(--panel-2); border-radius:999px; padding:1px 7px;}
  .stack{display:flex; flex-direction:column; gap:8px;}
  .m-card{background:var(--panel); border:1px solid var(--border-soft); border-left:3px solid var(--slate); border-radius:6px; padding:9px 11px;}
  .m-id{font-size:12.5px; font-weight:600; font-family:ui-monospace,monospace;}
  .m-desc{font-size:11.5px; color:var(--text-dim); margin-top:2px;}
  .col-planned .m-card{border-left-color:var(--slate);}
  .col-active .m-card{border-left-color:var(--blue);}
  .col-blocked .m-card{border-left-color:var(--red);}
  .col-ready .m-card{border-left-color:var(--teal);}
  .col-done .m-card{border-left-color:var(--green);}
  .col-done .stack{max-height:230px; overflow:hidden; position:relative; transition:max-height .25s ease;}
  .col-done .stack.expanded{max-height:2000px;}
  .col-done .stack.collapsed::after{content:""; position:absolute; bottom:0; left:0; right:0; height:40px; background:linear-gradient(180deg, rgba(10,14,22,0), var(--bg));}
  .show-more{margin-top:8px; background:none; border:1px solid var(--border-soft); color:var(--text-dim); font-size:11.5px; padding:5px 10px; border-radius:6px; cursor:pointer; width:100%;}
  .show-more:hover{border-color:var(--border); color:var(--text);}
  .empty-col{font-size:11.5px; color:var(--text-faint); padding:8px 0;}

  .day-label{font-size:11px; color:var(--text-faint); text-transform:uppercase; letter-spacing:.04em; margin:0 0 8px;}
  .timeline{max-height:340px; overflow-y:auto; padding-right:4px;}
  .t-row{display:grid; grid-template-columns:78px 1fr auto; gap:10px; align-items:center; padding:6px 0; border-bottom:1px solid var(--border-soft); font-size:12px;}
  .t-row:last-child{border-bottom:none;}
  .t-tag{font-size:10.5px; font-weight:600; padding:2px 7px; border-radius:4px; text-align:center;}
  .t-delivery{background:var(--teal-bg); color:var(--teal-text);}
  .t-validation{background:var(--blue-bg); color:var(--blue-text);}
  .t-session{background:var(--slate-bg); color:var(--slate-text);}
  .t-session-closed{background:var(--panel-2); color:var(--text-faint);}
  .t-pr-created{background:var(--indigo-bg); color:var(--indigo-text);}
  .t-id{color:var(--text-dim); font-family:ui-monospace,monospace; font-size:11.5px;}
  .t-time{color:var(--text-faint); font-size:11px; text-align:right;}

  @media (max-width:980px){
    .layout{grid-template-columns:1fr;}
    .board{grid-template-columns:repeat(2,1fr);}
  }
</style>
</head>
<body>

  <h1>Locaily development dashboard</h1>
  <div class="meta">Generated <span>${new Date(data.generatedAt).toISOString().replace("T", " ").slice(0, 19)} UTC</span> &middot; Branch <span class="mono">${data.git.branch || "unknown"}</span> &middot; HEAD <span class="mono">${data.git.head || "unknown"}</span></div>

  <div class="kpi-row">
    <div class="kpi total"><div class="num">${total}</div><div class="lbl">Total milestones</div></div>
    <div class="kpi active"><div class="num">${activeCount}</div><div class="lbl">Active</div></div>
    <div class="kpi done"><div class="num">${completedCount}</div><div class="lbl">Completed</div></div>
    <div class="kpi valid"><div class="num">${validCount}</div><div class="lbl">Validation runs</div></div>
    <div class="progress-track">
      <div class="progress-top"><span>Overall progress</span><span>${completedCount} of ${total} milestones complete &middot; ${progress}%</span></div>
      <div class="progress-bar"><div class="progress-fill" style="width:${progress}%"></div></div>
    </div>
  </div>

  <section>
    <h2>Subsystem maturity</h2>
    <div class="sub-grid">
${data.subsystemMaturity.map(area => {
  const areaClass = maturityBadge[area.maturity] || "b-designed";
  const chips = area.initiatives.map(init => {
    const label = init.maturity && init.maturity !== area.maturity
      ? init.title + " &middot; " + init.maturity
      : init.title;
    return label;
  });
  return `      <div class="sub-card">
        <div class="sub-head"><span class="sub-name">${area.title}</span><span class="badge ${areaClass}">${area.maturity}</span></div>
        <div class="chip-row">${chips.map(c => `<span class="chip">${c}</span>`).join("")}</div>
      </div>`;
}).join("\n")}
    </div>
  </section>

  <div class="layout">
    <div class="col-left">
      <section>
        <h2>Milestone board</h2>
        <div class="board">

          <div class="col-planned">
            <div class="col-head"><span class="col-title">Planned</span><span class="col-count">${board.planned.length}</span></div>
            <div class="stack">
${board.planned.length === 0 ? '              <div class="empty-col">No planned milestones</div>' :
  board.planned.map(m => `              <div class="m-card"><div class="m-id">${m.id}</div><div class="m-desc">${m.title || ""}</div></div>`).join("\n")}
            </div>
          </div>

${board.active.length > 0 ? `          <div class="col-active">
            <div class="col-head"><span class="col-title">Active</span><span class="col-count">${board.active.length}</span></div>
            <div class="stack">
${board.active.map(m => `              <div class="m-card"><div class="m-id">${m.id}</div><div class="m-desc">${m.title || ""}</div></div>`).join("\n")}
            </div>
          </div>
` : ""}
          <div class="col-blocked">
            <div class="col-head"><span class="col-title">Blocked</span><span class="col-count">${board.blocked.length}</span></div>
            <div class="stack">
${board.blocked.length === 0 ? '              <div class="empty-col">No blocked milestones</div>' :
  board.blocked.map(m => `              <div class="m-card"><div class="m-id">${m.id}</div><div class="m-desc">${m.title || ""}</div></div>`).join("\n")}
            </div>
          </div>

          <div class="col-ready">
            <div class="col-head"><span class="col-title">Ready for delivery</span><span class="col-count">${board.ready.length}</span></div>
            <div class="stack">
${board.ready.length === 0 ? '              <div class="empty-col">No milestones ready</div>' :
  board.ready.map(m => `              <div class="m-card"><div class="m-id">${m.id}</div><div class="m-desc">${m.title || ""}</div></div>`).join("\n")}
            </div>
          </div>

          <div class="col-done">
            <div class="col-head"><span class="col-title">Completed</span><span class="col-count">${board.completed.length}</span></div>
            <div class="stack collapsed" id="doneStack">
${board.completed.length === 0 ? '              <div class="empty-col">No completed milestones</div>' :
  board.completed.map(m => `              <div class="m-card"><div class="m-id">${m.id}</div><div class="m-desc">${m.title || ""}</div></div>`).join("\n")}
            </div>
${board.completed.length > 5 ? `            <button class="show-more" id="toggleDone">Show all ${board.completed.length}</button>` : ""}
          </div>

        </div>
      </section>
    </div>

    <div class="col-right">

${data.nextMilestone ? `      <div class="recommend">
        <div class="tag">Recommended next</div>
        <div class="title">${data.nextMilestone.milestone.id}</div>
        <div class="sub">${data.nextMilestone.milestone.title || ""}</div>
      </div>
` : ""}
      <section class="card">
        <h2 style="margin-bottom:10px;">Blockers &amp; human decisions</h2>
${errors.length === 0 ? '        <div class="no-blockers"><span class="dot"></span>No blocking issues</div>' :
  errors.map(w => `        <div class="warning warning-error">${w.message}</div>`).join("\n")}
${warnings.length > 0 ? warnings.map(w => `        <div class="warning warning-${w.severity}">${w.message}</div>`).join("\n") : ""}
      </section>

      <section class="card">
        <h2 style="margin-bottom:2px;">Validation scoreboard</h2>
${data.validationScoreboard.length === 0 ? '        <div style="color:var(--text-faint);">No validations recorded</div>' :
  data.validationScoreboard.slice(-5).reverse().map(v => {
    const totalChecks = v.requiredPassed + v.requiredFailed;
    return `        <div class="val-summary-row">
          <div class="val-left">
            <span class="val-id mono">${v.milestoneId}</span>
            <span class="val-profile">${v.profileId}</span>
          </div>
          <div class="val-right">
            <span class="val-score">${v.requiredPassed} / ${totalChecks} checks passed</span>
            <span class="val-date">${v.completedAt ? formatFullDate(v.completedAt) : "unknown"}</span>
          </div>
        </div>`;
  }).join("\n")
}
${data.validationScoreboard.length > 0 && data.validationScoreboard.every(v => v.milestoneId === data.validationScoreboard[0].milestoneId) && data.validationScoreboard.length >= 3 ? `        <div class="val-note">All ${data.validationScoreboard.length} validation runs are for <span class="mono">&nbsp;${data.validationScoreboard[0].milestoneId}&nbsp;</span> with identical scores — worth checking coverage across milestones.</div>` : ""}
      </section>

      <section class="card">
        <h2>Recent activity</h2>
${sortedDays.length === 0 ? '        <div style="color:var(--text-faint);">No recent activity</div>' :
  sortedDays.map(day => {
    const dayLabel = day === todayKey ? "Today" : formatFullDate(day);
    return `        <div class="day-label">${dayLabel}</div>
        <div class="timeline">
${activityByDay[day].map(a => {
  const tagClass = "t-" + a.type;
  return `          <div class="t-row"><span class="t-tag ${tagClass}">${a.type}</span><span class="t-id">${a.milestoneId || a.id || ""}</span><span class="t-time">${formatTime(a.timestamp)}</span></div>`;
}).join("\n")}
        </div>`;
  }).join("\n")
}
      </section>

    </div>
  </div>

${board.completed.length > 5 ? `<script>
  const stack = document.getElementById('doneStack');
  const btn = document.getElementById('toggleDone');
  if (btn) {
    btn.addEventListener('click', () => {
      const expanded = stack.classList.toggle('expanded');
      stack.classList.toggle('collapsed', !expanded);
      btn.textContent = expanded ? 'Show less' : 'Show all ${board.completed.length}';
    });
  }
</script>` : ""}

</body>
</html>`;
}

// ---- main ----

function main() {
  console.log("Generating development dashboard...");

  const state = loadState();
  const data = generateRoadmapData(state);

  // Attach session data for handoff enrichment
  const activeSession = state.sessions.find(s => s.status === "active") || null;
  const lastPausedSession = !activeSession
    ? state.sessions.filter(s => s.status === "paused").sort((a, b) => (b.closedAt || "").localeCompare(a.closedAt || ""))[0] || null
    : null;
  data._activeSession = activeSession;
  data._lastPausedSession = lastPausedSession;

  // Ensure generated directory exists
  fs.mkdirSync(GENERATED_DIR, { recursive: true });

  // Generate roadmap-data.json
  const dataPath = path.join(GENERATED_DIR, "roadmap-data.json");
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2) + "\n");
  console.log(`  Generated: ${dataPath}`);

  // Generate status-summary.md
  const summaryPath = path.join(GENERATED_DIR, "status-summary.md");
  fs.writeFileSync(summaryPath, generateStatusSummary(data));
  console.log(`  Generated: ${summaryPath}`);

  // Generate next-agent-handoff.md
  const handoffPath = path.join(GENERATED_DIR, "next-agent-handoff.md");
  fs.writeFileSync(handoffPath, generateAgentHandoff(data));
  console.log(`  Generated: ${handoffPath}`);

  // Generate roadmap.html
  const htmlPath = path.join(GENERATED_DIR, "roadmap.html");
  fs.writeFileSync(htmlPath, generateRoadmapHtml(data));
  console.log(`  Generated: ${htmlPath}`);

  // Report warnings
  if (data.staleness.length > 0) {
    console.log(`\n  Warnings: ${data.staleness.length}`);
    for (const w of data.staleness) {
      console.log(`    [${w.severity.toUpperCase()}] ${w.message}`);
    }
  }

  console.log("\nDashboard generation complete.");
}

main();
