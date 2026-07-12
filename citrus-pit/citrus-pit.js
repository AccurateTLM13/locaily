#!/usr/bin/env node
/**
 * CITRUS PIT
 *
 * A live terminal cockpit for the Locaily Local Brain.
 * It does not track "steps". It tracks tension.
 *
 * Self-contained. No external dependencies. Uses the global fetch (Node >= 18),
 * node:readline for keypress input, and raw ANSI for the frame.
 *
 * Connects to a running companion server at http://127.0.0.1:31313 by default
 * (override with LOCAILY_BASE_URL).
 *
 * Keys:
 *   SPACE  hold / release the machine
 *   D      damage report
 *   E      receipts mode
 *   R      refresh now
 *   ?      help
 *   Q/K    kill the pit (quit)
 */

"use strict";

const readline = require("node:readline");

const BASE_URL = (process.env.LOCAILY_BASE_URL || "http://127.0.0.1:31313").replace(/\/$/, "");
const POLL_MS = Number(process.env.CITRUS_POLL_MS || 1500);
const RUN_ID = makeRunId();

// ---------------------------------------------------------------------------
// Color + text helpers
// ---------------------------------------------------------------------------

const ESC = "\x1b[";
const RESET = `${ESC}0m`;

const C = {
  bg: `${ESC}48;5;232m`,
  cream: `${ESC}38;5;230m`,
  lemon: `${ESC}38;5;154m`,
  dim: `${ESC}38;5;244m`,
  red: `${ESC}38;5;196m`,
  amber: `${ESC}38;5;214m`,
  green: `${ESC}38;5;120m`,
  blue: `${ESC}38;5;75m`,
  bold: `${ESC}1m`,
  blink: `${ESC}5m`
};

function paint(color, text) {
  return `${color}${text}${RESET}`;
}

function str(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    try {
      if (value.message) return String(value.message);
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function summaryText(value) {
  if (value == null) return "";
  if (typeof value !== "object") return String(value);
  for (const key of ["summary", "message", "verdict", "final_status", "status", "result"]) {
    if (value[key] != null) {
      const v = value[key];
      if (typeof v === "string") return v;
      if (typeof v === "object") return JSON.stringify(v).slice(0, 120);
    }
  }
  return JSON.stringify(value).slice(0, 120);
}

function truncate(value, max) {
  const s = str(value);
  if (s.length <= max) return s;
  return s.slice(0, Math.max(1, max - 1)) + "…";
}

function padEnd(value, width) {
  const s = String(value == null ? "" : value);
  if (s.length >= width) return s.slice(0, width);
  return s + " ".repeat(width - s.length);
}

function padStart(value, width) {
  const s = String(value == null ? "" : value);
  if (s.length >= width) return s.slice(s.length - width);
  return " ".repeat(width - s.length) + s;
}

function meter(pct, width = 22) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  const filled = Math.round((p / 100) * width);
  const empty = width - filled;
  const color = p >= 66 ? C.red : p >= 33 ? C.amber : C.lemon;
  return paint(color, "█".repeat(filled)) + paint(C.dim, "░".repeat(empty));
}

function makeRunId() {
  const t = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  return `citrus_${t}_${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------------
// HTTP client
// ---------------------------------------------------------------------------

async function getJson(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(`${BASE_URL}${path}`, { signal: controller.signal });
    if (!res.ok) return { ok: false, status: res.status, body: null };
    const body = await res.json();
    return { ok: true, status: res.status, body };
  } catch (err) {
    return { ok: false, status: 0, body: null, error: String(err && err.message || err) };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// State store
// ---------------------------------------------------------------------------

const state = {
  serverUp: false,
  lastError: null,
  health: null,
  consoleStatus: null,
  audit: [],
  runs: [],
  activeRun: null,
  detailRun: null,
  startedAt: Date.now(),
  lastPoll: null,
  paused: false,
  mode: "live", // live | damage | receipts | help
  humanCutIn: false
};

function pickActiveRun(runs) {
  if (!Array.isArray(runs) || runs.length === 0) return null;
  const active = runs.find((r) => r.status === "running" || r.status === "queued");
  return active || runs[0];
}

async function poll() {
  if (state.paused) return;

  const [health, consoleStatus, audit, runsList] = await Promise.all([
    getJson("/health"),
    getJson("/console/status"),
    getJson("/audit?limit=30"),
    getJson("/console/runs?limit=12")
  ]);

  state.serverUp = health.ok;
  if (!health.ok) {
    state.lastError = health.error || "no signal";
  }

  state.health = health.ok ? health.body : null;
  state.consoleStatus = consoleStatus.ok ? consoleStatus.body : null;
  state.audit = audit.ok && Array.isArray(audit.body.events) ? audit.body.events : [];
  state.runs = runsList.ok && Array.isArray(runsList.body.runs) ? runsList.body.runs : [];

  const active = pickActiveRun(state.runs);
  state.activeRun = active;

  if (active) {
    const detail = await getJson(`/console/runs/${encodeURIComponent(active.runId)}`);
    state.detailRun = detail.ok ? detail.body.run : null;
  } else {
    state.detailRun = null;
  }

  // Human cut-in: a failed step the machine cannot self-heal, or a run that
  // explicitly awaits a human.
  const run = state.detailRun;
  let human = false;
  if (run && Array.isArray(run.steps)) {
    const failed = run.steps.find((s) => s.status === "failed");
    const hardFail = failed && !["preflight", "pagespeed_capture"].includes(failed.id);
    human = Boolean(hardFail) || run.status === "awaiting_human" || run.status === "blocked";
  }
  state.humanCutIn = human;

  state.lastPoll = Date.now();
}

// ---------------------------------------------------------------------------
// Derivers (the Citrus Pit "brain")
// ---------------------------------------------------------------------------

const STAGE_OF_STEP = {
  preflight: "scan",
  pagespeed_capture: "scan",
  slim_input: "scan",
  analyze_report: "build",
  model_provenance: "prove",
  compose_handoff: "build",
  schema_validation: "prove",
  metric_preservation: "prove",
  privacy_audit: "prove",
  artifact_save: "ship"
};

const STAGES = [
  { key: "intake", label: "INTAKE" },
  { key: "scan", label: "SCAN" },
  { key: "plan", label: "PLAN" },
  { key: "build", label: "BUILD" },
  { key: "break", label: "BREAK" },
  { key: "prove", label: "PROVE" },
  { key: "ship", label: "SHIP" }
];

const RANK = { passed: 3, running: 2, failed: 0, warning: 1, pending: 4 };

function stageStatuses(run) {
  const map = {};
  for (const s of STAGES) map[s.key] = "pending";
  if (!run || !Array.isArray(run.steps)) return map;
  for (const step of run.steps) {
    const stageKey = STAGE_OF_STEP[step.id] || "plan";
    const rank = RANK[step.status] ?? 4;
    const curRank = RANK[map[stageKey]] ?? 4;
    if (rank < curRank) map[stageKey] = step.status;
  }
  return map;
}

function currentStageKey(run) {
  const statuses = stageStatuses(run);
  for (const s of STAGES) {
    if (["running", "failed", "warning", "pending"].includes(statuses[s.key])) return s.key;
  }
  return "ship";
}

function deriveMachineStatus() {
  if (!state.serverUp) {
    return { line: "COLD. NO SIGNAL FROM THE LOCAL BRAIN.", dramatic: "OFFLINE", hot: false };
  }
  const run = state.detailRun;
  if (run && Array.isArray(run.steps)) {
    const failed = run.steps.find((s) => s.status === "failed");
    const running = run.steps.find((s) => s.status === "running");
    if (failed) {
      const dramatic = failed.id === "schema_validation" || failed.id === "metric_preservation"
        ? "EVIDENCE SPLIT"
        : "REPAIRING LOGIC";
      return { line: `TAKING APART "${truncate(failed.label || failed.id, 38)}"`, dramatic, hot: true };
    }
    if (running) {
      return { line: `WORKING "${truncate(running.label || running.id, 40)}"`, dramatic: "LOCKED ON", hot: true };
    }
    if (run.status === "passed" || run.status === "completed") {
      return { line: "THE ARGUMENT HOLDS. SHIPPING.", dramatic: "READY TO SHIP", hot: false };
    }
  }
  const h = state.health;
  if (h && h.runtime && h.runtime.available === false) {
    return { line: "WAITING FOR OLLAMA TO WARM UP", dramatic: "HUNTING", hot: false };
  }
  if (state.audit.length === 0) {
    return { line: "IDLE. THE PIT IS CLEAN.", dramatic: "NEEDS A HUMAN", hot: false };
  }
  return { line: "LISTENING FOR THE NEXT RUN", dramatic: "HUNTING", hot: false };
}

function deriveBullshitRisk() {
  if (!state.serverUp) return 100;
  let risk = 8;
  const h = state.health;
  if (h && h.runtime && h.runtime.available === false) risk += 34;
  if (h && h.model && h.model.ready === false) risk += 22;

  const run = state.detailRun;
  if (run && Array.isArray(run.steps)) {
    const failed = run.steps.filter((s) => s.status === "failed").length;
    const running = run.steps.find((s) => s.status === "running");
    if (failed > 0) risk += Math.min(30, failed * 16);
    if (Array.isArray(run.warnings)) risk += Math.min(24, run.warnings.length * 8);
    if (running && running.startedAt) {
      const secs = (Date.now() - Date.parse(running.startedAt)) / 1000;
      if (secs > 45) risk += 12;
    }
  }
  const errors = state.audit.filter((e) => e.status === "error").length;
  if (errors > 0) risk += Math.min(18, errors * 6);

  return Math.max(0, Math.min(100, Math.round(risk)));
}

function deriveEvidenceGrip() {
  if (!state.serverUp) return 0;
  let grip = 40;
  const run = state.detailRun;
  if (run && Array.isArray(run.steps)) {
    const passed = run.steps.filter((s) => s.status === "passed").length;
    const total = run.steps.length || 1;
    grip = Math.round((passed / total) * 70) + 10;
  }
  const h = state.health;
  if (h && h.runtime && h.runtime.available) grip += 8;
  if (state.consoleStatus && state.consoleStatus.memory && state.consoleStatus.memory.readable) grip += 6;
  const risk = deriveBullshitRisk();
  grip = grip - Math.round(risk / 6);
  return Math.max(0, Math.min(100, grip));
}

function deriveContextHeat() {
  if (!state.serverUp) return 0;
  let heat = 20;
  const wires = deriveLiveWires().length;
  heat += Math.min(45, wires * 7);
  const recent = state.audit.filter((e) => e.timestamp && Date.now() - Date.parse(e.timestamp) < 120000).length;
  heat += Math.min(35, recent * 5);
  return Math.max(0, Math.min(100, heat));
}

function deriveObsession() {
  if (!state.serverUp) return "Where is the Local Brain? It is not answering.";
  const run = state.detailRun;
  if (run && Array.isArray(run.steps)) {
    const failed = run.steps.find((s) => s.status === "failed");
    if (failed) {
      const msg = (failed.error && failed.error.message) || failed.message || failed.label || failed.id;
      return `“${truncate(msg, 70)}”`;
    }
    const warn = Array.isArray(run.warnings) && run.warnings[0];
    if (warn) return `“${truncate(warn, 70)}”`;
    const running = run.steps.find((s) => s.status === "running");
    if (running) {
      const stage = currentStageKey(run);
      return `Why is "${truncate(running.label || running.id, 30)}" taking so long at ${stage.toUpperCase()}?`;
    }
  }
  if (state.health && state.health.runtime && state.health.runtime.available === false) {
    return "Why is the runtime dark when the machine should be hot?";
  }
  const last = state.audit[0];
  if (last && last.output_summary) return `“${truncate(summaryText(last.output_summary), 70)}”`;
  return "Nothing yet. The pit is suspiciously clean.";
}

function deriveLiveWires() {
  const wires = [];
  const h = state.health;
  if (h && Array.isArray(h.tools)) {
    for (const t of h.tools.slice(0, 6)) wires.push(`tool.${t}`);
  }
  const seen = new Set(wires);
  for (const e of state.audit.slice(0, 6)) {
    if (e.source && e.source.app_id && !seen.has(`src.${e.source.app_id}`)) {
      seen.add(`src.${e.source.app_id}`);
      wires.push(`src.${e.source.app_id}`);
    }
  }
  return wires.slice(0, 8);
}

function deriveAgentTrail() {
  const entries = [];
  const run = state.detailRun;
  if (run && Array.isArray(run.steps)) {
    for (const s of run.steps) {
      if (s.status === "passed") {
        entries.push({ level: "MADE A CALL", text: `${s.label || s.id} held.` });
      } else if (s.status === "failed") {
        entries.push({ level: "CAUGHT FIRE", text: `${s.label || s.id} dropped. ${truncate(s.message || (s.error && s.error.message) || "", 48)}` });
      } else if (s.status === "running") {
        entries.push({ level: "NOW", text: `Working ${s.label || s.id}.` });
      } else if (s.status === "warning") {
        entries.push({ level: "GOT PUSHBACK", text: `${s.label || s.id} warned. ${truncate(s.message || "", 48)}` });
      }
    }
  }
  for (const e of state.audit.slice(0, 10)) {
    const ts = e.timestamp ? new Date(e.timestamp).toTimeString().slice(0, 8) : "--:--:--";
    if (e.status === "error") {
      entries.push({ ts, level: "GOT PUSHBACK", text: `${e.tool || "?"} rejected: ${truncate(e.error_code || "error", 40)}` });
    } else if (e.tool) {
      entries.push({ ts, level: "FOUND SOMETHING", text: `${e.tool} ran ${truncate(e.task || "", 30)}` });
    }
  }
  return entries.slice(-10).reverse();
}

function deriveDamage() {
  const run = state.detailRun;
  const items = [];
  let worst = null;
  if (run && Array.isArray(run.steps)) {
    for (const s of run.steps) {
      if (s.status === "failed") {
        items.push(`1 step failed: ${s.label || s.id}`);
        const msg = (s.error && s.error.message) || s.message || s.label || s.id;
        if (!worst) worst = { claim: `"${truncate(s.label || s.id, 40)}" did not survive.`, why: truncate(msg, 78) };
      }
    }
  }
  if (run && Array.isArray(run.warnings)) {
    for (const w of run.warnings) items.push(`warning: ${truncate(w, 60)}`);
  }
  const errors = state.audit.filter((e) => e.status === "error");
  if (errors.length) items.push(`${errors.length} audit event(s) rejected`);
  if (items.length === 0) items.push("Nothing broke. The run is clean.");
  return { items, worst };
}

function deriveReceipts() {
  const run = state.detailRun;
  const claims = [];
  if (run && Array.isArray(run.steps)) {
    for (const s of run.steps) {
      const verdict = s.status === "passed"
        ? "SUPPORTED"
        : s.status === "failed"
          ? "CONTRADICTED"
          : s.status === "running"
            ? "IN PROGRESS"
            : "PENDING";
      claims.push({ claim: truncate(s.label || s.id, 46), verdict, ok: s.status === "passed" });
    }
  }
  const result = (run && run.result) || {};
  const summary = [
    result.schemaValid != null ? `schema_valid=${result.schemaValid}` : null,
    result.benchmarkValid != null ? `benchmark_valid=${result.benchmarkValid}` : null,
    result.weakestCategory ? `weakest=${result.weakestCategory}` : null,
    result.modelMismatch != null ? `model_mismatch=${result.modelMismatch}` : null
  ].filter(Boolean);
  return { claims, summary };
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

function frameWidth() {
  const cols = (process.stdout.columns || 100);
  return Math.max(80, Math.min(120, cols));
}

function boxTop(w) { return `${C.lemon}${padEnd("┏" + "━".repeat(w - 2) + "┓", w)}${RESET}`; }
function boxBottom(w) { return `${C.lemon}${padEnd("┗" + "━".repeat(w - 2) + "┛", w)}${RESET}`; }
function div(w) { return `${C.lemon}${padEnd("┣" + "━".repeat(w - 2) + "┫", w)}${RESET}`; }

function row(w, text, color = C.cream) {
  const inner = w - 4;
  const safe = truncate(text, inner);
  return `${C.lemon}┃ ${RESET}${color}${padEnd(safe, inner)}${RESET}${C.lemon} ┃${RESET}`;
}

function rowRaw(w, left, right, leftColor = C.cream, rightColor = C.cream) {
  const inner = w - 4;
  const safeLeft = truncate(left, inner - 1);
  const safeRight = truncate(right, inner - safeLeft.length - 1);
  const pad = inner - safeLeft.length - safeRight.length;
  return `${C.lemon}┃ ${RESET}${leftColor}${safeLeft}${RESET}${" ".repeat(Math.max(0, pad))}${rightColor}${safeRight}${RESET}${C.lemon} ┃${RESET}`;
}

function emptyRow(w) { return row(w, ""); }

function renderThoughtLine(w) {
  const lines = [];
  const run = state.detailRun;
  const statuses = stageStatuses(run);
  const cur = currentStageKey(run);

  if (!state.serverUp) {
    lines.push(row(w, paint(C.dim, "THE MACHINE IS OFFLINE — NO THOUGHT LINE")));
    return lines;
  }

  const labels = STAGES.map((s) => {
    const st = statuses[s.key];
    let col = C.dim;
    if (s.key === cur && st !== "passed") col = st === "failed" ? C.red : C.lemon + C.bold;
    else if (st === "passed") col = C.lemon;
    else if (st === "failed") col = C.red;
    const mark = s.key === cur && st !== "passed" ? " ▲" : "";
    return paint(col, s.label + mark);
  });
  const line = labels.join(paint(C.dim, " ━ "));
  lines.push(row(w, line));

  // Branch annotations
  const failedStep = run && Array.isArray(run.steps) ? run.steps.find((s) => s.status === "failed") : null;
  const hasWarnings = run && Array.isArray(run.warnings) && run.warnings.length > 0;
  if (failedStep) {
    lines.push(row(w, paint(C.red, "╳╳╳ FAILURE") + paint(C.dim, "   ╰━━ RECOVER")));
  } else if (hasWarnings && cur === "prove") {
    lines.push(row(w, paint(C.amber, "╲") + paint(C.dim, "  CHALLENGER")));
  } else if (state.humanCutIn) {
    lines.push(row(w, paint(C.red, "▌▌▌ HUMAN INTERRUPT ▐")));
  } else if (!run) {
    lines.push(row(w, paint(C.dim, "╱╱╱ ACTIVE THREAD — awaiting the next run")));
  }
  return lines;
}

function formatClock(ms) {
  const s = Math.floor(ms / 1000);
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function renderHeader(w) {
  const lines = [];
  const ms = state.lastPoll ? Date.now() - state.startedAt : 0;
  const runNo = padStart(RUN_ID.slice(-5), 5);
  const hot = state.serverUp ? paint(C.red + C.blink, "● HOT") : paint(C.dim, "● COLD");
  const hold = state.paused ? paint(C.amber, "HOLD ") : "";
  const title = paint(C.lemon + C.bold, "LOCAILY // CITRUS PIT");
  lines.push(rowRaw(w, `${title}  ${hold}${hot}`, `RUN ${runNo}  ${formatClock(ms)}`, C.cream, C.dim));
  const status = deriveMachineStatus();
  lines.push(row(w, paint(C.cream, "THE MACHINE IS CURRENTLY: ") + paint(status.hot ? C.lemon : C.dim, status.line)));
  return lines;
}

function renderReadout(w) {
  const lines = [];
  const risk = deriveBullshitRisk();
  const grip = deriveEvidenceGrip();
  const heat = deriveContextHeat();
  lines.push(rowRaw(w, paint(C.cream, "CONTEXT HEAT"), meter(heat) + paint(C.dim, ` ${padStart(heat, 3)}%`), C.cream, C.dim));
  lines.push(rowRaw(w, paint(C.cream, "EVIDENCE GRIP"), meter(grip) + paint(C.dim, ` ${padStart(grip, 3)}%`), C.cream, C.dim));
  lines.push(rowRaw(w, paint(C.cream, "BULLSHIT RISK"), meter(risk) + paint(C.dim, ` ${padStart(risk, 3)}%`), C.cream, C.dim));
  return lines;
}

function renderLiveWires(w) {
  const lines = [];
  const wires = deriveLiveWires();
  const joined = wires.map((x) => paint(C.blue, truncate(x, 22))).join(paint(C.dim, "  ─┐ "));
  lines.push(row(w, joined || paint(C.dim, "no live wires")));
  return lines;
}

function renderAgentTrail(w) {
  const lines = [];
  const trail = deriveAgentTrail();
  const inner = w - 4;
  if (trail.length === 0) {
    lines.push(row(w, paint(C.dim, "no signal on the trail yet")));
    return lines;
  }
  for (const e of trail.slice(-7)) {
    const ts = e.ts ? paint(C.dim, e.ts + "  ") : "";
    const levelColor = e.level === "CAUGHT FIRE" ? C.red
      : e.level === "GOT PUSHBACK" ? C.amber
      : e.level === "NOW" ? C.lemon
      : C.green;
    const level = paint(levelColor + C.bold, padEnd(e.level, 14));
    lines.push(row(w, `${ts}${level}${paint(C.cream, truncate(e.text, inner - 26))}`));
  }
  return lines;
}

function renderDamage(w) {
  const lines = [];
  lines.push(row(w, paint(C.red + C.bold, "DAMAGE REPORT"), C.red));
  const dmg = deriveDamage();
  for (const it of dmg.items.slice(0, 5)) {
    lines.push(row(w, paint(C.red, "  ✕ ") + paint(C.cream, truncate(it, w - 10))));
  }
  if (dmg.worst) {
    lines.push(emptyRow(w));
    lines.push(row(w, paint(C.amber + C.bold, "WORST HIT")));
    lines.push(row(w, paint(C.cream, truncate(dmg.worst.claim, w - 4))));
    lines.push(row(w, paint(C.dim, "WHY IT BROKE")));
    lines.push(row(w, paint(C.cream, truncate(dmg.worst.why, w - 4))));
  }
  return lines;
}

function renderReceipts(w) {
  const lines = [];
  lines.push(row(w, paint(C.lemon + C.bold, "SHOW RECEIPTS — CLAIMS VS EVIDENCE"), C.lemon));
  const r = deriveReceipts();
  for (const c of r.claims) {
    const v = c.ok ? paint(C.green, "✓ " + c.verdict) : c.verdict === "CONTRADICTED" ? paint(C.red, "✕ " + c.verdict) : paint(C.dim, "△ " + c.verdict);
    lines.push(rowRaw(w, truncate(c.claim, w - 26), v, C.cream, C.dim));
  }
  if (r.claims.length === 0) lines.push(row(w, paint(C.dim, "no claims to weigh yet")));
  if (r.summary.length) {
    lines.push(emptyRow(w));
    lines.push(row(w, paint(C.dim, r.summary.join("   "))));
  }
  return lines;
}

function renderFooter(w) {
  const keys = [
    paint(C.lemon, "[SPACE]") + " HOLD",
    paint(C.lemon, "[D]") + " DAMAGE",
    paint(C.lemon, "[E]") + " RECEIPTS",
    paint(C.lemon, "[R]") + " REFRESH",
    paint(C.lemon, "[?]") + " HELP",
    paint(C.lemon, "[Q]") + " KILL"
  ].join(paint(C.dim, "   "));
  let modeNote = "";
  if (state.mode === "damage") modeNote = paint(C.red, "  ◉ DAMAGE VIEW — press D to exit");
  else if (state.mode === "receipts") modeNote = paint(C.lemon, "  ◉ RECEIPTS MODE — press E to exit");
  return [row(w, keys + modeNote)];
}

function renderHelp(w) {
  const lines = [];
  lines.push(row(w, paint(C.lemon + C.bold, "CITRUS PIT — CONTROLS"), C.lemon));
  const help = [
    "SPACE  hold / release the machine (stop polling)",
    "D      damage report — what broke and why",
    "E      receipts mode — claims vs evidence only",
    "R      force a refresh from the Local Brain",
    "?      this help screen",
    "Q / K  kill the pit and return to your shell"
  ];
  for (const h of help) lines.push(row(w, paint(C.cream, "  " + h)));
  lines.push(emptyRow(w));
  lines.push(row(w, paint(C.dim, `connected to ${BASE_URL}`)));
  return lines;
}

function renderHumanCutIn(w) {
  return [
    row(w, paint(C.red + C.bold, "THE MACHINE HAS REACHED THE EDGE OF ITS AUTHORITY"), C.red),
    row(w, paint(C.cream, "Your call. Press E for receipts, or Q to leave it parked."))
  ];
}

function renderOffline(w) {
  return [
    row(w, paint(C.red + C.bold, "THE MACHINE IS COLD"), C.red),
    row(w, paint(C.cream, "No signal from the Local Brain.")),
    row(w, paint(C.dim, `Expected at ${BASE_URL}`)),
    emptyRow(w),
    row(w, paint(C.cream, "Start it:")),
    row(w, paint(C.lemon, "  npm start        # or: node companion/server.js")),
    emptyRow(w),
    row(w, paint(C.dim, "The pit will re-light the moment the brain answers."))
  ];
}

function renderEmptyPit(w) {
  return [
    row(w, paint(C.lemon + C.bold, "NO WORK IN THE PIT"), C.lemon),
    row(w, paint(C.cream, "Everything is clean.")),
    row(w, paint(C.dim, "Suspiciously clean."))
  ];
}

function render() {
  const w = frameWidth();
  const out = [];
  out.push(C.bg);
  out.push(boxTop(w));
  out.push(...renderHeader(w));
  out.push(div(w));

  if (!state.serverUp) {
    out.push(...renderOffline(w));
    out.push(div(w));
    out.push(...renderFooter(w));
    out.push(boxBottom(w));
    out.push(RESET);
    return out.join("\n");
  }

  // Thought line
  out.push(row(w, paint(C.bold + C.lemon, "THE THOUGHT LINE")));
  out.push(...renderThoughtLine(w));
  out.push(emptyRow(w));

  if (state.mode === "help") {
    out.push(...renderHelp(w));
    out.push(div(w));
    out.push(...renderFooter(w));
    out.push(boxBottom(w));
    out.push(RESET);
    return out.join("\n");
  }

  if (state.mode === "damage") {
    out.push(...renderDamage(w));
    out.push(div(w));
    out.push(...renderFooter(w));
    out.push(boxBottom(w));
    out.push(RESET);
    return out.join("\n");
  }

  if (state.mode === "receipts") {
    out.push(...renderReceipts(w));
    out.push(div(w));
    out.push(...renderFooter(w));
    out.push(boxBottom(w));
    out.push(RESET);
    return out.join("\n");
  }

  // Current obsession
  out.push(row(w, paint(C.lemon + C.bold, "CURRENT OBSESSION"), C.lemon));
  out.push(row(w, paint(C.cream + C.bold, deriveObsession())));
  out.push(emptyRow(w));

  // Readout
  out.push(row(w, paint(C.bold + C.lemon, "MACHINE READOUT"), C.lemon));
  out.push(...renderReadout(w));
  out.push(div(w));

  // Live wires + Agent trail
  out.push(row(w, paint(C.bold + C.lemon, "LIVE WIRES"), C.lemon));
  out.push(...renderLiveWires(w));
  out.push(div(w));
  out.push(row(w, paint(C.bold + C.lemon, "AGENT TRAIL"), C.lemon));
  out.push(...renderAgentTrail(w));
  out.push(div(w));

  // Next impact
  const run = state.detailRun;
  const next = run ? "resolve contradiction" : "await next run";
  const nextItems = [
    [true, next],
    [Boolean(run), "rebuild output"],
    [Boolean(run && state.humanCutIn), "request approval"],
    [Boolean(run && run.status === "passed"), "ship"]
  ];
  const nextLine = nextItems
    .map(([on, label]) => on ? paint(C.lemon + C.bold, "◉ " + label) : paint(C.dim, "○ " + label))
    .join(paint(C.dim, "   "));
  out.push(row(w, paint(C.bold + C.lemon, "NEXT IMPACT")));
  out.push(row(w, nextLine));

  if (state.humanCutIn) {
    out.push(div(w));
    out.push(...renderHumanCutIn(w));
  }

  if (!run && state.audit.length === 0) {
    out.push(div(w));
    out.push(...renderEmptyPit(w));
  }

  out.push(div(w));
  out.push(...renderFooter(w));
  out.push(boxBottom(w));
  out.push(RESET);
  return out.join("\n");
}

// ---------------------------------------------------------------------------
// Main loop + input
// ---------------------------------------------------------------------------

let renderTimer = null;
let pollTimer = null;

function draw() {
  process.stdout.write(`${ESC}2J${ESC}H`);
  process.stdout.write(render());
  process.stdout.write("\n");
}

function start() {
  process.stdout.write(`${ESC}?25l`); // hide cursor
  process.stdout.write(C.bg);

  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);

  process.stdin.on("keypress", (chunk, key) => {
    if (!key) return;
    if (key.ctrl && key.name === "c") return quit();
    switch (key.name) {
      case "space":
        state.paused = !state.paused;
        draw();
        break;
      case "d":
        state.mode = state.mode === "damage" ? "live" : "damage";
        draw();
        break;
      case "e":
        state.mode = state.mode === "receipts" ? "live" : "receipts";
        draw();
        break;
      case "r":
        poll().then(draw);
        draw();
        break;
      case "h":
      case "?":
        state.mode = state.mode === "help" ? "live" : "help";
        draw();
        break;
      case "q":
      case "k":
        return quit();
      default:
        break;
    }
  });

  poll().then(() => {
    draw();
    pollTimer = setInterval(() => { poll().then(draw); }, POLL_MS);
    renderTimer = setInterval(draw, 1000); // tick the clock
  });
}

function quit() {
  if (pollTimer) clearInterval(pollTimer);
  if (renderTimer) clearInterval(renderTimer);
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  process.stdout.write(RESET);
  process.stdout.write(`${ESC}?25h`); // show cursor
  process.stdout.write("\n" + paint(C.lemon, "CITRUS PIT") + paint(C.dim, " — pit closed. Run `npm run citrus-pit` to reopen.\n"));
  process.exit(0);
}

if (require.main === module) {
  start();
}

module.exports = {
  state,
  poll,
  deriveBullshitRisk,
  deriveObsession,
  deriveMachineStatus,
  deriveContextHeat,
  deriveEvidenceGrip,
  deriveLiveWires,
  deriveAgentTrail,
  deriveDamage,
  deriveReceipts,
  stageStatuses,
  render
};
