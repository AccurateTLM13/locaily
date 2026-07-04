function buildOrchestrationLogEvent({
  identity = {},
  plan,
  provider = null,
  model = null,
  status,
  error = null,
  durationMs = null
}) {
  return {
    run_id: identity.run_id || null,
    trace_id: identity.trace_id || null,
    tool: "workflow-orchestrator",
    task: plan.workflow_id,
    provider,
    model,
    duration_ms: durationMs,
    status: status === "completed" ? "success" : "error",
    error_code: error ? (error.code || "WORKFLOW_EXECUTION_FAILED") : null,
    input_summary: {
      task_id: plan.task_id,
      workflow_id: plan.workflow_id,
      track_id: plan.track_id,
      plan_id: plan.plan_id,
      selected_tracks: [plan.track_id]
    },
    output_summary: {
      final_status: plan.status,
      step_statuses: Array.isArray(plan.steps)
        ? plan.steps.map((step) => ({
          step_id: step.step_id,
          track_id: step.track_id,
          status: step.status,
          worker_used: typeof step.worker_used === "undefined" ? null : step.worker_used,
          duration_ms: typeof step.duration_ms === "number" ? step.duration_ms : null,
          error: step.error || null
        }))
        : []
    }
  };
}

async function recordOrchestrationRun(auditLog, payload) {
  if (!auditLog || typeof auditLog.record !== "function") {
    return null;
  }

  return auditLog.record(buildOrchestrationLogEvent(payload));
}

module.exports = {
  buildOrchestrationLogEvent,
  recordOrchestrationRun
};
