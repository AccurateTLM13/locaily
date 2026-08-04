#!/usr/bin/env node
/**
 * scripts/dev-begin.js
 *
 * Single entrypoint for starting or resuming milestone work.
 * Runs dev:status, reads current milestone, resumes or starts.
 *
 * Usage:
 *   node scripts/dev-begin.js
 *   node scripts/dev-begin.js --slug <id>
 *   node scripts/dev-begin.js --slug <id> --title "..." --purpose "..."
 *   node scripts/dev-begin.js --json
 */

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const DEVELOPMENT_DIR = path.join(PROJECT_ROOT, "development");
const MILESTONES_DIR = path.join(DEVELOPMENT_DIR, "milestones");
const SESSIONS_DIR = path.join(DEVELOPMENT_DIR, "sessions");
const BRIEFS_DIR = path.join(DEVELOPMENT_DIR, "briefs");

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return fallback; }
}

function readText(p) {
  try { return fs.readFileSync(p, "utf8"); } catch { return ""; }
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: PROJECT_ROOT, encoding: "utf8", maxBuffer: 1024 * 1024, shell: false });
  return { stdout: r.stdout || "", stderr: r.stderr || "", status: r.status || 0 };
}

function git(args) {
  const r = spawnSync("git", args, { cwd: PROJECT_ROOT, encoding: "utf8", maxBuffer: 1024 * 1024, shell: process.platform === "win32" });
  return r.status === 0 ? (r.stdout || "").trim() : null;
}

function extractArg(args, name) {
  const idx = args.indexOf(name);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1];
}

function hasFlag(args, name) {
  return args.includes(name);
}

function listJson(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith(".json"));
}

function readMilestone(id) {
  return readJson(path.join(MILESTONES_DIR, `${id}.json`), null);
}

function findActiveMilestone() {
  if (!fs.existsSync(MILESTONES_DIR)) return null;
  for (const f of listJson(MILESTONES_DIR)) {
    const m = readJson(path.join(MILESTONES_DIR, f), null);
    if (m && m.status === "active") return m;
  }
  return null;
}

function findActiveSession() {
  if (!fs.existsSync(SESSIONS_DIR)) return null;
  for (const f of listJson(SESSIONS_DIR)) {
    const s = readJson(path.join(SESSIONS_DIR, f), null);
    if (s && s.status === "active") return s;
  }
  return null;
}

function findPausedSession() {
  if (!fs.existsSync(SESSIONS_DIR)) return null;
  for (const f of listJson(SESSIONS_DIR)) {
    const s = readJson(path.join(SESSIONS_DIR, f), null);
    if (s && s.status === "paused") return s;
  }
  return null;
}

function listPlannedMilestones() {
  if (!fs.existsSync(MILESTONES_DIR)) return [];
  const result = [];
  for (const f of listJson(MILESTONES_DIR)) {
    const m = readJson(path.join(MILESTONES_DIR, f), null);
    if (m && (m.status === "planned" || m.status === "ready")) result.push(m);
  }
  return result;
}

function main() {
  const args = process.argv.slice(2);
  const slug = extractArg(args, "--slug");
  const title = extractArg(args, "--title");
  const purpose = extractArg(args, "--purpose");
  const isJson = hasFlag(args, "--json");

  // 1. Run dev:status --json
  const statusResult = run("node", [path.join(PROJECT_ROOT, "scripts", "dev-status.js"), "--json"]);
  let statusData = {};
  try { statusData = JSON.parse(statusResult.stdout); } catch {}

  // 2. Check for active milestone
  const activeMilestone = findActiveMilestone();
  const activeSession = findActiveSession();
  const pausedSession = findPausedSession();

  if (activeMilestone) {
    // Load brief if available
    const briefPath = path.join(BRIEFS_DIR, `${activeMilestone.id}.json`);
    const brief = fs.existsSync(briefPath) ? readJson(briefPath, null) : null;

    // Resume or continue
    let result = {
      action: "resume",
      milestoneId: activeMilestone.id,
      title: activeMilestone.title,
      purpose: activeMilestone.purpose,
      scope: activeMilestone.scope || { included: [], excluded: [] },
      acceptanceCriteria: activeMilestone.acceptanceCriteria || [],
      status: activeMilestone.status,
      branchStatus: statusData.contradictions?.filter(c => c.code?.startsWith("BRANCH_")) || [],
      dirtyFiles: statusData.git?.totalDirty || 0,
      activeSession: activeSession ? { id: activeSession.id } : null,
      pausedSession: pausedSession ? { id: pausedSession.id, nextRecommendedAction: pausedSession.nextRecommendedAction } : null,
      brief: brief ? { context: brief.context, acceptance: brief.acceptance, files: brief.files, constraints: brief.constraints, decisions: brief.decisions } : null,
    };

    // If paused session, resume silently
    if (pausedSession && !activeSession) {
      run("node", [path.join(PROJECT_ROOT, "scripts", "dev-lifecycle.js"), "resume"]);
      result.action = "resumed";
    }

    if (isJson) {
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    }

    // Human readable
    const lines = [];
    lines.push("=== Begin Work ===");
    lines.push(`Milestone:  ${result.milestoneId} — ${result.title}`);
    lines.push(`Purpose:   ${result.purpose || "(not set)"}`);
    lines.push(`Status:    ${result.action === "resumed" ? "resumed from pause" : "active"}`);
    lines.push(`Dirty:     ${result.dirtyFiles} file(s)`);
    if (result.activeSession) lines.push(`Session:   ${result.activeSession.id} (active)`);
    if (result.pausedSession) lines.push(`Session:   ${result.pausedSession.id} (paused — will be resumed)`);
    lines.push("");
    lines.push("Scope — Included:");
    for (const s of (result.scope.included || [])) lines.push(`  + ${s}`);
    lines.push("Scope — Excluded:");
    for (const s of (result.scope.excluded || [])) lines.push(`  - ${s}`);

    // Load and display brief if available
    if (brief) {
      lines.push("");
      lines.push("--- Brief ---");
      lines.push(brief.context || "");
        if (brief.constraints && brief.constraints.length > 0) {
          lines.push("");
          lines.push("Constraints:");
          for (const c of brief.constraints) lines.push(`  ! ${c}`);
        }
        if (brief.files && brief.files.length > 0) {
          lines.push("");
          lines.push("Expected files:");
          for (const f of brief.files) lines.push(`  ~ ${f}`);
        }
        if (brief.decisions && brief.decisions.length > 0) {
          lines.push("");
          lines.push("Decisions:");
          for (const d of brief.decisions) lines.push(`  - ${d.question}: ${d.decision}`);
        }
      }

    if (result.acceptanceCriteria.length > 0) {
      lines.push("");
      lines.push("Acceptance Criteria:");
      for (const ac of result.acceptanceCriteria) {
        const desc = typeof ac === "string" ? ac : ac.description || ac;
        lines.push(`  [ ] ${desc}`);
      }
    }
    lines.push("");
    lines.push("Run: npm run dev:checkpoint -- --message \"...\"  to record progress");
    process.stdout.write(lines.join("\n") + "\n");
    process.stdout.write("\n");
    process.exit(0);
  }

  // 3. No active milestone — start or list
  if (slug) {
    const existing = readMilestone(slug);
    if (!existing) {
      if (!title || !purpose) {
        console.error(`Milestone '${slug}' not found. Provide --title and --purpose to create it.`);
        process.exit(1);
      }
    }
    const startArgs = [path.join(PROJECT_ROOT, "scripts", "dev-lifecycle.js"), "start", "--slug", slug];
    const startTitle = title || existing?.title;
    const startPurpose = purpose || existing?.purpose;
    if (startTitle) startArgs.push("--title", startTitle);
    if (startPurpose) startArgs.push("--purpose", startPurpose);
    if (existing?.type) startArgs.push("--type", existing.type);
    if (existing?.priority) startArgs.push("--priority", existing.priority);
    const startResult = run("node", startArgs);
    if (startResult.status !== 0) {
      console.error(`Failed to start milestone: ${startResult.stderr || startResult.stdout}`);
      process.exit(1);
    }
    const started = readMilestone(slug);
    if (isJson) {
      console.log(JSON.stringify({ action: "started", milestoneId: slug, title: started?.title, purpose: started?.purpose }, null, 2));
      process.exit(0);
    }
    console.log(`Started milestone: ${slug}`);
    console.log(`Title: ${started?.title || title}`);
    console.log(`Purpose: ${started?.purpose || purpose}`);
    process.exit(0);
  }

  // 4. No slug, no active — list planned
  const planned = listPlannedMilestones();
  if (planned.length === 0) {
    if (isJson) {
      console.log(JSON.stringify({ action: "idle", message: "No active or planned milestones", planned: [] }, null, 2));
      process.exit(1);
    }
    console.error("No active or planned milestones.");
    console.error("Create one with: node scripts/dev-lifecycle.js start --slug <id> --title \"...\" --purpose \"...\"");
    process.exit(1);
  }

  if (isJson) {
    console.log(JSON.stringify({ action: "select", planned: planned.map(m => ({ id: m.id, title: m.title, type: m.type, priority: m.priority })) }, null, 2));
    process.exit(1);
  }

  console.error("No active milestone. Select one of the planned milestones:");
  for (const m of planned) {
    console.error(`  ${m.id} — ${m.title} (${m.priority})`);
  }
  console.error("");
  console.error("Run: node scripts/dev-begin.js --slug <id>");
  process.exit(1);
}

main();
