const path = require("node:path");
const fs = require("node:fs/promises");
const { runModeComparison, EXECUTION_MODES } = require("../runners/mode-comparison-runner");
const { readJson } = require("../fs-utils");

const LAB_ROOT = path.resolve(__dirname, "..", "..");

async function main() {
  const suitePath = path.resolve(process.argv[2] || path.join(LAB_ROOT, "locaily", "tracks", "basic-tool-use", "suite.json"));
  const manifestId = process.argv[3] || "llama3.2-local";
  const trials = parseInt(process.argv[4], 10) || 3;

  const suiteConfig = await readJson(suitePath);
  const suiteDir = path.dirname(suitePath);
  const scenarioModule = require(path.resolve(suiteDir, suiteConfig.scenarioModule || "scenarios.js"));
  const toolDefinitions = await readJson(path.resolve(suiteDir, suiteConfig.toolDefinitions));

  const targetIds = ["tc-05", "tc-10", "tc-11", "tc-12", "tc-64", "tc-65"];
  const scenarios = scenarioModule.SCENARIO_REGISTRY.filter((s) => targetIds.includes(s.id));

  if (scenarios.length !== 6) {
    throw new Error(`Expected 6 scenarios, found ${scenarios.length}`);
  }

  const result = await runModeComparison({
    modelManifestId: manifestId,
    scenarios,
    systemPrompt: scenarioModule.SYSTEM_PROMPT,
    trackPolicy: scenarioModule.TRACK_POLICY,
    mockHandler: scenarioModule.mockHandler,
    toolDefinitions,
    suiteConfig,
    trials,
    runIdBase: "mode-comparison"
  });

  const runId = `mode-comparison-${new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z")}`;
  const outputDir = path.join(LAB_ROOT, "results", "raw", runId);
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, "run.json"), JSON.stringify(result, null, 2), "utf8");

  console.log(JSON.stringify({
    ok: true,
    runId,
    outputDir,
    summary: {
      totalTrials: result.modeResults.reduce((s, m) => s + m.trials.length, 0),
      modes: result.modeResults.map((m) => ({
        executionMode: m.executionMode,
        verdicts: aggregateModeVerdicts(m.trials)
      }))
    }
  }, null, 2));
}

function aggregateModeVerdicts(trials) {
  const byScenario = {};
  for (const t of trials) {
    if (!byScenario[t.scenarioId]) byScenario[t.scenarioId] = [];
    byScenario[t.scenarioId].push(t.verdict);
  }
  const result = {};
  for (const [sid, verdicts] of Object.entries(byScenario)) {
    const pass = verdicts.filter((v) => v === "PASS").length;
    const partial = verdicts.filter((v) => v === "PARTIAL").length;
    const fail = verdicts.filter((v) => v === "FAIL").length;
    const agg = pass === verdicts.length ? "PASS" : (pass + partial === verdicts.length ? "PARTIAL" : "FAIL");
    result[sid] = { verdicts, aggregate: agg, pass, partial, fail };
  }
  return result;
}

main().catch((err) => { console.error(JSON.stringify({ ok: false, error: err.message })); process.exitCode = 1; });
