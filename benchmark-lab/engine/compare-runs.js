const path = require("node:path");
const { readJson, writeJson } = require("./fs-utils");
const { validateSchema } = require("./schema-validator");

const LAB_ROOT = path.resolve(__dirname, "..");
const SUMMARY_SCHEMA_PATH = path.join(LAB_ROOT, "schemas", "benchmark-run-summary.schema.json");
const COMPARISON_SCHEMA_PATH = path.join(LAB_ROOT, "schemas", "benchmark-comparison.schema.json");

async function compareRuns({ leftRunId, rightRunId, comparisonId, now = () => new Date() }) {
  if (!leftRunId || !rightRunId) {
    throw new Error("Comparison requires --left and --right run ids.");
  }

  const summarySchema = await readJson(SUMMARY_SCHEMA_PATH);
  const comparisonSchema = await readJson(COMPARISON_SCHEMA_PATH);
  const left = await readJson(getDraftSummaryPath(leftRunId));
  const right = await readJson(getDraftSummaryPath(rightRunId));

  assertValid(validateSchema(left, summarySchema, "leftSummary"), "Left summary is invalid.");
  assertValid(validateSchema(right, summarySchema, "rightSummary"), "Right summary is invalid.");

  const comparison = buildComparison({
    comparisonId: comparisonId || `comparison-${leftRunId}-vs-${rightRunId}`,
    createdAt: now().toISOString(),
    left,
    right
  });

  assertValid(validateSchema(comparison, comparisonSchema, "comparison"), "Comparison is invalid.");

  const comparisonPath = path.join(LAB_ROOT, "reports", "drafts", "comparisons", `${comparison.comparisonId}.json`);
  await writeJson(comparisonPath, comparison);

  return {
    comparisonId: comparison.comparisonId,
    comparisonPath,
    comparison
  };
}

function buildComparison({ comparisonId, createdAt, left, right }) {
  const differences = buildDifferences(left, right);
  const caseDeltas = buildCaseDeltas(left.caseResults, right.caseResults);

  return {
    schemaVersion: "benchmark.comparison.v1",
    comparisonId,
    createdAt,
    leftRunId: left.runId,
    rightRunId: right.runId,
    comparable: differences.every((difference) => !difference.invalidating),
    differences,
    metrics: {
      left: extractMetrics(left),
      right: extractMetrics(right),
      delta: buildMetricDelta(extractMetrics(left), extractMetrics(right))
    },
    caseDeltas
  };
}

function buildDifferences(left, right) {
  const fields = [
    "suiteId",
    "trackId",
    "contractId",
    "runtime.provider",
    "caseCount"
  ];

  return fields.flatMap((field) => {
    const leftValue = getPath(left, field);
    const rightValue = getPath(right, field);

    if (leftValue === rightValue) {
      return [];
    }

    return [{
      field,
      left: String(leftValue),
      right: String(rightValue),
      invalidating: true
    }];
  });
}

function buildCaseDeltas(leftCases, rightCases) {
  const rightByCaseId = new Map(rightCases.map((result) => [result.caseId, result]));
  const deltas = [];

  for (const leftCase of leftCases) {
    const rightCase = rightByCaseId.get(leftCase.caseId);

    deltas.push({
      caseId: leftCase.caseId,
      leftVerdict: leftCase.verdict,
      rightVerdict: rightCase ? rightCase.verdict : "MISSING",
      changed: !rightCase || leftCase.verdict !== rightCase.verdict
    });
  }

  for (const rightCase of rightCases) {
    if (!leftCases.some((leftCase) => leftCase.caseId === rightCase.caseId)) {
      deltas.push({
        caseId: rightCase.caseId,
        leftVerdict: "MISSING",
        rightVerdict: rightCase.verdict,
        changed: true
      });
    }
  }

  return deltas;
}

function extractMetrics(summary) {
  return {
    caseCount: summary.caseCount,
    passed: summary.passed,
    failed: summary.failed,
    errors: summary.errors,
    timeouts: summary.timeouts,
    malformed: summary.malformed,
    passRate: summary.caseCount === 0 ? 0 : round(summary.passed / summary.caseCount)
  };
}

function buildMetricDelta(left, right) {
  return {
    passed: right.passed - left.passed,
    failed: right.failed - left.failed,
    errors: right.errors - left.errors,
    timeouts: right.timeouts - left.timeouts,
    malformed: right.malformed - left.malformed,
    passRate: round(right.passRate - left.passRate)
  };
}

function getPath(value, dottedPath) {
  return dottedPath.split(".").reduce((current, key) => current && current[key], value);
}

function getDraftSummaryPath(runId) {
  return path.join(LAB_ROOT, "reports", "drafts", runId, "summary.json");
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
  compareRuns,
  buildComparison
};
