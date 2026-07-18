const fs = require("node:fs");
const path = require("node:path");
const { validateResult } = require("../../core/result-validator");
const schema = require("../../schemas/development-memory-candidate.schema.json");

function createDevelopmentCandidateStore(options = {}) {
  const rootDir = options.rootDir || path.join(__dirname, "..", "..", "..", "data", "memory", "development-candidates");
  const candidateDir = path.join(rootDir, "candidates");
  const reportsDir = path.join(rootDir, "extraction-reports");

  function ensureDirs() {
    fs.mkdirSync(candidateDir, { recursive: true });
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  function candidatePath(candidateId) {
    const safeId = String(candidateId).replace(/[^a-zA-Z0-9_-]/g, "_");
    return path.join(candidateDir, `${safeId}.json`);
  }

  function validateCandidate(candidate, label = "candidate") {
    const validation = validateResult(candidate, schema, label);
    if (!validation.ok) {
      return {
        ok: false,
        error: {
          code: "CANDIDATE_SCHEMA_INVALID",
          message: `Development memory candidate failed schema validation: ${validation.errors.join("; ")}`,
          nextStep: "Fix the candidate payload to match development-memory-candidate.schema.json."
        },
        validation
      };
    }
    return { ok: true };
  }

  function writeCandidateAtomic(candidate) {
    ensureDirs();
    const filePath = candidatePath(candidate.candidateId);
    const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tempPath, `${JSON.stringify(candidate, null, 2)}\n`, "utf8");
    fs.renameSync(tempPath, filePath);
  }

  function readCandidate(candidateId) {
    ensureDirs();
    try {
      return JSON.parse(fs.readFileSync(candidatePath(candidateId), "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  function saveCandidate(candidate) {
    const validation = validateCandidate(candidate, candidate.candidateId);
    if (!validation.ok) {
      return { ok: false, error: validation.error, warnings: [] };
    }

    const existing = readCandidate(candidate.candidateId);
    if (existing) {
      const samePayload = JSON.stringify(existing) === JSON.stringify(candidate);
      if (samePayload) {
        return { ok: true, result: candidate, warnings: ["Duplicate candidate write ignored."] };
      }
    }

    writeCandidateAtomic(candidate);
    return { ok: true, result: candidate, warnings: [] };
  }

  function listCandidateFiles() {
    ensureDirs();
    try {
      return fs.readdirSync(candidateDir).filter((file) => file.endsWith(".json"));
    } catch (error) {
      if (error.code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  function listCandidates(filters = {}) {
    const candidates = [];

    for (const file of listCandidateFiles()) {
      const candidate = readCandidate(file.replace(/\.json$/, ""));
      if (!candidate) {
        continue;
      }

      if (filters.project && candidate.targetProject !== filters.project) {
        continue;
      }

      if (filters.sessionId && candidate.sessionId !== filters.sessionId) {
        continue;
      }

      if (filters.candidateType && candidate.candidateType !== filters.candidateType) {
        continue;
      }

      candidates.push(candidate);
    }

    candidates.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
    return candidates;
  }

  function saveExtractionReport(report) {
    ensureDirs();
    const fileName = `${report.sessionId}.${Date.now()}.json`;
    const filePath = path.join(reportsDir, fileName);
    fs.writeFileSync(filePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    return filePath;
  }

  function listExtractionReports(sessionId = null) {
    ensureDirs();
    const files = fs.readdirSync(reportsDir).filter((file) => file.endsWith(".json"));
    if (!sessionId) {
      return files;
    }
    return files.filter((file) => file.startsWith(`${sessionId}.`));
  }

  return {
    getRootDir: () => rootDir,
    readCandidate,
    saveCandidate,
    listCandidates,
    saveExtractionReport,
    listExtractionReports
  };
}

module.exports = {
  createDevelopmentCandidateStore
};
