#!/usr/bin/env node
const path = require("node:path");
const { runSuite } = require("../runners/suite-runner");
const { parseArgs, printHelp } = require("./args");

async function main() {
  const args = parseArgs(process.argv.slice(2), {
    suite: {},
    modelManifest: {}
  });

  if (args.help) {
    printHelp({
      command: "npm run benchmark:run -- [--suite <suite.json>] [--model-manifest <id>]",
      description: "Run a Benchmark Lab suite and write raw results plus a draft summary.",
      options: [
        { flag: "--suite <path>", description: "Suite config path. Defaults to the intent-classification mock suite." },
        { flag: "--model-manifest <id>", description: "Override suite runtime.modelManifest for matrix runs." },
        { flag: "--help", description: "Show this help." }
      ],
      examples: [
        "npm run benchmark:run -- --suite benchmark-lab/locaily/tracks/intent-classification/suite-ollama.example.json",
        "npm run benchmark:run -- --suite benchmark-lab/locaily/tracks/intent-classification/suite-ollama.example.json --model-manifest lfm25-local"
      ]
    });
    return;
  }

  const suite = args.suite || "benchmark-lab/locaily/tracks/intent-classification/suite.json";
  const result = await runSuite({
    suitePath: path.resolve(suite),
    modelManifest: args.modelManifest || null
  });

  console.log(JSON.stringify({
    ok: true,
    runId: result.runId,
    rawRunDir: result.rawRunDir,
    draftSummaryPath: result.draftSummaryPath,
    summary: result.summary
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
