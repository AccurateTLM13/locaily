#!/usr/bin/env node
/**
 * scripts/dev-end.js
 *
 * Closeout + delivery pipeline with review gates.
 * Requires an active milestone with closed session.
 *
 * Usage:
 *   node scripts/dev-end.js --summary "what was done"
 *   node scripts/dev-end.js --summary "..." --dry-run
 *   node scripts/dev-end.js --summary "..." --deliver
 *   node scripts/dev-end.js --summary "..." --deliver --pr
 *   node scripts/dev-end.js --summary "..." --deliver --pr --skip-review
 */

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const MILESTONES_DIR = path.join(PROJECT_ROOT, "development", "milestones");

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return fallback; }
}

function extractArg(args, name) {
  const idx = args.indexOf(name);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1];
}

function hasFlag(args, name) {
  return args.includes(name);
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: PROJECT_ROOT, encoding: "utf8", maxBuffer: 1024 * 1024 });
  return { stdout: r.stdout || "", stderr: r.stderr || "", status: r.status || 0 };
}

function git(args) {
  const r = spawnSync("git", args, { cwd: PROJECT_ROOT, encoding: "utf8", maxBuffer: 1024 * 1024 });
  return r.status === 0 ? (r.stdout || "").trim() : null;
}

function lifecycleCmd(sub, args) {
  return run("node", [path.join(PROJECT_ROOT, "scripts", "dev-lifecycle.js"), sub, ...args]);
}

function findActiveMilestone() {
  if (!fs.existsSync(MILESTONES_DIR)) return null;
  for (const f of fs.readdirSync(MILESTONES_DIR).filter(f => f.endsWith(".json"))) {
    const m = readJson(path.join(MILESTONES_DIR, f), null);
    if (m && (m.status === "active" || m.status === "paused" || m.status === "blocked")) return m;
  }
  return null;
}

function main() {
  const args = process.argv.slice(2);
  const summary = extractArg(args, "--summary");
  const isDryRun = hasFlag(args, "--dry-run");
  const isDeliver = hasFlag(args, "--deliver");
  const isPr = hasFlag(args, "--pr");
  const skipReview = hasFlag(args, "--skip-review");

  if (!summary) {
    console.error("Usage: node scripts/dev-end.js --summary \"what was done\" [--dry-run] [--deliver] [--pr]");
    process.exit(1);
  }

  const milestone = findActiveMilestone();
  if (!milestone) {
    console.error("No active, paused, or blocked milestone to end.");
    process.exit(1);
  }

  const slug = milestone.id;
  const steps = [];
  let failed = false;

  function step(name, cmd) {
    if (failed) return;
    steps.push(name);
    process.stderr.write(`  [${steps.length}] ${name}... `);
    const result = cmd();
    if (result.status !== 0) {
      process.stderr.write(`FAILED\n${result.stderr || result.stdout}\n`);
      failed = true;
    } else {
      process.stderr.write("OK\n");
    }
  }

  // Step 0: status preflight
  step("Status preflight", () => run("node", [path.join(PROJECT_ROOT, "scripts", "dev-status.js"), "--strict"]));

  // Step 1: session close
  step("Session close", () => lifecycleCmd("session:close", ["--summary", summary]));

  // Step 2: prepare
  if (!failed) step("Prepare commit", () => lifecycleCmd("prepare", []));

  // Step 3: validate with pre-delivery profile
  if (!failed) {
    const profilePath = path.join(PROJECT_ROOT, "development", "profiles", "pre-delivery.json");
    const profile = readJson(profilePath, null);
    if (profile) {
      step("Validate (pre-delivery)", () => lifecycleCmd("validate", ["--profile", "pre-delivery"]));
    } else {
      step("Validate (default)", () => lifecycleCmd("validate", []));
    }
  }

  // Step 4: code review
  if (!failed && !skipReview) {
    step("Code review", () => run("node", [path.join(PROJECT_ROOT, "scripts", "agent-review.js"), "--slug", slug]));
  }

  // Step 5: milestone complete
  if (!failed) step("Milestone complete", () => lifecycleCmd("complete", []));

  // Step 6: deliver
  if (!failed && isDeliver) {
    step("Push", () => run("node", [path.join(PROJECT_ROOT, "scripts", "deliver-milestone.js"), "--slug", slug, "--execute"]));
  }

  // Step 7: PR
  if (!failed && isDeliver && isPr) {
    step("PR", () => run("node", [path.join(PROJECT_ROOT, "scripts", "deliver-milestone.js"), "--slug", slug, "--pr"]));
  }

  // Step 8: regenerate dashboard
  if (!failed) {
    step("Regenerate dashboard", () => run("node", [path.join(PROJECT_ROOT, "scripts", "generate-development-dashboard.js")]));
  }

  if (failed) {
    console.error(`\nPipeline failed at step ${steps.length}. Resolve and re-run.`);
    console.error(`Steps completed: ${steps.slice(0, -1).join(", ")}`);
    process.exit(1);
  }

  const finalHead = git(["rev-parse", "--short", "HEAD"]);
  console.log(`\nAll gates passed. HEAD: ${finalHead}`);
  if (!isDeliver) {
    console.log("Dry run only. Add --deliver to push, --pr to create draft PR.");
  }
  process.exit(0);
}

main();
