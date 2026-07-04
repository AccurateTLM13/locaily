#!/usr/bin/env node
// .opencode/agents/controller/worker-runner.js
// Standalone single-worker-step runner (optional; the main loop in
// supervisor.js normally invokes the worker inline). Kept for debugging a
// single worker turn in isolation. Not used by the autonomous loop.

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const HERE = __dirname;
const AGENTS_DIR = path.resolve(HERE, "..");
const PROJECT_ROOT = path.resolve(AGENTS_DIR, "..", "..");
const CONFIG_PATH = path.join(HERE, "config.json");
const STATE_PATH = path.join(AGENTS_DIR, "state", "run-state.json");
const ACTIVE_TASK_PATH = path.join(AGENTS_DIR, "tasks", "active-task.md");
const WORKER_RESULT_PATH = path.join(AGENTS_DIR, "state", "latest-worker-result.json");
const RUNS_DIR = path.join(AGENTS_DIR, "runs");

function readJson(p, fallback) { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return fallback; } }
function tsFile() { return new Date().toISOString().replace(/[:.]/g, "-"); }

const cfg = readJson(CONFIG_PATH, {});
const cli = { executable: "opencode", args: ["run"], extra_args: [], ...(cfg.cli || {}) };
const worker = (cfg.agents && cfg.agents.worker) || { agent: "worker", model: null };
const workerAgent = worker.agent || worker.name || "build";

// Stale-artifact guard: clear before run.
fs.writeFileSync(WORKER_RESULT_PATH, JSON.stringify({ stale: true, task: null, iteration: -1, run_id: null }, null, 2) + "\n");

const state = { ...readJson(STATE_PATH, {}) };
if (!state.run_id) state.run_id = crypto.randomBytes(6).toString("hex");

const tmpl = fs.readFileSync(path.join(AGENTS_DIR, "worker", "PROMPT.md"), "utf8");
const activeTask = fs.readFileSync(ACTIVE_TASK_PATH, "utf8");
const prompt = tmpl
  .replace("{{ACTIVE_TASK}}", activeTask.trim())
  .replace("{{RUN_STATE}}", JSON.stringify(state, null, 2))
  .replace("{{RUN_ID}}", state.run_id || "")
  .replace("{{ITERATION}}", String(state.iteration || 0));

fs.mkdirSync(RUNS_DIR, { recursive: true });
const logFile = path.join(RUNS_DIR, `${tsFile()}-worker-standalone.log`);

const args = [...(cli.args || ["run"])];
if (workerAgent && workerAgent !== "build") args.push("--agent", workerAgent);
if (worker.model) args.push("-m", worker.model);
args.push("--dangerously-skip-permissions");
if (cli.extra_args && cli.extra_args.length) args.push(...cli.extra_args);
// Pass multi-line prompt via stdin (see supervisor.js for rationale).
console.error("[worker-runner] launching:", cli.executable, args.join(" "), "<prompt-via-stdin>");
const result = spawnSync(cli.executable, args, {
  cwd: PROJECT_ROOT, encoding: "utf8",
  maxBuffer: 1024 * 1024 * 64, timeout: cli.timeout_ms || 600000,
  input: prompt,
  shell: process.platform === "win32"
});
fs.writeFileSync(logFile, `# worker-standalone ${new Date().toISOString()}\nexit: ${result.status}\n\nstderr:\n${result.stderr || ""}\n\nstdout:\n${result.stdout || ""}\n`);
const ok = result.status === 0;
console.error(`[worker-runner] exit=${result.status} log=${path.relative(PROJECT_ROOT, logFile)}`);
if (!ok) console.error((result.stderr || result.stdout || "").slice(-4000));
process.exit(ok ? 0 : 1);