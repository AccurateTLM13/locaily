const path = require("node:path");
const { probeModel, saveProbeRecord, loadLatestProbe, checkSuiteRequirements } = require("../probes/model-capability-probe");
const { parseArgs, printHelp, requireArgs } = require("./args");

const LAB_ROOT = path.resolve(__dirname, "..", "..");

async function main() {
  const args = parseArgs(process.argv.slice(2), {
    model: {},
    manifest: {},
    force: {},
    requestTimeout: {},
    suite: {}
  });

  if (args.help) {
    printHelp({
      command: "npm run benchmark:probe -- --model <model-id> [--force] [--request-timeout <ms>]",
      description: "Probe a model's capabilities before running a benchmark suite.",
      options: [
        { flag: "--model <id>", description: "Model manifest id (required)." },
        { flag: "--force", description: "Force a fresh probe, ignoring cache." },
        { flag: "--request-timeout <ms>", description: "Per-request timeout in ms (default 120000)." },
        { flag: "--suite <path>", description: "Optional suite config to check requirements against." },
        { flag: "--help", description: "Show this help." }
      ]
    });
    return;
  }

  requireArgs(args, ["model"]);

  const manifestPath = path.join(LAB_ROOT, "..", "benchmark-lab", "models", "manifests", `${args.model}.json`);
  let manifest;
  try { manifest = require(manifestPath); } catch {
    throw new Error(`Manifest not found for model: ${args.model}`);
  }

  const baseUrl = "http://127.0.0.1:11434";
  const requestTimeout = parseInt(args.requestTimeout, 10) || 120000;

  const force = args.force === "true" || args.force === true;

  if (!force) {
    let ollamaVersion = "unknown";
    try {
      const verRes = await globalThis.fetch(`${baseUrl}/api/version`, { signal: AbortSignal.timeout(5000) });
      if (verRes.ok) ollamaVersion = (await verRes.json()).version || "unknown";
    } catch {}
    const cached = await loadLatestProbe(args.model, manifest.runtimeModelName, ollamaVersion);
    if (cached) {
      console.log(JSON.stringify({ ok: true, cached: true, probe: cached }, null, 2));
      if (args.suite) {
        const suiteConfig = require(path.resolve(args.suite));
        const check = checkSuiteRequirements(suiteConfig, cached);
        console.log(JSON.stringify({ suiteCheck: check }, null, 2));
      }
      return;
    }
  }

  console.error(`Probing ${args.model} (${manifest.runtimeModelName})...`);
  const probe = await probeModel({
    modelId: args.model,
    runtimeModelName: manifest.runtimeModelName,
    baseUrl,
    requestTimeoutMs: requestTimeout,
    fetchImpl: globalThis.fetch
  });

  const probePath = await saveProbeRecord(probe);
  console.log(JSON.stringify({ ok: true, cached: false, probePath, probe }, null, 2));

  if (args.suite) {
    const suiteConfig = require(path.resolve(args.suite));
    const check = checkSuiteRequirements(suiteConfig, probe);
    console.log(JSON.stringify({ suiteCheck: check }, null, 2));
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err.message, stack: err.stack }, null, 2));
  process.exitCode = 1;
});
