#!/usr/bin/env node
const { promoteRun } = require("../review-run");
const { parseArgs, printHelp, requireArgs } = require("./args");

async function main() {
  const args = parseArgs(process.argv.slice(2), {
    run: {},
    evidence: {},
    approvedBy: {},
    note: {}
  });

  if (args.help) {
    printHelp({
      command: "npm run benchmark:promote -- --run <run-id> --evidence <evidence-id> --approved-by <name>",
      description: "Explicitly promote a draft run summary into approved benchmark evidence.",
      options: [
        { flag: "--run <run-id>", description: "Run id under benchmark-lab/reports/drafts/." },
        { flag: "--evidence <id>", description: "Stable evidence id to write." },
        { flag: "--approved-by <name>", description: "Reviewer/operator approving promotion." },
        { flag: "--note <text>", description: "Optional review note." },
        { flag: "--help", description: "Show this help." }
      ]
    });
    return;
  }

  requireArgs(args, ["run", "evidence", "approvedBy"]);
  const result = await promoteRun({
    runId: args.run,
    evidenceId: args.evidence,
    approvedBy: args.approvedBy,
    notes: args.note ? [args.note] : []
  });

  console.log(JSON.stringify({
    ok: true,
    runId: result.runId,
    evidenceId: result.evidenceId,
    promotedPath: result.promotedPath,
    approvedPath: result.approvedPath,
    checksumPaths: result.checksumPaths
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
