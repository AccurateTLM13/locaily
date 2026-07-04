#!/usr/bin/env node
const { compareRuns } = require("../compare-runs");
const { parseArgs, printHelp, requireArgs } = require("./args");

async function main() {
  const args = parseArgs(process.argv.slice(2), {
    left: {},
    right: {},
    output: {}
  });

  if (args.help) {
    printHelp({
      command: "npm run benchmark:compare -- --left <run-id> --right <run-id> [--output <comparison-id>]",
      description: "Compare two draft benchmark summaries.",
      options: [
        { flag: "--left <run-id>", description: "Baseline run id." },
        { flag: "--right <run-id>", description: "Comparison run id." },
        { flag: "--output <id>", description: "Optional comparison id." },
        { flag: "--help", description: "Show this help." }
      ]
    });
    return;
  }

  requireArgs(args, ["left", "right"]);
  const result = await compareRuns({
    leftRunId: args.left,
    rightRunId: args.right,
    comparisonId: args.output
  });

  console.log(JSON.stringify({
    ok: true,
    comparisonId: result.comparisonId,
    comparisonPath: result.comparisonPath,
    comparison: result.comparison
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: {
      message: error.message,
      validation: error.validation || null
    }
  }, null, 2));
  process.exitCode = 1;
});
