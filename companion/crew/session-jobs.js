const jobs = new Map();
let jobCounter = 0;

function createJob({ trackId, input, context, options }) {
  jobCounter += 1;
  const jobId = `job_${Date.now()}_${jobCounter}`;

  const job = {
    job_id: jobId,
    track_id: trackId,
    status: "queued",
    input,
    context: context || {},
    options: options || {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    result: null,
    error: null
  };

  jobs.set(jobId, job);
  return { ...job };
}

function getJob(jobId) {
  const job = jobs.get(jobId);
  return job ? { ...job } : null;
}

function updateJob(jobId, patch) {
  const job = jobs.get(jobId);

  if (!job) {
    return null;
  }

  Object.assign(job, patch, { updated_at: new Date().toISOString() });
  return { ...job };
}

module.exports = {
  createJob,
  getJob,
  updateJob
};
