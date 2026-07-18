const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_STATE = {
  schemaVersion: "1.0",
  paused: false,
  lastProcessedAt: null,
  lastRunAt: null,
  lastRunStatus: null,
  processedSessionIds: [],
  extractedSessionIds: [],
  lastEventAt: null,
  unprocessedEvents: 0,
  warnings: []
};

function createDevelopmentCaptureProcessorStore(options = {}) {
  const rootDir = options.rootDir
    || path.join(__dirname, "..", "..", "..", "..", "data", "memory", "development-capture");
  const statePath = path.join(rootDir, "processor-state.json");

  function ensureDir() {
    fs.mkdirSync(rootDir, { recursive: true });
  }

  function readState() {
    ensureDir();

    try {
      const parsed = JSON.parse(fs.readFileSync(statePath, "utf8"));
      return {
        ...DEFAULT_STATE,
        ...parsed,
        processedSessionIds: Array.isArray(parsed.processedSessionIds) ? parsed.processedSessionIds : [],
        extractedSessionIds: Array.isArray(parsed.extractedSessionIds) ? parsed.extractedSessionIds : [],
        warnings: Array.isArray(parsed.warnings) ? parsed.warnings : []
      };
    } catch (error) {
      if (error.code === "ENOENT") {
        return { ...DEFAULT_STATE };
      }
      throw error;
    }
  }

  function writeState(state) {
    ensureDir();
    const tempPath = `${statePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tempPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    fs.renameSync(tempPath, statePath);
    return state;
  }

  function updateState(patch = {}) {
    const current = readState();
    const next = {
      ...current,
      ...patch,
      processedSessionIds: patch.processedSessionIds || current.processedSessionIds,
      extractedSessionIds: patch.extractedSessionIds || current.extractedSessionIds,
      warnings: patch.warnings || current.warnings
    };
    writeState(next);
    return next;
  }

  function markSessionProcessed(sessionId, { extracted = false } = {}) {
    const current = readState();
    const processedSessionIds = current.processedSessionIds.includes(sessionId)
      ? current.processedSessionIds
      : [...current.processedSessionIds, sessionId];
    const extractedSessionIds = extracted && !current.extractedSessionIds.includes(sessionId)
      ? [...current.extractedSessionIds, sessionId]
      : current.extractedSessionIds;

    return updateState({
      processedSessionIds,
      extractedSessionIds,
      lastProcessedAt: new Date().toISOString()
    });
  }

  function setPaused(paused) {
    return updateState({ paused: Boolean(paused) });
  }

  return {
    getRootDir: () => rootDir,
    getStatePath: () => statePath,
    readState,
    writeState,
    updateState,
    markSessionProcessed,
    setPaused
  };
}

module.exports = {
  createDevelopmentCaptureProcessorStore,
  DEFAULT_STATE
};
