const { probeModel, saveProbeRecord, loadLatestProbe, checkSuiteRequirements } = require("./model-capability-probe");
const crypto = require("node:crypto");

const PROBE_GATING_VERSION = "1.0.0";

async function gateModelForSuite(modelManifestId, suiteConfig, options = {}) {
  const {
    baseUrl = "http://127.0.0.1:11434",
    requestTimeoutMs = 120000,
    forceProbe = false,
    allowStale = true,
    noProbe = false
  } = options;

  const repoRoot = require("path").resolve(__dirname, "..", "..", "..");
  let manifest;
  try {
    manifest = JSON.parse(require("fs").readFileSync(require("path").join(repoRoot, "benchmark-lab", "models", "manifests", `${modelManifestId}.json`), "utf8"));
  } catch (e) {
    return { eligible: false, reason: "MANIFEST_NOT_FOUND", detail: `No manifest for ${modelManifestId}` };
  }

  if (noProbe) {
    return { eligible: true, probed: false, probeId: null, manifest, note: "probe bypassed by --no-probe" };
  }

  let ollamaVersion = "unknown";
  try {
    const verRes = await globalThis.fetch(`${baseUrl}/api/version`, { signal: AbortSignal.timeout(5000) });
    if (verRes.ok) ollamaVersion = (await verRes.json()).version || "unknown";
  } catch {}

  if (!forceProbe && allowStale) {
    const cached = await loadLatestProbe(modelManifestId, manifest.runtimeModelName, ollamaVersion);
    if (cached) {
      const check = checkSuiteRequirements(suiteConfig, cached);
      return {
        eligible: check.eligible,
        reason: check.eligible ? null : check.reason,
        missingCapabilities: check.missingCapabilities,
        probeId: cached.probeId,
        probed: false,
        cached: true,
        probeVersion: cached.probeVersion,
        probeAge: Date.now() - new Date(cached.createdAt).getTime(),
        manifest,
        ollamaVersion
      };
    }
  }

  const probe = await probeModel({
    modelId: modelManifestId,
    runtimeModelName: manifest.runtimeModelName,
    baseUrl,
    requestTimeoutMs,
    fetchImpl: globalThis.fetch
  });
  await saveProbeRecord(probe);

  const check = checkSuiteRequirements(suiteConfig, probe);

  return {
    eligible: check.eligible,
    reason: check.eligible ? null : check.reason,
    missingCapabilities: check.missingCapabilities,
    probeId: probe.probeId,
    probed: true,
    cached: false,
    probeVersion: probe.probeVersion,
    probeAge: 0,
    manifest,
    ollamaVersion,
    verifiedCapabilities: probe.verifiedCapabilities
  };
}

module.exports = { gateModelForSuite, PROBE_GATING_VERSION };
