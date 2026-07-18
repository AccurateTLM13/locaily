const fs = require("node:fs");
const path = require("node:path");
const { validateResult } = require("../../core/result-validator");
const schema = require("../../schemas/development-memory-session.schema.json");

function createDevelopmentSessionStore(options = {}) {
  const rootDir = options.rootDir || path.join(__dirname, "..", "..", "..", "data", "memory", "development-sessions");
  const manifestDir = path.join(rootDir, "manifests");
  const activeSessionPath = path.join(rootDir, "active-session.json");

  function ensureDirs() {
    fs.mkdirSync(manifestDir, { recursive: true });
  }

  function manifestPath(sessionId) {
    const safeId = String(sessionId).replace(/[^a-zA-Z0-9_-]/g, "_");
    return path.join(manifestDir, `${safeId}.json`);
  }

  function validateManifest(manifest, label = "session") {
    const validation = validateResult(manifest, schema, label);
    if (!validation.ok) {
      return {
        ok: false,
        error: {
          code: "SESSION_SCHEMA_INVALID",
          message: `Development memory session failed schema validation: ${validation.errors.join("; ")}`,
          nextStep: "Fix the session manifest to match development-memory-session.schema.json."
        },
        validation
      };
    }
    return { ok: true };
  }

  function writeManifestAtomic(manifest) {
    ensureDirs();
    const filePath = manifestPath(manifest.sessionId);
    const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tempPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    fs.renameSync(tempPath, filePath);
  }

  function readManifest(sessionId) {
    ensureDirs();
    const filePath = manifestPath(sessionId);
    try {
      return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  function saveManifest(manifest) {
    const validation = validateManifest(manifest, manifest.sessionId);
    if (!validation.ok) {
      return { ok: false, error: validation.error, warnings: [] };
    }

    const existing = readManifest(manifest.sessionId);
    if (existing && existing.status === "closed" && manifest.status === "closed") {
      const samePayload = JSON.stringify(existing) === JSON.stringify(manifest);
      if (samePayload) {
        return { ok: true, result: manifest, warnings: ["Duplicate closed manifest write ignored."] };
      }
    }

    writeManifestAtomic(manifest);
    return { ok: true, result: manifest, warnings: [] };
  }

  function readActiveSessionPointer() {
    ensureDirs();
    try {
      return JSON.parse(fs.readFileSync(activeSessionPath, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  function writeActiveSessionPointer(pointer) {
    ensureDirs();
    const tempPath = `${activeSessionPath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tempPath, `${JSON.stringify(pointer, null, 2)}\n`, "utf8");
    fs.renameSync(tempPath, activeSessionPath);
  }

  function clearActiveSessionPointer() {
    ensureDirs();
    try {
      fs.unlinkSync(activeSessionPath);
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
  }

  function listManifests() {
    ensureDirs();
    try {
      return fs.readdirSync(manifestDir).filter((file) => file.endsWith(".json"));
    } catch (error) {
      if (error.code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  return {
    getRootDir: () => rootDir,
    getActiveSessionPath: () => activeSessionPath,
    readManifest,
    saveManifest,
    readActiveSessionPointer,
    writeActiveSessionPointer,
    clearActiveSessionPointer,
    listManifests
  };
}

module.exports = {
  createDevelopmentSessionStore
};
