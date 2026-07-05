const path = require("node:path");
const fs = require("node:fs/promises");
const { runTC65Diagnostics } = require("../runners/tc65-diagnostic-runner");
const { readJson } = require("../fs-utils");
const { parseArgs, printHelp, requireArgs } = require("./args");

const LAB_ROOT = path.resolve(__dirname, "..", "..");

async function main() {
  const args = parseArgs(process.argv.slice(2), {
    models: {},
    suite: {},
    trials: {},
    runId: {}
  });
  if (args.help) {
    printHelp({
      command: "npm run benchmark:diagnose -- --models llama3.2-local,lfm25-local [--trials 3]",
      description: "Run TC-65 diagnostic variants across models and modes.",
      options: [
        { flag: "--models <list>", description: "Comma-separated model manifest IDs." },
        { flag: "--suite <path>", description: "Suite config path." },
        { flag: "--trials <n>", description: "Trials per combination (default 3)." },
        { flag: "--run-id <id>", description: "Custom run ID." },
        { flag: "--help", description: "Show this help." }
      ]
    });
    return;
  }
  requireArgs(args, ["models"]);

  const models = args.models.split(",").map((m) => m.trim());
  const suitePath = path.resolve(args.suite || path.join(LAB_ROOT, "locaily", "tracks", "basic-tool-use", "suite.json"));
  const suiteConfig = await readJson(suitePath);
  const trials = parseInt(args.trials, 10) || 3;
  const runId = args.runId || `tc65-diagnostic-${Date.now()}`;

  console.error(`Running TC-65 diagnostic for: ${models.join(", ")} (${trials} trials per config)`);
  const results = await runTC65Diagnostics({ modelManifests: models, suiteConfig, trials, runId });

  const outputDir = path.join(LAB_ROOT, "results", "raw", runId);
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, "run.json"), JSON.stringify(results, null, 2), "utf8");

  // Summary
  const summary = { runId, models, trials, totalRuns: results.runs.length, baselinePass: results.baseline?.every((b) => b.match) };
  for (const run of results.runs) {
    if (run.skipped) continue;
    if (!summary[run.modelId]) summary[run.modelId] = {};
    if (!summary[run.modelId][run.modeLabel]) summary[run.modelId][run.modeLabel] = {};
    summary[run.modelId][run.modeLabel][run.variant] = run.aggregate?.verdict || "?";
  }

  console.log(JSON.stringify({ ok: true, outputDir, summary, baselinePass: results.baseline?.every((b) => b.match) }, null, 2));
}

main().catch((err) => { console.error(err.message); process.exitCode = 1; });
