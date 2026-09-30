const { randomUUID } = require("node:crypto");
const { mkdir, readFile, writeFile } = require("node:fs/promises");
const path = require("node:path");
const { slugifyModelId } = require("./model-slug");
const {
  resolveValidationArtifactMode,
  shouldWriteSplitArtifacts,
  shouldWriteBundleArtifacts
} = require("./artifact-mode");
const {
  buildValidationRunBundle,
  mergeBundleIntoRun,
  hasLegacySplitArtifacts,
  artifactKindToField
} = require("./run-bundle");

const REPO_ROOT = path.join(__dirname, "..", "..");
const DEFAULT_VALIDATION_DIR = path.join(REPO_ROOT, "data", "validation");
const INDEX_FILE_NAME = "console-runs.index.local.json";
const MAX_INDEX_RUNS = 100;

function createRunStore(options = {}) {
  const validationDir = options.validationDir || DEFAULT_VALIDATION_DIR;
  const indexPath = path.join(validationDir, INDEX_FILE_NAME);
  const artifactMode = options.artifactMode || resolveValidationArtifactMode(options.env);
  const runs = new Map();
  const artifactBuffers = new Map();
  let indexLoaded = false;
  let index = [];

  async function ensureReady() {
    await mkdir(validationDir, { recursive: true });

    if (indexLoaded) {
      return;
    }

    index = await readIndex(indexPath);
    indexLoaded = true;
  }

  async function createRun({ url, mode, model = null }) {
    await ensureReady();

    const now = new Date().toISOString();
    const runId = createValidationRunId();
    const modelSlug = slugifyModelId(model);
    const run = {
      runId,
      workflow: "lighthouse_handoff_validation",
      url,
      mode,
      model: model || null,
      modelSlug: modelSlug || null,
      status: "queued",
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      durationMs: null,
      steps: buildInitialSteps(mode),
      warnings: [],
      result: null,
      evidence: null,
      artifacts: {},
      bundlePath: null,
      error: null
    };

    runs.set(runId, run);
    artifactBuffers.set(runId, {});
    await persistRun(run);
    await upsertIndex(run);

    return clone(run);
  }

  async function updateRun(runId, updater) {
    await ensureReady();

    const existing = await getRunForUpdate(runId);
    const updated = updater(clone(existing)) || existing;
    updated.updatedAt = new Date().toISOString();

    runs.set(runId, updated);
    await persistRun(updated);
    await upsertIndex(updated);

    return clone(updated);
  }

  async function setStep(runId, stepId, patch) {
    return updateRun(runId, (run) => {
      const step = run.steps.find((item) => item.id === stepId);

      if (!step) {
        return run;
      }

      Object.assign(step, patch);

      if (patch.status === "running" && !step.startedAt) {
        step.startedAt = new Date().toISOString();
      }

      if ((patch.status === "passed" || patch.status === "failed" || patch.status === "warning") && !step.completedAt) {
        step.completedAt = new Date().toISOString();
        step.durationMs = step.startedAt ? Date.now() - Date.parse(step.startedAt) : null;
      }

      return run;
    });
  }

  async function appendWarning(runId, warning) {
    if (!warning) {
      return null;
    }

    return updateRun(runId, (run) => {
      if (!run.warnings.includes(warning)) {
        run.warnings.push(warning);
      }
      return run;
    });
  }

  async function recordJsonArtifact(runId, kind, value) {
    await ensureReady();
    const run = await getRunForUpdate(runId);
    const buffer = getArtifactBuffer(runId);
    buffer[kind] = value;

    let artifactPath = null;

    if (shouldWriteSplitArtifacts(artifactMode)) {
      artifactPath = await writeJsonArtifactFile(run, kind, value);
      run.artifacts[artifactKindToField(kind)] = artifactPath;
      await persistRun(run);
    }

    return artifactPath;
  }

  async function recordTextArtifact(runId, kind, value) {
    await ensureReady();
    const run = await getRunForUpdate(runId);
    const buffer = getArtifactBuffer(runId);
    buffer[kind] = value;

    let artifactPath = null;

    if (shouldWriteSplitArtifacts(artifactMode)) {
      artifactPath = await writeTextArtifactFile(run, kind, value);
      run.artifacts[artifactKindToField(kind)] = artifactPath;
      await persistRun(run);
    }

    return artifactPath;
  }

  async function writeJsonArtifact(runId, kind, value) {
    return recordJsonArtifact(runId, kind, value);
  }

  async function writeTextArtifact(runId, kind, value) {
    return recordTextArtifact(runId, kind, value);
  }

  async function writeRunBundle(runId, bundle) {
    await ensureReady();
    const run = await getRunForUpdate(runId);
    const bundlePath = await writeBundleFile(run, bundle);
    run.bundlePath = bundlePath;
    runs.set(runId, run);
    return bundlePath;
  }

  async function finalizeRunArtifacts(runId, { summary, handoffMarkdown = "" }) {
    await ensureReady();
    const run = await getRunForUpdate(runId);
    const buffered = getArtifactBuffer(runId);
    const artifactPaths = { ...run.artifacts };
    const bundle = buildValidationRunBundle({
      run,
      artifacts: clone(buffered),
      summary,
      handoffMarkdown,
      artifactPaths
    });

    if (shouldWriteBundleArtifacts(artifactMode)) {
      const bundlePath = await writeRunBundle(runId, bundle);
      run.bundlePath = bundlePath;
      artifactPaths.bundle = bundlePath;
    }

    if (!shouldWriteSplitArtifacts(artifactMode)) {
      run.artifacts = artifactPaths.bundle ? { bundle: artifactPaths.bundle } : {};
    } else {
      run.artifacts = artifactPaths;
    }

    run.result = summary && summary.result ? summary.result : run.result;
    run.evidence = summary && summary.evidence ? summary.evidence : run.evidence;
    artifactBuffers.delete(runId);
    await persistRun(run);
    await upsertIndex(run);

    return {
      bundlePath: run.bundlePath || null,
      bundle
    };
  }

  async function listRuns(limit = 50) {
    await ensureReady();
    const normalizedLimit = normalizeLimit(limit);
    return {
      ok: true,
      runs: index.slice(0, normalizedLimit)
    };
  }

  async function getRun(runId) {
    await ensureReady();

    try {
      const stored = await getRunForUpdate(runId);
      const hydrated = await hydrateRunFromStorage(stored);
      return {
        ok: true,
        run: clone(hydrated)
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: error.code || "RUN_NOT_FOUND",
          message: error.message || `No validation run matched '${runId}'.`,
          nextStep: "Open a run from GET /console/runs or start a new validation."
        }
      };
    }
  }

  return {
    createRun,
    updateRun,
    setStep,
    appendWarning,
    recordJsonArtifact,
    recordTextArtifact,
    writeJsonArtifact,
    writeTextArtifact,
    writeRunBundle,
    finalizeRunArtifacts,
    listRuns,
    getRun,
    hydrateRunFromStorage,
    getArtifactMode: () => artifactMode
  };

  function getArtifactBuffer(runId) {
    if (!artifactBuffers.has(runId)) {
      artifactBuffers.set(runId, {});
    }

    return artifactBuffers.get(runId);
  }

  async function getRunForUpdate(runId) {
    if (runs.has(runId)) {
      return runs.get(runId);
    }

    const summary = index.find((item) => item.runId === runId);

    if (!summary || !summary.artifactPath) {
      const error = new Error(`No validation run matched '${runId}'.`);
      error.code = "RUN_NOT_FOUND";
      throw error;
    }

    const stored = JSON.parse(await readFile(path.join(REPO_ROOT, summary.artifactPath), "utf8"));
    runs.set(runId, stored);
    return stored;
  }

  async function hydrateRunFromStorage(run) {
    if (run.bundlePath) {
      try {
        const bundle = await readBundle(run.bundlePath);
        return mergeBundleIntoRun(run, bundle);
      } catch (error) {
        if (hasLegacySplitArtifacts(run)) {
          return run;
        }

        const bundleError = new Error(`Bundle for run '${run.runId}' could not be loaded.`);
        bundleError.code = "BUNDLE_NOT_FOUND";
        bundleError.cause = error;
        throw bundleError;
      }
    }

    return run;
  }

  async function readBundle(bundlePath) {
    const absolutePath = path.isAbsolute(bundlePath)
      ? bundlePath
      : path.join(REPO_ROOT, bundlePath);
    return JSON.parse(await readFile(absolutePath, "utf8"));
  }

  async function persistRun(run) {
    const runPath = path.join(validationDir, `console-${run.runId}.local.json`);
    const thinRun = buildThinRunRecord(run);
    await writeFile(runPath, `${JSON.stringify(thinRun, null, 2)}\n`, "utf8");
  }

  async function upsertIndex(run) {
    const summary = buildRunSummary(run);
    const existingIndex = index.findIndex((item) => item.runId === run.runId);

    if (existingIndex >= 0) {
      index.splice(existingIndex, 1);
    }

    index.unshift(summary);
    index = index.slice(0, MAX_INDEX_RUNS);
    await writeFile(indexPath, `${JSON.stringify({ runs: index }, null, 2)}\n`, "utf8");
  }

  function buildThinRunRecord(run) {
    return {
      runId: run.runId,
      workflow: run.workflow,
      url: run.url,
      mode: run.mode,
      model: run.model || null,
      modelSlug: run.modelSlug || null,
      status: run.status,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      completedAt: run.completedAt,
      durationMs: run.durationMs,
      steps: run.steps,
      warnings: run.warnings,
      result: summarizeResultForThinRecord(run.result),
      evidence: run.bundlePath ? null : (run.evidence || null),
      artifacts: run.artifacts || {},
      bundlePath: run.bundlePath || null,
      error: run.error || null
    };
  }

  function summarizeResultForThinRecord(result) {
    if (!result || typeof result !== "object") {
      return null;
    }

    return {
      weakestCategory: result.weakestCategory,
      weakestScore: result.weakestScore,
      schemaValid: result.schemaValid,
      benchmarkValid: result.benchmarkValid,
      modelMismatch: result.modelMismatch,
      requestedModel: result.requestedModel,
      actualAnalyzeModel: result.actualAnalyzeModel,
      actualComposeModel: result.actualComposeModel,
      provider: result.provider,
      model: result.model,
      memoryUsed: result.memoryUsed,
      durationMs: result.durationMs
    };
  }

  function buildRunSummary(run) {
    const runPath = path.join(validationDir, `console-${run.runId}.local.json`);
    const result = run.result || {};

    return {
      runId: run.runId,
      workflow: run.workflow,
      url: run.url,
      mode: run.mode,
      status: run.status,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      completedAt: run.completedAt,
      durationMs: run.durationMs,
      weakestCategory: result.weakestCategory || null,
      weakestScore: result.weakestScore ?? null,
      provider: result.provider || null,
      model: run.model || result.model || null,
      modelSlug: run.modelSlug || null,
      memoryUsed: result.memoryUsed ?? null,
      schemaValid: result.schemaValid ?? null,
      benchmarkValid: typeof result.benchmarkValid === "boolean" ? result.benchmarkValid : null,
      warnings: run.warnings.slice(0, 5),
      artifactPath: toRepoRelativePath(runPath),
      bundlePath: run.bundlePath || null
    };
  }

  async function writeJsonArtifactFile(run, kind, value) {
    const artifactPath = path.join(validationDir, buildArtifactFileName(run, kind, "json"));
    await writeFile(artifactPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    return toRepoRelativePath(artifactPath);
  }

  async function writeTextArtifactFile(run, kind, value) {
    const artifactPath = path.join(validationDir, buildArtifactFileName(run, kind, "md"));
    await writeFile(artifactPath, `${String(value || "")}\n`, "utf8");
    return toRepoRelativePath(artifactPath);
  }

  async function writeBundleFile(run, bundle) {
    const bundlePath = path.join(validationDir, buildBundleFileName(run));
    await writeFile(bundlePath, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
    return toRepoRelativePath(bundlePath);
  }
}

async function readIndex(indexPath) {
  try {
    const parsed = JSON.parse(await readFile(indexPath, "utf8"));
    return Array.isArray(parsed.runs) ? parsed.runs : [];
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

function buildInitialSteps(mode) {
  const steps = [
    ["preflight", "Preflight checks"],
    ["pagespeed_capture", "Live PageSpeed capture"],
    ["slim_input", "Slim Lighthouse input"],
    ["analyze_report", mode === "standard" ? "Deterministic analyze-report" : "Local Ollama analyze-report"],
    ["model_provenance", "Model provenance check"],
    ["compose_handoff", mode === "l2_ollama_memory" ? "Compose handoff with Memory Bridge" : "Compose handoff"],
    ["schema_validation", "Schema validation"],
    ["metric_preservation", "Metric preservation check"],
    ["privacy_audit", "Privacy/audit check"],
    ["artifact_save", "Save validation artifacts"]
  ];

  return steps.map(([id, label]) => ({
    id,
    label,
    status: "pending",
    startedAt: null,
    completedAt: null,
    durationMs: null,
    message: null,
    error: null
  }));
}

function createValidationRunId() {
  const timestamp = new Date().toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
  return `validation_${timestamp}_${randomUUID().replace(/-/g, "").slice(0, 10)}`;
}

function buildArtifactFileName(run, kind, extension) {
  const modelSuffix = run && run.modelSlug ? `-${run.modelSlug}` : "";
  return `console-${run.runId}${modelSuffix}-${kind}.local.${extension}`;
}

function buildBundleFileName(run) {
  const modelSuffix = run && run.modelSlug ? `-${run.modelSlug}` : "";
  return `console-${run.runId}${modelSuffix}.bundle.local.json`;
}

function toRepoRelativePath(filePath) {
  return path.relative(REPO_ROOT, filePath).replace(/\\/g, "/");
}

function normalizeLimit(limit) {
  const parsed = Number(limit);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return 50;
  }

  return Math.min(parsed, MAX_INDEX_RUNS);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = {
  createRunStore,
  DEFAULT_VALIDATION_DIR,
  buildBundleFileName
};
