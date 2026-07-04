const path = require("node:path");
const { readJson, writeJson, toPosixPath } = require("./fs-utils");
const { validateSchema } = require("./schema-validator");
const { writeChecksumRecord } = require("./checksums");

const LAB_ROOT = path.resolve(__dirname, "..");
const SUMMARY_SCHEMA_PATH = path.join(LAB_ROOT, "schemas", "benchmark-run-summary.schema.json");
const REVIEW_SCHEMA_PATH = path.join(LAB_ROOT, "schemas", "benchmark-review.schema.json");
const APPROVED_EVIDENCE_SCHEMA_PATH = path.join(LAB_ROOT, "schemas", "approved-evidence-summary.schema.json");
const PROMOTED_EVIDENCE_SCHEMA_PATH = path.join(LAB_ROOT, "schemas", "promoted-evidence.schema.json");

async function reviewRun({ runId, now = () => new Date() }) {
  const summaryPath = getDraftSummaryPath(runId);
  const summarySchema = await readJson(SUMMARY_SCHEMA_PATH);
  const reviewSchema = await readJson(REVIEW_SCHEMA_PATH);
  const summary = await readJson(summaryPath);

  assertValid(validateSchema(summary, summarySchema, "summary"), "Draft summary is invalid.");

  const review = buildReview({ summary, reviewedAt: now().toISOString() });
  assertValid(validateSchema(review, reviewSchema, "review"), "Review is invalid.");

  const reviewPath = path.join(LAB_ROOT, "reports", "drafts", runId, "review.json");
  await writeJson(reviewPath, review);

  return {
    runId,
    reviewPath,
    review
  };
}

async function promoteRun({ runId, evidenceId, approvedBy, notes = [], now = () => new Date() }) {
  if (!evidenceId) {
    throw new Error("Promotion requires --evidence.");
  }

  if (!approvedBy) {
    throw new Error("Promotion requires --approved-by.");
  }

  const summarySchema = await readJson(SUMMARY_SCHEMA_PATH);
  const approvedEvidenceSchema = await readJson(APPROVED_EVIDENCE_SCHEMA_PATH);
  const promotedEvidenceSchema = await readJson(PROMOTED_EVIDENCE_SCHEMA_PATH);
  const summary = await readJson(getDraftSummaryPath(runId));

  assertValid(validateSchema(summary, summarySchema, "summary"), "Draft summary is invalid.");

  const approvedAt = now().toISOString();
  const promotedEvidence = {
    schemaVersion: "benchmark.promoted_evidence.v1",
    evidenceId,
    sourceRunId: runId,
    suiteId: summary.suiteId,
    trackId: summary.trackId,
    contractId: summary.contractId,
    approvedAt,
    approvedBy,
    summary,
    notes
  };

  assertValid(validateSchema(promotedEvidence, promotedEvidenceSchema, "promotedEvidence"), "Promoted evidence is invalid.");

  const promotedPath = path.join(LAB_ROOT, "evidence", "summaries", `${evidenceId}.json`);
  const approvedSummary = {
    schemaVersion: "benchmark.approved_evidence_summary.v1",
    evidenceId,
    sourceRunId: runId,
    approvedAt,
    approvedBy,
    summaryPath: toPosixPath(path.relative(path.resolve(LAB_ROOT, ".."), promotedPath)),
    claims: [
      "Explicitly promoted benchmark evidence. No model qualification claim is made by this artifact."
    ]
  };

  assertValid(validateSchema(approvedSummary, approvedEvidenceSchema, "approvedSummary"), "Approved evidence summary is invalid.");

  const approvedPath = path.join(LAB_ROOT, "evidence", "approved", `${evidenceId}.json`);
  await writeJson(promotedPath, promotedEvidence);
  await writeJson(approvedPath, approvedSummary);
  const promotedChecksum = await writeChecksumRecord({
    artifactPath: promotedPath,
    artifactType: "promoted_evidence",
    checksumId: `${evidenceId}-promoted-evidence`
  });
  const approvedChecksum = await writeChecksumRecord({
    artifactPath: approvedPath,
    artifactType: "approved_evidence_summary",
    checksumId: `${evidenceId}-approved-summary`
  });

  return {
    runId,
    evidenceId,
    promotedPath,
    approvedPath,
    checksumPaths: [
      promotedChecksum.checksumPath,
      approvedChecksum.checksumPath
    ],
    promotedEvidence,
    approvedSummary
  };
}

function buildReview({ summary, reviewedAt }) {
  const notableCases = summary.caseResults
    .filter((result) => result.verdict !== "PASS")
    .map((result) => ({
      caseId: result.caseId,
      verdict: result.verdict
    }));
  const hasFailures = notableCases.length > 0;

  return {
    schemaVersion: "benchmark.review.v1",
    runId: summary.runId,
    suiteId: summary.suiteId,
    reviewedAt,
    caseCount: summary.caseCount,
    passed: summary.passed,
    failed: summary.failed,
    errors: summary.errors,
    timeouts: summary.timeouts,
    malformed: summary.malformed,
    promotion: {
      eligible: !hasFailures,
      reason: hasFailures
        ? "Run contains failed, malformed, timeout, or runtime-error cases."
        : "Run contains no failed cases."
    },
    notableCases
  };
}

function getDraftSummaryPath(runId) {
  if (!runId) {
    throw new Error("Run id is required.");
  }

  return path.join(LAB_ROOT, "reports", "drafts", runId, "summary.json");
}

function assertValid(validation, message) {
  if (!validation.ok) {
    const error = new Error(`${message} ${validation.errors.join(" ")}`);
    error.validation = validation;
    throw error;
  }
}

module.exports = {
  reviewRun,
  promoteRun,
  buildReview
};
