const path = require("node:path");
const fs = require("node:fs/promises");
const { runHybridWorkflow } = require("../runners/hybrid-deterministic-runner");
const { readJson } = require("../fs-utils");
const { parseArgs, printHelp, requireArgs } = require("./args");

const LAB_ROOT = path.resolve(__dirname, "..", "..");

async function main() {
  const args = parseArgs(process.argv.slice(2), {
    model: {},
    case: {},
    suite: {},
    trials: {},
    noProbe: {},
    forceProbe: {},
    allowStaleProbe: {},
    requestTimeout: {},
    outputDir: {},
    runId: {}
  });

  if (args.help) {
    printHelp({
      command: "npm run benchmark:hybrid -- --model <model-id> [--case <case-id>] [--trials 3]\n  Example: --case loc-hybrid-weather-001 (case-insensitive)",
      description: "Run a hybrid deterministic workflow: model tool call + deterministic transformer.",
      options: [
        { flag: "--model <id>", description: "Model manifest id (required)." },
        { flag: "--case <id>", description: "Scenario ID (default: loc-hybrid-weather-001)." },
        { flag: "--suite <path>", description: "Suite config path." },
        { flag: "--trials <n>", description: "Trials (default 3)." },
        { flag: "--no-probe", description: "Skip capability probing." },
        { flag: "--force-probe", description: "Force fresh probe." },
        { flag: "--allow-stale-probe", description: "Allow cached probe." },
        { flag: "--request-timeout <ms>", description: "Per-request timeout." },
        { flag: "--help", description: "Show this help." }
      ]
    });
    return;
  }

  requireArgs(args, ["model"]);

  const suitePath = path.resolve(args.suite || path.join(LAB_ROOT, "locaily", "tracks", "basic-tool-use", "suite.json"));
  const suiteConfig = await readJson(suitePath);
  const suiteDir = path.dirname(suitePath);
  const scenarioModule = require(path.resolve(suiteDir, suiteConfig.scenarioModule || "scenarios.js"));
  const toolDefinitions = await readJson(path.resolve(suiteDir, suiteConfig.toolDefinitions));
  const caseId = (args.case || "loc-hybrid-weather-001").toLowerCase();
  const scenario = scenarioModule.SCENARIO_REGISTRY.find((s) => s.id.toLowerCase() === caseId);
  if (!scenario) throw new Error(`Scenario not found: ${args.case || caseId}`);

  const trials = parseInt(args.trials, 10) || 3;

  const result = await runHybridWorkflow({
    modelManifestId: args.model,
    scenarios: [scenario],
    systemPrompt: scenarioModule.SYSTEM_PROMPT,
    trackPolicy: scenarioModule.TRACK_POLICY,
    mockHandler: scenarioModule.mockHandler,
    toolDefinitions,
    suiteConfig,
    trials,
    runId: args.runId || `hybrid-${caseId}-${Date.now()}`,
    probeOptions: {
      forceProbe: args.forceProbe === "true" || args.forceProbe === true,
      noProbe: args.noProbe === "true" || args.noProbe === true,
      allowStale: args.allowStaleProbe !== "false",
      requestTimeoutMs: parseInt(args.requestTimeout, 10) || 120000
    }
  });

  console.log(JSON.stringify({
    ok: true,
    runId: result.runId,
    skipped: result.skipped || false,
    summary: result.summary,
    gate: result.gate ? { eligible: result.gate.eligible, probeId: result.gate.probeId, missingCapabilities: result.gate.missingCapabilities } : null
  }, null, 2));
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err.message }));
  process.exitCode = 1;
});
