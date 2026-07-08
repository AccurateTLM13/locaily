const { mkdir, writeFile, readFile, readdir } = require("node:fs/promises");
const { join, basename, extname } = require("node:path");
const { validateResult } = require("../core/result-validator");
const schema = require("./schemas/human-review-record.schema.json");

const STORAGE_DIR = join(__dirname, "..", "..", "data", "evidence", "human-reviews");
const SCHEMA_VERSION = "locaily.human_review_record.v1";

async function ensureStorageDir(storageDir = STORAGE_DIR) {
  await mkdir(storageDir, { recursive: true });
}

function reviewFilename(trackRunId, storageDir = STORAGE_DIR) {
  return join(storageDir, `${sanitizeId(trackRunId)}.json`);
}

function sanitizeId(id) {
  return String(id || "").replace(/[^a-zA-Z0-9_-]/g, "_");
}

async function loadReview(trackRunId, options = {}) {
  const storageDir = options.storageDir || STORAGE_DIR;
  try {
    const raw = await readFile(reviewFilename(trackRunId, storageDir), "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function storeReview(review, options = {}) {
  const storageDir = options.storageDir || STORAGE_DIR;
  await ensureStorageDir(storageDir);

  const validation = validateResult(review, schema, review.reviewId || "humanReview");
  if (!validation.ok) {
    const error = new Error(`Human review record failed schema validation: ${validation.errors.join("; ")}`);
    error.code = "HUMAN_REVIEW_SCHEMA_INVALID";
    error.validation = validation;
    throw error;
  }

  const filePath = reviewFilename(review.trackRunId, storageDir);
  await writeFile(filePath, JSON.stringify(review, null, 2), "utf8");
  return { filePath, reviewId: review.reviewId, trackRunId: review.trackRunId };
}

async function upsertReview({ trackRun, body, now = new Date(), storageDir = STORAGE_DIR }) {
  const existing = await loadReview(trackRun.recordId, { storageDir });
  const review = buildReviewRecord({ trackRun, body, existing, now });
  const storeResult = await storeReview(review, { storageDir });
  return { review, storeResult, created: !existing };
}

async function listReviews(options = {}) {
  const storageDir = options.storageDir || STORAGE_DIR;
  await ensureStorageDir(storageDir);
  let files;
  try {
    files = await readdir(storageDir);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }

  const reviews = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = await readFile(join(storageDir, file), "utf8");
      reviews.push(JSON.parse(raw));
    } catch {
      // skip unreadable review records
    }
  }

  reviews.sort((a, b) => (b.reviewedAt || "").localeCompare(a.reviewedAt || ""));
  return reviews;
}

function buildReviewRecord({ trackRun, body, existing = null, now = new Date() }) {
  const modelChild = findReviewedModelChild(trackRun);
  const enforcementDecision = modelChild?.routing?.enforcementDecision || trackRun.routing?.enforcementDecision || null;
  const reviewedAt = body.reviewedAt || now.toISOString();

  return {
    schemaVersion: SCHEMA_VERSION,
    reviewId: existing?.reviewId || `review-${trackRun.recordId}`,
    trackRunId: trackRun.recordId,
    trackId: trackRun.trackId,
    roleId: body.roleId || modelChild?.execution?.modelInfo?.role || "unknown",
    capabilityId: body.capabilityId || modelChild?.routing?.capabilityId || trackRun.routing?.capabilityId || "unknown",
    executedCapabilityId: body.executedCapabilityId
      || enforcementDecision?.executedCapabilityId
      || modelChild?.execution?.modelInfo?.modelId
      || modelChild?.routing?.capabilityId
      || trackRun.routing?.capabilityId
      || "unknown",
    reviewer: body.reviewer,
    reviewedAt,
    usefulnessScore: body.usefulnessScore,
    accuracyScore: body.accuracyScore,
    structureScore: body.structureScore,
    clarityScore: body.clarityScore,
    riskScore: body.riskScore,
    riskFlags: Array.isArray(body.riskFlags) ? body.riskFlags : [],
    verdict: body.verdict,
    correctionRequired: body.correctionRequired === true,
    correctionText: body.correctionText || "",
    reviewerNotes: body.reviewerNotes || "",
    failureReasons: Array.isArray(body.failureReasons) ? body.failureReasons : [],
    createdAt: existing?.createdAt || now.toISOString(),
    updatedAt: now.toISOString()
  };
}

function findReviewedModelChild(trackRun) {
  const children = Array.isArray(trackRun.childRuns) ? trackRun.childRuns : [];
  return children.find((child) => child.routing?.enforcementDecision)
    || children.find((child) => child.routing?.executorType === "model")
    || null;
}

function buildQualitySummary(reviews) {
  const totalReviewedRuns = reviews.length;
  const verdictCounts = { pass: 0, needs_edit: 0, fail: 0 };
  const failureCounts = {};
  let correctionCount = 0;
  let criticalRiskCount = 0;

  for (const review of reviews) {
    if (Object.prototype.hasOwnProperty.call(verdictCounts, review.verdict)) {
      verdictCounts[review.verdict]++;
    }
    if (review.correctionRequired) correctionCount++;
    if ((review.riskScore || 0) >= 4 || (review.riskFlags || []).includes("critical")) {
      criticalRiskCount++;
    }
    for (const reason of review.failureReasons || []) {
      failureCounts[reason] = (failureCounts[reason] || 0) + 1;
    }
  }

  return {
    totalReviewedRuns,
    passCount: verdictCounts.pass,
    needsEditCount: verdictCounts.needs_edit,
    failCount: verdictCounts.fail,
    passRate: percentage(verdictCounts.pass, totalReviewedRuns),
    correctionRate: percentage(correctionCount, totalReviewedRuns),
    averageUsefulnessScore: average(reviews, "usefulnessScore"),
    averageAccuracyScore: average(reviews, "accuracyScore"),
    averageStructureScore: average(reviews, "structureScore"),
    commonFailureReasons: Object.entries(failureCounts)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason)),
    criticalRiskCount
  };
}

function average(records, key) {
  if (records.length === 0) return null;
  const total = records.reduce((sum, record) => sum + (Number(record[key]) || 0), 0);
  return Math.round((total / records.length) * 100) / 100;
}

function percentage(count, total) {
  if (total === 0) return null;
  return Math.round((count / total) * 10000) / 100;
}

module.exports = {
  STORAGE_DIR,
  SCHEMA_VERSION,
  buildReviewRecord,
  buildQualitySummary,
  loadReview,
  storeReview,
  upsertReview,
  listReviews,
  reviewFilename,
  sanitizeId
};
