const { readdir, readFile } = require("node:fs/promises");
const path = require("node:path");

const DEFAULT_TRACKS_DIR = path.resolve(__dirname, "..", "..", "benchmark-lab", "locaily", "tracks");

function createSuiteCatalog(options = {}) {
  const tracksDir = options.tracksDir || DEFAULT_TRACKS_DIR;
  let cache = null;

  async function listSuites({ refresh = false } = {}) {
    if (!cache || refresh) cache = await discoverSuites(tracksDir);
    return cache.map((suite) => ({ ...suite }));
  }

  async function getSuite(suiteId) {
    const suites = await listSuites();
    const suite = suites.find((item) => item.id === suiteId);
    if (!suite) {
      const error = new Error(`Benchmark suite '${suiteId}' is not in the local suite catalog.`);
      error.code = "SUITE_NOT_FOUND";
      error.statusCode = 404;
      throw error;
    }
    if (!suite.executable) {
      const error = new Error(`Benchmark suite '${suiteId}' is not executable from the local model lab.`);
      error.code = "SUITE_NOT_EXECUTABLE";
      error.statusCode = 409;
      throw error;
    }
    return { ...suite };
  }

  return { listSuites, getSuite };
}

async function discoverSuites(tracksDir) {
  const suites = [];
  let trackEntries = [];
  try {
    trackEntries = await readdir(tracksDir, { withFileTypes: true });
  } catch {
    return suites;
  }

  for (const trackEntry of trackEntries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!trackEntry.isDirectory()) continue;
    const trackDir = path.join(tracksDir, trackEntry.name);
    const files = await readdir(trackDir, { withFileTypes: true });
    for (const file of files.sort((a, b) => a.name.localeCompare(b.name))) {
      if (!file.isFile() || !/^suite(?:-[a-z0-9.-]+)?\.json$/i.test(file.name)) continue;
      const absolutePath = path.join(trackDir, file.name);
      try {
        const parsed = JSON.parse(await readFile(absolutePath, "utf8"));
        if (!isSuiteShape(parsed)) continue;
        const caseCount = await countCases(trackDir, parsed.caseFiles);
        suites.push({
          id: parsed.suiteId,
          name: parsed.name || parsed.suiteId,
          trackId: parsed.trackId,
          contractId: parsed.contractId,
          declaredMode: parsed.mode || "screening",
          provider: parsed.runtime.provider,
          defaultManifestId: parsed.runtime.modelManifest || null,
          caseCount,
          difficultyStrata: await collectDifficultyStrata(trackDir, parsed.caseFiles),
          semanticScorer: parsed.semanticScorer ? { id: parsed.semanticScorer.id, version: parsed.semanticScorer.version } : null,
          executable: parsed.runtime.provider === "ollama" && Boolean(parsed.runtime.modelManifest),
          relativePath: path.relative(path.resolve(tracksDir, "..", ".."), absolutePath).replace(/\\/g, "/")
        });
      } catch {
        // Malformed files are not admitted to the API allowlist.
      }
    }
  }
  return dedupeSuiteIds(suites);
}

function isSuiteShape(suite) {
  return suite && suite.schemaVersion === "benchmark.suite.v1" && typeof suite.suiteId === "string"
    && typeof suite.trackId === "string" && typeof suite.contractId === "string"
    && suite.runtime && typeof suite.runtime.provider === "string" && Array.isArray(suite.caseFiles);
}

async function readCases(trackDir, caseFiles) {
  const cases = [];
  for (const relativePath of caseFiles) {
    const resolved = path.resolve(trackDir, relativePath);
    if (!resolved.startsWith(`${path.resolve(trackDir)}${path.sep}`)) throw new Error("Case path escaped track directory.");
    const parsed = JSON.parse(await readFile(resolved, "utf8"));
    if (!Array.isArray(parsed)) throw new Error("Case file is not an array.");
    cases.push(...parsed);
  }
  return cases;
}

async function countCases(trackDir, caseFiles) {
  return (await readCases(trackDir, caseFiles)).length;
}

async function collectDifficultyStrata(trackDir, caseFiles) {
  return [...new Set((await readCases(trackDir, caseFiles)).map((item) => item.difficulty).filter(Boolean))].sort();
}

function dedupeSuiteIds(suites) {
  const seen = new Set();
  return suites.filter((suite) => {
    if (seen.has(suite.id)) return false;
    seen.add(suite.id);
    return true;
  }).sort((a, b) => a.name.localeCompare(b.name));
}

module.exports = { createSuiteCatalog, discoverSuites };
