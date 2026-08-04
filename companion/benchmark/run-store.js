const { randomUUID } = require("node:crypto");
const { mkdir, readFile, readdir, rename, writeFile } = require("node:fs/promises");
const path = require("node:path");

const DEFAULT_RUN_DIR = path.resolve(__dirname, "..", "..", "data", "benchmark-lab", "runs");
const INDEX_FILE = "index.local.json";
const MAX_RUNS = 200;
const MAX_EVENTS = 250;
const TERMINAL_STATES = new Set(["completed", "failed", "cancelled"]);

function createBenchmarkRunStore(options = {}) {
  const runDir = options.runDir || DEFAULT_RUN_DIR;
  const now = options.now || (() => new Date());
  const runs = new Map();
  let ready = false;

  async function initialize() {
    if (ready) return;
    await mkdir(runDir, { recursive: true });
    for (const entry of await readdir(runDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".local.json") || entry.name === INDEX_FILE) continue;
      try {
        const run = JSON.parse(await readFile(path.join(runDir, entry.name), "utf8"));
        if (run && run.schemaVersion === "benchmark.lab_run.v1" && run.runId) runs.set(run.runId, run);
      } catch {
        // Corrupt local records are skipped; a healthy record is never fabricated.
      }
    }
    for (const run of runs.values()) {
      if (!TERMINAL_STATES.has(run.status)) {
        run.status = "failed";
        run.completedAt = now().toISOString();
        run.updatedAt = run.completedAt;
        run.error = { code: "SERVER_RESTART", message: "The Local Brain restarted before this benchmark reached a terminal state." };
        appendEventInMemory(run, "failed", { error: run.error }, now);
        await persist(run);
      }
    }
    await persistIndex();
    ready = true;
  }

  async function createRun(input) {
    await initialize();
    const timestamp = now().toISOString();
    const runId = `bench-${timestamp.replace(/[-:.TZ]/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`;
    const run = {
      schemaVersion: "benchmark.lab_run.v1",
      runId,
      requestKey: input.requestKey,
      model: input.model,
      suiteId: input.suiteId,
      suiteName: input.suiteName,
      mode: input.mode,
      trialCount: input.trialCount,
      status: "queued",
      phase: "queued",
      progress: { completedTrials: 0, totalTrials: input.trialCount, percent: 0 },
      createdAt: timestamp,
      updatedAt: timestamp,
      startedAt: null,
      completedAt: null,
      result: null,
      error: null,
      events: []
    };
    appendEventInMemory(run, "queued", { phase: "queued" }, now);
    runs.set(runId, run);
    await persist(run);
    await persistIndex();
    return clone(run);
  }

  async function updateRun(runId, patch) {
    await initialize();
    const run = requireRun(runId);
    Object.assign(run, clone(patch), { updatedAt: now().toISOString() });
    await persist(run);
    await persistIndex();
    return clone(run);
  }

  async function appendEvent(runId, type, data = {}) {
    await initialize();
    const run = requireRun(runId);
    const event = appendEventInMemory(run, type, data, now);
    run.updatedAt = event.timestamp;
    await persist(run);
    await persistIndex();
    return clone(event);
  }

  async function getRun(runId) {
    await initialize();
    return clone(requireRun(runId));
  }

  async function listRuns(limit = 50) {
    await initialize();
    const normalizedLimit = Math.max(1, Math.min(Number(limit) || 50, 100));
    const sorted = [...runs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { ok: true, runs: sorted.slice(0, normalizedLimit).map(summarizeRun) };
  }

  async function findByRequestKey(requestKey) {
    await initialize();
    const match = [...runs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .find((run) => run.requestKey === requestKey && !TERMINAL_STATES.has(run.status));
    return match ? clone(match) : null;
  }

  function requireRun(runId) {
    const run = runs.get(runId);
    if (!run) {
      const error = new Error(`No benchmark run matched '${runId}'.`);
      error.code = "BENCHMARK_RUN_NOT_FOUND";
      error.statusCode = 404;
      throw error;
    }
    return run;
  }

  async function persist(run) {
    const target = path.join(runDir, `${safeRunId(run.runId)}.local.json`);
    const temp = `${target}.${process.pid}.tmp`;
    await writeFile(temp, `${JSON.stringify(run, null, 2)}\n`, "utf8");
    await rename(temp, target);
  }

  async function persistIndex() {
    const target = path.join(runDir, INDEX_FILE);
    const temp = `${target}.${process.pid}.tmp`;
    const sorted = [...runs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, MAX_RUNS);
    await writeFile(temp, `${JSON.stringify({ schemaVersion: "benchmark.lab_run_index.v1", runs: sorted.map(summarizeRun) }, null, 2)}\n`, "utf8");
    await rename(temp, target);
  }

  return { initialize, createRun, updateRun, appendEvent, getRun, listRuns, findByRequestKey };
}

function appendEventInMemory(run, type, data, now) {
  const sequence = (run.events.at(-1)?.sequence || 0) + 1;
  const event = { schemaVersion: "benchmark.worker_event.v1", sequence, type, timestamp: now().toISOString(), data: clone(data) };
  run.events.push(event);
  if (run.events.length > MAX_EVENTS) run.events.splice(0, run.events.length - MAX_EVENTS);
  return event;
}

function summarizeRun(run) {
  return {
    runId: run.runId,
    model: run.model,
    modelName: run.model && run.model.runtimeModelName,
    suiteId: run.suiteId,
    suiteName: run.suiteName,
    mode: run.mode,
    trialCount: run.trialCount,
    status: run.status,
    phase: run.phase,
    progress: run.progress,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    result: run.result,
    error: run.error
  };
}

function safeRunId(runId) {
  if (!/^[a-z0-9-]{8,100}$/i.test(runId)) throw new Error("Unsafe benchmark run id.");
  return runId;
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

module.exports = { createBenchmarkRunStore, TERMINAL_STATES };
