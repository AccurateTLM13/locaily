#!/usr/bin/env node
const path = require("node:path");
const { runToolEvalSuite } = require("../runners/tool-eval-runner");
const { readJson } = require("../fs-utils");
const { parseArgs, printHelp, requireArgs } = require("./args");

const LAB_ROOT = path.resolve(__dirname, "..", "..");

async function main() {
  const args = parseArgs(process.argv.slice(2), {
    suite: {},
    manifest: {},
    trials: {},
    runId: {}
  });

  if (args.help) {
    printHelp({
      command: "npm run tool-eval:run -- --suite <suite.json> --manifest <model-manifest-id> [--trials 3]",
      description: "Run selected Tool Eval Bench scenarios through existing Ollama adapter.",
      options: [
        { flag: "--suite <path>", description: "Suite JSON config path." },
        { flag: "--manifest <id>", description: "Model manifest id (e.g. llama3.2-local)." },
        { flag: "--trials <count>", description: "Number of trials per scenario (default: 1)." },
        { flag: "--run-id <id>", description: "Optional custom run ID." },
        { flag: "--help", description: "Show this help." }
      ]
    });
    return;
  }

  requireArgs(args, ["suite", "manifest"]);

  const suitePath = path.resolve(args.suite);
  const suiteConfig = await readJson(suitePath);
  const scenarioModule = require(path.resolve(path.dirname(suitePath), suiteConfig.scenarioModule || "scenarios.js"));

  if (!scenarioModule.SCENARIO_REGISTRY || scenarioModule.SCENARIO_REGISTRY.length === 0) {
    throw new Error("No scenarios loaded from module.");
  }

  const result = await runToolEvalSuite({
    modelManifestId: args.manifest,
    scenarios: scenarioModule.SCENARIO_REGISTRY,
    systemPrompt: scenarioModule.SYSTEM_PROMPT,
    trackPolicy: scenarioModule.TRACK_POLICY,
    mockHandler: scenarioModule.mockHandler,
    toolDefinitions: await readJson(path.resolve(path.dirname(suitePath), suiteConfig.toolDefinitions)),
    suiteConfig,
    trials: parseInt(args.trials, 10) || 1,
    runId: args.runId || undefined
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
      stack: error.stack
    }
  }, null, 2));
  process.exitCode = 1;
});
