const { readFileSync, writeFileSync, renameSync, mkdirSync, readdirSync } = require("node:fs");
const { join } = require("node:path");
const { randomUUID } = require("node:crypto");
const { validateResult } = require("./result-validator");
const durableJobSchema = require("../schemas/internal/durable-job.schema.json");

const STATUSES = ["queued", "claimed", "running", "completed", "failed", "cancelled", "paused_review"];
const TERMINAL_STATUSES = ["completed", "failed", "cancelled"];

const VALID_TRANSITIONS = {
  queued: ["claimed", "cancelled"],
  claimed: ["running", "cancelled", "queued"],
  running: ["completed", "failed", "paused_review"],
  failed: ["queued"],
  completed: [],
  cancelled: [],
  paused_review: ["queued", "failed", "cancelled"]
};

const DEFAULT_LEASE_DURATION_MS = 60_000;

function createDurableJobStore(options = {}) {
  const dataDir = options.dataDir || join(process.cwd(), "data");
  const jobsDir = join(dataDir, "jobs");

  const jobs = new Map();

  function ensureJobsDir() {
    try {
      mkdirSync(jobsDir, { recursive: true });
    } catch {}
  }

  function jobFilePath(jobId) {
    return join(jobsDir, `${jobId}.json`);
  }

  function loadAllJobs() {
    ensureJobsDir();
    try {
      const files = readdirSync(jobsDir);
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        const filePath = join(jobsDir, file);
        try {
          const raw = readFileSync(filePath, "utf8");
          const job = JSON.parse(raw);
          if (job && typeof job === "object" && job.jobId) {
            jobs.set(job.jobId, job);
          }
        } catch {}
      }
    } catch {}
  }

  function atomicWriteJob(job) {
    ensureJobsDir();
    const filePath = jobFilePath(job.jobId);
    const tmpPath = filePath + ".tmp." + randomUUID().replace(/-/g, "").slice(0, 12);
    writeFileSync(tmpPath, JSON.stringify(job, null, 2), { encoding: "utf8" });
    renameSync(tmpPath, filePath);
  }

  function validateJob(job) {
    const validation = validateResult(job, durableJobSchema, "job");
    if (!validation.ok) {
      throw new Error(`Job schema validation failed: ${validation.errors.join("; ")}`);
    }
  }

  function now() {
    return new Date().toISOString();
  }

  function isLeaseExpired(job) {
    if (!job.lease || !job.lease.expiresAt) return false;
    return new Date(job.lease.expiresAt).getTime() <= Date.now();
  }

  function createJob(params) {
    const {
      executionType,
      trackId = null,
      workflowId = null,
      input = {},
      context = {},
      options = {},
      maxAttempts = 3,
      correlationId = null
    } = params || {};

    if (!executionType || !["track", "workflow"].includes(executionType)) {
      return {
        ok: false,
        code: "INVALID_EXECUTION_TYPE",
        message: "executionType must be 'track' or 'workflow'."
      };
    }

    if (executionType === "track" && !trackId) {
      return {
        ok: false,
        code: "MISSING_TRACK_ID",
        message: "trackId is required when executionType is 'track'."
      };
    }

    if (executionType === "workflow" && !workflowId) {
      return {
        ok: false,
        code: "MISSING_WORKFLOW_ID",
        message: "workflowId is required when executionType is 'workflow'."
      };
    }

    const jobId = `job_${randomUUID().replace(/-/g, "")}`;
    const timestamp = now();

    const job = {
      jobId,
      executionType,
      trackId: executionType === "track" ? trackId : null,
      workflowId: executionType === "workflow" ? workflowId : null,
      input,
      context,
      options,
      status: "queued",
      attempt: 0,
      maxAttempts: Math.max(1, maxAttempts),
      lease: null,
      timestamps: {
        createdAt: timestamp,
        updatedAt: timestamp,
        startedAt: null,
        completedAt: null
      },
      correlationId: correlationId || jobId,
      result: null,
      error: null,
      evidenceRefs: []
    };

    try {
      validateJob(job);
    } catch (err) {
      return {
        ok: false,
        code: "JOB_VALIDATION_FAILED",
        message: err.message
      };
    }

    atomicWriteJob(job);
    jobs.set(jobId, job);

    return { ok: true, job: deepClone(job) };
  }

  function claimJob(jobId, holder, leaseDurationMs = DEFAULT_LEASE_DURATION_MS) {
    if (!holder || typeof holder !== "string") {
      return {
        ok: false,
        code: "INVALID_HOLDER",
        message: "holder must be a non-empty string."
      };
    }

    const job = jobs.get(jobId);
    if (!job) {
      return {
        ok: false,
        code: "JOB_NOT_FOUND",
        message: `Job '${jobId}' not found.`
      };
    }

    if (job.status === "queued") {
      const timestamp = now();
      const expiresAt = new Date(Date.now() + leaseDurationMs).toISOString();

      job.status = "claimed";
      job.lease = {
        holder,
        startedAt: timestamp,
        expiresAt
      };
      job.timestamps.updatedAt = timestamp;

      try {
        validateJob(job);
      } catch (err) {
        return {
          ok: false,
          code: "JOB_VALIDATION_FAILED",
          message: err.message
        };
      }

      atomicWriteJob(job);
      return { ok: true, job: deepClone(job) };
    }

    if (job.status === "claimed" && isLeaseExpired(job)) {
      const timestamp = now();
      const expiresAt = new Date(Date.now() + leaseDurationMs).toISOString();

      job.lease = {
        holder,
        startedAt: timestamp,
        expiresAt
      };
      job.timestamps.updatedAt = timestamp;

      try {
        validateJob(job);
      } catch (err) {
        return {
          ok: false,
          code: "JOB_VALIDATION_FAILED",
          message: err.message
        };
      }

      atomicWriteJob(job);
      return { ok: true, job: deepClone(job) };
    }

    if (job.status === "claimed" && !isLeaseExpired(job)) {
      return {
        ok: false,
        code: "JOB_ALREADY_CLAIMED",
        message: `Job '${jobId}' is already claimed by '${job.lease.holder}' and lease has not expired.`
      };
    }

    return {
      ok: false,
      code: "INVALID_STATE_TRANSITION",
      message: `Cannot claim job in status '${job.status}'.`
    };
  }

  function startJob(jobId) {
    const job = jobs.get(jobId);
    if (!job) {
      return {
        ok: false,
        code: "JOB_NOT_FOUND",
        message: `Job '${jobId}' not found.`
      };
    }

    if (job.status !== "claimed") {
      return {
        ok: false,
        code: "INVALID_STATE_TRANSITION",
        message: `Cannot start job in status '${job.status}'. Job must be 'claimed'.`
      };
    }

    const timestamp = now();
    job.status = "running";
    job.timestamps.startedAt = timestamp;
    job.timestamps.updatedAt = timestamp;

    try {
      validateJob(job);
    } catch (err) {
      return {
        ok: false,
        code: "JOB_VALIDATION_FAILED",
        message: err.message
      };
    }

    atomicWriteJob(job);
    return { ok: true, job: deepClone(job) };
  }

  function completeJob(jobId, result = null) {
    const job = jobs.get(jobId);
    if (!job) {
      return {
        ok: false,
        code: "JOB_NOT_FOUND",
        message: `Job '${jobId}' not found.`
      };
    }

    if (job.status !== "running") {
      return {
        ok: false,
        code: "INVALID_STATE_TRANSITION",
        message: `Cannot complete job in status '${job.status}'. Job must be 'running'.`
      };
    }

    const timestamp = now();
    job.status = "completed";
    job.result = result;
    job.lease = null;
    job.timestamps.completedAt = timestamp;
    job.timestamps.updatedAt = timestamp;

    try {
      validateJob(job);
    } catch (err) {
      return {
        ok: false,
        code: "JOB_VALIDATION_FAILED",
        message: err.message
      };
    }

    atomicWriteJob(job);
    return { ok: true, job: deepClone(job) };
  }

  function failJob(jobId, error = null) {
    const job = jobs.get(jobId);
    if (!job) {
      return {
        ok: false,
        code: "JOB_NOT_FOUND",
        message: `Job '${jobId}' not found.`
      };
    }

    if (job.status !== "running") {
      return {
        ok: false,
        code: "INVALID_STATE_TRANSITION",
        message: `Cannot fail job in status '${job.status}'. Job must be 'running'.`
      };
    }

    const timestamp = now();
    job.status = "failed";
    job.error = error || {
      code: "UNKNOWN_ERROR",
      message: "Job failed without error details.",
      retryable: true,
      details: {}
    };
    job.lease = null;
    job.timestamps.completedAt = timestamp;
    job.timestamps.updatedAt = timestamp;

    try {
      validateJob(job);
    } catch (err) {
      return {
        ok: false,
        code: "JOB_VALIDATION_FAILED",
        message: err.message
      };
    }

    atomicWriteJob(job);
    return { ok: true, job: deepClone(job) };
  }

  function cancelJob(jobId) {
    const job = jobs.get(jobId);
    if (!job) {
      return {
        ok: false,
        code: "JOB_NOT_FOUND",
        message: `Job '${jobId}' not found.`
      };
    }

    if (job.status !== "queued" && job.status !== "claimed") {
      return {
        ok: false,
        code: "INVALID_STATE_TRANSITION",
        message: `Cannot cancel job in status '${job.status}'. Job must be 'queued' or 'claimed'.`
      };
    }

    const timestamp = now();
    job.status = "cancelled";
    job.lease = null;
    job.timestamps.completedAt = timestamp;
    job.timestamps.updatedAt = timestamp;

    try {
      validateJob(job);
    } catch (err) {
      return {
        ok: false,
        code: "JOB_VALIDATION_FAILED",
        message: err.message
      };
    }

    atomicWriteJob(job);
    return { ok: true, job: deepClone(job) };
  }

  function retryJob(jobId) {
    const job = jobs.get(jobId);
    if (!job) {
      return {
        ok: false,
        code: "JOB_NOT_FOUND",
        message: `Job '${jobId}' not found.`
      };
    }

    if (job.status !== "failed") {
      return {
        ok: false,
        code: "INVALID_STATE_TRANSITION",
        message: `Cannot retry job in status '${job.status}'. Job must be 'failed'.`
      };
    }

    if (job.attempt + 1 >= job.maxAttempts) {
      return {
        ok: false,
        code: "MAX_ATTEMPTS_EXCEEDED",
        message: `Job '${jobId}' has reached max attempts (${job.maxAttempts}).`
      };
    }

    const timestamp = now();
    job.status = "queued";
    job.attempt += 1;
    job.lease = null;
    job.error = null;
    job.timestamps.completedAt = null;
    job.timestamps.updatedAt = timestamp;

    try {
      validateJob(job);
    } catch (err) {
      return {
        ok: false,
        code: "JOB_VALIDATION_FAILED",
        message: err.message
      };
    }

    atomicWriteJob(job);
    return { ok: true, job: deepClone(job) };
  }

  function reviewJob(jobId, action, reviewPayload = {}) {
    const job = jobs.get(jobId);
    if (!job) {
      return {
        ok: false,
        code: "JOB_NOT_FOUND",
        message: `Job '${jobId}' not found.`
      };
    }

    const REVIEW_ACTIONS = {
      request_review: { from: "running", to: "paused_review" },
      approve: { from: "paused_review", to: "queued" },
      reject: { from: "paused_review", to: "failed" },
      request_correction: { from: "paused_review", to: "queued" },
      stop: { from: "paused_review", to: "cancelled" }
    };

    const actionDef = REVIEW_ACTIONS[action];
    if (!actionDef) {
      return {
        ok: false,
        code: "INVALID_REVIEW_ACTION",
        message: `Unsupported review action '${action}'. Supported: ${Object.keys(REVIEW_ACTIONS).join(", ")}.`
      };
    }

    if (job.status !== actionDef.from) {
      return {
        ok: false,
        code: "INVALID_STATE_TRANSITION",
        message: `Cannot '${action}' job in status '${job.status}'. Job must be '${actionDef.from}'.`
      };
    }

    const allowedTransitions = VALID_TRANSITIONS[actionDef.from] || [];
    if (!allowedTransitions.includes(actionDef.to)) {
      return {
        ok: false,
        code: "INVALID_STATE_TRANSITION",
        message: `Transition '${actionDef.from}' → '${actionDef.to}' is not allowed.`
      };
    }

    const timestamp = now();
    const reviewedBy = reviewPayload.reviewedBy || "operator";
    const reviewReason = reviewPayload.reason || null;

    job.status = actionDef.to;
    job.timestamps.updatedAt = timestamp;

    if (actionDef.to === "failed" || actionDef.to === "cancelled") {
      job.timestamps.completedAt = timestamp;
    } else if (actionDef.to === "queued") {
      job.timestamps.completedAt = null;
    }

    if (actionDef.to === "queued" || actionDef.to === "paused_review") {
      job.lease = null;
    }

    if (actionDef.to === "failed") {
      job.error = {
        code: "HUMAN_REJECTED",
        message: reviewReason || "Job was rejected by operator review.",
        retryable: false,
        details: { reviewAction: action, reviewedBy, reviewedAt: timestamp }
      };
    }

    job.review = {
      reviewAction: action,
      reviewedBy,
      reviewedAt: timestamp,
      reviewReason
    };

    try {
      validateJob(job);
    } catch (err) {
      return {
        ok: false,
        code: "JOB_VALIDATION_FAILED",
        message: err.message
      };
    }

    atomicWriteJob(job);
    return { ok: true, job: deepClone(job) };
  }

  function getJob(jobId) {
    const job = jobs.get(jobId);
    return job ? deepClone(job) : null;
  }

  function listJobs(filter = {}) {
    const results = [];
    for (const job of jobs.values()) {
      if (filter.status && job.status !== filter.status) continue;
      if (filter.executionType && job.executionType !== filter.executionType) continue;
      if (filter.trackId && job.trackId !== filter.trackId) continue;
      if (filter.workflowId && job.workflowId !== filter.workflowId) continue;
      results.push(deepClone(job));
    }
    return results;
  }

  function listClaimableJobs() {
    const results = [];
    for (const job of jobs.values()) {
      if (job.status === "queued") {
        results.push(deepClone(job));
      } else if (job.status === "claimed" && isLeaseExpired(job)) {
        results.push(deepClone(job));
      }
    }
    return results;
  }

  function listLeasedJobs() {
    const results = [];
    for (const job of jobs.values()) {
      if (job.lease && !isLeaseExpired(job)) {
        results.push(deepClone(job));
      }
    }
    return results;
  }

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  loadAllJobs();

  return {
    createJob,
    claimJob,
    startJob,
    completeJob,
    failJob,
    cancelJob,
    retryJob,
    reviewJob,
    getJob,
    listJobs,
    listClaimableJobs,
    listLeasedJobs,
    STATUSES,
    TERMINAL_STATUSES,
    VALID_TRANSITIONS,
    DEFAULT_LEASE_DURATION_MS
  };
}

module.exports = {
  createDurableJobStore,
  STATUSES,
  TERMINAL_STATUSES,
  VALID_TRANSITIONS,
  DEFAULT_LEASE_DURATION_MS
};
