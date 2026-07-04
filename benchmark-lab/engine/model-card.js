const path = require("node:path");
const { readJson, writeJson } = require("./fs-utils");
const { validateSchema } = require("./schema-validator");
const { writeChecksumRecord } = require("./checksums");

const LAB_ROOT = path.resolve(__dirname, "..");
const MODEL_MANIFEST_SCHEMA_PATH = path.join(LAB_ROOT, "schemas", "model-manifest.schema.json");
const MODEL_CARD_SOURCE_SCHEMA_PATH = path.join(LAB_ROOT, "schemas", "model-card-source-data.schema.json");
const PROMOTED_EVIDENCE_SCHEMA_PATH = path.join(LAB_ROOT, "schemas", "promoted-evidence.schema.json");

async function generateModelCard({ modelId, evidenceIds, now = () => new Date() }) {
  if (!modelId) {
    throw new Error("Model card generation requires --model.");
  }

  if (!Array.isArray(evidenceIds) || evidenceIds.length === 0) {
    throw new Error("Model card generation requires at least one --evidence value.");
  }

  const modelManifestSchema = await readJson(MODEL_MANIFEST_SCHEMA_PATH);
  const modelCardSourceSchema = await readJson(MODEL_CARD_SOURCE_SCHEMA_PATH);
  const promotedEvidenceSchema = await readJson(PROMOTED_EVIDENCE_SCHEMA_PATH);
  const manifestPath = path.join(LAB_ROOT, "models", "manifests", `${modelId}.json`);
  const manifest = await readJson(manifestPath);

  assertValid(validateSchema(manifest, modelManifestSchema, "modelManifest"), "Model manifest is invalid.");

  const evidence = [];
  for (const evidenceId of evidenceIds) {
    const evidencePath = path.join(LAB_ROOT, "evidence", "summaries", `${evidenceId}.json`);
    const promotedEvidence = await readJson(evidencePath);
    assertValid(validateSchema(promotedEvidence, promotedEvidenceSchema, `evidence:${evidenceId}`), "Promoted evidence is invalid.");
    evidence.push(promotedEvidence);
  }

  const sourceData = buildSourceData({
    manifest,
    evidence,
    generatedAt: now().toISOString()
  });
  assertValid(validateSchema(sourceData, modelCardSourceSchema, "modelCardSource"), "Model card source data is invalid.");

  const markdown = renderModelCard({ manifest, sourceData, evidence });
  const modelCardDir = path.join(LAB_ROOT, "model-cards", "published");
  const sourcePath = path.join(modelCardDir, `${modelId}.source.json`);
  const markdownPath = path.join(modelCardDir, `${modelId}.md`);

  await writeJson(sourcePath, sourceData);
  await writeText(markdownPath, markdown);
  const sourceChecksum = await writeChecksumRecord({
    artifactPath: sourcePath,
    artifactType: "model_card_source",
    checksumId: `${modelId}-model-card-source`
  });
  const markdownChecksum = await writeChecksumRecord({
    artifactPath: markdownPath,
    artifactType: "model_card_markdown",
    checksumId: `${modelId}-model-card-markdown`
  });

  return {
    modelId,
    sourcePath,
    markdownPath,
    checksumPaths: [
      sourceChecksum.checksumPath,
      markdownChecksum.checksumPath
    ],
    sourceData,
    markdown
  };
}

function buildSourceData({ manifest, evidence, generatedAt }) {
  const trackQualifications = evidence.map((item) => ({
    trackId: item.trackId,
    status: "screening",
    evidenceIds: [
      item.evidenceId
    ]
  }));

  return {
    schemaVersion: "benchmark.model_card_source.v1",
    modelId: manifest.modelId,
    runtimeModelName: manifest.runtimeModelName,
    generatedAt,
    evidenceIds: evidence.map((item) => item.evidenceId),
    trackQualifications,
    limitations: [
      "Draft model card only. No Locaily routing qualification is claimed by this artifact."
    ]
  };
}

function renderModelCard({ manifest, sourceData, evidence }) {
  const lines = [
    `# ${manifest.displayName}`,
    "",
    "## Identity",
    "",
    `- Model ID: ${manifest.modelId}`,
    `- Provider: ${manifest.provider}`,
    `- Runtime: ${manifest.runtime}`,
    `- Runtime model name: ${manifest.runtimeModelName}`,
    `- Status: ${manifest.status}`,
    "",
    "## Evidence",
    "",
    "| Evidence ID | Track | Contract | Source Run | Pass Rate |",
    "|---|---|---|---|---:|"
  ];

  for (const item of evidence) {
    const passRate = item.summary.caseCount === 0
      ? "0%"
      : `${Math.round((item.summary.passed / item.summary.caseCount) * 1000) / 10}%`;
    lines.push(`| ${item.evidenceId} | ${item.trackId} | ${item.contractId} | ${item.sourceRunId} | ${passRate} |`);
  }

  lines.push(
    "",
    "## Track Status",
    "",
    "| Track | Status | Evidence |",
    "|---|---|---|"
  );

  for (const track of sourceData.trackQualifications) {
    lines.push(`| ${track.trackId} | ${track.status} | ${track.evidenceIds.join(", ")} |`);
  }

  lines.push(
    "",
    "## Limitations",
    ""
  );

  for (const limitation of sourceData.limitations) {
    lines.push(`- ${limitation}`);
  }

  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function writeText(filePath, text) {
  const fs = require("node:fs/promises");
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(`${filePath}.tmp`, text, "utf8");
  await fs.rename(`${filePath}.tmp`, filePath);
}

function assertValid(validation, message) {
  if (!validation.ok) {
    const error = new Error(`${message} ${validation.errors.join(" ")}`);
    error.validation = validation;
    throw error;
  }
}

module.exports = {
  generateModelCard,
  buildSourceData,
  renderModelCard
};
