#!/usr/bin/env node
const readline = require("node:readline");
const path = require("node:path");
const { runSuite } = require("./runners/suite-runner");
const { aggregateRuns } = require("./aggregation");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SUITE_ROOT = path.join(REPO_ROOT, "benchmark-lab", "locaily", "tracks");

async function main() {
  const request = await readRequest();
  validateRequest(request);
  const suitePath = path.resolve(REPO_ROOT, "benchmark-lab", request.suiteRelativePath);
  if (!suitePath.startsWith(`${SUITE_ROOT}${path.sep}`)) throw workerError("SUITE_PATH_REJECTED", "Suite path is outside the allowlisted catalog root.");

  const startedAt = Date.now();
  emit("started", { runId: request.runId, mode: request.mode, trialCount: request.trialCount });
  emit("phase", { phase: "running", completedTrials: 0, totalTrials: request.trialCount });
  const runs = [];
  for (let index = 1; index <= request.trialCount; index += 1) {
    emit("trial-started", { trial: index, totalTrials: request.trialCount });
    const trialStartedAt = Date.now();
    const run = await runSuite({
      suitePath,
      modelManifest: request.modelManifestId,
      runtimeBaseUrl: request.runtimeBaseUrl,
      runId: `${request.runId}-${String(index).padStart(2, "0")}`,
      onCaseComplete(caseResult) {
        emit("case-completed", {
          trial: index,
          totalTrials: request.trialCount,
          ...caseResult,
          overallCompletedCases: ((index - 1) * caseResult.caseCount) + caseResult.caseIndex,
          overallCaseCount: request.trialCount * caseResult.caseCount
        });
      }
    });
    runs.push(run);
    emit("trial-completed", {
      trial: index,
      totalTrials: request.trialCount,
      passed: run.summary.passed,
      failed: run.summary.failed,
      errors: run.summary.errors,
      timeouts: run.summary.timeouts,
      malformed: run.summary.malformed,
      durationMs: Date.now() - trialStartedAt
    });
  }

  emit("phase", { phase: "aggregating", completedTrials: request.trialCount, totalTrials: request.trialCount });
  const aggregationResult = await aggregateRuns({
    runIds: runs.map((run) => run.runId),
    aggregationId: `interactive-${request.runId}`
  });
  emit("completed", {
    result: buildResult(request, runs, aggregationResult.aggregation, Date.now() - startedAt)
  });
}

function buildResult(request, runs, aggregation, durationMs) {
  const semanticFailureCodes = [...new Set(runs.flatMap((run) => run.summary.caseResults)
    .flatMap((item) => item.checks || [])
    .filter((check) => check.status === "fail" && check.code)
    .map((check) => check.code))].sort();
  const strata = {};
  for (const result of aggregation.caseResults || []) {
    if (!strata[result.difficulty]) strata[result.difficulty] = { trialCount: 0, passed: 0, failed: 0, criticalFailureCount: 0 };
    strata[result.difficulty].trialCount += result.trialCount;
    strata[result.difficulty].passed += result.passed;
    strata[result.difficulty].failed += result.failed;
    strata[result.difficulty].criticalFailureCount += result.criticalFailureCount;
  }
  return {
    schemaVersion: "benchmark.lab_result.v1",
    mode: request.mode,
    runIds: aggregation.runIds,
    suiteId: aggregation.suiteId,
    trackId: aggregation.trackId,
    contractId: aggregation.contractId,
    metrics: aggregation.metrics,
    difficultyStrata: aggregation.difficultyStrata,
    strata,
    semanticFailureCodes,
    provenance: aggregation.provenance,
    qualificationGate: aggregation.qualificationGate,
    runtimeMetrics: {
      durationMs,
      averageTrialDurationMs: Math.round(durationMs / Math.max(1, runs.length)),
      independentRunCount: aggregation.independentRunCount
    }
  };
}

function readRequest() {
  return new Promise((resolve, reject) => {
    const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
    let settled = false;
    input.once("line", (line) => {
      settled = true;
      try { resolve(JSON.parse(line)); } catch { reject(workerError("WORKER_REQUEST_INVALID_JSON", "Worker request was not valid JSON.")); }
      input.close();
    });
    input.once("close", () => { if (!settled) reject(workerError("WORKER_REQUEST_MISSING", "Worker request was missing.")); });
  });
}

function validateRequest(request) {
  if (!request || request.schemaVersion !== "benchmark.worker_request.v1") throw workerError("WORKER_REQUEST_INVALID", "Unsupported worker request schema.");
  if (!/^[a-z0-9-]{8,100}$/i.test(request.runId || "")) throw workerError("WORKER_REQUEST_INVALID", "Invalid run id.");
  if (!/^[a-z0-9._-]{1,100}$/i.test(request.modelManifestId || "")) throw workerError("WORKER_REQUEST_INVALID", "Invalid model manifest id.");
  if (!Number.isInteger(request.trialCount) || request.trialCount < 1 || request.trialCount > 10) throw workerError("WORKER_REQUEST_INVALID", "Trial count must be between 1 and 10.");
  if (!["quick", "qualification"].includes(request.mode)) throw workerError("WORKER_REQUEST_INVALID", "Unsupported benchmark mode.");
  assertLoopbackUrl(request.runtimeBaseUrl);
}

function assertLoopbackUrl(value) {
  let parsed;
  try { parsed = new URL(value); } catch { throw workerError("WORKER_REQUEST_INVALID", "Runtime base URL is invalid."); }
  if (parsed.protocol !== "http:" || !["127.0.0.1", "localhost", "::1", "[::1]"].includes(parsed.hostname)) {
    throw workerError("WORKER_REQUEST_INVALID", "Runtime base URL must be loopback HTTP.");
  }
}

function emit(type, data) {
  process.stdout.write(`${JSON.stringify({ schemaVersion: "benchmark.worker_event.v1", type, timestamp: new Date().toISOString(), data })}\n`);
}

function workerError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

main().catch((error) => {
  emit("failed", { error: { code: error.code || "BENCHMARK_WORKER_FAILED", message: error.message || "Benchmark worker failed." } });
  process.exitCode = 1;
});
