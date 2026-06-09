const DEFAULT_BASE_URL = "http://127.0.0.1:11434";
const DEFAULT_MODEL = "llama3.2";
const DEFAULT_TIMEOUT_MS = 30000;
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
  const baseUrl = normalizeBaseUrl(options.baseUrl || DEFAULT_BASE_URL);
  const response = await fetchJson(`${baseUrl}/api/tags`, {
    method: "GET",
    timeoutMs: options.timeoutMs || HEALTH_TIMEOUT_MS
  });

  return normalizeOllamaModels(response);
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

function normalizeOllamaModels(body) {
  if (!body || !Array.isArray(body.models)) {
    return [];
  }

  return body.models
    .map((model) => model.name || model.model)
    .filter((name) => typeof name === "string" && name.trim())
    .sort();
}

function matchesConfiguredModel(models, configuredModel) {
  return models.some((modelName) => {
    return modelName === configuredModel || modelName.startsWith(`${configuredModel}:`);
  });
}

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
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
  hasModel,
  generate,
  generateJson
};
