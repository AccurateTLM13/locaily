const { createHash } = require("node:crypto");
const path = require("node:path");
const { TERMINAL_STATES } = require("./run-store");

function createBenchmarkController(options = {}) {
  const inventory = options.inventory;
  const catalog = options.catalog;
  const runStore = options.runStore;
  const workerClient = options.workerClient;
  const runtimeBaseUrl = options.runtimeBaseUrl || "http://127.0.0.1:11434";
  const subscribers = new Map();
  const workers = new Map();
  let activeRunId = null;

  if (!inventory || !catalog || !runStore || !workerClient) throw new Error("Benchmark controller dependencies are required.");

  async function initialize() {
    await runStore.initialize();
  }

  async function preflight(input) {
    const request = validateRunInput(input);
    const [suite, model] = await Promise.all([
      catalog.getSuite(request.suiteId),
      request.mode === "qualification"
        ? inventory.assertQualificationReady(request.modelId)
        : inventory.getModel(request.modelId, { includeDetails: false })
    ]);
    if (!model.manifest) throw controllerError("MODEL_MANIFEST_REQUIRED", "Interactive benchmark runs require a registered model manifest.", 409);
    if (model.loadState !== "loaded") throw controllerError("MODEL_NOT_LOADED", "Load the selected model explicitly before starting a benchmark.", 409);
    return {
      ok: true,
      eligible: true,
      request,
      model: publicModelIdentity(model),
      suite,
      warnings: request.mode === "quick" ? ["Quick mode is screening evidence and cannot qualify a model."] : []
    };
  }

  async function startRun(input) {
    const checked = await preflight(input);
    const requestKey = normalizeRequestKey(input && input.requestKey) || fingerprintRequest(checked.request);
    const duplicate = await runStore.findByRequestKey(requestKey);
    if (duplicate) return { duplicate: true, run: duplicate };
    if (activeRunId) throw controllerError("BENCHMARK_CAPACITY_REACHED", `Benchmark run '${activeRunId}' is already active.`, 409);

    const run = await runStore.createRun({
      requestKey,
      model: checked.model,
      suiteId: checked.suite.id,
      suiteName: checked.suite.name,
      mode: checked.request.mode,
      trialCount: checked.request.trialCount
    });
    activeRunId = run.runId;
    await runStore.updateRun(run.runId, { status: "preflight", phase: "preflight", startedAt: new Date().toISOString() });
    await appendAndPublish(run.runId, "preflight", { model: checked.model, suiteId: checked.suite.id, mode: checked.request.mode });
    startWorker(run.runId, checked);
    return { duplicate: false, run: await runStore.getRun(run.runId) };
  }

  function startWorker(runId, checked) {
    let eventQueue = Promise.resolve();
    let failed = false;
    const handle = workerClient.start({
      runId,
      mode: checked.request.mode,
      trialCount: checked.request.trialCount,
      modelManifestId: checked.model.manifestId,
      suiteRelativePath: checked.suite.relativePath,
      runtimeBaseUrl
    }, {
      onEvent(event) {
        eventQueue = eventQueue.then(() => processWorkerEvent(runId, event)).catch((error) => failRun(runId, error));
      },
      onProtocolError(error) {
        failed = true;
        handle.cancel();
        eventQueue = eventQueue.then(() => failRun(runId, error));
      },
      onError(error) {
        failed = true;
        eventQueue = eventQueue.then(() => failRun(runId, controllerError("WORKER_START_FAILED", error.message, 500)));
      },
      onExit({ code, signal, terminalEvent, stderr }) {
        eventQueue.then(async () => {
          const run = await runStore.getRun(runId).catch(() => null);
          if (!failed && run && !TERMINAL_STATES.has(run.status) && !terminalEvent) {
            await failRun(runId, controllerError("WORKER_EXITED", `Benchmark worker exited before completion (${signal || code}).${stderr ? ` ${stderr.slice(-500)}` : ""}`, 500));
          }
          workers.delete(runId);
          if (activeRunId === runId) activeRunId = null;
        });
      }
    });
    workers.set(runId, handle);
  }

  async function processWorkerEvent(runId, event) {
    if (event.type === "started") {
      await runStore.updateRun(runId, { status: "running", phase: "running" });
    } else if (event.type === "phase") {
      await runStore.updateRun(runId, { phase: event.data.phase });
    } else if (event.type === "trial-completed") {
      const completedTrials = event.data.trial;
      const totalTrials = event.data.totalTrials;
      await runStore.updateRun(runId, {
        status: "running",
        phase: "running",
        progress: { completedTrials, totalTrials, percent: Math.round((completedTrials / totalTrials) * 100) }
      });
    } else if (event.type === "case-completed") {
      const completedCases = event.data.overallCompletedCases;
      const totalCases = event.data.overallCaseCount;
      await runStore.updateRun(runId, {
        status: "running",
        phase: "running",
        progress: {
          completedTrials: event.data.trial - 1,
          totalTrials: event.data.totalTrials,
          completedCases,
          totalCases,
          currentCaseId: event.data.caseId,
          percent: Math.round((completedCases / totalCases) * 100)
        }
      });
    } else if (event.type === "completed") {
      const completedAt = new Date().toISOString();
      await runStore.updateRun(runId, {
        status: "completed",
        phase: "completed",
        progress: { completedTrials: event.data.result.runtimeMetrics.independentRunCount, totalTrials: event.data.result.runtimeMetrics.independentRunCount, percent: 100 },
        result: event.data.result,
        completedAt
      });
      if (activeRunId === runId) activeRunId = null;
    } else if (event.type === "failed") {
      await failRun(runId, controllerError(event.data.error && event.data.error.code || "BENCHMARK_FAILED", event.data.error && event.data.error.message || "Benchmark failed.", 500), false);
    }
    await appendAndPublish(runId, event.type, event.data);
  }

  async function failRun(runId, error, publish = true) {
    const run = await runStore.getRun(runId).catch(() => null);
    if (!run || TERMINAL_STATES.has(run.status)) return;
    const safeError = { code: error.code || "BENCHMARK_FAILED", message: error.message || "Benchmark failed." };
    await runStore.updateRun(runId, { status: "failed", phase: "failed", error: safeError, completedAt: new Date().toISOString() });
    if (publish) await appendAndPublish(runId, "failed", { error: safeError });
    if (activeRunId === runId) activeRunId = null;
  }

  async function cancelRun(runId) {
    const run = await runStore.getRun(runId);
    if (TERMINAL_STATES.has(run.status)) throw controllerError("RUN_ALREADY_TERMINAL", `Run '${runId}' is already ${run.status}.`, 409);
    const handle = workers.get(runId);
    if (handle) handle.cancel();
    const completedAt = new Date().toISOString();
    await runStore.updateRun(runId, { status: "cancelled", phase: "cancelled", completedAt, error: { code: "CANCELLED_BY_OPERATOR", message: "Benchmark cancelled by the local operator." } });
    await appendAndPublish(runId, "cancelled", { reason: "operator" });
    workers.delete(runId);
    if (activeRunId === runId) activeRunId = null;
    return runStore.getRun(runId);
  }

  async function loadModel(modelId, keepAlive) {
    return inventory.load(modelId, keepAlive);
  }

  async function unloadModel(modelId) {
    if (activeRunId) {
      const active = await runStore.getRun(activeRunId);
      if (active.model.runtimeModelName === modelId) throw controllerError("MODEL_IN_USE", `Model is in use by '${activeRunId}'.`, 409);
    }
    return inventory.unload(modelId);
  }

  async function listEvents(runId, afterSequence = 0) {
    const run = await runStore.getRun(runId);
    return run.events.filter((event) => event.sequence > afterSequence);
  }

  function subscribe(runId, listener) {
    if (!subscribers.has(runId)) subscribers.set(runId, new Set());
    subscribers.get(runId).add(listener);
    return () => {
      const listeners = subscribers.get(runId);
      if (!listeners) return;
      listeners.delete(listener);
      if (listeners.size === 0) subscribers.delete(runId);
    };
  }

  async function appendAndPublish(runId, type, data) {
    const event = await runStore.appendEvent(runId, type, data);
    for (const listener of subscribers.get(runId) || []) listener(event);
    return event;
  }

  return {
    initialize,
    preflight,
    startRun,
    cancelRun,
    listEvents,
    subscribe,
    listRuns: (limit) => runStore.listRuns(limit),
    getRun: (runId) => runStore.getRun(runId),
    listModels: () => inventory.listModels(),
    getModel: (modelId) => inventory.getModel(modelId),
    loadModel,
    unloadModel,
    listSuites: () => catalog.listSuites(),
    getActiveRunId: () => activeRunId
  };
}

function validateRunInput(input) {
  const modelId = input && input.modelId;
  const suiteId = input && input.suiteId;
  const mode = input && input.mode || "quick";
  if (typeof modelId !== "string" || !modelId.trim() || modelId.length > 300) throw controllerError("MODEL_REQUIRED", "Select an installed model.", 400);
  if (!/^[a-z0-9._-]{1,120}$/i.test(suiteId || "")) throw controllerError("SUITE_REQUIRED", "Select a catalog benchmark suite.", 400);
  if (!["quick", "qualification"].includes(mode)) throw controllerError("MODE_INVALID", "Mode must be quick or qualification.", 400);
  const defaultTrials = mode === "qualification" ? 5 : 1;
  const trialCount = input && input.trialCount == null ? defaultTrials : Number(input.trialCount);
  if (!Number.isInteger(trialCount) || trialCount < 1 || trialCount > 10) throw controllerError("TRIAL_COUNT_INVALID", "Trial count must be between 1 and 10.", 400);
  if (mode === "quick" && trialCount !== 1) throw controllerError("TRIAL_COUNT_INVALID", "Quick mode always runs one trial.", 400);
  return { modelId, suiteId, mode, trialCount };
}

function publicModelIdentity(model) {
  return {
    runtimeModelName: model.name,
    runtimeDigest: model.digest,
    manifestId: model.manifest && model.manifest.id,
    manifestDigest: model.manifest && model.manifest.digest,
    digestMatch: model.manifest && model.manifest.digestMatch,
    loadState: model.loadState,
    qualificationState: model.qualificationState
  };
}

function fingerprintRequest(request) {
  return createHash("sha256").update(JSON.stringify(request)).digest("hex");
}

function normalizeRequestKey(value) {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !/^[a-z0-9._:-]{8,120}$/i.test(value)) throw controllerError("REQUEST_KEY_INVALID", "requestKey must be 8-120 safe characters.", 400);
  return value;
}

function controllerError(code, message, statusCode) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

module.exports = { createBenchmarkController, validateRunInput };
