#!/usr/bin/env node
const { reviewRun } = require("../review-run");
const { parseArgs, printHelp, requireArgs } = require("./args");

async function main() {
  const args = parseArgs(process.argv.slice(2), {
    run: {}
  });

  if (args.help) {
    printHelp({
      command: "npm run benchmark:review -- --run <run-id>",
      description: "Review a draft benchmark run summary without promoting evidence.",
      options: [
        { flag: "--run <run-id>", description: "Run id under benchmark-lab/reports/drafts/." },
        { flag: "--help", description: "Show this help." }
      ]
    });
    return;
  }

  requireArgs(args, ["run"]);
  const result = await reviewRun({ runId: args.run });

  console.log(JSON.stringify({
    ok: true,
    runId: result.runId,
    reviewPath: result.reviewPath,
    review: result.review
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
