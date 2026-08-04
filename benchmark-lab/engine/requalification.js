const { runSuite } = require("./runners/suite-runner");
const { aggregateRuns } = require("./aggregation");

async function runRequalification({
  suitePath,
  modelManifest = null,
  trialCount = 5,
  runIdPrefix = null,
  aggregationId = null,
  now = () => new Date(),
  policy = {}
}) {
  if (!suitePath) {
    throw new Error("Requalification requires a suite path.");
  }

  if (!Number.isInteger(trialCount) || trialCount < 1) {
    throw new Error("Requalification trial count must be a positive integer.");
  }

  const prefix = runIdPrefix || `requal-${Date.now()}`;
  const runs = [];

  for (let index = 1; index <= trialCount; index += 1) {
    const runId = `${prefix}-${String(index).padStart(2, "0")}`;
    runs.push(await runSuite({
      suitePath,
      modelManifest,
      runId,
      now
    }));
  }

  const aggregation = await aggregateRuns({
    runIds: runs.map((run) => run.runId),
    aggregationId: aggregationId || `aggregation-${prefix}`,
    now,
    policy
  });

  return {
    runIds: runs.map((run) => run.runId),
    runs,
    aggregation
  };
}

module.exports = {
  runRequalification
};
