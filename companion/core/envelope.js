function buildAnalyzeMeta({ requestId, startedAt }) {
  return {
    requestId,
    durationMs: Date.now() - startedAt,
    createdAt: new Date().toISOString()
  };
}

function buildAnalyzeSuccess({ tool, task, provider, model, result, meta }) {
  return {
    ok: true,
    tool,
    task,
    provider,
    model,
    result,
    meta
  };
}

function buildAnalyzeError({ tool = null, task = null, provider, model, code, message, nextStep, meta }) {
  return {
    ok: false,
    tool,
    task,
    provider,
    model,
    result: null,
    error: {
      code,
      message,
      nextStep
    },
    meta
  };
}

function buildEngineMeta({ startedAt, schemaValid = true, tokensIn = null, tokensOut = null, cachedModel = null, extra = {} }) {
  const meta = {
    duration_ms: Date.now() - startedAt,
    schema_valid: schemaValid,
    ...extra
  };

  if (tokensIn !== null) {
    meta.tokens_in = tokensIn;
  }

  if (tokensOut !== null) {
    meta.tokens_out = tokensOut;
  }

  if (cachedModel !== null) {
    meta.cached_model = cachedModel;
  }

  return meta;
}

function buildEngineSuccess({
  run_id,
  trace_id = null,
  tool,
  task = null,
  provider = null,
  model = null,
  model_role = null,
  result,
  confidence = 1,
  warnings = [],
  fallbacks_used = [],
  meta
}) {
  return {
    ok: true,
    run_id,
    trace_id,
    tool,
    task,
    provider,
    model,
    model_role,
    result,
    confidence,
    warnings,
    fallbacks_used,
    meta
  };
}

function buildEngineError({
  run_id,
  trace_id = null,
  tool = null,
  task = null,
  provider = null,
  model = null,
  model_role = null,
  code,
  message,
  next_step,
  warnings = [],
  fallbacks_used = [],
  meta
}) {
  return {
    ok: false,
    run_id,
    trace_id,
    tool,
    task,
    provider,
    model,
    model_role,
    code,
    message,
    next_step,
    warnings,
    fallbacks_used,
    meta
  };
}

module.exports = {
  buildAnalyzeMeta,
  buildAnalyzeSuccess,
  buildAnalyzeError,
  buildEngineMeta,
  buildEngineSuccess,
  buildEngineError
};
