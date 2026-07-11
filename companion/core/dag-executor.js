const {
  computeDependencyGraph,
  groupByLevel
} = require("./dag-graph");

const DEFAULT_MAX_CONCURRENCY = 4;

function validateDag(track) {
  const graph = computeDependencyGraph(track);
  const errors = [];

  if (graph.cycles.length > 0) {
    errors.push({
      code: "DAG_CYCLE_DETECTED",
      message: `Circular dependency detected: ${graph.cycles.map(c => c.join(" -> ")).join(", ")}`,
      cycles: graph.cycles
    });
  }

  if (graph.missing.length > 0) {
    for (const m of graph.missing) {
      errors.push({
        code: "DAG_MISSING_STEP",
        message: `Step '${m.step}' depends on '${m.dependsOn}' which does not exist: ${m.reason}`
      });
    }
  }

  return { valid: errors.length === 0, graph, errors };
}

function createDagContext(input) {
  return {
    input,
    artifacts: {},
    results: {},
    errors: {},
    startTimes: {},
    endTimes: {},
    stepStatuses: {}
  };
}

async function executeDag({ track, context, stepExecutor, options = {} }) {
  const maxConcurrency = options.maxConcurrency || DEFAULT_MAX_CONCURRENCY;
  const abortOnError = options.abortOnError !== false;

  const validation = validateDag(track);
  if (!validation.valid) {
    return {
      ok: false,
      errors: validation.errors,
      context,
      graph: validation.graph,
      durationMs: 0
    };
  }

  const graph = validation.graph;
  const levels = groupByLevel(graph.stepIds, graph.edges);
  const stepMap = {};
  track.steps.forEach(s => { stepMap[s.id] = s; });

  const startTime = Date.now();

  for (const stepId of graph.sorted) {
    context.stepStatuses[stepId] = "pending";
  }

  const levelKeys = Object.keys(levels).sort((a, b) => Number(a) - Number(b));

  for (const level of levelKeys) {
    const levelStepIds = levels[level];

    if (abortOnError && Object.keys(context.errors).length > 0) break;

    const eligible = levelStepIds.filter(id => context.stepStatuses[id] === "pending");

    if (eligible.length === 0) continue;

    const batch = [];
    for (const stepId of eligible) {
      context.stepStatuses[stepId] = "running";
      context.startTimes[stepId] = Date.now();

      const step = stepMap[stepId];
      if (!step) {
        context.stepStatuses[stepId] = "failed";
        context.errors[stepId] = { code: "STEP_NOT_FOUND", message: `Step '${stepId}' not found in track` };
        continue;
      }

      const promise = executeSingleStep({ step, context, stepExecutor })
        .then(result => {
          context.endTimes[stepId] = Date.now();
          context.results[stepId] = result;

          if (result.ok) {
            context.stepStatuses[stepId] = "completed";
            context.artifacts[stepId] = result.output;
          } else {
            context.stepStatuses[stepId] = "failed";
            const errDetail = result.error ? `${result.error.code}: ${result.error.message}` : "no error object";
            context.errors[stepId] = result.error || { code: "STEP_FAILED", message: "Step execution failed: " + errDetail };
          }
        })
        .catch(err => {
          context.endTimes[stepId] = Date.now();
          context.stepStatuses[stepId] = "failed";
          context.errors[stepId] = { code: "STEP_EXCEPTION", message: err.message };
        });

      batch.push(promise);
    }

    await Promise.allSettled(batch);
  }

  const durationMs = Date.now() - startTime;
  const failed = Object.keys(context.errors);
  const completed = Object.keys(context.results).filter(id => context.stepStatuses[id] === "completed");

  return {
    ok: failed.length === 0,
    context,
    graph,
    durationMs,
    totalSteps: track.steps.length,
    completed: completed.length,
    failed: failed.length,
    errors: context.errors,
    stepOrder: graph.sorted
  };
}

async function executeSingleStep({ step, context, stepExecutor }) {
  if (typeof stepExecutor !== "function") {
    return { ok: false, error: { code: "NO_EXECUTOR", message: "No step executor provided" } };
  }

  try {
    const result = await stepExecutor(step, context);
    return result;
  } catch (err) {
    return { ok: false, error: { code: "EXECUTOR_ERROR", message: err.message, originalCode: err.code } };
  }
}

module.exports = {
  executeDag,
  validateDag,
  createDagContext,
  DEFAULT_MAX_CONCURRENCY
};
