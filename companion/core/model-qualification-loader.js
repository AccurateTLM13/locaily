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

const TEXT_EXTENSIONS = new Set([".json", ".md", ".js", ".txt", ".yaml", ".yml", ".toml", ".html", ".css", ".xml", ".svg"]);

function createRecordCache() {
  const entries = new Map();

  return {
    get(filePath, stat) {
      const cached = entries.get(filePath);
      if (!cached || cached.key !== `${stat.mtimeMs}:${stat.size}`) {
        return null;
      }
      return cached.value;
    },
    set(filePath, stat, value) {
      entries.set(filePath, { key: `${stat.mtimeMs}:${stat.size}`, value });
    },
    drop(filePath) {
      entries.delete(filePath);
    }
  };
}

function verifyChecksumDirectory(checksumDir) {
  const summary = {
    total: 0,
    verified: 0,
    failed: 0,
    failures: [],
    results: []
  };

  if (!fs.existsSync(checksumDir)) {
    return summary;
  }

  for (const entry of fs.readdirSync(checksumDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }

    const filePath = path.join(checksumDir, entry.name);
    let record;
    try {
      record = JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (error) {
      // A malformed qualification checksum is still a real failure. Draft,
      // raw, and other transient checksum artifacts remain outside this
      // endpoint's qualification verification scope.
      if (!entry.name.endsWith("-qualification.json")) {
        continue;
      }
      summary.total += 1;
      const result = verifyChecksumFile(filePath);
      result.file = filePath;
      summary.results.push(result);
      summary.failed += 1;
      summary.failures.push({
        file: filePath,
        checksumId: result.checksumId || null,
        reason: result.reason,
        detail: result.detail || error.message
      });
      continue;
    }

    if (!record || record.artifactType !== "qualification_record") {
      continue;
    }

    summary.total += 1;
    const result = verifyChecksumFile(filePath);
    result.file = filePath;
    summary.results.push(result);

    if (result.ok) {
      summary.verified += 1;
    } else {
      summary.failed += 1;
      summary.failures.push({
        file: filePath,
        checksumId: result.checksumId || null,
        reason: result.reason,
        detail: result.detail || null
      });
    }
  }

  return summary;
}

function verifyChecksumFile(checksumFilePath) {
  let record;

  try {
    record = JSON.parse(fs.readFileSync(checksumFilePath, "utf8"));
  } catch (error) {
    return {
      ok: false,
      reason: "CHECKSUM_RECORD_INVALID_JSON",
      detail: error.message
    };
  }

  if (!record || typeof record.artifactPath !== "string" || typeof record.checksum !== "string") {
    return {
      ok: false,
      checksumId: record && record.checksumId ? record.checksumId : null,
      reason: "CHECKSUM_RECORD_INCOMPLETE",
      detail: "Checksum record is missing artifactPath or checksum."
    };
  }

  const repositoryRoot = path.resolve(__dirname, "..", "..");
  const artifactPath = path.resolve(repositoryRoot, record.artifactPath);

  if (!artifactPath.startsWith(`${repositoryRoot}${path.sep}`)) {
    return {
      ok: false,
      checksumId: record.checksumId || null,
      reason: "ARTIFACT_PATH_ESCAPES_REPOSITORY",
      detail: artifactPath
    };
  }

  let artifact;
  try {
    artifact = fs.readFileSync(artifactPath);
  } catch (error) {
    return {
      ok: false,
      checksumId: record.checksumId || null,
      reason: "ARTIFACT_MISSING",
      detail: artifactPath
    };
  }

  const mode = record.checksumMode || "byte_exact";
  const actual = checksumContent(artifact, mode);

  if (actual === record.checksum) {
    return {
      ok: true,
      checksumId: record.checksumId || null,
      expected: record.checksum,
      actual
    };
  }

  if (mode === "byte_exact" && isTextArtifact(artifactPath)) {
    const canonicalActual = checksumContent(artifact, "canonical_text_v1");
    if (canonicalActual === record.checksum) {
      return {
        ok: true,
        checksumId: record.checksumId || null,
        expected: record.checksum,
        actual: canonicalActual,
        legacyCanonicalMatch: true
      };
    }
  }

  return {
    ok: false,
    checksumId: record.checksumId || null,
    reason: "CHECKSUM_MISMATCH",
    detail: `expected ${record.checksum}, got ${actual}`,
    expected: record.checksum,
    actual
  };
}

function checksumContent(buffer, mode) {
  let content = buffer;

  if (mode === "canonical_text_v1") {
    content = Buffer.from(buffer.toString("utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n"), "utf8");
  }

  return `sha256:${crypto.createHash("sha256").update(content).digest("hex")}`;
}

function isTextArtifact(filePath) {
  return TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function createModelQualificationLoader(options = {}) {
  const qualificationDir = options.qualificationDir
    || path.resolve(__dirname, "..", "..", "benchmark-lab", "qualifications", "models");
  const checksumDir = options.checksumDir
    || path.resolve(__dirname, "..", "..", "benchmark-lab", "evidence", "checksums");
  const qualificationSchema = options.qualificationSchema || loadQualificationSchema(options.schemaPath);
  const recordCache = createRecordCache();

  return {
    list() {
      return loadQualificationRecords(qualificationDir, qualificationSchema, recordCache);
    },
    getStatus() {
      const scan = scanQualificationRecords(qualificationDir, qualificationSchema, recordCache);
      const checksumVerification = verifyChecksumDirectory(checksumDir);
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
        checksums: checksumVerification.total,
        checksumVerification: {
          total: checksumVerification.total,
          verified: checksumVerification.verified,
          passed: checksumVerification.verified,
          failed: checksumVerification.failed,
          failures: checksumVerification.failures
        },
        byStatus,
        byRole,
        latestGeneratedAt,
        errors: scan.errors
      };
    },
    findByModel(modelId) {
      const normalizedModelId = normalizeId(modelId);
      return loadQualificationRecords(qualificationDir, qualificationSchema, recordCache)
        .filter((record) => matchesModel(record, normalizedModelId));
    },
    findForRole({ modelId, role, trackId = null, contractId = null }) {
      const normalizedModelId = normalizeId(modelId);
      const normalizedRole = normalizeId(role);
      const normalizedTrackId = normalizeId(trackId);
      const normalizedContractId = normalizeId(contractId);
      const matches = [];

      for (const record of loadQualificationRecords(qualificationDir, qualificationSchema, recordCache)) {
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

function loadQualificationRecords(qualificationDir, qualificationSchema = loadQualificationSchema(), cache = null) {
  return scanQualificationRecords(qualificationDir, qualificationSchema, cache).records;
}

function scanQualificationRecords(qualificationDir, qualificationSchema = loadQualificationSchema(), cache = null) {
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
    let stat;

    try {
      stat = fs.statSync(filePath);
    } catch (error) {
      continue;
    }

    let parsed = cache ? cache.get(filePath, stat) : null;
    const fromCache = parsed !== null;

    if (!parsed) {
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
    }
    const schemaValidation = validateResult(parsed, qualificationSchema, "qualification");

    if (schemaValidation.ok) {
      records.push(parsed);

      if (cache && !fromCache) {
        cache.set(filePath, stat, parsed);
      }
    } else {
      if (cache) {
        cache.drop(filePath);
      }

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
