#!/usr/bin/env node
const path = require("node:path");
const { runRequalification } = require("../requalification");
const { parseArgs, printHelp } = require("./args");

async function main() {
  const args = parseArgs(process.argv.slice(2), {
    suite: {},
    modelManifest: {},
    trials: {},
    runPrefix: {},
    output: {}
  });

  if (args.help) {
    printHelp({
      command: "npm run benchmark:requalify -- --suite <suite.json> [--model-manifest <id>] [--trials 5]",
      description: "Run independent suite trials and write an aggregation for M2 requalification review.",
      options: [
        { flag: "--suite <path>", description: "Suite config path." },
        { flag: "--model-manifest <id>", description: "Override suite runtime.modelManifest." },
        { flag: "--trials <count>", description: "Independent run count. Defaults to 5." },
        { flag: "--run-prefix <prefix>", description: "Stable prefix for generated run ids." },
        { flag: "--output <id>", description: "Aggregation id to write." },
        { flag: "--help", description: "Show this help." }
      ]
    });
    return;
  }

  if (!args.suite) {
    throw new Error("Requalification requires --suite.");
  }

  const trialCount = args.trials ? Number(args.trials) : 5;
  if (!Number.isInteger(trialCount) || trialCount < 1) {
    throw new Error("--trials must be a positive integer.");
  }

  const result = await runRequalification({
    suitePath: path.resolve(args.suite),
    modelManifest: args.modelManifest || null,
    trialCount,
    runIdPrefix: args.runPrefix || null,
    aggregationId: args.output || null
  });

  console.log(JSON.stringify({
    ok: true,
    runIds: result.runIds,
    aggregationId: result.aggregation.aggregationId,
    aggregationPath: result.aggregation.aggregationPath,
    qualificationGate: result.aggregation.aggregation.qualificationGate,
    draftSummaryPaths: result.runs.map((run) => run.draftSummaryPath)
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: {
      message: error.message,
      differences: error.differences || null,
      validation: error.validation || null
    }
  }, null, 2));
  process.exitCode = 1;
});
