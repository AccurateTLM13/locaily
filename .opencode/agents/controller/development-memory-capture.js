const path = require("node:path");

const PROJECT_ROOT = path.resolve(__dirname, "..", "..", "..");
const DATA_DIR = path.join(PROJECT_ROOT, "data", "memory", "development-events");
const SESSIONS_DIR = path.join(PROJECT_ROOT, "data", "memory", "development-sessions");

let capture = null;
let loadError = null;

try {
  capture = require(path.join(PROJECT_ROOT, "companion", "memory", "events", "capture"));
  const enabled = process.env.DEVELOPMENT_MEMORY_CAPTURE !== "0";
  capture.init({
    enabled,
    project: process.env.DEVELOPMENT_MEMORY_PROJECT || "locaily",
    dataDir: DATA_DIR,
    sessionsRoot: SESSIONS_DIR,
    failureLogPath: path.join(DATA_DIR, "capture-failures.jsonl")
  });
} catch (error) {
  loadError = error;
  capture = {
    init() {},
    emitObjectiveStarted() {},
    emitObjectiveCompleted() {},
    emitObjectiveBlocked() {},
    emitTaskDispatched() {},
    emitTaskAccepted() {},
    emitTaskRejected() {},
    emitBlockerRecorded() {},
    emitTestCompleted() {},
    emitCommitCreated() {},
    emitCommitsSinceRef() {},
    emitDecisionRecorded() {},
    emitWorkerValidationCompleted() {}
  };
}

if (loadError) {
  console.error(`[development-memory-capture] disabled: ${loadError.message}`);
}

module.exports = capture;
