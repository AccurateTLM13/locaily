#!/usr/bin/env node
const { aggregateRuns } = require("../aggregation");
const { parseArgs, printHelp, requireArgs } = require("./args");

async function main() {
  const args = parseArgs(process.argv.slice(2), {
    run: { multiple: true },
    output: {}
  });

  if (args.help) {
    printHelp({
      command: "npm run benchmark:aggregate -- --run <run-id> --run <run-id> [--output <aggregation-id>]",
      description: "Aggregate repeated draft benchmark summaries into deterministic trial statistics and qualification-gate evidence.",
      options: [
        { flag: "--run <run-id>", description: "Draft run id; repeat for independent trials." },
        { flag: "--output <id>", description: "Optional aggregation id." },
        { flag: "--help", description: "Show this help." }
      ]
    });
    return;
  }

  requireArgs(args, ["run"]);
  const result = await aggregateRuns({
    runIds: args.run,
    aggregationId: args.output || null
  });

  console.log(JSON.stringify({
    ok: true,
    aggregationId: result.aggregationId,
    aggregationPath: result.aggregationPath,
    aggregation: result.aggregation
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: {
      message: error.message,
      validation: error.validation || null,
      differences: error.differences || null
    }
  }, null, 2));
  process.exitCode = 1;
});
