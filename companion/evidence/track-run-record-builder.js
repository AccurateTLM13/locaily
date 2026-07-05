const crypto = require("node:crypto");

const SCHEMA_VERSION = "locaily.track_run_record.v1";

function createRecordId(prefix = "run") {
  const ts = Date.now().toString(36);
  const rand = crypto.randomBytes(4).toString("hex");
  return `${prefix}-${ts}-${rand}`;
}

function buildTrackRunRecord(options = {}) {
  const now = new Date();
  const recordId = options.recordId || createRecordId(options.recordIdPrefix);

  const record = {
    schemaVersion: SCHEMA_VERSION,
    recordId,
    trackId: options.trackId || "unknown",
    workflowId: options.workflowId || null,
    parentRunId: options.parentRunId || null,
    correlationId: options.correlationId || null,
    timestamps: {
      createdAt: now.toISOString(),
      startedAt: options.startedAt ? new Date(options.startedAt).toISOString() : null,
      completedAt: options.completedAt ? new Date(options.completedAt).toISOString() : null
    }
  };

  if (options.request) {
    record.request = { ...options.request };
  }

  const executorType = options.executorType || "model";
  record.routing = {
    executorType,
    capabilityId: options.capabilityId || null,
    provider: options.provider || null,
    relayNodeId: options.relayNodeId || null,
    qualificationRecordId: options.qualificationRecordId || null,
    routingReason: options.routingReason || null,
    fallbackCandidates: options.fallbackCandidates || [],
    shadowRecommendation: options.shadowRecommendation || undefined
  };

  if (!record.routing.shadowRecommendation) {
    delete record.routing.shadowRecommendation;
  }

  const execution = {
    status: options.status || "success",
    durationMs: options.durationMs != null ? options.durationMs : null,
    retryCount: options.retryCount != null ? options.retryCount : 0,
    fallbackUsed: options.fallbackUsed || false
  };

  if (executorType === "model" && options.modelInfo) {
    execution.modelInfo = { ...options.modelInfo };
  }
  if (executorType === "tool" && options.toolInfo) {
    execution.toolInfo = { ...options.toolInfo };
  }
  if (executorType === "transform" && options.transformInfo) {
    execution.transformInfo = { ...options.transformInfo };
  }
  if (executorType === "rule" && options.ruleInfo) {
    execution.ruleInfo = { ...options.ruleInfo };
  }
  if (executorType === "relay-node" && options.relayNodeInfo) {
    execution.relayNodeInfo = { ...options.relayNodeInfo };
  }
  record.execution = execution;

  if (options.output) {
    record.output = { ...options.output };
  }

  if (options.validation) {
    record.validation = { ...options.validation };
  }

  if (options.performance) {
    record.performance = { ...options.performance };
  }

  if (options.error) {
    record.error = { ...options.error };
  }

  if (options.childRuns && Array.isArray(options.childRuns) && options.childRuns.length > 0) {
    record.childRuns = options.childRuns.map((child) => {
      const childOptions = { ...child };
      childOptions.parentRunId = childOptions.parentRunId || recordId;
      childOptions.correlationId = childOptions.correlationId || options.correlationId;
      if (!childOptions.recordId) {
        childOptions.recordId = createRecordId("child");
      }
      return buildTrackRunRecord(childOptions);
    });
  } else {
    record.childRuns = [];
  }

  return record;
}

function buildModelRecord(options) {
  return buildTrackRunRecord({
    ...options,
    executorType: "model"
  });
}

function buildToolRecord(options) {
  return buildTrackRunRecord({
    ...options,
    executorType: "tool"
  });
}

function buildTransformRecord(options) {
  return buildTrackRunRecord({
    ...options,
    executorType: "transform"
  });
}

function buildRuleRecord(options) {
  return buildTrackRunRecord({
    ...options,
    executorType: "rule"
  });
}

function buildRelayNodeRecord(options) {
  return buildTrackRunRecord({
    ...options,
    executorType: "relay-node"
  });
}

function buildHybridRecord(options) {
  return buildTrackRunRecord({
    ...options,
    executorType: "hybrid"
  });
}

module.exports = {
  SCHEMA_VERSION,
  createRecordId,
  buildTrackRunRecord,
  buildModelRecord,
  buildToolRecord,
  buildTransformRecord,
  buildRuleRecord,
  buildRelayNodeRecord,
  buildHybridRecord
};
