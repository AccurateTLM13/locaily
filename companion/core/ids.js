const { randomUUID } = require("node:crypto");

function createRequestId() {
  return randomUUID();
}

function createRunId() {
  return `run_${randomUUID().replace(/-/g, "")}`;
}

function createTraceId() {
  return `trace_${randomUUID().replace(/-/g, "")}`;
}

function createRunIdentity() {
  return {
    requestId: createRequestId(),
    run_id: createRunId(),
    trace_id: createTraceId()
  };
}

module.exports = {
  createRequestId,
  createRunId,
  createTraceId,
  createRunIdentity
};
