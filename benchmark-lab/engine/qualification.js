const path = require("node:path");
const { readJson, writeJson } = require("./fs-utils");
const { validateSchema } = require("./schema-validator");
const { writeChecksumRecord } = require("./checksums");

const LAB_ROOT = path.resolve(__dirname, "..");
const MODEL_MANIFEST_SCHEMA_PATH = path.join(LAB_ROOT, "schemas", "model-manifest.schema.json");
const PROMOTED_EVIDENCE_SCHEMA_PATH = path.join(LAB_ROOT, "schemas", "promoted-evidence.schema.json");
const QUALIFICATION_SCHEMA_PATH = path.join(LAB_ROOT, "schemas", "qualification-record.schema.json");

async function generateQualification({
  modelId,
  evidenceId,
  role = null,
  status = "screening",
  roleStatus = null,
  notes = [],
  now = () => new Date()
}) {
  if (!modelId) {
    throw new Error("Qualification generation requires --model.");
  }

  if (!evidenceId) {
    throw new Error("Qualification generation requires --evidence.");
  }

  const modelManifestSchema = await readJson(MODEL_MANIFEST_SCHEMA_PATH);
  const promotedEvidenceSchema = await readJson(PROMOTED_EVIDENCE_SCHEMA_PATH);
  const qualificationSchema = await readJson(QUALIFICATION_SCHEMA_PATH);
  const manifest = await readJson(path.join(LAB_ROOT, "models", "manifests", `${modelId}.json`));
  const evidence = await readJson(path.join(LAB_ROOT, "evidence", "summaries", `${evidenceId}.json`));

  assertValid(validateSchema(manifest, modelManifestSchema, "modelManifest"), "Model manifest is invalid.");
  assertValid(validateSchema(evidence, promotedEvidenceSchema, "promotedEvidence"), "Promoted evidence is invalid.");

  const record = buildQualificationRecord({
    manifest,
    evidence,
    role,
    status,
    roleStatus,
    notes,
    generatedAt: now().toISOString()
  });

  assertValid(validateSchema(record, qualificationSchema, "qualification"), "Qualification record is invalid.");

  const recordPath = path.join(LAB_ROOT, "qualifications", "models", `${record.recordId}.json`);
  await writeJson(recordPath, record);
  const checksum = await writeChecksumRecord({
    artifactPath: recordPath,
    artifactType: "qualification_record",
    checksumId: `${record.recordId}-qualification`
  });

  return {
    recordPath,
    checksumPath: checksum.checksumPath,
    record
  };
}

function buildQualificationRecord({
  manifest,
  evidence,
  role,
  status,
  roleStatus,
  notes,
  generatedAt
}) {
  const normalizedRole = typeof role === "string" && role.trim() ? role.trim() : null;
  const normalizedRoleStatus = typeof roleStatus === "string" && roleStatus.trim()
    ? roleStatus.trim()
    : null;
  const qualifiedFor = [];

  if (normalizedRole && normalizedRoleStatus) {
    qualifiedFor.push({
      role: normalizedRole,
      trackId: evidence.trackId,
      contractId: evidence.contractId,
      status: normalizedRoleStatus,
      score: calculatePassRate(evidence.summary),
      conditions: normalizedRoleStatus === "qualified"
        ? []
        : ["Generated from explicit promoted evidence; review conditions before routing."]
    });
  }

  return {
    schemaVersion: "benchmark.qualification.v1",
    recordId: `${manifest.modelId}-${evidence.evidenceId}`,
    subject: {
      type: "model",
      id: manifest.modelId,
      provider: manifest.runtime,
      runtimeModelName: manifest.runtimeModelName,
      digest: manifest.digest || "unknown"
    },
    status,
    qualifiedFor,
    evidence: {
      evidenceIds: [
        evidence.evidenceId
      ],
      summaryPaths: [
        `benchmark-lab/evidence/summaries/${evidence.evidenceId}.json`
      ]
    },
    modelProfileId: manifest.modelId,
    notes: [
      "Generated from explicitly promoted Benchmark Lab evidence.",
      ...notes
    ],
    generatedAt
  };
}

function calculatePassRate(summary) {
  if (!summary || !summary.caseCount) {
    return 0;
  }

  return Math.round((summary.passed / summary.caseCount) * 10000) / 10000;
}

function assertValid(validation, message) {
  if (!validation.ok) {
    const error = new Error(`${message} ${validation.errors.join(" ")}`);
    error.validation = validation;
    throw error;
  }
}

module.exports = {
  generateQualification,
  buildQualificationRecord,
  calculatePassRate
};
