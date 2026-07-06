#!/usr/bin/env node
const path = require("node:path");
const { runLighthousePrioritySuite } = require("../runners/lighthouse-priority-runner");
const { readJson } = require("../fs-utils");
const { parseArgs, printHelp, requireArgs } = require("./args");

const LAB_ROOT = path.resolve(__dirname, "..", "..");

async function main() {
  const args = parseArgs(process.argv.slice(2), {
    suite: {},
    manifest: {},
    mock: {},
    runId: {}
  });

  if (args.help) {
    printHelp({
      command: "npm run lighthouse-priority:run -- --suite <suite.json> [--manifest <model-manifest-id>] [--mock]",
      description: "Run Lighthouse Handoff priority_helper benchmark scenarios.",
      options: [
        { flag: "--suite <path>", description: "Suite JSON config path." },
        { flag: "--manifest <id>", description: "Model manifest id (e.g. llama3.2-local). Defaults to suite config." },
        { flag: "--mock", description: "Run with mock adapter (requires mock-responses.json in suite dir)." },
        { flag: "--run-id <id>", description: "Optional custom run ID." },
        { flag: "--help", description: "Show this help." }
      ]
    });
    return;
  }

  requireArgs(args, ["suite"]);

  const suitePath = path.resolve(args.suite);
  const suiteConfig = await readJson(suitePath);
  suiteConfig._suitePath = suitePath;

  const scenarioModule = require(path.resolve(path.dirname(suitePath), suiteConfig.scenarioModule || "scenarios.js"));
  suiteConfig._scenarioModule = scenarioModule;

  if (!scenarioModule.SCENARIO_REGISTRY || scenarioModule.SCENARIO_REGISTRY.length === 0) {
    throw new Error("No scenarios loaded from module.");
  }

  let mockResponses = null;
  if (args.mock) {
    mockResponses = await readJson(path.resolve(path.dirname(suitePath), "mock-responses.json"));
  }

  const manifestId = args.manifest || suiteConfig.runtime?.modelManifest || null;

  const result = await runLighthousePrioritySuite({
    modelManifestId: manifestId,
    scenarios: scenarioModule.SCENARIO_REGISTRY,
    suiteConfig,
    mockResponses,
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
