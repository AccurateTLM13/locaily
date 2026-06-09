const SUPPORTED_INPUT_TYPES = new Set([
  "text",
  "json",
  "markdown",
  "html",
  "url_context",
  "clipboard_text",
  "browser_selection",
  "voice_transcript",
  "file_reference"
]);

const DEFAULT_CONSTRAINTS = {
  output_format: "json",
  max_tokens: 800,
  allow_network: false,
  allow_file_access: false,
  allow_clipboard_write: false
};

const DEFAULT_FALLBACK = {
  on_schema_fail: "retry_same_model_once",
  on_low_confidence: "escalate_model_role",
  on_timeout: "return_partial",
  on_permission_denied: "stop_with_error",
  on_model_unavailable: "use_default_worker",
  max_retries: 1
};

const DEFAULT_AUDIT = {
  log_input_summary: true,
  log_output_summary: true,
  redact_sensitive: true
};

function buildContextPacket({ identity, source = {}, task = {}, input = {}, options = {} }) {
  const normalizedInput = normalizeInput(input);

  if (!SUPPORTED_INPUT_TYPES.has(normalizedInput.type)) {
    return {
      ok: false,
      error: {
        code: "UNSUPPORTED_INPUT_TYPE",
        message: "Input type is not supported by this engine version.",
        nextStep: "Use one of the supported v1 input types."
      }
    };
  }

  if (!hasInputContent(normalizedInput)) {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "Input must include content or attachments.",
        nextStep: "Send input content or at least one attachment reference."
      }
    };
  }

  return {
    ok: true,
    context: {
      run_id: identity.run_id,
      trace_id: identity.trace_id,
      source: normalizeSource(source),
      task: normalizeTask(task, options),
      input: normalizedInput,
      constraints: {
        ...DEFAULT_CONSTRAINTS,
        ...(options.constraints || {})
      },
      state: {
        previous_steps: [],
        memory_refs: [],
        intermediate_outputs: {},
        ...(options.state || {})
      },
      permissions: normalizePermissions(options.permissions),
      fallback: {
        ...DEFAULT_FALLBACK,
        ...(options.fallback || {})
      },
      audit: {
        ...DEFAULT_AUDIT,
        ...(options.audit || {})
      }
    }
  };
}

function buildAnalyzeContextPacket({ identity, body }) {
  return buildContextPacket({
    identity,
    source: {
      app_id: "legacy-analyze",
      surface: "http-api",
      user_action: body.task,
      client_version: "0.1.0"
    },
    task: {
      tool: body.tool,
      goal: body.task,
      model_role: body.options && body.options.model_role ? body.options.model_role : "default_worker",
      priority: "normal"
    },
    input: {
      type: "json",
      content: body.input,
      attachments: [],
      metadata: {
        legacyEndpoint: "/analyze",
        task: body.task
      }
    },
    options: body.options || {}
  });
}

function normalizeSource(source) {
  return {
    app_id: stringOrDefault(source.app_id || source.appId, "unknown-app"),
    surface: stringOrDefault(source.surface, "unknown-surface"),
    user_action: stringOrDefault(source.user_action || source.userAction, "unknown-action"),
    client_version: stringOrDefault(source.client_version || source.clientVersion, "unknown")
  };
}

function normalizeTask(task, options) {
  return {
    tool: stringOrDefault(task.tool, "unknown-tool"),
    goal: stringOrDefault(task.goal || task.task, "run-tool"),
    model_role: stringOrDefault(task.model_role || task.modelRole || options.model_role || options.modelRole, "default_worker"),
    priority: stringOrDefault(task.priority || options.priority, "normal")
  };
}

function normalizeInput(input) {
  const type = stringOrDefault(input.type, "json");
  const attachments = Array.isArray(input.attachments) ? input.attachments : [];
  const metadata = input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)
    ? input.metadata
    : {};

  return {
    type,
    content: Object.prototype.hasOwnProperty.call(input, "content") ? input.content : null,
    attachments,
    metadata
  };
}

function normalizePermissions(permissions = {}) {
  return {
    requested: Array.isArray(permissions.requested) ? permissions.requested : ["model.run"],
    approved: Array.isArray(permissions.approved) ? permissions.approved : ["model.run"],
    denied: Array.isArray(permissions.denied) ? permissions.denied : []
  };
}

function hasInputContent(input) {
  if (input.attachments.length > 0) {
    return true;
  }

  if (input.content === null || typeof input.content === "undefined") {
    return false;
  }

  if (typeof input.content === "string") {
    return input.content.trim().length > 0;
  }

  return true;
}

function stringOrDefault(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

module.exports = {
  SUPPORTED_INPUT_TYPES,
  DEFAULT_CONSTRAINTS,
  DEFAULT_FALLBACK,
  DEFAULT_AUDIT,
  buildContextPacket,
  buildAnalyzeContextPacket
};
