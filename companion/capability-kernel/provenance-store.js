const path = require("node:path");
const {
  appendFile,
  mkdir,
  readFile,
  rename,
  writeFile
} = require("node:fs/promises");
const { assertContract } = require("./contracts");
const { sanitizeForRecord } = require("./canonical");

function createProvenanceStore(options = {}) {
  const rootDir = options.rootDir;

  if (!rootDir || typeof rootDir !== "string") {
    const error = new Error("Provenance store requires rootDir.");
    error.code = "PROVENANCE_STORE_PATH_REQUIRED";
    throw error;
  }

  const runsPath = path.join(rootDir, "runs.jsonl");
  const outputsDir = path.join(rootDir, "outputs");
  let appendChain = Promise.resolve();

  async function writeOutput(runId, output) {
    await mkdir(outputsDir, { recursive: true });
    const safeRunId = runId.replace(/[^A-Za-z0-9_-]/g, "_");
    const outputPath = path.join(outputsDir, `${safeRunId}.json`);
    const tempPath = `${outputPath}.${process.pid}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(sanitizeForRecord(output), null, 2)}\n`, "utf8");
    await rename(tempPath, outputPath);
    return outputPath;
  }

  function appendRunRecord(record) {
    const sanitized = sanitizeForRecord(record);
    assertContract(sanitized, "run-record.v1", "RUN_RECORD_INVALID", "run-record");

    const operation = appendChain.then(async () => {
      await mkdir(rootDir, { recursive: true });
      await appendFile(runsPath, `${JSON.stringify(sanitized)}\n`, "utf8");
      return {
        runsPath,
        runId: sanitized.run_id
      };
    });

    appendChain = operation.catch(() => {});
    return operation;
  }

  async function readRunRecords() {
    let raw;

    try {
      raw = await readFile(runsPath, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") {
        return [];
      }

      throw error;
    }

    return raw
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line));
  }

  async function hasExecutedEvent(eventId) {
    const records = await readRunRecords();

    return records.some((record) =>
      record.event_id === eventId
      && Array.isArray(record.transitions)
      && record.transitions.some((transition) => transition.to === "running")
    );
  }

  return {
    rootDir,
    runsPath,
    outputsDir,
    writeOutput,
    appendRunRecord,
    readRunRecords,
    hasExecutedEvent
  };
}

module.exports = {
  createProvenanceStore
};
