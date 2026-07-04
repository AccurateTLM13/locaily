#!/usr/bin/env node
const { generateBenchmarkReport } = require("../report");
const { parseArgs, printHelp, requireArgs } = require("./args");

async function main() {
  const args = parseArgs(process.argv.slice(2), {
    report: {},
    title: {},
    evidence: {
      multiple: true
    }
  });

  if (args.help) {
    printHelp({
      command: "npm run report:generate -- --report <report-id> --evidence <evidence-id>",
      description: "Generate a published benchmark report from promoted evidence.",
      options: [
        { flag: "--report <id>", description: "Report id." },
        { flag: "--title <text>", description: "Optional report title." },
        { flag: "--evidence <id>", description: "Promoted evidence id. May be repeated." },
        { flag: "--help", description: "Show this help." }
      ]
    });
    return;
  }

  requireArgs(args, ["report", "evidence"]);
  const result = await generateBenchmarkReport({
    reportId: args.report,
    title: args.title,
    evidenceIds: args.evidence
  });

  console.log(JSON.stringify({
    ok: true,
    reportId: result.reportId,
    sourcePath: result.sourcePath,
    markdownPath: result.markdownPath,
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
