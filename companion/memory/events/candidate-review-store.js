const fs = require("node:fs");
const path = require("node:path");
const { validateResult } = require("../../core/result-validator");
const { buildStableEventId } = require("./capture/event-id");
const schema = require("../../schemas/development-memory-candidate-review.schema.json");

function createDevelopmentCandidateReviewStore(options = {}) {
  const rootDir = options.rootDir || path.join(__dirname, "..", "..", "..", "data", "memory", "development-candidates");
  const reviewDir = path.join(rootDir, "reviews");

  function ensureDirs() {
    fs.mkdirSync(reviewDir, { recursive: true });
  }

  function reviewPath(candidateId) {
    const safeId = String(candidateId).replace(/[^a-zA-Z0-9_-]/g, "_");
    return path.join(reviewDir, `${safeId}.json`);
  }

  function buildReviewId(candidateId) {
    return buildStableEventId(["review", candidateId]).replace(/^evt_/, "rev_");
  }

  function validateReview(review, label = "review") {
    const validation = validateResult(review, schema, label);
    if (!validation.ok) {
      return {
        ok: false,
        error: {
          code: "REVIEW_SCHEMA_INVALID",
          message: `Development memory candidate review failed schema validation: ${validation.errors.join("; ")}`,
          nextStep: "Fix the review record to match development-memory-candidate-review.schema.json."
        },
        validation
      };
    }
    return { ok: true };
  }

  function writeReviewAtomic(review) {
    ensureDirs();
    const filePath = reviewPath(review.candidateId);
    const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tempPath, `${JSON.stringify(review, null, 2)}\n`, "utf8");
    fs.renameSync(tempPath, filePath);
  }

  function readReview(candidateId) {
    ensureDirs();
    try {
      return JSON.parse(fs.readFileSync(reviewPath(candidateId), "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  function saveReview(review) {
    const validation = validateReview(review, review.candidateId);
    if (!validation.ok) {
      return { ok: false, error: validation.error, warnings: [] };
    }

    writeReviewAtomic(review);
    return { ok: true, result: review, warnings: [] };
  }

  function createPendingReview(candidateId, writebackDeliveryMode = "proposal_only") {
    const now = new Date().toISOString();
    return {
      reviewId: buildReviewId(candidateId),
      schemaVersion: "1.0",
      candidateId,
      status: "pending",
      action: null,
      reviewer: null,
      reviewedAt: null,
      editedStatement: null,
      mergeTargetId: null,
      proposalId: null,
      proposalPath: null,
      notes: null,
      writebackDeliveryMode,
      createdAt: now,
      updatedAt: now
    };
  }

  function listReviews() {
    ensureDirs();
    const reviews = [];

    for (const file of fs.readdirSync(reviewDir).filter((entry) => entry.endsWith(".json"))) {
      const review = readReview(file.replace(/\.json$/, ""));
      if (review) {
        reviews.push(review);
      }
    }

    return reviews;
  }

  return {
    getRootDir: () => rootDir,
    readReview,
    saveReview,
    createPendingReview,
    listReviews,
    buildReviewId
  };
}

module.exports = {
  createDevelopmentCandidateReviewStore
};
