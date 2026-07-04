const fs = require("node:fs");
const path = require("node:path");
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

    const schemaValidation = qualificationSchema
      ? validateResult(parsed, qualificationSchema, "qualification")
      : { ok: parsed && parsed.schemaVersion === "benchmark.qualification.v1", errors: [] };

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
