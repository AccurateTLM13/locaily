const fs = require("node:fs/promises");
const path = require("node:path");
const { readJson, writeJson } = require("./fs-utils");
const { validateSchema } = require("./schema-validator");
const { writeChecksumRecord } = require("./checksums");

const LAB_ROOT = path.resolve(__dirname, "..");
const PROMOTED_EVIDENCE_SCHEMA_PATH = path.join(LAB_ROOT, "schemas", "promoted-evidence.schema.json");
const REPORT_SOURCE_SCHEMA_PATH = path.join(LAB_ROOT, "schemas", "benchmark-report-source.schema.json");

async function generateBenchmarkReport({
  reportId,
  title,
  evidenceIds,
  now = () => new Date()
}) {
  if (!reportId) {
    throw new Error("Report generation requires --report.");
  }

  if (!Array.isArray(evidenceIds) || evidenceIds.length === 0) {
    throw new Error("Report generation requires at least one --evidence value.");
  }

  const promotedEvidenceSchema = await readJson(PROMOTED_EVIDENCE_SCHEMA_PATH);
  const reportSourceSchema = await readJson(REPORT_SOURCE_SCHEMA_PATH);
  const evidence = [];

  for (const evidenceId of evidenceIds) {
    const evidencePath = path.join(LAB_ROOT, "evidence", "summaries", `${evidenceId}.json`);
    const promotedEvidence = await readJson(evidencePath);
    assertValid(validateSchema(promotedEvidence, promotedEvidenceSchema, `evidence:${evidenceId}`), "Promoted evidence is invalid.");
    evidence.push(promotedEvidence);
  }

  const source = buildReportSource({
    reportId,
    title: title || reportId,
    generatedAt: now().toISOString(),
    evidence
  });

  assertValid(validateSchema(source, reportSourceSchema, "reportSource"), "Report source is invalid.");

  const markdown = renderReport(source);
  const reportDir = path.join(LAB_ROOT, "reports", "published");
  const sourcePath = path.join(reportDir, `${reportId}.source.json`);
  const markdownPath = path.join(reportDir, `${reportId}.md`);

  await writeJson(sourcePath, source);
  await writeText(markdownPath, markdown);
  const sourceChecksum = await writeChecksumRecord({
    artifactPath: sourcePath,
    artifactType: "benchmark_report_source",
    checksumId: `${reportId}-report-source`
  });
  const markdownChecksum = await writeChecksumRecord({
    artifactPath: markdownPath,
    artifactType: "benchmark_report_markdown",
    checksumId: `${reportId}-report-markdown`
  });

  return {
    reportId,
    sourcePath,
    markdownPath,
    checksumPaths: [
      sourceChecksum.checksumPath,
      markdownChecksum.checksumPath
    ],
    source,
    markdown
  };
}

function buildReportSource({ reportId, title, generatedAt, evidence }) {
  return {
    schemaVersion: "benchmark.report_source.v1",
    reportId,
    title,
    generatedAt,
    evidenceIds: evidence.map((item) => item.evidenceId),
    summaries: evidence.map((item) => {
      const summary = item.summary || {};
      return {
        evidenceId: item.evidenceId,
        sourceRunId: item.sourceRunId,
        suiteId: item.suiteId,
        trackId: item.trackId,
        contractId: item.contractId,
        caseCount: summary.caseCount || 0,
        passed: summary.passed || 0,
        failed: summary.failed || 0,
        errors: summary.errors || 0,
        timeouts: summary.timeouts || 0,
        malformed: summary.malformed || 0,
        passRate: calculatePassRate(summary)
      };
    })
  };
}

function renderReport(source) {
  const lines = [
    `# ${source.title}`,
    "",
    `Generated: ${source.generatedAt}`,
    "",
    "## Evidence Summary",
    "",
    "| Evidence | Track | Contract | Cases | Pass Rate | Failures | Runtime Errors | Timeouts | Malformed |",
    "|---|---|---|---:|---:|---:|---:|---:|---:|"
  ];

  for (const summary of source.summaries) {
    lines.push(`| ${summary.evidenceId} | ${summary.trackId} | ${summary.contractId} | ${summary.caseCount} | ${Math.round(summary.passRate * 1000) / 10}% | ${summary.failed} | ${summary.errors} | ${summary.timeouts} | ${summary.malformed} |`);
  }

  lines.push(
    "",
    "## Notes",
    "",
    "- This report is generated from promoted Benchmark Lab evidence only.",
    "- It does not include raw prompts or raw model responses.",
    "- It does not create or imply a model qualification record.",
    ""
  );

  return `${lines.join("\n")}\n`;
}

function calculatePassRate(summary) {
  if (!summary || !summary.caseCount) {
    return 0;
  }

  return Math.round((summary.passed / summary.caseCount) * 10000) / 10000;
}

async function writeText(filePath, text) {
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
  generateBenchmarkReport,
  buildReportSource,
  renderReport,
  calculatePassRate
};
