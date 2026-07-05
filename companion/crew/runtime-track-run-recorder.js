const {
  buildTrackRunRecord,
  buildToolRecord,
  buildModelRecord,
  buildHybridRecord,
  createRecordId
} = require("../evidence/track-run-record-builder");
const {
  storeRecord,
  loadRecord
} = require("../evidence/track-run-record-store");

function buildInputSummary(input) {
  if (!input || typeof input !== "object") {
    return String(input).slice(0, 80);
  }
  const keys = Object.keys(input).slice(0, 5);
  const parts = keys.map((k) => {
    const v = input[k];
    if (typeof v === "string") return `${k}:string(${v.length})`;
    if (typeof v === "number") return `${k}:number(${v})`;
    if (v === null) return `${k}:null`;
    if (Array.isArray(v)) return `${k}:array(${v.length})`;
    if (typeof v === "object") return `${k}:object(${Object.keys(v).length})`;
    return `${k}:${typeof v}`;
  });
  return parts.join(", ");
}

function buildOutputSummary(output) {
  if (!output || typeof output !== "object") {
    return String(output);
  }
  const keys = Object.keys(output).slice(0, 5);
  const summary = keys.map((k) => {
    const v = output[k];
    if (typeof v === "string") return `${k}="${v.slice(0, 60)}"`;
    if (typeof v === "number") return `${k}=${v}`;
    if (v === null) return `${k}=null`;
    if (Array.isArray(v)) return `${k}[${v.length}]`;
    if (typeof v === "object") return `${k}{${Object.keys(v).length}}`;
    return `${k}=${typeof v}`;
  });
  return summary.join(", ");
}

function validationStatusFromSchemaValid(schemaValid) {
  if (schemaValid === true) return "passed";
  if (schemaValid === false) return "failed";
  return "not_validated";
}

function executionStatusFromSchemaValid(schemaValid) {
  if (schemaValid === false) return "partial";
  return "success";
}

function buildStepChildRecord({ step, trackId, correlationId, parentRunId, options }) {
  const executorType = step.executor || "tool";
  const isModelExecutor = executorType === "model";
  const base = {
    trackId,
    correlationId,
    parentRunId,
    startedAt: step.startedAt,
    completedAt: step.completedAt,
    durationMs: step.durationMs,
    capabilityId: step.tool || step.model || step.role || executorType,
    provider: step.provider || options?.provider || null,
    qualificationRecordId: step.qualification?.recordId || null,
    shadowRecommendation: step.shadowRouting || undefined,
    routingReason: step.role ? `role:${step.role}` : null
  };

  if (isModelExecutor) {
    return buildModelRecord({
      ...base,
      status: step.status || "success",
      recordIdPrefix: "step-model",
      modelInfo: {
        modelId: step.model || null,
        role: step.role || null,
        profile_id: step.profile_id || null
      },
      output: step.output
        ? {
            outputFormat: "json",
            outputSummary: buildOutputSummary(step.output)
          }
        : undefined
    });
  }

  return buildToolRecord({
    ...base,
    status: step.status || "success",
    recordIdPrefix: "step-tool",
    toolInfo: {
      toolId: step.tool || null,
      task: step.task || null
    },
    output: step.output
      ? {
          outputFormat: "json",
          outputSummary: buildOutputSummary(step.output)
        }
      : undefined
  });
}

async function recordDirectTrackRun({
  trackId,
  input,
  result,
  steps,
  durationMs,
  schemaValid,
  fallbacksUsed,
  error,
  correlationId,
  auditRecordId,
  options = {}
}) {
  const now = new Date();
  const startedAt = new Date(now.getTime() - durationMs);
  const childRecords = [];
  const stepRecordIds = [];
  const stepRecordRefs = [];

  if (steps && Array.isArray(steps) && steps.length > 0) {
    const parentRecordId = createRecordId("track");

    for (const step of steps) {
      const childRecord = buildStepChildRecord({
        step,
        trackId,
        correlationId,
        parentRunId: parentRecordId,
        options
      });
      childRecords.push(childRecord);
      stepRecordIds.push(childRecord.recordId);
      stepRecordRefs.push(childRecord.recordId);
    }

    const hasModelStep = steps.some((s) => s.executor === "model");
    const hasToolStep = steps.some((s) => s.executor === "tool");
    const executorType = hasModelStep && hasToolStep ? "hybrid" : hasModelStep ? "model" : "tool";

    const execStatus = error
      ? (schemaValid === false ? "partial" : "failure")
      : executionStatusFromSchemaValid(schemaValid);

    const record = buildTrackRunRecord({
      recordId: parentRecordId,
      trackId,
      correlationId,
      executorType,
      status: execStatus,
      provider: options.provider || null,
      capabilityId: trackId,
      durationMs,
      startedAt: startedAt.toISOString(),
      completedAt: now.toISOString(),
      fallbackUsed: Array.isArray(fallbacksUsed) ? fallbacksUsed.length > 0 : false,
      retryCount: 0,
      output: result
        ? {
            outputFormat: "json",
            outputSummary: buildOutputSummary(result),
            structuredOutputValid: schemaValid !== false
          }
        : undefined,
      request: {
        requester: "companion-server",
        requestedCapability: trackId,
        inputSummary: buildInputSummary(input)
      },
      validation: {
        status: validationStatusFromSchemaValid(schemaValid),
        validatorIds: ["track-output-schema"],
        failedChecks: schemaValid === false ? [{ validator: "track-output-schema", message: "Output did not match track output schema." }] : [],
        score: schemaValid !== false ? 1 : 0
      },
      error: error
        ? {
            type: error.code || "TRACK_EXECUTION_FAILED",
            source: "track-runner",
            recoverable: false,
            diagnosticSummary: error.message || "Track execution failed."
          }
        : undefined
    });

    record.childRuns = childRecords;
    record.auditRecordId = auditRecordId || null;

    let storeResult;
    try {
      storeResult = await storeRecord(record);
    } catch (storeError) {
      if (storeError.code === "RECORD_ALREADY_EXISTS") {
        storeResult = { recordId: record.recordId, warning: "Record already exists, skipped storage." };
      } else {
        storeResult = { recordId: record.recordId, error: storeError.message, warning: "Record storage failed." };
      }
    }

    return {
      parentRecordId: record.recordId,
      childRecordIds: stepRecordIds,
      childRecordRefs: stepRecordRefs,
      storeResult
    };
  }

  const recordId = createRecordId("track");
  const execStatus = error ? "failure" : executionStatusFromSchemaValid(schemaValid);

  const record = buildTrackRunRecord({
    recordId,
    trackId,
    correlationId,
    executorType: "tool",
    status: execStatus,
    capabilityId: trackId,
    provider: options.provider || null,
    durationMs,
    startedAt: startedAt.toISOString(),
    completedAt: now.toISOString(),
    fallbackUsed: false,
    retryCount: 0,
    output: result
      ? {
          outputFormat: "json",
          outputSummary: buildOutputSummary(result),
          structuredOutputValid: schemaValid !== false
        }
      : undefined,
    request: {
      requester: "companion-server",
      requestedCapability: trackId,
      inputSummary: buildInputSummary(input)
    },
    validation: {
      status: validationStatusFromSchemaValid(schemaValid),
      validatorIds: ["track-output-schema"],
      failedChecks: schemaValid === false ? [{ validator: "track-output-schema", message: "Output did not match track output schema." }] : [],
      score: schemaValid !== false ? 1 : 0
    },
    error: error
      ? {
          type: error.code || "TRACK_EXECUTION_FAILED",
          source: "track-runner",
          recoverable: false,
          diagnosticSummary: error.message || "Track execution failed."
        }
      : undefined
  });

  record.auditRecordId = auditRecordId || null;

  let storeResult;
  try {
    storeResult = await storeRecord(record);
  } catch (storeError) {
    if (storeError.code === "RECORD_ALREADY_EXISTS") {
      storeResult = { recordId: record.recordId, warning: "Record already exists, skipped storage." };
    } else {
      storeResult = { recordId: record.recordId, error: storeError.message, warning: "Record storage failed." };
    }
  }

  return {
    parentRecordId: record.recordId,
    childRecordIds: [],
    childRecordRefs: [],
    storeResult
  };
}

async function recordWorkflowRun({
  workflowId,
  trackId,
  input,
  planSteps,
  planResult,
  durationMs,
  schemaValid,
  error,
  correlationId,
  auditRecordId,
  options = {}
}) {
  const now = new Date();
  const startedAt = new Date(now.getTime() - durationMs);
  const parentRecordId = createRecordId("wf");
  const childRecords = [];
  const childRecordIds = [];

  const planStepArray = (planSteps || []);

  for (const step of planStepArray) {
    const stepWorker = step.worker_used || {};
    const stepExecutorType = stepWorker.type || "tool";
    const stepStatus = step.status === "completed" ? "success" : step.status === "running" ? "failure" : step.status || "failure";
    const isModel = stepExecutorType === "model";

    const childOptions = {
      recordIdPrefix: isModel ? "wf-step-model" : "wf-step-tool",
      trackId: step.track_id || trackId,
      workflowId,
      correlationId,
      parentRunId: parentRecordId,
      status: stepStatus,
      durationMs: step.duration_ms || null,
      capabilityId: stepWorker.tool || stepWorker.model || stepWorker.role || stepExecutorType,
      provider: options.provider || null,
      qualificationRecordId: stepWorker.qualification?.recordId || null,
      startedAt: startedAt.toISOString(),
      completedAt: now.toISOString()
    };

    if (isModel) {
      childOptions.modelInfo = {
        modelId: stepWorker.model || null,
        role: stepWorker.role || null
      };
    } else {
      childOptions.toolInfo = {
        toolId: stepWorker.tool || null,
        task: stepWorker.task || null
      };
    }

    if (step.error) {
      childOptions.error = {
        type: step.error.code || "STEP_FAILED",
        source: step.step_id,
        recoverable: false,
        diagnosticSummary: step.error.message || "Step failed."
      };
      childOptions.status = "failure";
    }

    const childRecord = isModel
      ? buildModelRecord(childOptions)
      : buildToolRecord(childOptions);

    childRecords.push(childRecord);
    childRecordIds.push(childRecord.recordId);
  }

  const hasModel = planStepArray.some((s) => (s.worker_used?.type || "tool") === "model");
  const hasTool = planStepArray.some((s) => (s.worker_used?.type || "tool") === "tool");
  const executorType = hasModel && hasTool ? "hybrid" : hasModel ? "model" : "tool";
  const execStatus = error ? "failure" : planResult?.status === "completed" ? "success" : "partial";

  const record = buildTrackRunRecord({
    recordId: parentRecordId,
    trackId,
    workflowId,
    correlationId,
    executorType,
    status: execStatus,
    capabilityId: trackId,
    provider: options.provider || null,
    durationMs,
    startedAt: startedAt.toISOString(),
    completedAt: now.toISOString(),
    fallbackUsed: false,
    retryCount: 0,
    request: {
      requester: "companion-server",
      requestedCapability: workflowId || trackId,
      inputSummary: buildInputSummary(input)
    },
    validation: {
      status: validationStatusFromSchemaValid(schemaValid),
      validatorIds: ["workflow-output-schema"],
      failedChecks: schemaValid === false ? [{ validator: "workflow-output-schema", message: "Workflow output did not pass validation." }] : [],
      score: schemaValid !== false ? 1 : 0
    },
    error: error
      ? {
          type: error.code || "WORKFLOW_EXECUTION_FAILED",
          source: "workflow-runner",
          recoverable: false,
          diagnosticSummary: error.message || "Workflow execution failed."
        }
      : undefined
  });

  record.childRuns = childRecords;
  record.auditRecordId = auditRecordId || null;

  let storeResult;
  try {
    storeResult = await storeRecord(record);
  } catch (storeError) {
    storeResult = { recordId: record.recordId, error: storeError.message, warning: "Record storage failed." };
  }

  return {
    parentRecordId: record.recordId,
    childRecordIds,
    storeResult
  };
}

async function recordFailedExecution({
  trackId,
  workflowId,
  input,
  error,
  durationMs,
  correlationId,
  auditRecordId,
  options = {}
}) {
  const now = new Date();
  const recordId = createRecordId("failed");
  const record = buildTrackRunRecord({
    recordId,
    trackId: trackId || workflowId || "unknown",
    workflowId: workflowId || null,
    correlationId: correlationId || null,
    executorType: "tool",
    status: "failure",
    capabilityId: trackId || workflowId || "unknown",
    provider: options.provider || null,
    durationMs: durationMs || 0,
    startedAt: new Date(now.getTime() - (durationMs || 0)).toISOString(),
    completedAt: now.toISOString(),
    fallbackUsed: false,
    retryCount: 0,
    request: {
      requester: "companion-server",
      requestedCapability: trackId || workflowId || "unknown",
      inputSummary: buildInputSummary(input)
    },
    validation: {
      status: "not_validated",
      validatorIds: [],
      failedChecks: [],
      score: 0
    },
    error: {
      type: error?.code || "EXECUTION_FAILED",
      source: "companion-server",
      recoverable: false,
      diagnosticSummary: error?.message || "Execution failed before track initialization."
    }
  });

  record.auditRecordId = auditRecordId || null;

  let storeResult;
  try {
    storeResult = await storeRecord(record);
  } catch (storeError) {
    storeResult = { recordId: record.recordId, error: storeError.message, warning: "Record storage failed." };
  }

  return {
    parentRecordId: record.recordId,
    childRecordIds: [],
    storeResult
  };
}

module.exports = {
  recordDirectTrackRun,
  recordWorkflowRun,
  recordFailedExecution,
  buildInputSummary,
  buildOutputSummary
};
