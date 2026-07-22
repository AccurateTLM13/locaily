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

// ---- generate roadmap-data.json ----

function generateRoadmapData(state) {
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
    stats: {
      totalMilestones: state.milestones.length,
      active: state.milestones.filter(m => m.status === "active").length,
      completed: state.milestones.filter(m => m.status === "completed" || m.status === "merged").length,
      totalSessions: state.sessions.length,
      totalValidations: state.validations.length,
      totalDeliveries: state.deliveries.length,
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

  lines.push("## Commands");
  lines.push("");
  lines.push("```bash");
  lines.push("npm run dev:status              # Current project state");
  lines.push("npm run dev:milestone:start     # Start an approved milestone");
  lines.push("npm run dev:checkpoint          # Record progress");
  lines.push("npm run dev:session:close       # Close implementation session");
  lines.push("npm run dev:prepare             # Stage, commit, record prepared SHA");
  lines.push("npm run dev:validate            # Run validation profile");
  lines.push("npm run dev:milestone:complete  # Gate check before delivery");
  lines.push("```");
  lines.push("");

  lines.push("## Lifecycle");
  lines.push("");
  lines.push("```text");
  lines.push("start → checkpoint → session:close → prepare → validate → complete → ready-for-delivery");
  lines.push("```");
  lines.push("");

  if (data.nextMilestone) {
    lines.push("## Next Action");
    lines.push("");
    lines.push(`${data.nextMilestone.reason}: ${data.nextMilestone.milestone.id} — ${data.nextMilestone.milestone.title}`);
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
  const maturityColors = {
    "idea": "#94a3b8",
    "designed": "#a78bfa",
    "implemented": "#60a5fa",
    "tested": "#34d399",
    "simulation-validated": "#fbbf24",
    "physically-validated": "#f59e0b",
    "human-accepted": "#10b981",
    "operational": "#22c55e",
    "blocked": "#ef4444",
    "deprecated": "#6b7280",
  };

  const statusColors = {
    "idea": "#94a3b8", "planned": "#a78bfa", "ready": "#60a5fa",
    "active": "#22c55e", "paused": "#fbbf24", "blocked": "#ef4444",
    "validating": "#f59e0b", "ready-for-delivery": "#10b981",
    "delivered": "#3b82f6", "merged": "#8b5cf6", "completed": "#22c55e",
    "cancelled": "#6b7280",
  };

  const maturityList = ["idea", "designed", "implemented", "tested", "simulation-validated", "physically-validated", "human-accepted", "operational", "blocked", "deprecated"];
  const statusList = ["idea", "planned", "ready", "active", "paused", "blocked", "validating", "ready-for-delivery", "delivered", "merged", "completed", "cancelled"];

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Locaily Development Dashboard</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #e2e8f0; padding: 20px; }
  h1 { font-size: 1.5rem; margin-bottom: 8px; color: #f8fafc; }
  h2 { font-size: 1.1rem; margin: 20px 0 10px; color: #94a3b8; border-bottom: 1px solid #1e293b; padding-bottom: 4px; }
  h3 { font-size: 0.95rem; margin: 12px 0 6px; color: #cbd5e1; }
  .meta { font-size: 0.8rem; color: #64748b; margin-bottom: 16px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; margin-bottom: 20px; }
  .card { background: #1e293b; border-radius: 8px; padding: 16px; border: 1px solid #334155; }
  .card h3 { margin-top: 0; }
  .stat { font-size: 2rem; font-weight: bold; color: #f8fafc; }
  .stat-label { font-size: 0.8rem; color: #64748b; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 500; margin: 2px; }
  .maturity-badge { color: white; }
  .status-badge { color: white; }
  .board { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
  .board-col { background: #0f172a; border-radius: 6px; padding: 8px; }
  .board-col h4 { font-size: 0.75rem; color: #64748b; text-transform: uppercase; margin-bottom: 6px; }
  .board-item { background: #1e293b; padding: 6px 8px; border-radius: 4px; margin-bottom: 4px; font-size: 0.8rem; border-left: 3px solid #334155; }
  .warning { padding: 8px 12px; border-radius: 6px; margin-bottom: 8px; font-size: 0.85rem; }
  .warning-error { background: #450a0a; border: 1px solid #7f1d1d; }
  .warning-warning { background: #451a03; border: 1px solid #78350f; }
  .warning-info { background: #0c4a6e; border: 1px solid #075985; }
  .activity-item { padding: 6px 0; border-bottom: 1px solid #1e293b; font-size: 0.85rem; }
  .activity-time { color: #64748b; font-size: 0.75rem; }
  .next-action { background: #0f766e; border: 1px solid #115e59; border-radius: 8px; padding: 16px; margin-top: 16px; }
  .next-action h3 { color: #5eead4; margin-top: 0; }
</style>
</head>
<body>
<h1>Locaily Development Dashboard</h1>
<div class="meta">Generated: ${data.generatedAt} | Branch: ${data.git.branch} | HEAD: ${data.git.head}</div>

<div class="grid">
  <div class="card">
    <div class="stat">${data.stats.totalMilestones}</div>
    <div class="stat-label">Total Milestones</div>
  </div>
  <div class="card">
    <div class="stat" style="color: #22c55e">${data.stats.active}</div>
    <div class="stat-label">Active</div>
  </div>
  <div class="card">
    <div class="stat" style="color: #3b82f6">${data.stats.completed}</div>
    <div class="stat-label">Completed</div>
  </div>
  <div class="card">
    <div class="stat">${data.stats.totalValidations}</div>
    <div class="stat-label">Validations</div>
  </div>
</div>

<h2>Subsystem Maturity</h2>
<div class="grid">
${data.subsystemMaturity.map(area => `  <div class="card">
    <h3>${area.title}</h3>
    <span class="badge maturity-badge" style="background: ${maturityColors[area.maturity] || '#6b7280'}">${area.maturity}</span>
    ${area.initiatives.map(init => `<div style="margin-top: 6px; font-size: 0.85rem;">${init.title} <span class="badge maturity-badge" style="background: ${maturityColors[init.maturity] || '#6b7280'}; font-size: 0.7rem;">${init.maturity}</span></div>`).join("\n    ")}
  </div>`).join("\n")}
</div>

<h2>Milestone Board</h2>
<div class="board">
${statusList.filter(s => data.milestoneBoard[s] && data.milestoneBoard[s].length > 0).map(status => `  <div class="board-col">
    <h4>${status} (${data.milestoneBoard[status].length})</h4>
    ${data.milestoneBoard[status].map(m => `<div class="board-item" style="border-left-color: ${statusColors[status] || '#334155'}">${m.id}<br><span style="color: #64748b; font-size: 0.75rem;">${m.title || ''}</span></div>`).join("\n    ")}
  </div>`).join("\n")}
</div>

<h2>Validation Scoreboard</h2>
<div class="card">
${data.validationScoreboard.length === 0 ? '<div style="color: #64748b;">No validations recorded</div>' :
  `<table style="width: 100%; font-size: 0.85rem; border-collapse: collapse;">
    <tr style="border-bottom: 1px solid #334155; color: #94a3b8;">
      <th style="text-align: left; padding: 4px;">Milestone</th>
      <th style="text-align: left; padding: 4px;">Status</th>
      <th style="text-align: left; padding: 4px;">Profile</th>
      <th style="text-align: left; padding: 4px;">Passed</th>
      <th style="text-align: left; padding: 4px;">Date</th>
    </tr>
    ${data.validationScoreboard.map(v => `<tr style="border-bottom: 1px solid #1e293b;">
      <td style="padding: 4px;">${v.milestoneId}</td>
      <td style="padding: 4px;"><span class="badge" style="background: ${v.status === 'passed' ? '#166534' : '#991b1b'}; color: white;">${v.status}</span></td>
      <td style="padding: 4px;">${v.profileId}</td>
      <td style="padding: 4px;">${v.requiredPassed}/${v.requiredPassed + v.requiredFailed}</td>
      <td style="padding: 4px; color: #64748b;">${v.completedAt ? new Date(v.completedAt).toLocaleDateString() : 'unknown'}</td>
    </tr>`).join("\n    ")}
  </table>`}
</div>

<h2>Blockers and Human Decisions</h2>
<div class="card">
${data.staleness.filter(w => w.severity === 'error').length === 0 ? '<div style="color: #22c55e;">No blocking issues</div>' :
  data.staleness.filter(w => w.severity === 'error').map(w => `<div class="warning warning-error">${w.message}</div>`).join("\n")}
</div>

<h2>Recent Activity</h2>
<div class="card">
${data.recentActivity.length === 0 ? '<div style="color: #64748b;">No recent activity</div>' :
  data.recentActivity.map(a => `<div class="activity-item">
    <span class="badge" style="background: #334155;">${a.type}</span>
    ${a.milestoneId || a.id || ''}
    <span class="activity-time">${a.timestamp ? new Date(a.timestamp).toLocaleString() : ''}</span>
  </div>`).join("\n")}
</div>

${data.nextMilestone ? `
<div class="next-action">
  <h3>Recommended Next</h3>
  <div>${data.nextMilestone.reason}: <strong>${data.nextMilestone.milestone.id}</strong> — ${data.nextMilestone.milestone.title || ''}</div>
</div>` : ''}

${data.staleness.filter(w => w.severity !== 'error').length > 0 ? `
<h2>Warnings</h2>
${data.staleness.filter(w => w.severity !== 'error').map(w => `<div class="warning warning-${w.severity}">${w.message}</div>`).join("\n")}` : ''}

</body>
</html>`;

  return html;
}

// ---- main ----

function main() {
  console.log("Generating development dashboard...");

  const state = loadState();
  const data = generateRoadmapData(state);

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
