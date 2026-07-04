#!/usr/bin/env node
const path = require("node:path");
const { runMatrix } = require("../matrix-runner");
const { parseArgs, printHelp } = require("./args");

async function main() {
  const args = parseArgs(process.argv.slice(2), {
    suite: {},
    modelManifest: {
      multiple: true
    },
    output: {}
  });

  if (args.help) {
    printHelp({
      command: "npm run benchmark:matrix -- --suite <suite.json> [--model-manifest <id>] [--output <matrix-id>]",
      description: "Run one Benchmark Lab suite across multiple model manifests and write a draft matrix report.",
      options: [
        { flag: "--suite <path>", description: "Suite config path. Defaults to the intent-classification Ollama suite." },
        { flag: "--model-manifest <id>", description: "Model manifest id. May be repeated. Defaults to all available Ollama manifests." },
        { flag: "--output <id>", description: "Optional matrix id." },
        { flag: "--help", description: "Show this help." }
      ],
      examples: [
        "npm run benchmark:matrix -- --suite benchmark-lab/locaily/tracks/intent-classification/suite-ollama.example.json",
        "npm run benchmark:matrix -- --suite benchmark-lab/locaily/tracks/intent-classification/suite-ollama.example.json --model-manifest llama3.2-local --model-manifest lfm25-local"
      ]
    });
    return;
  }

  const suite = args.suite || "benchmark-lab/locaily/tracks/intent-classification/suite-ollama.example.json";
  const result = await runMatrix({
    suitePath: path.resolve(suite),
    modelManifests: args.modelManifest || [],
    matrixId: args.output || null
  });

  console.log(JSON.stringify({
    ok: true,
    matrixId: result.matrixId,
    matrixPath: result.matrixPath,
    markdownPath: result.markdownPath,
    matrix: result.matrix
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
