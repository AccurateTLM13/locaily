const path = require("node:path");
const { readJson, writeJson } = require("./fs-utils");
const { validateSchema } = require("./schema-validator");

const LAB_ROOT = path.resolve(__dirname, "..");
const SUMMARY_SCHEMA_PATH = path.join(LAB_ROOT, "schemas", "benchmark-run-summary.schema.json");
const AGGREGATION_SCHEMA_PATH = path.join(LAB_ROOT, "schemas", "benchmark-aggregation.schema.json");

const DEFAULT_QUALIFICATION_POLICY = Object.freeze({
  minScoredTrials: 20,
  minDifficultyStrata: 3,
  minIndependentRuns: 3,
  maxCriticalFailures: 0,
  requireSemanticScorer: true,
  requireDeclaredPrompt: true,
  requireModelIdentity: true,
  requireRuntimeVersion: true,
  requireHardwareProfile: false
});

async function aggregateRuns({ runIds, aggregationId, now = () => new Date(), policy = {} }) {
  if (!Array.isArray(runIds) || runIds.length === 0) {
    throw new Error("Aggregation requires at least one --run id.");
  }

  const summarySchema = await readJson(SUMMARY_SCHEMA_PATH);
  const aggregationSchema = await readJson(AGGREGATION_SCHEMA_PATH);
  const summaries = [];

  for (const runId of runIds) {
    const summary = await readJson(getDraftSummaryPath(runId));
    assertValid(validateSchema(summary, summarySchema, `summary:${runId}`), "Run summary is invalid.");
    summaries.push(summary);
  }

  const aggregation = buildAggregation({
    aggregationId: aggregationId || `aggregation-${runIds.join("-vs-")}`,
    createdAt: now().toISOString(),
    summaries,
    policy
  });
  assertValid(validateSchema(aggregation, aggregationSchema, "aggregation"), "Aggregation is invalid.");

  const aggregationDir = path.join(LAB_ROOT, "reports", "drafts", "aggregations");
  const aggregationPath = path.join(aggregationDir, `${aggregation.aggregationId}.json`);
  await writeJson(aggregationPath, aggregation);

  return {
    aggregationId: aggregation.aggregationId,
    aggregationPath,
    aggregation
  };
}

function buildAggregation({ aggregationId, createdAt, summaries, policy = {} }) {
  if (!Array.isArray(summaries) || summaries.length === 0) {
    throw new Error("Aggregation requires at least one summary.");
  }

  const duplicateRunIds = summaries
    .map((summary) => summary.runId)
    .filter((runId, index, runIds) => runIds.indexOf(runId) !== index);
  if (duplicateRunIds.length > 0) {
    throw new Error(`Aggregation requires independent run ids; duplicates: ${[...new Set(duplicateRunIds)].join(", ")}`);
  }

  const baseline = summaries[0];
  const differences = findAggregationDifferences(baseline, summaries.slice(1));
  if (differences.length > 0) {
    const error = new Error(`Aggregation inputs are incompatible: ${differences.map((difference) => difference.field).join(", ")}`);
    error.differences = differences;
    throw error;
  }

  const caseResults = aggregateCaseResults(summaries);
  const metrics = aggregateMetrics(caseResults.flatMap((result) => result.trials));
  const difficultyStrata = [...new Set(caseResults.map((result) => result.difficulty))].sort();
  const mergedPolicy = { ...DEFAULT_QUALIFICATION_POLICY, ...policy };

  return {
    schemaVersion: "benchmark.aggregation.v1",
    aggregationId,
    createdAt,
    runIds: summaries.map((summary) => summary.runId),
    runCount: summaries.length,
    independentRunCount: summaries.length,
    suiteId: baseline.suiteId,
    trackId: baseline.trackId,
    contractId: baseline.contractId,
    provenance: baseline.provenance,
    metrics,
    difficultyStrata,
    difficultyStrataCount: difficultyStrata.length,
    caseResults: caseResults.map(({ trials, ...result }) => result),
    qualificationGate: evaluateQualificationGate({
      metrics,
      difficultyStrata,
      independentRunCount: summaries.length,
      provenance: baseline.provenance,
      policy: mergedPolicy
    })
  };
}

function findAggregationDifferences(baseline, comparisons) {
  const fields = [
    "suiteId",
    "trackId",
    "contractId",
    "provenance.model.modelId",
    "provenance.model.manifestDigest",
    "provenance.model.runtimeModelName",
    "provenance.model.runtimeModelDigest",
    "provenance.runtime.provider",
    "provenance.runtime.version",
    "provenance.runtime.adapterId",
    "provenance.runtime.adapterVersion",
    "provenance.suite.configDigest",
    "provenance.prompt.id",
    "provenance.prompt.version",
    "provenance.prompt.inputDigest",
    "provenance.scorer.id",
    "provenance.scorer.version",
    "provenance.cases.caseSetDigest",
    "provenance.cases.difficultyStrataDigest",
    "provenance.hardware.profileId"
  ];
  const differences = [];

  for (const summary of [baseline, ...comparisons]) {
    if (!summary.provenance) {
      differences.push({
        field: "provenance",
        left: "present",
        right: "missing",
        invalidating: true
      });
      continue;
    }
  }

  for (const field of fields) {
    const expected = getPath(baseline, field);
    for (const summary of comparisons) {
      const actual = getPath(summary, field);
      if (expected !== actual) {
        differences.push({
          field,
          left: String(expected),
          right: String(actual),
          invalidating: true
        });
      }
    }
  }

  const baselineCaseIds = baseline.caseResults.map((result) => result.caseId).join("|");
  for (const summary of comparisons) {
    const caseIds = summary.caseResults.map((result) => result.caseId).join("|");
    if (baselineCaseIds !== caseIds) {
      differences.push({
        field: "caseResults.caseIds",
        left: baselineCaseIds,
        right: caseIds,
        invalidating: true
      });
    }
  }

  return deduplicateDifferences(differences);
}

function aggregateCaseResults(summaries) {
  const caseOrder = summaries[0].caseResults.map((result) => result.caseId);
  return caseOrder.map((caseId) => {
    const trials = summaries.map((summary) => {
      const result = summary.caseResults.find((caseResult) => caseResult.caseId === caseId);
      if (!result) {
        throw new Error(`Case ${caseId} is missing from an aggregation input.`);
      }
      return result;
    });
    const difficulty = trials[0].difficulty;
    if (!difficulty || trials.some((trial) => trial.difficulty !== difficulty)) {
      throw new Error(`Case ${caseId} has inconsistent or missing difficulty strata.`);
    }

    return {
      caseId,
      difficulty,
      ...aggregateMetrics(trials),
      trials
    };
  });
}

function aggregateMetrics(trials) {
  const trialCount = trials.length;
  const passed = trials.filter((trial) => trial.verdict === "PASS").length;
  const failed = trials.filter((trial) => trial.verdict === "FAIL").length;
  const partial = trials.filter((trial) => trial.verdict === "PARTIAL").length;
  const errors = trials.filter((trial) => trial.verdict === "RUNTIME_ERROR").length;
  const timeouts = trials.filter((trial) => trial.verdict === "TIMEOUT").length;
  const malformed = trials.filter((trial) => trial.verdict === "MALFORMED_OUTPUT").length;
  const scoredTrialCount = trials.filter(isScoredTrial).length;
  const criticalFailureCount = trials.filter(isCriticalFailure).length;

  return {
    trialCount,
    scoredTrialCount,
    passed,
    failed,
    partial,
    errors,
    timeouts,
    malformed,
    criticalFailureCount,
    passRate: calculateRate(passed, trialCount),
    scoredPassRate: calculateRate(passed, scoredTrialCount),
    uncertainty: wilsonInterval(passed, trialCount),
    scoredUncertainty: wilsonInterval(passed, scoredTrialCount)
  };
}

function evaluateQualificationGate({ metrics, difficultyStrata, independentRunCount, provenance, policy }) {
  const reasons = [];
  const model = provenance && provenance.model;
  const runtime = provenance && provenance.runtime;
  const prompt = provenance && provenance.prompt;
  const scorer = provenance && provenance.scorer;
  const hardware = provenance && provenance.hardware;

  if (metrics.scoredTrialCount < policy.minScoredTrials) {
    reasons.push(`Requires at least ${policy.minScoredTrials} scored trials; received ${metrics.scoredTrialCount}.`);
  }
  if (difficultyStrata.length < policy.minDifficultyStrata) {
    reasons.push(`Requires at least ${policy.minDifficultyStrata} difficulty strata; received ${difficultyStrata.length}.`);
  }
  if (independentRunCount < policy.minIndependentRuns) {
    reasons.push(`Requires at least ${policy.minIndependentRuns} independent runs; received ${independentRunCount}.`);
  }
  if (metrics.criticalFailureCount > policy.maxCriticalFailures) {
    reasons.push(`Allows at most ${policy.maxCriticalFailures} critical failures; received ${metrics.criticalFailureCount}.`);
  }
  if (policy.requireSemanticScorer && !scorer) {
    reasons.push("Requires a declared semantic scorer.");
  }
  if (policy.requireDeclaredPrompt && (!prompt || prompt.declared !== true)) {
    reasons.push("Requires a declared prompt contract.");
  }
  if (policy.requireModelIdentity && (!model || !model.modelId || !model.runtimeModelName || !model.manifestDigest)) {
    reasons.push("Requires non-unknown model identity and a manifest fingerprint.");
  }
  if (policy.requireRuntimeVersion && (!runtime || !runtime.version || runtime.version === "unreported")) {
    reasons.push("Requires a reported runtime version.");
  }
  if (policy.requireHardwareProfile && (!hardware || hardware.captured !== true)) {
    reasons.push("Requires a captured hardware profile.");
  }

  return {
    eligible: reasons.length === 0,
    reasons,
    policy
  };
}

function isScoredTrial(trial) {
  return ["PASS", "PARTIAL", "FAIL"].includes(trial.verdict);
}

function isCriticalFailure(trial) {
  if (["RUNTIME_ERROR", "TIMEOUT", "MALFORMED_OUTPUT"].includes(trial.verdict)) {
    return true;
  }

  return trial.checks.some((check) => (
    check.validator === "semantic-scorer" &&
    check.status === "fail" &&
    ["SEMANTIC_SCENARIO_NOT_FOUND", "SEMANTIC_EVALUATOR_ERROR", "SEMANTIC_RESULT_INVALID"].includes(check.code)
  ));
}

function wilsonInterval(successes, trials, confidence = 0.95) {
  if (trials === 0) {
    return {
      method: "wilson",
      confidence,
      lower: null,
      upper: null
    };
  }

  const z = confidence === 0.95 ? 1.959963984540054 : 1.959963984540054;
  const proportion = successes / trials;
  const denominator = 1 + (z * z) / trials;
  const center = (proportion + (z * z) / (2 * trials)) / denominator;
  const margin = (z / denominator) * Math.sqrt((proportion * (1 - proportion) / trials) + (z * z / (4 * trials * trials)));

  return {
    method: "wilson",
    confidence,
    lower: round(Math.max(0, center - margin)),
    upper: round(Math.min(1, center + margin))
  };
}

function calculateRate(numerator, denominator) {
  return denominator === 0 ? 0 : round(numerator / denominator);
}

function getDraftSummaryPath(runId) {
  return path.join(LAB_ROOT, "reports", "drafts", runId, "summary.json");
}

function getPath(value, dottedPath) {
  return dottedPath.split(".").reduce((current, key) => current && current[key], value);
}

function deduplicateDifferences(differences) {
  const seen = new Set();
  return differences.filter((difference) => {
    const key = `${difference.field}|${difference.left}|${difference.right}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function round(value) {
  return Math.round(value * 1000000) / 1000000;
}

function assertValid(validation, message) {
  if (!validation.ok) {
    const error = new Error(`${message} ${validation.errors.join(" ")}`);
    error.validation = validation;
    throw error;
  }
}

module.exports = {
  aggregateRuns,
  buildAggregation,
  aggregateMetrics,
  evaluateQualificationGate,
  wilsonInterval,
  DEFAULT_QUALIFICATION_POLICY
};
