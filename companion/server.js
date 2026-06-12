const http = require("node:http");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { createRunIdentity } = require("./core/ids");
const {
  createAuditLog,
  buildAuditEvent
} = require("./core/audit-log");
const {
  buildContextPacket,
  buildAnalyzeContextPacket
} = require("./core/context");
const { inspectContextInput } = require("./core/input-gate");
const {
  buildAnalyzeMeta,
  buildEngineMeta,
  buildEngineSuccess,
  buildEngineError,
  buildAnalyzeSuccess: createAnalyzeSuccess,
  buildAnalyzeError: createAnalyzeError
} = require("./core/envelope");
const { createModelRoleManager } = require("./core/model-roles");
const { createModelProfileManager } = require("./core/model-profiles");
const { createPermissionManager } = require("./core/permissions");
const { runToolWithValidation } = require("./core/result-validator");
const { createProviderRouter } = require("./providers/router");
const { createToolRegistry } = require("./tools/registry");
const { listTracks, runTrack, createJob, updateJob } = require("./pit-crew");
const { recordScoreboardEntry } = require("./core/scoreboard");

const PLATFORM_VERSION = "0.1.0";
const SERVICE_NAME = "local-ai-platform";
const DEFAULT_CONFIG = {
  server: {
    host: "127.0.0.1",
    port: 31313
  },
  runtime: {
    provider: "ollama",
    baseUrl: "http://127.0.0.1:11434",
    model: "llama3.2"
  },
  modelRoles: {
    roles: {
      fast_worker: "llama3.2",
      default_worker: "llama3.2",
      reasoning_worker: "llama3.2",
      voice_worker: null
    },
    providers: {
      mock: {
        fast_worker: "mock-local-model",
        default_worker: "mock-local-model",
        reasoning_worker: "mock-local-model",
        voice_worker: null
      }
    }
  },
  modelProfiles: {
    active: "balanced"
  },
  tools: {
    enabled: ["deal-sniper", "lighthouse-handoff"]
  },
  audit: {
    filePath: join(__dirname, "..", "data", "audit.jsonl")
  },
  permissions: {
    filePath: join(__dirname, "..", "data", "permissions.json"),
    approved: ["model.run"],
    denied: ["file.delete", "file.write", "network.send", "browser.write", "memory.delete"]
  }
};

const config = loadConfig();
applyEnvironmentOverrides(config);
const providerRouter = createProviderRouter(config.runtime);
const modelRoleManager = createModelRoleManager({
  defaultModel: config.runtime.model,
  ...config.modelRoles
});
const modelProfileManager = createModelProfileManager({
  defaultModel: config.runtime.model,
  active: config.modelProfiles.active,
  profiles: config.modelProfiles.profiles
});
function getConfiguredProviderIds() {
  return Array.from(new Set([
    providerRouter.getActiveProviderId(),
    ...Object.keys(config.modelRoles.providers || {})
  ]));
}

const initialProfileApply = modelProfileManager.applyProfileRoles(
  modelRoleManager,
  modelProfileManager.resolveActiveProfileId(),
  getConfiguredProviderIds()
);

if (!initialProfileApply.ok) {
  console.warn(`[Model Profiles] Warning: ${initialProfileApply.error.message}`);
}
const toolRegistry = createToolRegistry({
  enabledTools: config.tools.enabled
});
const auditLog = createAuditLog({
  filePath: config.audit.filePath
});
const permissionManager = createPermissionManager(config.permissions);

const server = http.createServer(async (request, response) => {
  const startedAt = Date.now();
  const identity = createRunIdentity();

  try {
    const url = new URL(request.url, `http://${request.headers.host || "127.0.0.1"}`);

    if (request.method === "GET" && url.pathname === "/health") {
      return sendJson(response, 200, await buildHealthResponse());
    }

    if (request.method === "GET" && url.pathname === "/tools") {
      return sendJson(response, 200, buildToolsResponse());
    }

    if (request.method === "GET" && url.pathname === "/audit") {
      return sendJson(response, 200, await buildAuditResponse(url.searchParams));
    }

    if (request.method === "GET" && url.pathname === "/scoreboard") {
      const { getScoreboardSummary } = require("./core/scoreboard");
      return sendJson(response, 200, {
        ok: true,
        scoreboard: getScoreboardSummary()
      });
    }

    if (request.method === "GET" && url.pathname === "/tracks") {
      return sendJson(response, 200, {
        ok: true,
        tracks: listTracks()
      });
    }

    if (request.method === "POST" && url.pathname === "/tracks/run") {
      const bodyResult = await readJsonBody(request);

      if (!bodyResult.ok) {
        const errorBody = buildTaskRunError({
          identity,
          startedAt,
          code: "BAD_JSON",
          message: "Request body could not be parsed as JSON.",
          nextStep: "Send a valid JSON object with track_id and input."
        });

        return sendJson(response, 400, errorBody);
      }

      const trackRunResult = await executeTrackRunRequest(bodyResult.body, {
        identity,
        startedAt
      });

      return sendJson(response, trackRunResult.statusCode, trackRunResult.body);
    }

    if (request.method === "GET" && url.pathname === "/providers/status") {
      return sendJson(response, 200, await buildProvidersStatusResponse());
    }

    if (request.method === "POST" && url.pathname === "/providers/set") {
      const bodyResult = await readJsonBody(request);

      if (!bodyResult.ok) {
        return sendJson(response, 400, {
          ok: false,
          code: "BAD_JSON",
          message: "Request body could not be parsed as JSON.",
          nextStep: "Send a valid JSON object with provider or id."
        });
      }

      const setResult = setActiveProvider(bodyResult.body);

      return sendJson(response, setResult.ok ? 200 : 400, setResult);
    }

    if (request.method === "GET" && url.pathname === "/models/roles") {
      return sendJson(response, 200, buildModelRolesResponse());
    }

    if (request.method === "POST" && url.pathname === "/models/roles/set") {
      const bodyResult = await readJsonBody(request);

      if (!bodyResult.ok) {
        return sendJson(response, 400, {
          ok: false,
          code: "BAD_JSON",
          message: "Request body could not be parsed as JSON.",
          nextStep: "Send a valid JSON object with role, model, and optional provider."
        });
      }

      const setResult = setModelRole(bodyResult.body);

      return sendJson(response, setResult.ok ? 200 : 400, setResult);
    }

    if (request.method === "GET" && url.pathname === "/models/profiles") {
      return sendJson(response, 200, buildModelProfilesResponse());
    }

    if (request.method === "POST" && url.pathname === "/models/profiles/set") {
      const bodyResult = await readJsonBody(request);

      if (!bodyResult.ok) {
        return sendJson(response, 400, {
          ok: false,
          code: "BAD_JSON",
          message: "Request body could not be parsed as JSON.",
          nextStep: "Send a valid JSON object with profile or profile_id."
        });
      }

      const setResult = setModelProfile(bodyResult.body);

      return sendJson(response, setResult.ok ? 200 : 400, setResult);
    }

    if (request.method === "POST" && url.pathname === "/tasks/run") {
      const bodyResult = await readJsonBody(request);

      if (!bodyResult.ok) {
        const errorBody = buildTaskRunError({
          identity,
          startedAt,
          code: "BAD_JSON",
          message: "Request body could not be parsed as JSON.",
          nextStep: "Send a valid JSON object with tool, input, optional task, context, and options."
        });

        return sendJson(response, 400, await recordTaskRunAndReturn({
          identity,
          startedAt,
          statusCode: 400,
          body: errorBody
        }));
      }

      const taskRunResult = await executeTaskRunRequest(bodyResult.body, {
        identity,
        startedAt
      });

      return sendJson(response, taskRunResult.statusCode, await recordTaskRunAndReturn({
        identity,
        startedAt,
        statusCode: taskRunResult.statusCode,
        body: taskRunResult.body,
        contextPacket: taskRunResult.contextPacket,
        tool: taskRunResult.tool,
        permissionResult: taskRunResult.permissionResult
      }));
    }

    if (request.method === "POST" && url.pathname === "/analyze") {
      const bodyResult = await readJsonBody(request);

      if (!bodyResult.ok) {
        return sendJson(response, 400, buildAnalyzeError({
          code: "BAD_JSON",
          message: "Request body could not be parsed as JSON.",
          nextStep: "Send a valid JSON object with tool, task, input, and optional options.",
          meta: buildAnalyzeMeta({ requestId: identity.requestId, startedAt })
        }));
      }

      const validationError = validateAnalyzeRequest(bodyResult.body);

      if (validationError) {
        return sendJson(response, 400, buildAnalyzeError({
          tool: validationError.tool,
          task: validationError.task,
          code: validationError.code,
          message: validationError.message,
          nextStep: validationError.nextStep,
          meta: buildAnalyzeMeta({ requestId: identity.requestId, startedAt })
        }));
      }

      const analyzeResult = await executeAnalyzeRequest(bodyResult.body, {
        identity,
        startedAt
      });

      return sendJson(response, analyzeResult.statusCode, analyzeResult.body);
    }

    return sendJson(response, 404, {
      ok: false,
      code: "NOT_FOUND",
      message: `No route matched ${request.method} ${url.pathname}.`,
      nextStep: "Use GET /health, GET /tools, GET /models/profiles, GET /tracks, POST /tracks/run, POST /tasks/run, or legacy POST /analyze."
    });
  } catch (error) {
    console.error("Unexpected server error.");
    console.error(error.stack || error.message);

    return sendJson(response, 500, {
      ok: false,
      code: "INTERNAL_ERROR",
      message: "The companion server hit an unexpected error.",
      nextStep: "Check the server logs and try again."
    });
  }
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Local AI Platform could not start because ${config.server.host}:${config.server.port} is already in use.`);
    console.error("Stop the existing server process, or start this one on another port.");
    console.error(`Windows check: netstat -ano | findstr :${config.server.port}`);
    console.error(`Alternate port: set LOCAL_AI_PORT=${config.server.port + 1}, then run node companion\\server.js`);
    process.exitCode = 1;
    return;
  }

  console.error("Failed to start Local AI Platform.");
  console.error(error.message);
  process.exitCode = 1;
});

server.listen(config.server.port, config.server.host, async () => {
  await printStartupStatus();
});

function loadConfig() {
  const configPath = join(__dirname, "config.json");

  try {
    const parsed = JSON.parse(readFileSync(configPath, "utf8"));
    return mergeConfig(DEFAULT_CONFIG, parsed);
  } catch (error) {
    return DEFAULT_CONFIG;
  }
}

function mergeConfig(base, override) {
  return {
    server: {
      ...base.server,
      ...(override.server || {})
    },
    runtime: {
      ...base.runtime,
      ...(override.runtime || {})
    },
    tools: {
      ...base.tools,
      ...(override.tools || {})
    },
    modelRoles: {
      ...base.modelRoles,
      ...(override.modelRoles || {}),
      roles: {
        ...base.modelRoles.roles,
        ...((override.modelRoles && override.modelRoles.roles) || {})
      },
      providers: {
        ...base.modelRoles.providers,
        ...((override.modelRoles && override.modelRoles.providers) || {})
      }
    },
    modelProfiles: {
      ...base.modelProfiles,
      ...(override.modelProfiles || {}),
      profiles: {
        ...((base.modelProfiles && base.modelProfiles.profiles) || {}),
        ...((override.modelProfiles && override.modelProfiles.profiles) || {})
      }
    },
    audit: {
      ...base.audit,
      ...(override.audit || {})
    },
    permissions: {
      ...base.permissions,
      ...(override.permissions || {})
    }
  };
}

function applyEnvironmentOverrides(targetConfig) {
  if (process.env.LOCAL_AI_HOST) {
    targetConfig.server.host = process.env.LOCAL_AI_HOST;
  }

  if (process.env.LOCAL_AI_PORT) {
    const port = Number(process.env.LOCAL_AI_PORT);

    if (Number.isInteger(port) && port > 0) {
      targetConfig.server.port = port;
    }
  }

  if (process.env.OLLAMA_BASE_URL) {
    targetConfig.runtime.baseUrl = process.env.OLLAMA_BASE_URL;
  }

  if (process.env.OLLAMA_MODEL) {
    targetConfig.runtime.model = process.env.OLLAMA_MODEL;
  }
}

async function buildHealthResponse() {
  const runtimeState = await checkRuntimeState();
  const health = {
    ok: true,
    engine: "local-ai-engine-core",
    service: SERVICE_NAME,
    version: PLATFORM_VERSION,
    status: "running",
    canonicalEndpoint: "/tasks/run",
    compatibilityEndpoints: ["/analyze"],
    runtime: {
      provider: runtimeState.provider,
      available: runtimeState.available,
      baseUrl: runtimeState.endpoint
    },
    model: {
      name: runtimeState.model,
      ready: runtimeState.modelReady
    },
    model_profile: modelProfileManager.getActive(),
    tools: toolRegistry.listIds()
  };

  if (runtimeState.warning) {
    health.warning = runtimeState.warning;
  }

  if (runtimeState.models.length > 0) {
    health.runtime.models = runtimeState.models;
  }

  return health;
}

async function printStartupStatus() {
  const serverUrl = `http://${config.server.host}:${config.server.port}`;
  const activeProvider = providerRouter.getActiveProviderId();
  const defaultRole = resolveModelForRole("default_worker");

  console.log("Local AI Platform");
  console.log(`Server URL: ${serverUrl}`);
  console.log("Canonical API: POST /tasks/run");
  console.log("Track API: POST /tracks/run");
  console.log("Compatibility API: POST /analyze");
  console.log(`Active provider: ${activeProvider}`);

  try {
    const runtimeState = await checkRuntimeState(defaultRole.ok ? defaultRole.model : null);
    const availability = runtimeState.available ? "available" : "unavailable";
    const readiness = runtimeState.modelReady ? "ready" : "not ready";

    console.log(`Provider status: ${availability}`);
    console.log(`Provider endpoint: ${runtimeState.endpoint}`);
    const activeProfile = modelProfileManager.getActive();
    console.log(`Model profile: ${activeProfile.label} (${activeProfile.policy})`);
    console.log(`Default model role: default_worker`);
    console.log(`Selected model: ${defaultRole.ok ? defaultRole.model : runtimeState.model} (${readiness})`);

    if (runtimeState.warning) {
      console.log(`Startup warning: ${runtimeState.warning.message}`);
      console.log(`Next step: ${runtimeState.warning.nextStep}`);
    }
  } catch (error) {
    console.log("Provider status: unavailable");
    console.log(`Startup warning: ${error.message}`);
  }

  console.log(`Registered tools: ${toolRegistry.listIds().length}`);
  console.log("Smoke test: node scripts\\smoke-test.js");
}

function buildToolsResponse() {
  return {
    ok: true,
    tools: toolRegistry.listPublic()
  };
}

async function buildAuditResponse(searchParams) {
  const events = await auditLog.list({
    limit: searchParams.get("limit"),
    run_id: searchParams.get("run_id"),
    tool: searchParams.get("tool"),
    source: searchParams.get("source")
  });

  return {
    ok: true,
    events
  };
}

async function buildProvidersStatusResponse() {
  return {
    ok: true,
    active_provider: providerRouter.getActiveProviderId(),
    active_profile: modelProfileManager.getActive(),
    providers: await providerRouter.listStatus(),
    roles: modelRoleManager.list(providerRouter.getActiveProviderId())
  };
}

function setActiveProvider(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      ok: false,
      code: "INVALID_INPUT",
      message: "Provider update body must be a JSON object.",
      nextStep: "Send provider or id with a configured provider ID."
    };
  }

  const providerId = body.provider || body.id;
  const result = providerRouter.setActiveProvider(providerId);

  if (!result.ok) {
    return {
      ok: false,
      code: result.error.code,
      message: result.error.message,
      nextStep: result.error.nextStep
    };
  }

  return {
    ok: true,
    active_provider: providerRouter.getActiveProviderId(),
    provider: result.provider
  };
}

function buildModelRolesResponse() {
  const provider = providerRouter.getActiveProviderId();

  return {
    ok: true,
    active_provider: provider,
    roles: modelRoleManager.list(provider)
  };
}

function setModelRole(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      ok: false,
      code: "INVALID_INPUT",
      message: "Model role update body must be a JSON object.",
      nextStep: "Send role, model, and optional provider."
    };
  }

  const result = modelRoleManager.set({
    role: body.role || body.model_role || body.modelRole,
    model: body.model,
    provider: body.provider || null
  });

  if (!result.ok) {
    return {
      ok: false,
      code: result.error.code,
      message: result.error.message,
      nextStep: result.error.nextStep
    };
  }

  return {
    ok: true,
    active_provider: providerRouter.getActiveProviderId(),
    role: result.role,
    model: result.model,
    provider: result.provider,
    roles: modelRoleManager.list(result.provider || providerRouter.getActiveProviderId())
  };
}

function buildModelProfilesResponse() {
  return {
    ok: true,
    active_profile: modelProfileManager.resolveActiveProfileId(),
    profiles: modelProfileManager.list()
  };
}

function setModelProfile(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      ok: false,
      code: "INVALID_INPUT",
      message: "Model profile update body must be a JSON object.",
      nextStep: "Send profile or profile_id."
    };
  }

  const profileId = body.profile || body.profile_id || body.id;
  const setResult = modelProfileManager.setActive(profileId);

  if (!setResult.ok) {
    return {
      ok: false,
      code: setResult.error.code,
      message: setResult.error.message,
      nextStep: setResult.error.nextStep
    };
  }

  const applyResult = modelProfileManager.applyProfileRoles(
    modelRoleManager,
    setResult.active_profile,
    getConfiguredProviderIds()
  );

  if (!applyResult.ok) {
    return {
      ok: false,
      code: applyResult.error.code,
      message: applyResult.error.message,
      nextStep: applyResult.error.nextStep
    };
  }

  return {
    ok: true,
    active_profile: setResult.active_profile,
    profile: setResult.profile,
    applied_roles: applyResult.applied,
    roles: modelRoleManager.list(providerRouter.getActiveProviderId())
  };
}

function validateAnalyzeRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      tool: null,
      task: null,
      code: "INVALID_INPUT",
      message: "Analyze request body must be a JSON object.",
      nextStep: "Send tool, task, input, and optional options."
    };
  }

  const tool = typeof body.tool === "string" ? body.tool : null;
  const task = typeof body.task === "string" ? body.task : null;

  if (!tool) {
    return {
      tool: null,
      task,
      code: "INVALID_INPUT",
      message: "Analyze request is missing a string tool field.",
      nextStep: "Use a registered tool ID from /health."
    };
  }

  if (!task) {
    return {
      tool,
      task: null,
      code: "INVALID_INPUT",
      message: "Analyze request is missing a string task field.",
      nextStep: "Use a supported task for the selected tool."
    };
  }

  if (!body.input || typeof body.input !== "object" || Array.isArray(body.input)) {
    return {
      tool,
      task,
      code: "INVALID_INPUT",
      message: "Analyze request is missing an input object.",
      nextStep: "Send structured input for the selected tool and task."
    };
  }

  if (!toolRegistry.has(tool)) {
    return {
      tool,
      task,
      code: "UNKNOWN_TOOL",
      message: `No registered tool matched '${tool}'.`,
      nextStep: "Use one of the registered tool IDs from /health."
    };
  }

  if (!toolRegistry.supportsTask(tool, task)) {
    const registeredTool = toolRegistry.get(tool);

    return {
      tool,
      task,
      code: "UNKNOWN_TASK",
      message: `Tool '${tool}' does not support task '${task}'.`,
      nextStep: `Use one of these tasks: ${registeredTool.tasks.join(", ")}.`
    };
  }

  return null;
}

async function checkRuntimeState(modelOverride = null) {
  const activeState = await providerRouter.checkActiveState(modelOverride);

  return {
    available: activeState.available,
    modelReady: activeState.modelReady,
    models: activeState.models,
    provider: activeState.provider,
    model: activeState.model,
    endpoint: activeState.endpoint,
    warning: activeState.warning
  };
}

function getActiveRuntime() {
  return providerRouter.getRuntime();
}

function getActiveProviderId() {
  return providerRouter.getActiveProviderId();
}

function getActiveModel(modelOverride = null) {
  return providerRouter.getModel(modelOverride);
}

function resolveModelForRole(modelRole) {
  return modelRoleManager.resolve(modelRole, getActiveProviderId());
}

function buildModelRoutingOptions(extra = {}) {
  return {
    ...extra,
    profile_id: modelProfileManager.resolveActiveProfileId(),
    getRoleSuitability: (role) => modelProfileManager.getRoleSuitability(role),
    resolveModelForRole: (role) => resolveModelForRole(role),
    toolRegistry
  };
}

function getModelUnavailableNextStep(runtimeState) {
  if (runtimeState.warning && runtimeState.warning.nextStep) {
    return runtimeState.warning.nextStep;
  }

  if (runtimeState.provider === "ollama") {
    return `Run 'ollama pull ${runtimeState.model}', then try again.`;
  }

  return "Select an available provider or configure the selected model.";
}

async function executeAnalyzeRequest(body, context) {
  const contextResult = buildAnalyzeContextPacket({
    identity: context.identity,
    body
  });

  if (!contextResult.ok) {
    return {
      statusCode: 400,
      body: buildAnalyzeError({
        tool: body.tool,
        task: body.task,
        code: contextResult.error.code,
        message: contextResult.error.message,
        nextStep: contextResult.error.nextStep,
        meta: buildAnalyzeMeta({ requestId: context.identity.requestId, startedAt: context.startedAt })
      })
    };
  }

  const contextPacket = contextResult.context;
  const modelRole = contextPacket.task.model_role;
  const modelResolution = resolveModelForRole(modelRole);
  const inputGateResult = inspectContextInput(contextPacket);

  if (!inputGateResult.ok) {
    return {
      statusCode: inputGateResult.statusCode || 400,
      body: buildAnalyzeError({
        tool: body.tool,
        task: body.task,
        code: inputGateResult.code,
        message: inputGateResult.message,
        nextStep: inputGateResult.nextStep,
        meta: buildAnalyzeRequestMeta(context, inputGateResult)
      })
    };
  }

  contextPacket.security = {
    risk_level: inputGateResult.risk_level,
    flags: inputGateResult.flags,
    warnings: inputGateResult.warnings,
    input_summary: inputGateResult.input_summary
  };

  const tool = toolRegistry.get(body.tool);
  const toolValidationError = validateToolInput(tool, body.input);

  if (toolValidationError) {
    return {
      statusCode: 400,
      body: buildAnalyzeError({
        tool: body.tool,
        task: body.task,
        code: toolValidationError.code,
        message: toolValidationError.message,
        nextStep: toolValidationError.nextStep,
        meta: buildAnalyzeRequestMeta(context, inputGateResult)
      })
    };
  }

  const permissionResult = permissionManager.check({
    tool,
    requestedPermissions: resolveRequestedPermissions(body, tool)
  });

  if (!permissionResult.ok) {
    return {
      statusCode: 403,
      body: buildAnalyzeError({
        tool: body.tool,
        task: body.task,
        code: permissionResult.code,
        message: permissionResult.message,
        nextStep: permissionResult.nextStep,
        meta: buildAnalyzeRequestMeta(context, inputGateResult, permissionResult)
      })
    };
  }

  if (tool.requiresRuntime !== false) {
    const modelRole = resolveModelRole(body, tool);
    const modelResolution = resolveModelForRole(modelRole);

    if (!modelResolution.ok) {
      return {
        statusCode: 503,
        body: buildAnalyzeError({
          tool: body.tool,
          task: body.task,
          code: "MODEL_NOT_READY",
          message: modelResolution.error.message,
          nextStep: modelResolution.error.nextStep,
          meta: buildAnalyzeRequestMeta(context, inputGateResult)
        })
      };
    }

    const runtimeState = await checkRuntimeState(modelResolution.model);

    if (!runtimeState.available) {
      return {
        statusCode: 503,
        body: buildAnalyzeError({
          tool: body.tool,
          task: body.task,
          model: modelResolution.model,
          code: runtimeState.warning.code,
          message: runtimeState.warning.message,
          nextStep: runtimeState.warning.nextStep,
          meta: buildAnalyzeRequestMeta(context, inputGateResult, permissionResult)
        })
      };
    }

    if (!runtimeState.modelReady) {
      return {
        statusCode: 503,
        body: buildAnalyzeError({
          tool: body.tool,
          task: body.task,
          model: modelResolution.model,
          code: "MODEL_NOT_READY",
          message: `The local model '${runtimeState.model}' is not ready.`,
          nextStep: getModelUnavailableNextStep(runtimeState),
          meta: buildAnalyzeRequestMeta(context, inputGateResult, permissionResult)
        })
      };
    }
  }

  try {
    const modelRole = resolveModelRole(body, tool);
    const modelResolution = resolveModelForRole(modelRole);
    const selectedModel = modelResolution.ok ? modelResolution.model : getActiveModel();
    const execution = await runToolWithValidation({
      tool,
      fallbackPolicy: contextPacket.fallback,
      runOnce: (fallbackContext = {}) => tool.handle({
        task: body.task,
        input: body.input,
        runtime: getActiveRuntime(),
        options: buildModelRoutingOptions({
          ...(body.options || {}),
          model: selectedModel,
          fallback: fallbackContext
        }),
        meta: {
          requestId: context.identity.requestId,
          run_id: context.identity.run_id,
          trace_id: context.identity.trace_id,
          context: contextPacket,
          provider: getActiveProviderId(),
          model: selectedModel,
          model_role: modelRole,
          fallback: fallbackContext
        }
      })
    });

    return {
      statusCode: 200,
      body: buildAnalyzeSuccess({
        tool: body.tool,
        task: body.task,
        provider: getActiveProviderId(),
        model: selectedModel,
        result: normalizeToolResult(execution.result),
        meta: buildAnalyzeRequestMeta(context, inputGateResult, permissionResult, execution)
      })
    };
  } catch (error) {
    const code = error.code || "INTERNAL_ERROR";
    const statusCode = code === "NOT_IMPLEMENTED" ? 501 : code === "SCHEMA_VALIDATION_FAILED" ? 422 : 500;

    return {
      statusCode,
      body: buildAnalyzeError({
        tool: body.tool,
        task: body.task,
        code,
        message: error.message || "Tool execution failed.",
        nextStep: error.nextStep || getAnalyzeErrorNextStep(code),
        meta: buildAnalyzeRequestMeta(context, inputGateResult, permissionResult, error)
      })
    };
  }
}

async function executeTaskRunRequest(body, context) {
  const validationError = validateTaskRunRequest(body);

  if (validationError) {
    return {
      statusCode: validationError.statusCode || 400,
      body: buildTaskRunError({
        identity: context.identity,
        startedAt: context.startedAt,
        tool: validationError.tool,
        task: validationError.task,
        code: validationError.code,
        message: validationError.message,
        nextStep: validationError.nextStep
      })
    };
  }

  const tool = toolRegistry.get(body.tool);
  const task = resolveTaskRunTask(body, tool);
  const contextResult = buildTaskRunContextPacket({
    identity: context.identity,
    body,
    task,
    tool
  });

  if (!contextResult.ok) {
    return {
      statusCode: 400,
      tool,
      body: buildTaskRunError({
        identity: context.identity,
        startedAt: context.startedAt,
        tool: body.tool,
        task,
        code: contextResult.error.code,
        message: contextResult.error.message,
        nextStep: contextResult.error.nextStep,
        modelRole: resolveModelRole(body, tool)
      })
    };
  }

  const contextPacket = contextResult.context;
  const modelRole = contextPacket.task.model_role;
  const modelResolution = resolveModelForRole(modelRole);
  const inputGateResult = inspectContextInput(contextPacket);

  if (!inputGateResult.ok) {
    return {
      statusCode: inputGateResult.statusCode || 400,
      tool,
      contextPacket,
      body: buildTaskRunError({
        identity: context.identity,
        startedAt: context.startedAt,
        tool: body.tool,
        task,
        code: inputGateResult.code,
        message: inputGateResult.message,
        nextStep: inputGateResult.nextStep,
        modelRole,
        model: modelResolution.ok ? modelResolution.model : getActiveModel(),
        inputGateResult
      })
    };
  }

  contextPacket.security = {
    risk_level: inputGateResult.risk_level,
    flags: inputGateResult.flags,
    warnings: inputGateResult.warnings,
    input_summary: inputGateResult.input_summary
  };

  const toolInput = contextPacket.input.content;
  const toolValidationError = validateToolInput(tool, toolInput);

  if (toolValidationError) {
    return {
      statusCode: 400,
      tool,
      contextPacket,
      body: buildTaskRunError({
        identity: context.identity,
        startedAt: context.startedAt,
        tool: body.tool,
        task,
        code: toolValidationError.code,
        message: toolValidationError.message,
        nextStep: toolValidationError.nextStep,
        modelRole,
        model: modelResolution.ok ? modelResolution.model : getActiveModel(),
        inputGateResult
      })
    };
  }

  const permissionResult = permissionManager.check({
    tool,
    requestedPermissions: resolveRequestedPermissions(body, tool)
  });
  contextPacket.permissions.used = permissionResult.permissions_used;
  contextPacket.permissions.denied = permissionResult.denied;

  if (!permissionResult.ok) {
    return {
      statusCode: 403,
      tool,
      contextPacket,
      permissionResult,
      body: buildTaskRunError({
        identity: context.identity,
        startedAt: context.startedAt,
        tool: body.tool,
        task,
        code: permissionResult.code,
        message: permissionResult.message,
        nextStep: permissionResult.nextStep,
        modelRole,
        model: modelResolution.ok ? modelResolution.model : getActiveModel(),
        inputGateResult,
        permissionResult
      })
    };
  }

  if (tool.requiresRuntime !== false) {
    if (!modelResolution.ok) {
      return {
        statusCode: 503,
        tool,
        contextPacket,
        permissionResult,
        body: buildTaskRunError({
          identity: context.identity,
          startedAt: context.startedAt,
          tool: body.tool,
          task,
          code: "MODEL_UNAVAILABLE",
          message: modelResolution.error.message,
          nextStep: modelResolution.error.nextStep,
          modelRole,
          inputGateResult,
          permissionResult
        })
      };
    }

    const runtimeState = await checkRuntimeState(modelResolution.model);

    if (!runtimeState.available) {
      return {
        statusCode: 503,
        tool,
        contextPacket,
        permissionResult,
        body: buildTaskRunError({
          identity: context.identity,
          startedAt: context.startedAt,
          tool: body.tool,
          task,
          code: "PROVIDER_UNAVAILABLE",
          message: runtimeState.warning.message,
          nextStep: runtimeState.warning.nextStep,
          modelRole,
          model: modelResolution.model,
          inputGateResult,
          permissionResult
        })
      };
    }

    if (!runtimeState.modelReady) {
      return {
        statusCode: 503,
        tool,
        contextPacket,
        permissionResult,
        body: buildTaskRunError({
          identity: context.identity,
          startedAt: context.startedAt,
          tool: body.tool,
          task,
          code: "MODEL_UNAVAILABLE",
          message: `The local model '${runtimeState.model}' is not ready.`,
          nextStep: getModelUnavailableNextStep(runtimeState),
          modelRole,
          model: modelResolution.model,
          inputGateResult,
          permissionResult
        })
      };
    }
  }

  try {
    const selectedModel = modelResolution.ok ? modelResolution.model : getActiveModel();
    const execution = await runToolWithValidation({
      tool,
      fallbackPolicy: contextPacket.fallback,
      runOnce: (fallbackContext = {}) => tool.handle({
        task,
        input: toolInput,
        runtime: getActiveRuntime(),
        options: buildModelRoutingOptions({
          ...(body.options || {}),
          model: selectedModel,
          fallback: fallbackContext
        }),
        meta: {
          requestId: context.identity.requestId,
          run_id: context.identity.run_id,
          trace_id: context.identity.trace_id,
          context: contextPacket,
          provider: getActiveProviderId(),
          model: selectedModel,
          model_role: modelRole,
          fallback: fallbackContext
        }
      })
    });

    return {
      statusCode: 200,
      tool,
      contextPacket,
      permissionResult,
      body: buildEngineSuccess({
        run_id: context.identity.run_id,
        trace_id: context.identity.trace_id,
        tool: body.tool,
        task,
        provider: getActiveProviderId(),
        model: selectedModel,
        model_role: modelRole,
        result: normalizeToolResult(execution.result),
        confidence: 1,
        warnings: inputGateResult.warnings,
        fallbacks_used: execution.fallbacks_used,
        meta: buildTaskRunMeta(context, inputGateResult, execution.validation.ok, permissionResult)
      })
    };
  } catch (error) {
    const code = normalizeTaskRunErrorCode(error.code || "INTERNAL_ERROR");
    const statusCode = code === "NOT_IMPLEMENTED" ? 501 : code === "SCHEMA_VALIDATION_FAILED" ? 422 : 500;

    return {
      statusCode,
      tool,
      contextPacket,
      permissionResult,
      body: buildTaskRunError({
        identity: context.identity,
        startedAt: context.startedAt,
        tool: body.tool,
        task,
        code,
        message: error.message || "Tool execution failed.",
        nextStep: error.nextStep || getTaskRunErrorNextStep(code),
        modelRole,
        model: modelResolution.ok ? modelResolution.model : getActiveModel(),
        inputGateResult,
        permissionResult,
        schemaValid: code !== "SCHEMA_VALIDATION_FAILED",
        fallbacksUsed: error.fallbacks_used || []
      })
    };
  }
}

async function executeTrackRunRequest(body, context) {
  const validationError = validateTrackRunRequest(body);

  if (validationError) {
    return {
      statusCode: validationError.statusCode || 400,
      body: buildTaskRunError({
        identity: context.identity,
        startedAt: context.startedAt,
        code: validationError.code,
        message: validationError.message,
        nextStep: validationError.nextStep,
        tool: "track-orchestrator",
        task: body && body.track_id ? body.track_id : null
      })
    };
  }

  const job = createJob({
    trackId: body.track_id,
    input: body.input,
    context: body.context || {},
    options: body.options || {}
  });

  updateJob(job.job_id, { status: "running" });

  const runtime = getActiveRuntime();
  const runtimeState = await checkRuntimeState(getActiveModel());

  if (!runtimeState.available) {
    updateJob(job.job_id, {
      status: "failed",
      error: runtimeState.warning
    });

    return {
      statusCode: 503,
      body: buildTaskRunError({
        identity: context.identity,
        startedAt: context.startedAt,
        tool: "track-orchestrator",
        task: body.track_id,
        code: "PROVIDER_UNAVAILABLE",
        message: runtimeState.warning.message,
        nextStep: runtimeState.warning.nextStep
      })
    };
  }

  try {
    const trackResult = await runTrack({
      trackId: body.track_id,
      input: body.input,
      runtime,
      toolRegistry,
      options: buildModelRoutingOptions({
        ...(body.options || {}),
        model: getActiveModel()
      }),
      meta: {
        requestId: context.identity.requestId,
        run_id: context.identity.run_id,
        trace_id: context.identity.trace_id,
        job_id: job.job_id
      }
    });

    recordScoreboardEntry({
      track: body.track_id,
      mode: body.options?.execution_mode || "orchestrated",
      durationMs: trackResult.durationMs,
      schemaValid: trackResult.schemaValid !== false,
      steps: trackResult.steps
    });

    updateJob(job.job_id, {
      status: "completed",
      result: trackResult.result
    });

    return {
      statusCode: 200,
      body: buildEngineSuccess({
        run_id: context.identity.run_id,
        trace_id: context.identity.trace_id,
        tool: "track-orchestrator",
        task: body.track_id,
        provider: getActiveProviderId(),
        model: getActiveModel(),
        model_role: "default_worker",
        result: normalizeToolResult(trackResult.result),
        confidence: 1,
        warnings: [],
        fallbacks_used: trackResult.fallbacks_used || [],
        meta: {
          ...buildTaskRunMeta(context, { warnings: [], risk_level: "low", flags: [] }, trackResult.schemaValid !== false, { ok: true }),
          job_id: job.job_id,
          track_id: body.track_id,
          steps: trackResult.steps.map((step) => ({
            step_id: step.name,
            executor: step.executor,
            tool: step.tool,
            model: step.model,
            role: step.role,
            durationMs: step.durationMs
          }))
        }
      })
    };
  } catch (error) {
    updateJob(job.job_id, {
      status: "failed",
      error: {
        code: error.code || "TRACK_EXECUTION_FAILED",
        message: error.message
      }
    });

    const code = normalizeTaskRunErrorCode(error.code || "TRACK_EXECUTION_FAILED");

    return {
      statusCode: code === "TRACK_NOT_FOUND" ? 404 : 500,
      body: buildTaskRunError({
        identity: context.identity,
        startedAt: context.startedAt,
        tool: "track-orchestrator",
        task: body.track_id,
        code,
        message: error.message || "Track execution failed.",
        nextStep: error.nextStep || "Check track configuration and tool registration."
      })
    };
  }
}

function validateTrackRunRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      statusCode: 400,
      code: "INVALID_INPUT",
      message: "Track run request must be a JSON object.",
      nextStep: "Send track_id and input fields."
    };
  }

  if (!body.track_id || typeof body.track_id !== "string" || !body.track_id.trim()) {
    return {
      statusCode: 400,
      code: "INVALID_INPUT",
      message: "Track run request requires track_id.",
      nextStep: "Use GET /tracks to list available tracks."
    };
  }

  if (!body.input || typeof body.input !== "object" || Array.isArray(body.input)) {
    return {
      statusCode: 400,
      code: "INVALID_INPUT",
      message: "Track run request requires input object.",
      nextStep: "Send structured track input such as url and scores."
    };
  }

  return null;
}

function validateTaskRunRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      tool: null,
      task: null,
      code: "INVALID_INPUT",
      message: "Task run request body must be a JSON object.",
      nextStep: "Send tool, input, optional task, context, and options."
    };
  }

  const tool = typeof body.tool === "string" ? body.tool : null;
  const task = typeof body.task === "string" ? body.task : null;

  if (!tool) {
    return {
      tool: null,
      task,
      code: "INVALID_INPUT",
      message: "Task run request is missing a string tool field.",
      nextStep: "Use a registered tool ID from /tools."
    };
  }

  if (!Object.prototype.hasOwnProperty.call(body, "input")) {
    return {
      tool,
      task,
      code: "INVALID_INPUT",
      message: "Task run request is missing input.",
      nextStep: "Send the selected tool input object."
    };
  }

  if (!toolRegistry.has(tool)) {
    return {
      tool,
      task,
      code: "TOOL_NOT_FOUND",
      message: `No registered tool matched '${tool}'.`,
      nextStep: "Use one of the registered tool IDs from /tools."
    };
  }

  const registeredTool = toolRegistry.get(tool);

  if (task && !toolRegistry.supportsTask(tool, task)) {
    return {
      tool,
      task,
      code: "TASK_NOT_FOUND",
      message: `Tool '${tool}' does not support task '${task}'.`,
      nextStep: `Use one of these tasks: ${registeredTool.tasks.join(", ")}.`
    };
  }

  return null;
}

function buildTaskRunContextPacket({ identity, body, task, tool }) {
  return buildContextPacket({
    identity,
    source: normalizeTaskRunSource(body.context),
    task: {
      tool: body.tool,
      goal: task,
      model_role: resolveModelRole(body, tool),
      priority: body.options && body.options.priority
    },
    input: normalizeTaskRunInput(body.input),
    options: body.options || {}
  });
}

function normalizeTaskRunSource(context = {}) {
  if (typeof context === "string") {
    return {
      app_id: context,
      surface: "http-api",
      user_action: "tasks.run",
      client_version: "unknown"
    };
  }

  if (!context || typeof context !== "object" || Array.isArray(context)) {
    return {
      app_id: "unknown-app",
      surface: "http-api",
      user_action: "tasks.run",
      client_version: "unknown"
    };
  }

  if (typeof context.source === "string") {
    return {
      app_id: context.source,
      surface: context.surface || "http-api",
      user_action: context.user_action || context.userAction || "tasks.run",
      client_version: context.client_version || context.clientVersion || "unknown"
    };
  }

  if (context.source && typeof context.source === "object" && !Array.isArray(context.source)) {
    return context.source;
  }

  return context;
}

function normalizeTaskRunInput(input) {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    const hasEngineShape = Object.prototype.hasOwnProperty.call(input, "content")
      || Object.prototype.hasOwnProperty.call(input, "attachments")
      || Object.prototype.hasOwnProperty.call(input, "metadata");

    if (hasEngineShape) {
      return input;
    }
  }

  return {
    type: "json",
    content: input,
    attachments: [],
    metadata: {
      endpoint: "/tasks/run"
    }
  };
}

function resolveTaskRunTask(body, tool) {
  if (typeof body.task === "string" && body.task.trim()) {
    return body.task.trim();
  }

  return tool.tasks[0];
}

function resolveModelRole(body, tool) {
  if (body.options && typeof body.options.model_role === "string" && body.options.model_role.trim()) {
    return body.options.model_role.trim();
  }

  if (body.options && typeof body.options.modelRole === "string" && body.options.modelRole.trim()) {
    return body.options.modelRole.trim();
  }

  return tool.modelRole || "default_worker";
}

function resolveRequestedPermissions(body, tool) {
  const explicitRequested = body.options
    && body.options.permissions
    && Array.isArray(body.options.permissions.requested)
    ? body.options.permissions.requested
    : null;

  return explicitRequested || tool.permissions || [];
}

function validateToolInput(tool, input) {
  if (!tool || typeof tool.validateInput !== "function") {
    return null;
  }

  return tool.validateInput(input);
}

function normalizeToolResult(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    const error = new Error("Tool handler must return a raw result object.");
    error.code = "MODEL_RESPONSE_INVALID";
    throw error;
  }

  return result;
}

function getAnalyzeErrorNextStep(code) {
  if (code === "NOT_IMPLEMENTED") {
    return "Implement the selected tool handler in a later phase.";
  }

  if (code === "MODEL_RESPONSE_INVALID") {
    return "Update the tool handler to return a valid raw result object.";
  }

  return "Check the server logs and try again.";
}

function buildAnalyzeSuccess(options) {
  return createAnalyzeSuccess({
    provider: getActiveProviderId(),
    model: getActiveModel(),
    ...options
  });
}

function buildAnalyzeError(options) {
  return createAnalyzeError({
    provider: getActiveProviderId(),
    model: getActiveModel(),
    ...options
  });
}

function buildAnalyzeRequestMeta(context, inputGateResult = null, permissionResult = null, validationResult = null) {
  const meta = buildAnalyzeMeta({
    requestId: context.identity.requestId,
    startedAt: context.startedAt
  });

  if (inputGateResult) {
    meta.security = {
      riskLevel: inputGateResult.risk_level,
      flags: inputGateResult.flags,
      warnings: inputGateResult.warnings,
      inputSummary: inputGateResult.input_summary
    };
  }

  if (permissionResult) {
    meta.permissions = {
      used: permissionResult.permissions_used,
      denied: permissionResult.denied,
      undeclared: permissionResult.undeclared
    };
  }

  if (validationResult) {
    meta.schemaValid = !validationResult.validation || validationResult.validation.ok !== false;
    meta.fallbacksUsed = validationResult.fallbacks_used || [];
  }

  return meta;
}

function buildTaskRunError({
  identity,
  startedAt,
  tool = null,
  task = null,
  code,
  message,
  nextStep,
  modelRole = null,
  model = null,
  inputGateResult = null,
  permissionResult = null,
  schemaValid = false,
  fallbacksUsed = []
}) {
  return buildEngineError({
    run_id: identity.run_id,
    trace_id: identity.trace_id,
    tool,
    task,
    provider: getActiveProviderId(),
    model: getActiveModel(model),
    model_role: modelRole,
    code,
    message,
    next_step: nextStep,
    warnings: inputGateResult ? inputGateResult.warnings : [],
    fallbacks_used: fallbacksUsed,
    meta: buildTaskRunMeta({ startedAt }, inputGateResult, schemaValid, permissionResult)
  });
}

function buildTaskRunMeta(context, inputGateResult = null, schemaValid = true, permissionResult = null) {
  const extra = {};

  if (inputGateResult) {
    extra.input_gate = {
      risk_level: inputGateResult.risk_level,
      flags: inputGateResult.flags,
      input_summary: inputGateResult.input_summary
    };
  }

  if (permissionResult) {
    extra.permissions = {
      used: permissionResult.permissions_used,
      denied: permissionResult.denied,
      undeclared: permissionResult.undeclared
    };
  }

  return buildEngineMeta({
    startedAt: context.startedAt,
    schemaValid,
    extra
  });
}

async function recordTaskRunAndReturn({
  identity,
  startedAt,
  statusCode,
  body,
  contextPacket = null,
  tool = null,
  permissionResult = null
}) {
  try {
    await auditLog.record(buildAuditEvent({
      identity,
      contextPacket,
      tool,
      provider: getActiveProviderId(),
      model: body && body.model ? body.model : getActiveModel(),
      permissionsUsed: permissionResult ? permissionResult.permissions_used : null,
      responseBody: body,
      statusCode,
      startedAt
    }));
  } catch (error) {
    console.error("Failed to write audit event.");
    console.error(error.message);
  }

  return body;
}

function normalizeTaskRunErrorCode(code) {
  if (code === "UNKNOWN_TOOL") {
    return "TOOL_NOT_FOUND";
  }

  if (code === "UNKNOWN_TASK") {
    return "TASK_NOT_FOUND";
  }

  if (code === "MODEL_NOT_READY") {
    return "MODEL_UNAVAILABLE";
  }

  return code;
}

function getTaskRunErrorNextStep(code) {
  if (code === "TOOL_NOT_FOUND") {
    return "Use a registered tool ID from /tools.";
  }

  if (code === "TASK_NOT_FOUND") {
    return "Use a supported task for the selected tool.";
  }

  if (code === "MODEL_RESPONSE_INVALID" || code === "SCHEMA_VALIDATION_FAILED") {
    return "Update the tool handler or model prompt so the result matches the tool output schema.";
  }

  if (code === "PROVIDER_UNAVAILABLE") {
    return "Start the configured local provider, then try again.";
  }

  if (code === "MODEL_UNAVAILABLE") {
    return "Pull or configure the selected local model, then try again.";
  }

  return "Check the server logs and try again.";
}

async function readJsonBody(request) {
  const rawBody = await readBody(request);

  if (!rawBody.trim()) {
    return { ok: true, body: {} };
  }

  try {
    return { ok: true, body: JSON.parse(rawBody) };
  } catch (error) {
    return { ok: false, body: null };
  }
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function sendJson(response, statusCode, body) {
  const payload = JSON.stringify(body, null, 2);

  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload)
  });
  response.end(payload);
}
