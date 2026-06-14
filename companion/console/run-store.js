const { randomUUID } = require("node:crypto");
const { mkdir, readFile, writeFile } = require("node:fs/promises");
const path = require("node:path");

const REPO_ROOT = path.join(__dirname, "..", "..");
const DEFAULT_VALIDATION_DIR = path.join(REPO_ROOT, "data", "validation");
const INDEX_FILE_NAME = "console-runs.index.local.json";
const MAX_INDEX_RUNS = 100;

function createRunStore(options = {}) {
  const validationDir = options.validationDir || DEFAULT_VALIDATION_DIR;
  const indexPath = path.join(validationDir, INDEX_FILE_NAME);
  const runs = new Map();
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

  async function createRun({ url, mode }) {
    await ensureReady();

    const now = new Date().toISOString();
    const runId = createValidationRunId();
    const run = {
      runId,
      workflow: "lighthouse_handoff_validation",
      url,
      mode,
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
      error: null
    };

    runs.set(runId, run);
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

  async function writeJsonArtifact(runId, kind, value) {
    await ensureReady();
    const artifactPath = path.join(validationDir, `console-${runId}-${kind}.local.json`);
    await writeFile(artifactPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    return toRepoRelativePath(artifactPath);
  }

  async function writeTextArtifact(runId, kind, value) {
    await ensureReady();
    const artifactPath = path.join(validationDir, `console-${runId}-${kind}.local.md`);
    await writeFile(artifactPath, `${String(value || "")}\n`, "utf8");
    return toRepoRelativePath(artifactPath);
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
      return {
        ok: true,
        run: clone(await getRunForUpdate(runId))
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          code: "RUN_NOT_FOUND",
          message: `No validation run matched '${runId}'.`,
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
    writeJsonArtifact,
    writeTextArtifact,
    listRuns,
    getRun
  };

  async function getRunForUpdate(runId) {
    if (runs.has(runId)) {
      return runs.get(runId);
    }

    const summary = index.find((item) => item.runId === runId);

    if (!summary || !summary.artifactPath) {
      throw new Error("Run not found.");
    }

    const stored = JSON.parse(await readFile(path.join(REPO_ROOT, summary.artifactPath), "utf8"));
    runs.set(runId, stored);
    return stored;
  }

  async function persistRun(run) {
    const runPath = path.join(validationDir, `console-${run.runId}.local.json`);
    await writeFile(runPath, `${JSON.stringify(run, null, 2)}\n`, "utf8");
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

  function buildRunSummary(run) {
    const runPath = path.join(validationDir, `console-${run.runId}.local.json`);

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
      weakestCategory: run.result ? run.result.weakestCategory : null,
      weakestScore: run.result ? run.result.weakestScore : null,
      provider: run.result ? run.result.provider : null,
      model: run.result ? run.result.model : null,
      memoryUsed: run.result ? run.result.memoryUsed : null,
      schemaValid: run.result ? run.result.schemaValid : null,
      warnings: run.warnings.slice(0, 5),
      artifactPath: toRepoRelativePath(runPath)
    };
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
  DEFAULT_VALIDATION_DIR
};
