const path = require("node:path");
const crypto = require("node:crypto");

const registry = new Map();
const sourceChecksums = new Map();

function registerTransformer(transformerId, modulePath, version) {
  if (!transformerId || typeof transformerId !== "string") throw new Error("transformerId is required");
  if (!modulePath || typeof modulePath !== "string") throw new Error("modulePath is required");
  if (!version || typeof version !== "string") throw new Error("version is required");

  let transformFn;
  try {
    const mod = require(modulePath);
    transformFn = mod.transform || mod.default || mod;
    if (typeof transformFn !== "function") throw new Error("Module does not export a transform function");
  } catch (e) {
    throw new Error(`Failed to load transformer ${transformerId}: ${e.message}`);
  }

  let checksum;
  try {
    const fs = require("fs");
    const source = fs.readFileSync(modulePath, "utf8");
    checksum = `sha256:${crypto.createHash("sha256").update(source).digest("hex")}`;
  } catch {
    checksum = "unknown";
  }

  registry.set(transformerId, { transformerId, transformFn, version, modulePath, checksum });
  sourceChecksums.set(transformerId, checksum);
}

function getTransformer(transformerId) {
  if (!registry.has(transformerId)) {
    throw new Error(`Unknown transformer: ${transformerId}. Registered: ${[...registry.keys()].join(", ")}`);
  }
  return registry.get(transformerId);
}

function listTransformers() {
  return [...registry.entries()].map(([id, entry]) => ({
    transformerId: id,
    version: entry.version,
    modulePath: entry.modulePath,
    checksum: entry.checksum
  }));
}

function transform(transformerId, input) {
  const entry = getTransformer(transformerId);
  const diagnostics = { transformerId, transformerVersion: entry.version, inputReceived: !!input, startedAt: Date.now(), inputValid: false, outputValid: false, missingFields: [], typeMismatches: [], ignoredSourceFields: [], inferredFields: [] };

  if (!input || typeof input !== "object") {
    diagnostics.inputValid = false;
    return { ok: false, diagnostics, output: null };
  }

  try {
    const result = entry.transformFn(input, diagnostics);
    diagnostics.inputValid = true;
    if (result && typeof result === "object" && !result.error) {
      diagnostics.outputValid = true;
    }
    diagnostics.durationMs = Date.now() - diagnostics.startedAt;
    return { ok: diagnostics.outputValid, diagnostics, output: diagnostics.outputValid ? result : null };
  } catch (e) {
    diagnostics.inputValid = true;
    diagnostics.outputValid = false;
    diagnostics.error = e.message;
    diagnostics.durationMs = Date.now() - diagnostics.startedAt;
    return { ok: false, diagnostics, output: null };
  }
}

function getChecksum(transformerId) {
  return sourceChecksums.get(transformerId) || "unknown";
}

module.exports = { registerTransformer, getTransformer, listTransformers, transform, getChecksum };
