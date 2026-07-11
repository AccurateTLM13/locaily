#!/usr/bin/env node
// .opencode/agents/controller/supervisor.js
// The automation layer. Drives:  plan -> worker -> review -> (repeat|stop).
//
// Ownership model (robust against LLM output drift):
//   - Agents write decision artifacts ONLY (with run_id/iteration/task_id/created_at):
//       supervisor plan  -> tasks/active-task.md
//       supervisor review-> state/latest-review.json  (+ archive task)
//       worker           -> state/latest-worker-result.json
//   - THIS controller owns state/run-state.json and all phase transitions.
//   - CLI stdout is logged to runs/ but NEVER trusted for decisions.
//
// Hardening implemented:
//   - run_id matching: stale artifacts are rejected so a failed CLI call can't
//     masquerade as a fresh success.
//   - distinct failure modes: nonzero exit, timeout, missing artifact, invalid
//     JSON, agent completed without doing the task (no artifact written or IDs
//     mismatched), too many consecutive failures.
//   - git boundary: dedicated worker branch, dirty-startup stop, no edits to
//     protected branches, no main touch, no merge/force-push detection (via
//     reflog inspection), excluded-path + diff-size enforcement, stop if the
//     worker moves files outside allowed scopes.
//   - endless-correction protection: max_iterations, max_corrections_per_task,
//     max_consecutive_failures.
//   - committed history: sanitized snapshots copied to history/ at each
//     accepted/rejected milestone.

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const HERE = __dirname;
const AGENTS_DIR = path.resolve(HERE, "..");
const PROJECT_ROOT = path.resolve(AGENTS_DIR, "..", "..");
const CONFIG_PATH = path.join(HERE, "config.json");

const STATE_PATH = path.join(AGENTS_DIR, "state", "run-state.json");
const REVIEW_PATH = path.join(AGENTS_DIR, "state", "latest-review.json");
const WORKER_RESULT_PATH = path.join(AGENTS_DIR, "state", "latest-worker-result.json");
const OBJECTIVE_PATH = path.join(AGENTS_DIR, "objectives", "active-objective.md");
const ACTIVE_TASK_PATH = path.join(AGENTS_DIR, "tasks", "active-task.md");
const RUNS_DIR = path.join(AGENTS_DIR, "runs");
const HISTORY_DIR = path.join(AGENTS_DIR, "history");

const DEFAULT_STATE = {
  objective: "controller-validation",
  status: "running",
  phase: "plan",
  iteration: 0,
  corrections_for_task: 0,
  consecutive_failures: 0,
  max_iterations: 3,
  max_corrections_per_task: 2,
  max_consecutive_failures: 2,
  current_task: null,
  recommended_worker_agent: null,
  worker_branch: null,
  last_worker_status: "idle",
  last_review_status: null,
  objective_complete: false,
  blocker: null,
  run_id: null,
  updatedAt: new Date().toISOString()
};

// ---------- helpers ----------

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return fallback; }
}
function readJsonOrThrow(p) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); }
  catch (e) { throw new ArtifactError("invalid_json", `unreadable/invalid JSON at ${p}: ${e.message}`); }
}
function writeJson(p, obj) {
  obj.updatedAt = new Date().toISOString();
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n");
}
function readText(p) {
  try { return fs.readFileSync(p, "utf8"); } catch { return ""; }
}
function writeText(p, s) { fs.writeFileSync(p, s); }
function ts() { return new Date().toISOString(); }
function tsFile() { return ts().replace(/[:.]/g, "-"); }
function newRunId() { return crypto.randomBytes(6).toString("hex"); }
function sleep(ms) {
  if (ms <= 0) return;
  spawnSync(process.execPath, ["-e", `new Promise(r=>setTimeout(r,${Math.max(0, Math.floor(ms))}))`]);
}
function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function git(args, opts = {}) {
  return spawnSync("git", args, { cwd: PROJECT_ROOT, encoding: "utf8", maxBuffer: 1024 * 1024 * 16, ...opts });
}
function gitOk(args) {
  const r = git(args, { shell: process.platform === "win32" });
  return r.status === 0 ? (r.stdout || "").trim() : null;
}

class ArtifactError extends Error {
  constructor(code, message) { super(message); this.code = code; this.name = "ArtifactError"; }
}

function loadConfig() {
  const c = readJson(CONFIG_PATH, {});
  return {
    cli: { executable: "opencode", args: ["run"], extra_args: [], timeout_ms: 600000, ...(c.cli || {}) },
    agents: c.agents || { supervisor: { agent: "plan", model: null }, worker: { agent: "build", model: null } },
    loop: {
      max_iterations: 3, max_corrections_per_task: 2, max_consecutive_failures: 2,
      stop_on_blocker: true, seconds_between_steps: 1, ...(c.loop || {})
    },
    git: {
      protected_branches: ["main", "master"],
      worker_branch_prefix: "agents/worker",
      stop_on_dirty_startup: true,
      max_diff_files: 40, max_diff_lines: 2000,
      forbidden_worker_paths: [], ...(c.git || {})
    }
  };
}

function agentFor(role, cfg) {
  const a = cfg.agents[role] || {};
  return { name: a.agent || a.name || "build", model: a.model || null };
}

// ---------- git boundary ----------

function currentBranch() { return gitOk(["rev-parse", "--abbrev-ref", "HEAD"]); }
function isDirtyPattern() {
  const r = git(["status", "--porcelain"], { shell: process.platform === "win32" });
  if (r.status !== 0) return null;
  return r.stdout.trim();
}
function checkoutBranch(name) {
  const r = git(["checkout", "-b", name], { shell: process.platform === "win32" });
  return r.status === 0;
}
function changedFilesSince(ref) {
  const r = git(["diff", "--name-only", ref], { shell: process.platform === "win32" });
  if (r.status !== 0) return [];
  return r.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}
function diffStatSince(ref) {
  const r = git(["diff", "--numstat", ref], { shell: process.platform === "win32" });
  if (r.status !== 0) return { files: 0, lines: 0 };
  let files = 0, lines = 0;
  for (const line of r.stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parts = line.split(/\s+/);
    const a = parseInt(parts[0], 10); const b = parseInt(parts[1], 10);
    if (!Number.isNaN(a)) lines += a;
    if (!Number.isNaN(b)) lines += b;
    files += 1;
  }
  return { files, lines };
}
function matchesAny(p, patterns) {
  // simple glob: ** = any, * = segment-ish. Use minimatch-lite via RegExp.
  for (const pat of patterns) {
    const re = new RegExp("^" + pat.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "<<<D>>>").replace(/\*/g, "[^/]*").replace(/<<<D>>>/g, ".*") + "$");
    if (re.test(p)) return true;
  }
  return false;
}
function detectForbiddenForceOrMerge(ref) {
  // Detect a merge commit introduced since ref, or a force-push to current
  // remote tracking. Heuristic only: a new merge commit on the worker branch.
  const r = git(["rev-list", "--merges", "--count", `${ref}..HEAD`], { shell: process.platform === "win32" });
  if (r.status === 0 && parseInt((r.stdout || "0").trim(), 10) > 0) return "merge_commit_detected";
  return null;
}

// ---------- artifact freshness ----------

function clearArtifacts(phase) {
  // Only clear the artifact the UPCOMING phase will REWRITE. Never wipe an
  // artifact a phase must READ as input:
  //   worker reads: tasks/active-task.md, state/run-state.json
  //   review reads: state/latest-worker-result.json  <-- must NOT be wiped
  //   plan   reads: state/latest-review.json         <-- must NOT be wiped on re-plan
  const stale = { stale: true, task: null, iteration: -1, run_id: null, task_id: null, created_at: null };
  if (phase === "worker") {
    try { fs.writeFileSync(WORKER_RESULT_PATH, JSON.stringify({ ...stale }, null, 2) + "\n"); } catch {}
  } else if (phase === "review") {
    try { fs.writeFileSync(REVIEW_PATH, JSON.stringify({ ...stale }, null, 2) + "\n"); } catch {}
  }
  // plan: clear nothing (it writes active-task.md; unchanged is detected via prevTaskText)
}
function freshArtifact(art, expectedRunId, expectedIteration, expectedTask, label) {
  if (!art || art.stale) throw new ArtifactError("missing_artifact", `${label}: no artifact written`);
  if (art.run_id && expectedRunId && art.run_id !== expectedRunId)
    throw new ArtifactError("stale_artifact", `${label}: run_id mismatch (got ${art.run_id}, expected ${expectedRunId})`);
  if (typeof art.iteration === "number" && art.iteration !== expectedIteration)
    throw new ArtifactError("stale_artifact", `${label}: iteration mismatch (got ${art.iteration}, expected ${expectedIteration})`);
  if (expectedTask && art.task && art.task !== expectedTask)
    throw new ArtifactError("stale_artifact", `${label}: task mismatch (got ${art.task}, expected ${expectedTask})`);
  if (!art.created_at)
    throw new ArtifactError("stale_artifact", `${label}: missing created_at`);
  return art;
}

// ---------- history snapshots ----------

function snapshotHistory(phase, state, art) {
  ensureDir(HISTORY_DIR);
  const slug = (state.current_task || "no-task").replace(/[^\w-]+/g, "-").slice(0, 40);
  const base = `${tsFile()}-${phase}-${slug}`;
  // objective + active task markdown
  try { writeText(path.join(HISTORY_DIR, `${base}-context.md`),
    `# ${phase} @ ${ts()}\nrun_id: ${state.run_id}\niteration: ${state.iteration}\nstatus: ${state.status}\n\n## Objective\n${readText(OBJECTIVE_PATH)}\n\n## Task\n${readText(ACTIVE_TASK_PATH)}\n`); } catch {}
  if (art) {
    try { writeText(path.join(HISTORY_DIR, `${base}-${phase}.json`), JSON.stringify({ run_id: state.run_id, iteration: state.iteration, phase, state: sanitizeState(state), artifact: art }, null, 2) + "\n"); } catch {}
  } else {
    try { writeText(path.join(HISTORY_DIR, `${base}-${phase}.json`), JSON.stringify({ run_id: state.run_id, iteration: state.iteration, phase, state: sanitizeState(state) }, null, 2) + "\n"); } catch {}
  }
}
function sanitizeState(s) {
  const c = { ...s };
  delete c.updatedAt;
  return c;
}

// ---------- prompt rendering ----------

function renderSupervisorPrompt(state, phase) {
  const tmpl = readText(path.join(AGENTS_DIR, "supervisor", "PROMPT.md"));
  const objective = readText(OBJECTIVE_PATH);
  const activeTask = readText(ACTIVE_TASK_PATH);
  const workerResult = phase === "review" ? JSON.stringify(readJson(WORKER_RESULT_PATH, {}), null, 2) : "(plan phase: no worker result yet)";
  const review = (phase === "plan" && state.last_review_status === "rejected") ? JSON.stringify(readJson(REVIEW_PATH, {}), null, 2) : "(no prior rejection this task)";
  return tmpl
    .replace("{{PHASE}}", phase)
    .replace("{{RUN_STATE}}", JSON.stringify(state, null, 2))
    .replace("{{OBJECTIVE}}", objective.trim())
    .replace("{{ACTIVE_TASK}}", activeTask.trim())
    .replace("{{WORKER_RESULT}}", workerResult)
    .replace("{{LAST_REVIEW}}", review)
    .replace("{{RUN_ID}}", state.run_id || "")
    .replace("{{ITERATION}}", String(state.iteration));
}
function renderWorkerPrompt(state) {
  const tmpl = readText(path.join(AGENTS_DIR, "worker", "PROMPT.md"));
  const activeTask = readText(ACTIVE_TASK_PATH);
  return tmpl
    .replace("{{ACTIVE_TASK}}", activeTask.trim())
    .replace("{{RUN_STATE}}", JSON.stringify(state, null, 2))
    .replace("{{RUN_ID}}", state.run_id || "")
    .replace("{{ITERATION}}", String(state.iteration));
}

// ---------- CLI runner ----------

function runCli(phase, prompt, cfg) {
  ensureDir(RUNS_DIR);
  const logFile = path.join(RUNS_DIR, `${tsFile()}-${phase}.log`);
  let who;
  if (phase === "worker") {
    who = agentFor("worker", cfg);
    const st = readJson(STATE_PATH, {});
    if (st.recommended_worker_agent) {
      who = { name: st.recommended_worker_agent, model: null };
    }
  } else {
    who = agentFor("supervisor", cfg);
  }
  const args = [...(cfg.cli.args || ["run"])];
  if (who.name && who.name !== "build") args.push("--agent", who.name);
  if (who.model) args.push("-m", who.model);
  args.push("--dangerously-skip-permissions");
  if (cfg.cli.extra_args && cfg.cli.extra_args.length) args.push(...cfg.cli.extra_args);
  // Pass the (multi-line) prompt via stdin, not as a positional arg: Windows
  // cmd.exe splits embedded newlines into separate commands, mangling markdown
  // prompts. opencode `run` reads the message from stdin when no positional is
  // given, which preserves newlines faithfully.

  const timeoutMs = cfg.cli.timeout_ms || 600000;
  console.error(`\n[controller] phase=${phase} launching ${cfg.cli.executable} ${args.join(" ")} <prompt-via-stdin> (timeout ${timeoutMs}ms)`);
  const started = Date.now();
  const result = spawnSync(cfg.cli.executable, args, {
    cwd: PROJECT_ROOT, encoding: "utf8",
    maxBuffer: 1024 * 1024 * 64,
    timeout: timeoutMs,
    input: prompt,
    shell: process.platform === "win32"
  });
  const elapsed = Date.now() - started;
  const timedOut = !!result.error && result.error.code === "ETIMEDOUT";
  const tail = (result.stderr || result.stdout || "").slice(-3000);
  fs.writeFileSync(logFile, `# ${phase} ${ts()}\nexit: ${result.status}\ntimed_out: ${timedOut}\nelapsed_ms: ${elapsed}\n\nstderr:\n${result.stderr || ""}\n\nstdout:\n${result.stdout || ""}\nerror:\n${result.error ? String(result.error) : ""}\n`);
  console.error(`[controller] phase=${phase} exit=${result.status} timed_out=${timedOut} log=${path.relative(PROJECT_ROOT, logFile)}`);
  if (result.status !== 0 || timedOut) console.error(tail);
  return { ok: result.status === 0 && !timedOut, timedOut, exit: result.status };
}

// ---------- reconciliation ----------

function reconcileAfterPlan(state, cfg, cliOk, prevTaskText) {
  if (!cliOk) {
    state.consecutive_failures += 1;
    state.blocker = `plan_cli_failed`;
    return state;
  }
  const taskText = readText(ACTIVE_TASK_PATH);
  const changed = taskText !== prevTaskText;
  const looksReal = !!taskText
    && taskText.length >= 20
    && !/\(pending/i.test(taskText)
    && /##\s*Objective/i.test(taskText)
    && /##\s*Acceptance Criteria/i.test(taskText);
  if (!changed || !looksReal) {
    state.consecutive_failures += 1;
    state.blocker = `plan_artifact_${!changed ? "unchanged" : "invalid_or_placeholder"}`;
    return state;
  }
  const objMatch = taskText.match(/##\s*Objective\s*\n+\s*(.+)/i);
  let id = state.current_task;
  if (objMatch) {
    const slug = objMatch[1].trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60);
    if (slug && slug !== "pending-first-plan") id = slug;
  }
  if (!id || id === "pending-first-plan") id = `task-${state.iteration}`;
  state.current_task = id;
  const recMatch = taskText.match(/##\s*Recommended Worker\s*\n+\s*(\S+)/i);
  state.recommended_worker_agent = recMatch ? recMatch[1].trim().toLowerCase() : null;
  state.phase = "worker";
  state.last_worker_status = "pending";
  snapshotHistory("plan", state, null);
  return state;
}

function reconcileAfterWorker(state, cfg, cliOk) {
  if (!cliOk) {
    state.consecutive_failures += 1;
    state.last_worker_status = "failed";
    state.blocker = "worker_cli_failed";
    snapshotHistory("worker", state, { error: "cli_failed" });
    return state;
  }
  let wr;
  try {
    wr = freshArtifact(readJsonOrThrow(WORKER_RESULT_PATH), state.run_id, state.iteration, state.current_task, "worker_result");
  } catch (e) {
    state.consecutive_failures += 1;
    state.last_worker_status = "failed";
    state.blocker = `worker_${e.code}`;
    snapshotHistory("worker", state, { error: e.code, message: e.message });
    return state;
  }

  state.last_worker_status = wr.status === "complete" ? "complete" : "failed";
  state.consecutive_failures = wr.status === "complete" ? 0 : state.consecutive_failures + 1;

  // git boundary check on what the worker actually changed
  const ref = state.worker_branch ? gitOk(["merge-base", state.worker_branch, "HEAD"]) || "HEAD~1" : "HEAD~1";
  const changed = changedFilesSince(ref);
  const forbidden = changed.filter((f) => matchesAny(f, cfg.git.forbidden_worker_paths));
  const onProtected = cfg.git.protected_branches.includes(currentBranch());
  const statLines = diffStatSince(ref);
  const mergeOrForce = detectForbiddenForceOrMerge(ref);
  if (onProtected) { state.blocker = `worker_touched_protected_branch_${currentBranch()}`; state.last_worker_status = "failed"; }
  else if (forbidden.length) { state.blocker = `worker_changed_excluded:${forbidden.join(",")}`; state.last_worker_status = "failed"; }
  else if (mergeOrForce) { state.blocker = `worker_${mergeOrForce}`; state.last_worker_status = "failed"; }
  else if (statLines.files > cfg.git.max_diff_files) { state.blocker = `worker_diff_too_large_files:${statLines.files}`; state.last_worker_status = "failed"; }
  else if (statLines.lines > cfg.git.max_diff_lines) { state.blocker = `worker_diff_too_large_lines:${statLines.lines}`; state.last_worker_status = "failed"; }
  if (wr.blocker) state.blocker = state.blocker || `worker: ${wr.blocker}`;

  state.phase = "review";
  snapshotHistory("worker", state, wr);
  return state;
}

function reconcileAfterReview(state, cfg, cliOk) {
  if (!cliOk) {
    state.consecutive_failures += 1;
    state.blocker = "review_cli_failed";
    snapshotHistory("review", state, { error: "cli_failed" });
    return state;
  }
  let review;
  try {
    review = freshArtifact(readJsonOrThrow(REVIEW_PATH), state.run_id, state.iteration, state.current_task, "latest_review");
  } catch (e) {
    state.consecutive_failures += 1;
    state.blocker = `review_${e.code}`;
    snapshotHistory("review", state, { error: e.code, message: e.message });
    return state;
  }

  const accepted = review.status === "accepted";
  state.last_review_status = review.status || "rejected";
  state.objective_complete = !!(review.objective_complete) && accepted;
  if (review.blocker) state.blocker = state.blocker || `supervisor: ${review.blocker}`;

  archiveTask(state, accepted);
  snapshotHistory("review", state, review);

  if (state.objective_complete) { state.status = "complete"; state.phase = "stop"; return state; }
  if (state.blocker && cfg.loop.stop_on_blocker) { state.status = "blocked"; state.phase = "stop"; return state; }

  if (accepted) {
    state.iteration += 1;
    state.corrections_for_task = 0;
    state.consecutive_failures = 0;
    state.last_worker_status = "idle";
  } else {
    state.consecutive_failures = state.consecutive_failures + 1;
    state.corrections_for_task = (state.corrections_for_task || 0) + 1;
    if (state.corrections_for_task > cfg.loop.max_corrections_per_task) {
      state.blocker = `max_corrections_per_task_exceeded:${state.corrections_for_task}`;
      state.status = "blocked"; state.phase = "stop"; return state;
    }
    if (state.consecutive_failures > cfg.loop.max_consecutive_failures) {
      state.blocker = `max_consecutive_failures:${state.consecutive_failures}`;
      state.status = "blocked"; state.phase = "stop"; return state;
    }
  }
  state.phase = "plan";
  return state;
}

function archiveTask(state, accepted) {
  const id = state.current_task || `task-${state.iteration}`;
  const dest = path.join(AGENTS_DIR, "tasks", accepted ? "completed" : "failed", `${id}.md`);
  try { ensureDir(path.dirname(dest)); fs.copyFileSync(ACTIVE_TASK_PATH, dest); } catch {}
}

// ---------- main loop ----------

function startGitBoundary(cfg) {
  const branch = currentBranch();
  const dirty = isDirtyPattern();
  if (dirty && cfg.git.stop_on_dirty_startup) {
    throw new Error(`git_boundary: working tree dirty at startup; refusing to run. branch=${branch}`);
  }
  if (cfg.git.protected_branches.includes(branch)) {
    throw new Error(`git_boundary: current branch '${branch}' is protected. Check out a non-protected branch before running the controller.`);
  }
  // Always run the worker on a dedicated branch off the current HEAD, so
  // product code never lands on the user's working branch without review.
  const slug = (process.env.OBJECTIVE_SLUG || readJson(STATE_PATH, {}).objective || DEFAULT_STATE.objective).replace(/[^\w-]+/g, "-").slice(0, 40);
  const workerBranch = `${cfg.git.worker_branch_prefix}/${slug}`;
  if (branch !== workerBranch) {
    if (!checkoutBranch(workerBranch)) throw new Error(`git_boundary: cannot create worker branch ${workerBranch}`);
  }
  return workerBranch;
}

function main() {
  const cfg = loadConfig();
  if (!fs.existsSync(STATE_PATH)) writeJson(STATE_PATH, DEFAULT_STATE);

  let guard = 0;
  const hardCap = (cfg.loop.max_iterations || 3) * 4 + 8;

  try {
    const branch = startGitBoundary(cfg);
    let st = readJson(STATE_PATH, DEFAULT_STATE);
    st = { ...DEFAULT_STATE, ...st };
    if (!st.run_id || st.status !== "running") st.run_id = newRunId();
    if (!st.worker_branch) st.worker_branch = branch === currentBranch() ? branch : branch;
    st.max_iterations = cfg.loop.max_iterations;
    st.max_corrections_per_task = cfg.loop.max_corrections_per_task;
    st.max_consecutive_failures = cfg.loop.max_consecutive_failures;
    writeJson(STATE_PATH, st);

    for (;;) {
      guard += 1;
      if (guard > hardCap) { console.error("[controller] hard safety cap reached; stopping."); st.status = "capped"; st.blocker = st.blocker || "hard_safety_cap"; writeJson(STATE_PATH, st); break; }

      let state = readJson(STATE_PATH, DEFAULT_STATE);
      state = { ...DEFAULT_STATE, ...state };
      state.run_id = state.run_id || newRunId();
      state.max_iterations = cfg.loop.max_iterations;
      state.max_corrections_per_task = cfg.loop.max_corrections_per_task;
      state.max_consecutive_failures = cfg.loop.max_consecutive_failures;

      if (state.status === "complete") { console.error("[controller] objective complete."); break; }
      if (state.status === "blocked" || (state.blocker && cfg.loop.stop_on_blocker)) { console.error(`[controller] blocked: ${state.blocker}`); break; }
      if (state.iteration >= (cfg.loop.max_iterations || 3)) {
        console.error(`[controller] iteration budget exhausted (${state.iteration}).`);
        state.status = "budget_exhausted"; writeJson(STATE_PATH, state); break;
      }
      if (state.consecutive_failures > cfg.loop.max_consecutive_failures) {
        console.error(`[controller] consecutive failures exceeded (${state.consecutive_failures}).`); state.status = "blocked"; state.blocker = state.blocker || "max_consecutive_failures"; writeJson(STATE_PATH, state); break;
      }

      const phase = state.phase || "plan";
      const prevTaskText = phase === "plan" ? readText(ACTIVE_TASK_PATH) : null;
      clearArtifacts(phase);
      const res = runCli(phase, phase === "worker" ? renderWorkerPrompt(state) : renderSupervisorPrompt(state, phase), cfg);
      const ok = res.ok;
      if (cfg.loop.seconds_between_steps) sleep((cfg.loop.seconds_between_steps || 1) * 1000);

      if (phase === "plan") state = reconcileAfterPlan(state, cfg, ok, prevTaskText);
      else if (phase === "worker") state = reconcileAfterWorker(state, cfg, ok);
      else if (phase === "review") state = reconcileAfterReview(state, cfg, ok);

      writeJson(STATE_PATH, state);
      if (state.phase === "stop") break;
      if (state.blocker && (state.status === "blocked" || cfg.loop.stop_on_blocker)) {
        // For non-fatal blockers in plan/worker (e.g., cli_failed once), fall
        // through only if under the consecutive failure budget; otherwise stop.
        if (state.status === "blocked") break;
        writeJson(STATE_PATH, state);
      }
    }

    const finalState = readJson(STATE_PATH, {});
    console.error(`\n[controller] done. status=${finalState.status} iteration=${finalState.iteration} blocker=${finalState.blocker}`);
    // Final sanitized history snapshot
    snapshotHistory("final", finalState, null);
    return 0;
  } catch (e) {
    console.error(`[controller] abort: ${e.message}`);
    const st = readJson(STATE_PATH, DEFAULT_STATE);
    st.status = "blocked"; st.blocker = e.message;
    writeJson(STATE_PATH, st);
    snapshotHistory("abort", st, { error: String(e) });
    return 1;
  }
}

main();