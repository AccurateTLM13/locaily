function evaluateExecutionOutcome(executionResult, executionType) {
  if (!executionResult || typeof executionResult !== "object") {
    return {
      ok: false,
      code: "INVALID_RESULT",
      message: "Execution returned no result.",
      retryable: false,
      details: {}
    };
  }

  if (executionType === "workflow") {
    const planStatus = executionResult.plan && executionResult.plan.status;
    const schemaValid = executionResult.schemaValid;
    const validationOk = !executionResult.validation || executionResult.validation.ok !== false;

    if (planStatus === "failed") {
      return {
        ok: false,
        code: "WORKFLOW_FAILED",
        message: "Workflow execution finished with failed status.",
        retryable: false,
        details: {
          planStatus,
          schemaValid,
          validation: executionResult.validation || null
        }
      };
    }

    if (schemaValid === false) {
      return {
        ok: false,
        code: "SCHEMA_VALIDATION_FAILED",
        message: "Workflow output failed schema validation.",
        retryable: false,
        details: {
          planStatus,
          schemaValid,
          validation: executionResult.validation || null
        }
      };
    }

    if (!validationOk) {
      return {
        ok: false,
        code: "WORKFLOW_VALIDATION_FAILED",
        message: "Workflow result validation failed.",
        retryable: false,
        details: {
          planStatus,
          schemaValid,
          validation: executionResult.validation || null
        }
      };
    }

    return { ok: true };
  }

  if (executionType === "track") {
    if (executionResult.schemaValid === false) {
      return {
        ok: false,
        code: "SCHEMA_VALIDATION_FAILED",
        message: "Track output failed schema validation.",
        retryable: false,
        details: {
          trackId: executionResult.track_id || null
        }
      };
    }

    const verification = executionResult.result
      && executionResult.result.meta
      && executionResult.result.meta.verification;

    if (verification && verification.valid === false) {
      return {
        ok: false,
        code: "OUTPUT_VALIDATION_FAILED",
        message: "Track output verification failed.",
        retryable: false,
        details: {
          trackId: executionResult.track_id || null,
          errors: verification.errors || []
        }
      };
    }

    return { ok: true };
  }

  return { ok: true };
}

module.exports = {
  evaluateExecutionOutcome
};
