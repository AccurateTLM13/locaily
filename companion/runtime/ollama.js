const DEFAULT_BASE_URL = "http://127.0.0.1:11434";
const DEFAULT_MODEL = "llama3.2";
const DEFAULT_TIMEOUT_MS = 30000;
const MODEL_LOAD_TIMEOUT_MS = 120000;
const HEALTH_TIMEOUT_MS = 1500;

function createOllamaRuntime(config = {}) {
  const baseUrl = normalizeBaseUrl(config.baseUrl || DEFAULT_BASE_URL);
  const defaultModel = config.model || DEFAULT_MODEL;

  return {
    provider: "ollama",
    baseUrl,
    model: defaultModel,
    isAvailable: () => isAvailable({ baseUrl }),
    listModels: () => listModels({ baseUrl }),
    listModelDetails: () => listModelDetails({ baseUrl }),
    listRunningModels: () => listRunningModels({ baseUrl }),
    showModel: (modelName = defaultModel) => showModel(modelName, { baseUrl }),
    loadModel: (modelName = defaultModel, options = {}) => loadModel(modelName, { baseUrl, ...options }),
    unloadModel: (modelName = defaultModel) => unloadModel(modelName, { baseUrl }),
    hasModel: (modelName = defaultModel) => hasModel(modelName, { baseUrl }),
    generate: (prompt, options = {}) => generate(prompt, {
      baseUrl,
      model: defaultModel,
      ...options
    }),
    generateJson: (prompt, schema, options = {}) => generateJson(prompt, schema, {
      baseUrl,
      model: defaultModel,
      ...options
    })
  };
}

async function isAvailable(options = {}) {
  try {
    await listModels({
      ...options,
      timeoutMs: options.timeoutMs || HEALTH_TIMEOUT_MS
    });
    return true;
  } catch (error) {
    return false;
  }
}

async function listModels(options = {}) {
  const models = await listModelDetails(options);
  return models.map((model) => model.name).sort();
}

async function listModelDetails(options = {}) {
  const baseUrl = normalizeBaseUrl(options.baseUrl || DEFAULT_BASE_URL);
  const response = await fetchJson(`${baseUrl}/api/tags`, {
    method: "GET",
    timeoutMs: options.timeoutMs || HEALTH_TIMEOUT_MS
  });

  return normalizeOllamaModelDetails(response);
}

async function listRunningModels(options = {}) {
  const baseUrl = normalizeBaseUrl(options.baseUrl || DEFAULT_BASE_URL);
  const response = await fetchJson(`${baseUrl}/api/ps`, {
    method: "GET",
    timeoutMs: options.timeoutMs || HEALTH_TIMEOUT_MS
  });
  return normalizeRunningModels(response);
}

async function showModel(modelName, options = {}) {
  assertModelName(modelName);
  const baseUrl = normalizeBaseUrl(options.baseUrl || DEFAULT_BASE_URL);
  return fetchJson(`${baseUrl}/api/show`, {
    method: "POST",
    body: { model: modelName },
    timeoutMs: options.timeoutMs || DEFAULT_TIMEOUT_MS
  });
}

async function loadModel(modelName, options = {}) {
  assertModelName(modelName);
  const baseUrl = normalizeBaseUrl(options.baseUrl || DEFAULT_BASE_URL);
  const keepAlive = normalizeKeepAlive(options.keepAlive);
  await fetchJson(`${baseUrl}/api/generate`, {
    method: "POST",
    body: { model: modelName, keep_alive: keepAlive },
    timeoutMs: options.timeoutMs || MODEL_LOAD_TIMEOUT_MS
  });
  return { model: modelName, loaded: true, keepAlive };
}

async function unloadModel(modelName, options = {}) {
  assertModelName(modelName);
  const baseUrl = normalizeBaseUrl(options.baseUrl || DEFAULT_BASE_URL);
  await fetchJson(`${baseUrl}/api/generate`, {
    method: "POST",
    body: { model: modelName, keep_alive: 0 },
    timeoutMs: options.timeoutMs || DEFAULT_TIMEOUT_MS
  });
  return { model: modelName, loaded: false };
}

async function hasModel(modelName, options = {}) {
  const models = await listModels(options);
  return matchesConfiguredModel(models, modelName);
}

async function generate(prompt, options = {}) {
  if (!prompt || typeof prompt !== "string") {
    throwRuntimeError("INVALID_PROMPT", "Prompt must be a non-empty string.");
  }

  const baseUrl = normalizeBaseUrl(options.baseUrl || DEFAULT_BASE_URL);
  const model = options.model || DEFAULT_MODEL;
  const body = {
    model,
    prompt,
    stream: false,
    options: buildOllamaOptions(options)
  };

  const response = await fetchJson(`${baseUrl}/api/generate`, {
    method: "POST",
    body,
    timeoutMs: options.timeoutMs || DEFAULT_TIMEOUT_MS
  });

  if (typeof response.response !== "string") {
    throwRuntimeError("MODEL_RESPONSE_INVALID", "Ollama response did not include a text response.");
  }

  return response.response;
}

async function generateJson(prompt, schema, options = {}) {
  if (!schema || typeof schema !== "object") {
    throwRuntimeError("INVALID_SCHEMA", "Schema must be an object.");
  }

  const baseUrl = normalizeBaseUrl(options.baseUrl || DEFAULT_BASE_URL);
  const model = options.model || DEFAULT_MODEL;
  const body = {
    model,
    prompt,
    stream: false,
    format: schema,
    options: buildOllamaOptions(options)
  };

  const response = await fetchJson(`${baseUrl}/api/generate`, {
    method: "POST",
    body,
    timeoutMs: options.timeoutMs || DEFAULT_TIMEOUT_MS
  });

  if (typeof response.response !== "string") {
    throwRuntimeError("MODEL_RESPONSE_INVALID", "Ollama response did not include a JSON string response.");
  }

  try {
    return JSON.parse(response.response);
  } catch (error) {
    throwRuntimeError("MODEL_RESPONSE_INVALID", "Model output could not be parsed as JSON.", {
      cause: error
    });
  }
}

function buildOllamaOptions(options) {
  const ollamaOptions = {};

  if (typeof options.temperature === "number") {
    ollamaOptions.temperature = options.temperature;
  }

  if (typeof options.numPredict === "number") {
    ollamaOptions.num_predict = options.numPredict;
  }

  return ollamaOptions;
}

async function fetchJson(url, { method, body, timeoutMs }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method,
      signal: controller.signal,
      headers: body ? {
        "Content-Type": "application/json"
      } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });

    if (!response.ok) {
      throwRuntimeError("OLLAMA_REQUEST_FAILED", `Ollama returned HTTP ${response.status}.`);
    }

    return await response.json();
  } catch (error) {
    if (error.code) {
      throw error;
    }

    const code = error.name === "AbortError" ? "OLLAMA_TIMEOUT" : "OLLAMA_NOT_RUNNING";
    const message = error.name === "AbortError"
      ? "Ollama request timed out."
      : "Ollama is not reachable.";

    throwRuntimeError(code, message, { cause: error });
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeOllamaModelDetails(body) {
  if (!body || !Array.isArray(body.models)) {
    return [];
  }

  return body.models
    .map((model) => ({
      name: model.name || model.model,
      model: model.model || model.name,
      modifiedAt: model.modified_at || null,
      sizeBytes: Number.isFinite(model.size) ? model.size : null,
      digest: normalizeDigest(model.digest),
      family: model.details && model.details.family || null,
      families: model.details && Array.isArray(model.details.families) ? model.details.families : [],
      parameterSize: model.details && model.details.parameter_size || null,
      quantizationLevel: model.details && model.details.quantization_level || null,
      format: model.details && model.details.format || null
    }))
    .filter((model) => typeof model.name === "string" && model.name.trim())
    .sort((left, right) => left.name.localeCompare(right.name));
}

function normalizeRunningModels(body) {
  if (!body || !Array.isArray(body.models)) return [];
  return body.models.map((model) => ({
    name: model.name || model.model,
    model: model.model || model.name,
    sizeBytes: Number.isFinite(model.size) ? model.size : null,
    sizeVramBytes: Number.isFinite(model.size_vram) ? model.size_vram : null,
    digest: normalizeDigest(model.digest),
    expiresAt: model.expires_at || null,
    contextLength: model.context_length || null
  })).filter((model) => typeof model.name === "string" && model.name.trim());
}

function matchesConfiguredModel(models, configuredModel) {
  return models.some((modelName) => {
    return modelName === configuredModel || modelName.startsWith(`${configuredModel}:`);
  });
}

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
}

function normalizeDigest(value) {
  if (!value) return null;
  const digest = String(value).toLowerCase();
  if (/^sha256:[a-f0-9]{64}$/.test(digest)) return digest;
  if (/^[a-f0-9]{64}$/.test(digest)) return `sha256:${digest}`;
  return digest;
}

function normalizeKeepAlive(value) {
  if (value == null) return "5m";
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === "string" && /^\d+(ms|s|m|h)$/.test(value)) return value;
  throwRuntimeError("INVALID_KEEP_ALIVE", "keepAlive must be a non-negative number or a duration such as '5m'.");
}

function assertModelName(modelName) {
  if (typeof modelName !== "string" || !modelName.trim() || modelName.length > 300) {
    throwRuntimeError("INVALID_MODEL", "Model must be a non-empty installed Ollama model name.");
  }
}

function throwRuntimeError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;

  if (details.cause) {
    error.cause = details.cause;
  }

  throw error;
}

module.exports = {
  createOllamaRuntime,
  isAvailable,
  listModels,
  listModelDetails,
  listRunningModels,
  showModel,
  loadModel,
  unloadModel,
  hasModel,
  generate,
  generateJson
};
