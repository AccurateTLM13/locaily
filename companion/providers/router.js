const { createOllamaRuntime } = require("../runtime/ollama");

const DEFAULT_PROVIDER = "ollama";
const DEFAULT_MODEL = "llama3.2";
const MOCK_MODEL = "mock-local-model";
const MOCK_MODELS = new Set([
  "mock-local-model",
  "mock-fast-model",
  "mock-reasoning-model"
]);

function createProviderRouter(config = {}) {
  const activeProvider = normalizeProviderId(config.provider || config.activeProvider || DEFAULT_PROVIDER);
  const providers = new Map();

  providers.set("ollama", createProviderState({
    id: "ollama",
    endpoint: config.baseUrl || "http://127.0.0.1:11434",
    model: config.model || DEFAULT_MODEL,
    runtime: createOllamaRuntime({
      baseUrl: config.baseUrl,
      model: config.model
    })
  }));

  providers.set("mock", createProviderState({
    id: "mock",
    endpoint: "local-memory",
    model: MOCK_MODEL,
    runtime: createMockRuntime()
  }));

  let currentProvider = providers.has(activeProvider) ? activeProvider : DEFAULT_PROVIDER;

  return {
    getActiveProviderId() {
      return currentProvider;
    },
    getActiveProvider() {
      return providers.get(currentProvider);
    },
    getRuntime() {
      return providers.get(currentProvider).runtime;
    },
    getModel(modelOverride = null) {
      return modelOverride || providers.get(currentProvider).model;
    },
    setActiveProvider(providerId) {
      const normalized = normalizeProviderId(providerId);

      if (!providers.has(normalized)) {
        return {
          ok: false,
          error: {
            code: "PROVIDER_NOT_FOUND",
            message: `Provider '${providerId}' is not configured.`,
            nextStep: "Use one of the providers returned by GET /providers/status."
          }
        };
      }

      currentProvider = normalized;

      return {
        ok: true,
        provider: buildPublicProviderState(providers.get(currentProvider), true)
      };
    },
    async listStatus() {
      const statuses = [];

      for (const provider of providers.values()) {
        statuses.push(await checkProviderStatus(provider, provider.id === currentProvider));
      }

      return statuses;
    },
    async checkActiveState(modelOverride = null) {
      const provider = providers.get(currentProvider);
      const model = modelOverride || provider.model;
      const status = await checkProviderStatus(provider, true, model);

      return {
        provider: provider.id,
        model,
        available: status.status === "available",
        modelReady: status.model_ready === true,
        models: status.models || [],
        endpoint: provider.endpoint,
        warning: status.warning || null
      };
    }
  };
}

function createProviderState({ id, endpoint, model, runtime }) {
  return {
    id,
    endpoint,
    model,
    runtime
  };
}

async function checkProviderStatus(provider, active, modelOverride = null) {
  const model = modelOverride || provider.model;

  try {
    const models = await provider.runtime.listModels();
    const modelReady = await provider.runtime.hasModel(model);

    return {
      ...buildPublicProviderState(provider, active, model),
      status: "available",
      model_ready: modelReady,
      models,
      warning: modelReady ? null : {
        code: "MODEL_UNAVAILABLE",
        message: `Model '${model}' was not found for provider '${provider.id}'.`,
        nextStep: provider.id === "ollama"
          ? `Run 'ollama pull ${model}', then try again.`
          : "Configure a model supported by this provider."
      }
    };
  } catch (error) {
    return {
      ...buildPublicProviderState(provider, active, model),
      status: "unavailable",
      model_ready: false,
      models: [],
      warning: normalizeProviderError(error, provider)
    };
  }
}

function buildPublicProviderState(provider, active, modelOverride = null) {
  return {
    id: provider.id,
    active,
    endpoint: provider.endpoint,
    model: modelOverride || provider.model
  };
}

function normalizeProviderError(error, provider) {
  const code = error && error.code === "OLLAMA_TIMEOUT" ? "TIMEOUT" : "PROVIDER_UNAVAILABLE";

  return {
    code,
    message: `Provider '${provider.id}' is not available at ${provider.endpoint}.`,
    nextStep: provider.id === "ollama"
      ? "Start Ollama, then try again."
      : "Select an available provider or check its local configuration."
  };
}

function normalizeProviderId(providerId) {
  return String(providerId || "").trim().toLowerCase();
}

function createMockRuntime() {
  return {
    provider: "mock",
    baseUrl: "local-memory",
    model: MOCK_MODEL,
    isAvailable: async () => true,
    listModels: async () => Array.from(MOCK_MODELS),
    hasModel: async (modelName = MOCK_MODEL) => MOCK_MODELS.has(modelName),
    generate: async (prompt) => `Mock response for: ${String(prompt || "").slice(0, 80)}`,
    generateJson: async (prompt, schema) => buildMockJson(schema, prompt)
  };
}

function buildMockJson(schema, prompt) {
  if (schema && Array.isArray(schema.required)) {
    const result = {};

    for (const key of schema.required) {
      result[key] = mockValueForSchema(schema.properties && schema.properties[key], key);
    }

    return result;
  }

  return {
    summary: `Mock JSON response for: ${String(prompt || "").slice(0, 80)}`
  };
}

function mockValueForSchema(schema, key) {
  if (!schema || typeof schema !== "object") {
    return mockValueForKey(key);
  }

  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return schema.enum[0];
  }

  if (schema.type === "array") {
    return [];
  }

  if (schema.type === "boolean") {
    return true;
  }

  if (schema.type === "integer") {
    return 0;
  }

  if (schema.type === "number") {
    return 0.8;
  }

  if (schema.type === "object") {
    return {};
  }

  return mockValueForKey(key);
}

function mockValueForKey(key) {
  if (/score|count|total|price/i.test(key)) {
    return 0;
  }

  if (/flags|items|list|fixes|checklist|signals/i.test(key)) {
    return [];
  }

  if (/risk/i.test(key)) {
    return "low";
  }

  return `Mock ${key}`;
}

module.exports = {
  createProviderRouter,
  createMockRuntime
};
