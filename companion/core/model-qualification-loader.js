const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { validateResult } = require("./result-validator");

const DEFAULT_QUALIFICATION_SCHEMA_PATH = path.resolve(
  __dirname,
  "..",
  "..",
  "benchmark-lab",
  "schemas",
  "qualification-record.schema.json"
);

function createModelQualificationLoader(options = {}) {
  const qualificationDir = options.qualificationDir
    || path.resolve(__dirname, "..", "..", "benchmark-lab", "qualifications", "models");
  const checksumDir = options.checksumDir
    || path.resolve(__dirname, "..", "..", "benchmark-lab", "evidence", "checksums");
  const qualificationSchema = options.qualificationSchema || loadQualificationSchema(options.schemaPath);

  return {
    list() {
      return loadQualificationRecords(qualificationDir, qualificationSchema);
    },
    getStatus() {
      const scan = scanQualificationRecords(qualificationDir, qualificationSchema);
      const checksumCount = countJsonFiles(checksumDir);
      const checksumVerification = verifyQualificationChecksums(checksumDir);
      const byStatus = {};
      const byRole = {};
      let latestGeneratedAt = null;

      for (const record of scan.records) {
        const status = record.status || "unknown";
        byStatus[status] = (byStatus[status] || 0) + 1;

        for (const entry of record.qualifiedFor || []) {
          const role = entry.role || "unknown";
          byRole[role] = (byRole[role] || 0) + 1;
        }

        if (record.generatedAt && (!latestGeneratedAt || record.generatedAt > latestGeneratedAt)) {
          latestGeneratedAt = record.generatedAt;
        }
      }

      return {
        enabled: true,
        qualificationDir,
        checksumDir,
        records: scan.records.length,
        invalidRecords: scan.errors.length,
        checksums: checksumCount,
        checksumVerification,
        byStatus,
        byRole,
        latestGeneratedAt,
        errors: scan.errors
      };
    },
    findByModel(modelId) {
      const normalizedModelId = normalizeId(modelId);
      return loadQualificationRecords(qualificationDir, qualificationSchema)
        .filter((record) => matchesModel(record, normalizedModelId));
    },
    findForRole({ modelId, role, trackId = null, contractId = null }) {
      const normalizedModelId = normalizeId(modelId);
      const normalizedRole = normalizeId(role);
      const normalizedTrackId = normalizeId(trackId);
      const normalizedContractId = normalizeId(contractId);
      const matches = [];

      for (const record of loadQualificationRecords(qualificationDir, qualificationSchema)) {
        if (!matchesModel(record, normalizedModelId)) {
          continue;
        }

        for (const entry of record.qualifiedFor || []) {
          if (normalizeId(entry.role) !== normalizedRole) {
            continue;
          }

          if (normalizedTrackId && normalizeId(entry.trackId) !== normalizedTrackId) {
            continue;
          }

          if (normalizedContractId && normalizeId(entry.contractId) !== normalizedContractId) {
            continue;
          }

          matches.push({
            recordId: record.recordId,
            modelId: record.subject.id,
            runtimeModelName: record.subject.runtimeModelName || null,
            status: entry.status,
            role: entry.role,
            trackId: entry.trackId,
            contractId: entry.contractId,
            score: typeof entry.score === "number" ? entry.score : null,
            evidenceIds: record.evidence ? record.evidence.evidenceIds || [] : [],
            generatedAt: record.generatedAt
          });
        }
      }

      return matches;
    }
  };
}

function loadQualificationRecords(qualificationDir, qualificationSchema = loadQualificationSchema()) {
  return scanQualificationRecords(qualificationDir, qualificationSchema).records;
}

function scanQualificationRecords(qualificationDir, qualificationSchema = loadQualificationSchema()) {
  if (!qualificationSchema) {
    return {
      records: [],
      errors: [{
        file: qualificationDir,
        code: "QUALIFICATION_SCHEMA_UNAVAILABLE",
        message: "Qualification records are not trusted because the qualification schema is unavailable."
      }]
    };
  }

  if (!fs.existsSync(qualificationDir)) {
    return {
      records: [],
      errors: []
    };
  }

  const records = [];
  const errors = [];
  const entries = fs.readdirSync(qualificationDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }

    const filePath = path.join(qualificationDir, entry.name);
    let parsed;

    try {
      parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (error) {
      errors.push({
        file: filePath,
        code: "QUALIFICATION_RECORD_INVALID_JSON",
        message: error.message
      });
      continue;
    }

    const schemaValidation = validateResult(parsed, qualificationSchema, "qualification");

    if (schemaValidation.ok) {
      records.push(parsed);
    } else {
      errors.push({
        file: filePath,
        code: parsed && parsed.schemaVersion === "benchmark.qualification.v1"
          ? "QUALIFICATION_RECORD_SCHEMA_INVALID"
          : "QUALIFICATION_RECORD_SCHEMA_UNSUPPORTED",
        message: schemaValidation.errors.length > 0
          ? schemaValidation.errors.join("; ")
          : "Qualification record schemaVersion is missing or unsupported."
      });
    }
  }

  return {
    records,
    errors
  };
}

function verifyQualificationChecksums(checksumDir) {
  const result = { total: 0, passed: 0, failures: [] };
  if (!fs.existsSync(checksumDir)) {
    return result;
  }

  for (const entry of fs.readdirSync(checksumDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }

    const checksumPath = path.join(checksumDir, entry.name);
    let record;
    try {
      record = JSON.parse(fs.readFileSync(checksumPath, "utf8"));
    } catch (error) {
      continue;
    }
    if (record.artifactType !== "qualification_record") {
      continue;
    }

    result.total += 1;
    try {
      const repositoryRoot = path.resolve(__dirname, "..", "..");
      const artifactPath = path.resolve(repositoryRoot, record.artifactPath);
      if (!artifactPath.startsWith(`${repositoryRoot}${path.sep}`)) {
        throw new Error("Checksum artifact path escapes the repository root.");
      }
      const raw = fs.readFileSync(artifactPath);
      const content = record.checksumMode === "canonical_text_v1"
        ? Buffer.from(raw.toString("utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n"), "utf8")
        : raw;
      const actual = `sha256:${crypto.createHash("sha256").update(content).digest("hex")}`;
      if (actual !== record.checksum) {
        throw new Error(`Checksum mismatch: expected ${record.checksum}, received ${actual}.`);
      }
      result.passed += 1;
    } catch (error) {
      result.failures.push({
        file: checksumPath,
        code: "QUALIFICATION_CHECKSUM_INVALID",
        message: error.message
      });
    }
  }

  return result;
}

function countJsonFiles(dir) {
  if (!fs.existsSync(dir)) {
    return 0;
  }

  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .length;
}

function loadQualificationSchema(schemaPath = DEFAULT_QUALIFICATION_SCHEMA_PATH) {
  try {
    return JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  } catch (error) {
    return null;
  }
}

function normalizeId(value) {
  return typeof value === "string" ? value.trim() : "";
}

function matchesModel(record, normalizedModelId) {
  const subject = record.subject || {};
  return normalizeId(subject.id) === normalizedModelId
    || normalizeId(subject.runtimeModelName) === normalizedModelId;
}

module.exports = {
  createModelQualificationLoader,
  loadQualificationSchema,
  loadQualificationRecords,
  scanQualificationRecords
};
