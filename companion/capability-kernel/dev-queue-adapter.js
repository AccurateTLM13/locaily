const path = require("path");
const fs = require("fs");
const { createDurableJobStore } = require("../core/durable-job-store");

function loadDevJobStore(dataDir = null) {
  const targetDir = dataDir || path.join(__dirname, "..", "..", "data");
  return createDurableJobStore({ dataDir: targetDir });
}

function enqueueMilestoneTask({ milestoneId, taskDescription, trackId = "build-handoff", dataDir = null }) {
  const store = loadDevJobStore(dataDir);
  const milestonePath = path.join(__dirname, "..", "..", "development", "milestones", `${milestoneId}.json`);

  if (!fs.existsSync(milestonePath)) {
    const error = new Error(`Milestone '${milestoneId}' not found at '${milestonePath}'.`);
    error.code = "MILESTONE_NOT_FOUND";
    throw error;
  }

  let milestoneData = {};
  try {
    milestoneData = JSON.parse(fs.readFileSync(milestonePath, "utf8"));
  } catch (err) {
    const error = new Error(`Malformed milestone JSON '${milestonePath}': ${err.message}`);
    error.code = "MALFORMED_MILESTONE";
    throw error;
  }

  const jobParams = {
    executionType: "track",
    trackId,
    input: {
      milestoneId,
      milestoneTitle: milestoneData.title,
      taskDescription: taskDescription || milestoneData.purpose,
      milestonePath
    },
    context: {
      source: "development-control-plane",
      milestoneId,
      enqueuedAt: new Date().toISOString()
    },
    options: {
      timeout_ms: 10000,
      safe_runner: true
    },
    maxAttempts: 2,
    correlationId: `dev-task-${milestoneId}`
  };

  const result = store.createJob(jobParams);
  if (!result.ok) {
    const error = new Error(`Failed to enqueue milestone task job: ${result.message}`);
    error.code = result.code;
    throw error;
  }

  return result.job;
}

function runNextDevJob({ dataDir = null, workerId = "dev-safe-runner-01" } = {}) {
  const store = loadDevJobStore(dataDir);
  const claimable = store.listClaimableJobs();

  if (claimable.length === 0) {
    return { ok: false, code: "NO_CLAIMABLE_JOBS", message: "No queued dev jobs found." };
  }

  const targetJob = claimable[0];
  const claimRes = store.claimJob(targetJob.jobId, workerId);
  if (!claimRes.ok) {
    return claimRes;
  }

  const startRes = store.startJob(targetJob.jobId);
  if (!startRes.ok) {
    return startRes;
  }

  // Safe runner execution
  const job = startRes.job;
  try {
    const { execSync } = require("child_process");

    // Dirty tree check if required by safe runner options
    if (job.options && job.options.enforce_clean_tree) {
      let isDirty = false;
      try {
        const gitStatus = execSync("git status --porcelain", { encoding: "utf8" });
        if (gitStatus.trim().length > 0) {
          isDirty = true;
        }
      } catch {}

      if (isDirty) {
        return store.failJob(job.jobId, {
          code: "DIRTY_WORKING_TREE",
          message: "Working tree is dirty. Safe runner requires a clean repository tree.",
          retryable: false
        });
      }
    }

    // Verify milestone file exists and dependencies are well-formed
    if (job.input && job.input.milestonePath && fs.existsSync(job.input.milestonePath)) {
      const milestoneContent = JSON.parse(fs.readFileSync(job.input.milestonePath, "utf8"));
      if (Array.isArray(milestoneContent.dependencies)) {
        for (const depId of milestoneContent.dependencies) {
          const depPath = path.join(path.dirname(job.input.milestonePath), `${depId}.json`);
          if (!fs.existsSync(depPath)) {
            return store.failJob(job.jobId, {
              code: "UNSATISFIED_DEPENDENCY",
              message: `Milestone dependency '${depId}' missing manifest at '${depPath}'.`,
              retryable: false
            });
          }
        }
      }
    }

    const outputResult = {
      completed: true,
      milestoneId: job.input.milestoneId,
      taskDescription: job.input.taskDescription,
      executedBy: workerId,
      finishedAt: new Date().toISOString()
    };

    const completeRes = store.completeJob(job.jobId, outputResult);
    return completeRes;
  } catch (err) {
    const failRes = store.failJob(job.jobId, {
      code: "SAFE_RUNNER_ERROR",
      message: err.message,
      retryable: true,
      details: { stack: err.stack }
    });
    return failRes;
  }
}

module.exports = {
  loadDevJobStore,
  enqueueMilestoneTask,
  runNextDevJob
};
