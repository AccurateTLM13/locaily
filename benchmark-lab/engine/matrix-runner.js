const fs = require("node:fs/promises");
const path = require("node:path");
const { runSuite } = require("./runners/suite-runner");
const { readJson, writeJson } = require("./fs-utils");
const { validateSchema } = require("./schema-validator");

const LAB_ROOT = path.resolve(__dirname, "..");
const MANIFEST_DIR = path.join(LAB_ROOT, "models", "manifests");
const SUITE_SCHEMA_PATH = path.join(LAB_ROOT, "schemas", "benchmark-suite.schema.json");
const MODEL_MANIFEST_SCHEMA_PATH = path.join(LAB_ROOT, "schemas", "model-manifest.schema.json");
const MATRIX_SCHEMA_PATH = path.join(LAB_ROOT, "schemas", "benchmark-matrix.schema.json");

async function runMatrix({
  suitePath,
  modelManifests = [],
  matrixId = null,
  now = () => new Date()
}) {
  const suiteFile = path.resolve(suitePath);
  const suiteSchema = await readJson(SUITE_SCHEMA_PATH);
  const manifestSchema = await readJson(MODEL_MANIFEST_SCHEMA_PATH);
  const matrixSchema = await readJson(MATRIX_SCHEMA_PATH);
  const suite = await readJson(suiteFile);

  assertValid(validateSchema(suite, suiteSchema, "suite"), "Suite config is invalid.");

  const manifests = modelManifests.length > 0
    ? await loadSelectedManifests(modelManifests, manifestSchema)
    : await loadAvailableOllamaManifests(manifestSchema);

  if (manifests.length === 0) {
    throw new Error("Matrix requires at least one model manifest.");
  }

  const createdAt = now().toISOString();
  const id = matrixId || `matrix-${suite.suiteId}-${compactTimestamp(createdAt)}`;
  const models = [];
  const summaries = [];

  for (const manifest of manifests) {
    try {
      const result = await runSuite({
        suitePath: suiteFile,
        modelManifest: manifest.modelId,
        runId: `${id}-${sanitizeId(manifest.modelId)}`,
        now
      });
      summaries.push(result.summary);
      models.push(toModelResult({ manifest, summary: result.summary }));
    } catch (error) {
      models.push(toErroredModelResult({ manifest, error }));
    }
  }

  const matrix = {
    schemaVersion: "benchmark.matrix.v1",
    matrixId: id,
    createdAt,
    suiteId: suite.suiteId,
    trackId: suite.trackId,
    contractId: suite.contractId,
    models,
    rankings: buildRankings(models),
    caseMatrix: buildCaseMatrix(summaries, models)
  };

  assertValid(validateSchema(matrix, matrixSchema, "matrix"), "Matrix summary is invalid.");

  const matrixDir = path.join(LAB_ROOT, "reports", "drafts", "matrices");
  const matrixPath = path.join(matrixDir, `${id}.json`);
  const markdownPath = path.join(matrixDir, `${id}.md`);
  const markdown = renderMatrixMarkdown(matrix);

  await writeJson(matrixPath, matrix);
  await writeText(markdownPath, markdown);

  return {
    matrixId: id,
    matrixPath,
    markdownPath,
    matrix,
    markdown
  };
}

async function loadSelectedManifests(modelIds, manifestSchema) {
  const manifests = [];

  for (const modelId of modelIds) {
    const manifest = await readJson(path.join(MANIFEST_DIR, `${modelId}.json`));
    assertValid(validateSchema(manifest, manifestSchema, `modelManifest:${modelId}`), "Model manifest is invalid.");
    manifests.push(manifest);
  }

  return manifests;
}

async function loadAvailableOllamaManifests(manifestSchema) {
  const entries = await fs.readdir(MANIFEST_DIR, { withFileTypes: true });
  const manifests = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }

    const manifest = await readJson(path.join(MANIFEST_DIR, entry.name));
    assertValid(validateSchema(manifest, manifestSchema, `modelManifest:${entry.name}`), "Model manifest is invalid.");

    if (manifest.runtime === "ollama" && manifest.status === "available") {
      manifests.push(manifest);
    }
  }

  return manifests.sort((left, right) => left.modelId.localeCompare(right.modelId));
}

function toModelResult({ manifest, summary }) {
  return {
    modelId: manifest.modelId,
    runtimeModelName: manifest.runtimeModelName,
    status: "completed",
    runId: summary.runId,
    caseCount: summary.caseCount,
    passed: summary.passed,
    failed: summary.failed,
    errors: summary.errors,
    timeouts: summary.timeouts,
    malformed: summary.malformed,
    passRate: summary.caseCount === 0 ? 0 : round(summary.passed / summary.caseCount),
    error: ""
  };
}

function toErroredModelResult({ manifest, error }) {
  return {
    modelId: manifest.modelId,
    runtimeModelName: manifest.runtimeModelName,
    status: "run_error",
    runId: "",
    caseCount: 0,
    passed: 0,
    failed: 0,
    errors: 1,
    timeouts: 0,
    malformed: 0,
    passRate: 0,
    error: error.message
  };
}

function buildRankings(models) {
  return models
    .slice()
    .sort((left, right) => {
      if (right.passRate !== left.passRate) return right.passRate - left.passRate;
      if (right.passed !== left.passed) return right.passed - left.passed;
      if (left.malformed !== right.malformed) return left.malformed - right.malformed;
      if (left.errors !== right.errors) return left.errors - right.errors;
      if (left.timeouts !== right.timeouts) return left.timeouts - right.timeouts;
      if (left.failed !== right.failed) return left.failed - right.failed;
      return left.modelId.localeCompare(right.modelId);
    })
    .map((model, index) => ({
      rank: index + 1,
      modelId: model.modelId,
      passRate: model.passRate,
      passed: model.passed,
      failed: model.failed,
      errors: model.errors,
      timeouts: model.timeouts,
      malformed: model.malformed
    }));
}

function buildCaseMatrix(summaries, models) {
  const caseIds = [];

  for (const summary of summaries) {
    for (const result of summary.caseResults) {
      if (!caseIds.includes(result.caseId)) {
        caseIds.push(result.caseId);
      }
    }
  }

  return caseIds.map((caseId) => {
    const verdicts = {};

    for (const model of models) {
      const summary = summaries.find((item) => item.runtime.modelId === model.modelId);
      const caseResult = summary
        ? summary.caseResults.find((item) => item.caseId === caseId)
        : null;
      verdicts[model.modelId] = caseResult ? caseResult.verdict : "NO_RUN";
    }

    return {
      caseId,
      verdicts
    };
  });
}

function renderMatrixMarkdown(matrix) {
  const lines = [
    `# ${matrix.matrixId}`,
    "",
    `- Suite: ${matrix.suiteId}`,
    `- Track: ${matrix.trackId}`,
    `- Contract: ${matrix.contractId}`,
    `- Created: ${matrix.createdAt}`,
    "",
    "## Rankings",
    "",
    "| Rank | Model | Pass Rate | Passed | Failed | Errors | Timeouts | Malformed | Run |",
    "|---:|---|---:|---:|---:|---:|---:|---:|---|"
  ];

  const byModel = new Map(matrix.models.map((model) => [model.modelId, model]));
  for (const ranking of matrix.rankings) {
    const model = byModel.get(ranking.modelId);
    lines.push([
      ranking.rank,
      ranking.modelId,
      `${Math.round(ranking.passRate * 1000) / 10}%`,
      ranking.passed,
      ranking.failed,
      ranking.errors,
      ranking.timeouts,
      ranking.malformed,
      model && model.runId ? model.runId : model.status
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }

  lines.push("", "## Case Matrix", "");
  lines.push(`| Case | ${matrix.models.map((model) => model.modelId).join(" | ")} |`);
  lines.push(`|---|${matrix.models.map(() => "---").join("|")}|`);

  for (const row of matrix.caseMatrix) {
    lines.push(`| ${row.caseId} | ${matrix.models.map((model) => row.verdicts[model.modelId]).join(" | ")} |`);
  }

  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function writeText(filePath, text) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(`${filePath}.tmp`, text, "utf8");
  await fs.rename(`${filePath}.tmp`, filePath);
}

function compactTimestamp(timestamp) {
  return timestamp.replace(/[-:]/g, "").replace(/\..+$/, "Z");
}

function sanitizeId(value) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

function round(value) {
  return Math.round(value * 10000) / 10000;
}

function assertValid(validation, message) {
  if (!validation.ok) {
    const error = new Error(`${message} ${validation.errors.join(" ")}`);
    error.validation = validation;
    throw error;
  }
}

module.exports = {
  runMatrix,
  buildRankings,
  buildCaseMatrix,
  renderMatrixMarkdown
};
