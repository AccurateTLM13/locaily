const fs = require("node:fs");
const path = require("node:path");
const { validateResult } = require("../../core/result-validator");
const schema = require("../../schemas/development-memory-maintainer-run.schema.json");

function createDevelopmentMaintainerStore(options = {}) {
  const rootDir = options.rootDir || path.join(__dirname, "..", "..", "..", "data", "memory", "development-maintainer");
  const runsDir = path.join(rootDir, "runs");
  const rollbacksDir = path.join(rootDir, "rollbacks");

  function ensureDirs() {
    fs.mkdirSync(runsDir, { recursive: true });
    fs.mkdirSync(rollbacksDir, { recursive: true });
  }

  function runPath(runId) {
    const safeId = String(runId).replace(/[^a-zA-Z0-9_-]/g, "_");
    return path.join(runsDir, `${safeId}.json`);
  }

  function rollbackPath(rollbackId) {
    const safeId = String(rollbackId).replace(/[^a-zA-Z0-9_-]/g, "_");
    return path.join(rollbacksDir, `${safeId}.json`);
  }

  function validateRun(run, label = "maintainer-run") {
    const validation = validateResult(run, schema, label);
    if (!validation.ok) {
      return {
        ok: false,
        error: {
          code: "MAINTAINER_RUN_SCHEMA_INVALID",
          message: `Maintainer run failed schema validation: ${validation.errors.join("; ")}`,
          nextStep: "Fix the maintainer run to match development-memory-maintainer-run.schema.json."
        },
        validation
      };
    }
    return { ok: true };
  }

  function writeJsonAtomic(filePath, payload) {
    ensureDirs();
    const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    fs.renameSync(tempPath, filePath);
  }

  function saveRun(run) {
    const validation = validateRun(run, run.runId);
    if (!validation.ok) {
      return { ok: false, error: validation.error, warnings: [] };
    }

    writeJsonAtomic(runPath(run.runId), run);
    return { ok: true, result: run, warnings: [] };
  }

  function readRun(runId) {
    ensureDirs();
    try {
      return JSON.parse(fs.readFileSync(runPath(runId), "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  function listRuns(project = null) {
    ensureDirs();
    const runs = [];

    for (const file of fs.readdirSync(runsDir).filter((entry) => entry.endsWith(".json"))) {
      const run = readRun(file.replace(/\.json$/, ""));
      if (!run) {
        continue;
      }
      if (project && run.project !== project) {
        continue;
      }
      runs.push(run);
    }

    runs.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
    return runs;
  }

  function saveRollback(rollback) {
    writeJsonAtomic(rollbackPath(rollback.rollbackId), rollback);
    return { ok: true, result: rollback, warnings: [] };
  }

  function readRollback(rollbackId) {
    ensureDirs();
    try {
      return JSON.parse(fs.readFileSync(rollbackPath(rollbackId), "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  return {
    getRootDir: () => rootDir,
    saveRun,
    readRun,
    listRuns,
    saveRollback,
    readRollback
  };
}

module.exports = {
  createDevelopmentMaintainerStore
};
