const { readdir, readFile } = require("node:fs/promises");
const path = require("node:path");

const DEFAULT_MANIFEST_DIR = path.resolve(__dirname, "..", "..", "benchmark-lab", "models", "manifests");
const QUALIFICATION_ORDER = ["rejected", "stale", "screening", "conditional", "qualified"];

function createModelInventory(options = {}) {
  const runtime = options.runtime;
  const qualificationLoader = options.qualificationLoader || null;
  const runStore = options.runStore || null;
  const manifestDir = options.manifestDir || DEFAULT_MANIFEST_DIR;

  if (!runtime) throw new Error("Model inventory requires an Ollama runtime.");

  async function listModels() {
    const [installed, loaded, manifests, recentRuns] = await Promise.all([
      runtime.listModelDetails(),
      runtime.listRunningModels().catch(() => []),
      loadManifests(manifestDir),
      runStore ? runStore.listRuns(100).then((result) => result.runs || []) : []
    ]);
    const loadedByName = new Map(loaded.map((model) => [normalizeModelName(model.name), model]));

    return installed.map((model) => {
      const manifest = findManifest(manifests, model.name);
      const running = loadedByName.get(normalizeModelName(model.name)) || null;
      const digestMatch = manifest && manifest.digest
        ? normalizeDigest(manifest.digest) === normalizeDigest(model.digest)
        : null;
      const qualifications = summarizeQualifications(manifest, qualificationLoader);
      const latestRun = recentRuns.find((run) => normalizeModelName(run.model && run.model.runtimeModelName || run.modelName) === normalizeModelName(model.name));

      return {
        id: model.name,
        runtime: "ollama",
        runtimeState: "online",
        installationState: "installed",
        loadState: running ? "loaded" : "unloaded",
        loadabilityState: manifest && digestMatch !== false ? "ready" : digestMatch === false ? "blocked" : "unknown",
        manifestState: manifest ? digestMatch === false ? "stale" : "registered" : "unregistered",
        qualificationState: qualifications.state,
        name: model.name,
        family: model.family,
        families: model.families,
        parameterSize: model.parameterSize,
        quantizationLevel: model.quantizationLevel,
        format: model.format,
        sizeBytes: model.sizeBytes,
        modifiedAt: model.modifiedAt,
        digest: model.digest,
        manifest: manifest ? {
          id: manifest.modelId,
          displayName: manifest.displayName,
          runtimeModelName: manifest.runtimeModelName,
          digest: normalizeDigest(manifest.digest),
          digestMatch,
          capabilities: manifest.capabilities || []
        } : null,
        loaded: running ? {
          sizeBytes: running.sizeBytes,
          sizeVramBytes: running.sizeVramBytes,
          expiresAt: running.expiresAt,
          contextLength: running.contextLength,
          digest: running.digest
        } : null,
        qualifications: qualifications.items,
        latestRun: latestRun ? summarizeRun(latestRun) : null
      };
    });
  }

  async function getModel(modelId, options = {}) {
    const models = await listModels();
    const model = models.find((item) => item.id === modelId);
    if (!model) throw inventoryError("MODEL_NOT_INSTALLED", `Model '${modelId}' is not installed.`, 404);
    if (options.includeDetails === false) return model;

    const details = await runtime.showModel(model.name);
    return {
      ...model,
      details: {
        capabilities: Array.isArray(details.capabilities) ? details.capabilities : [],
        family: details.details && details.details.family || model.family,
        families: details.details && details.details.families || model.families,
        parameterSize: details.details && details.details.parameter_size || model.parameterSize,
        quantizationLevel: details.details && details.details.quantization_level || model.quantizationLevel,
        format: details.details && details.details.format || model.format,
        parentModel: details.details && details.details.parent_model || null,
        license: typeof details.license === "string" ? details.license.slice(0, 500) : null
      }
    };
  }

  async function load(modelId, keepAlive = "5m") {
    const model = await getModel(modelId, { includeDetails: false });
    if (model.loadabilityState === "blocked") {
      throw inventoryError("MODEL_DIGEST_MISMATCH", `Installed digest does not match manifest '${model.manifest.id}'.`, 409);
    }
    await runtime.loadModel(model.name, { keepAlive });
    return getModel(model.id, { includeDetails: false });
  }

  async function unload(modelId) {
    const model = await getModel(modelId, { includeDetails: false });
    await runtime.unloadModel(model.name);
    return getModel(model.id, { includeDetails: false });
  }

  async function assertQualificationReady(modelId) {
    const model = await getModel(modelId, { includeDetails: false });
    if (!model.manifest) throw inventoryError("MODEL_MANIFEST_REQUIRED", "Qualification mode requires a registered model manifest.", 409);
    if (!model.manifest.digest) throw inventoryError("MODEL_DIGEST_REQUIRED", "Qualification mode requires a manifest-pinned digest.", 409);
    if (model.manifest.digestMatch !== true) throw inventoryError("MODEL_DIGEST_MISMATCH", "Installed model digest does not match the registered manifest.", 409);
    return model;
  }

  return { listModels, getModel, load, unload, assertQualificationReady };
}

async function loadManifests(manifestDir) {
  let entries;
  try {
    entries = await readdir(manifestDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const manifests = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    try {
      const parsed = JSON.parse(await readFile(path.join(manifestDir, entry.name), "utf8"));
      if (parsed && parsed.modelId && parsed.runtime === "ollama" && parsed.runtimeModelName) manifests.push(parsed);
    } catch {
      // Invalid manifests are excluded from the executable allowlist.
    }
  }
  return manifests;
}

function findManifest(manifests, modelName) {
  const normalized = normalizeModelName(modelName);
  return manifests.find((manifest) => normalizeModelName(manifest.runtimeModelName) === normalized) || null;
}

function summarizeQualifications(manifest, loader) {
  const items = [];
  if (manifest && manifest.qualifications) {
    for (const [trackId, roles] of Object.entries(manifest.qualifications)) {
      for (const [role, state] of Object.entries(roles || {})) items.push({ trackId, role, state, source: "manifest" });
    }
  }
  if (manifest && loader) {
    for (const record of loader.findByModel(manifest.modelId)) {
      for (const entry of record.qualifiedFor || []) {
        items.push({ trackId: entry.trackId, role: entry.role, state: entry.status, recordId: record.recordId, source: "record" });
      }
    }
  }
  const states = items.map((item) => item.state);
  const state = QUALIFICATION_ORDER.slice().reverse().find((candidate) => states.includes(candidate)) || "untested";
  return { state, items };
}

function summarizeRun(run) {
  return {
    runId: run.runId,
    suiteId: run.suiteId,
    mode: run.mode,
    status: run.status,
    createdAt: run.createdAt,
    completedAt: run.completedAt,
    passRate: run.result && run.result.metrics ? run.result.metrics.passRate : null
  };
}

function normalizeModelName(value) {
  return String(value || "").trim().toLowerCase().replace(/:latest$/, "");
}

function normalizeDigest(value) {
  if (!value) return null;
  const digest = String(value).toLowerCase();
  return /^[a-f0-9]{64}$/.test(digest) ? `sha256:${digest}` : digest;
}

function inventoryError(code, message, statusCode) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

module.exports = { createModelInventory, loadManifests, normalizeModelName, normalizeDigest };
