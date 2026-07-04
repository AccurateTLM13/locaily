const DEFAULT_BASE_URL = "http://127.0.0.1:11434";
const DEFAULT_TIMEOUT_MS = 60000;

class OllamaRuntimeAdapter {
  constructor({
    baseUrl = DEFAULT_BASE_URL,
    model,
    outputSchema,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    temperature = 0,
    numPredict = 512,
    fetchImpl = globalThis.fetch
  }) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.model = model;
    this.outputSchema = outputSchema;
    this.timeoutMs = timeoutMs;
    this.temperature = temperature;
    this.numPredict = numPredict;
    this.fetchImpl = fetchImpl;
  }

  async generate({ caseId, input }) {
    const startedAt = Date.now();

    try {
      const response = await fetchJson(`${this.baseUrl}/api/generate`, {
        fetchImpl: this.fetchImpl,
        timeoutMs: this.timeoutMs,
        body: {
          model: this.model,
          prompt: buildPrompt({ caseId, input }),
          stream: false,
          format: this.outputSchema,
          options: {
            temperature: this.temperature,
            num_predict: this.numPredict
          }
        }
      });

      if (typeof response.response !== "string") {
        return {
          ok: false,
          errorCode: "MODEL_RESPONSE_INVALID",
          rawText: "",
          durationMs: Date.now() - startedAt
        };
      }

      return {
        ok: true,
        rawText: response.response,
        durationMs: Date.now() - startedAt
      };
    } catch (error) {
      return {
        ok: false,
        errorCode: normalizeErrorCode(error),
        rawText: "",
        durationMs: Date.now() - startedAt
      };
    }
  }
}

function buildPrompt({ caseId, input }) {
  return [
    "You are a strict Locaily benchmark worker.",
    "Return only JSON that matches the provided schema.",
    "Do not include prose, Markdown, or code fences.",
    "",
    "Choose exactly one label using these definitions:",
    "- extract: the user wants fields, facts, values, entities, or structured data pulled from input.",
    "- summarize: the user wants a shorter summary, handoff, brief, digest, or recap.",
    "- classify: the user explicitly asks to categorize, label, score, tag, or classify something.",
    "- route: the user wants work sent to a tool, workflow, model role, worker, or destination.",
    "- unknown: the request is creative generation, conversation, advice, a test/error simulation, impossible, unrelated, or does not match another label.",
    "Do not use classify as a catch-all label. If the request asks you to write, joke, brainstorm, chat, advise, or answer a general question, use unknown.",
    "",
    "Examples:",
    "Input: Pull the title and price from this listing. Label: extract",
    "Input: Summarize this Lighthouse report. Label: summarize",
    "Input: Classify this request as a workflow or tool task. Label: classify",
    "Input: Send this to the best worker role. Label: route",
    "Input: Tell me a joke about a sandwich. Label: unknown",
    "Input: What should I cook for dinner? Label: unknown",
    "Input: Trigger a simulated runtime error. Label: unknown",
    "",
    `Case ID: ${caseId}`,
    "Input:",
    JSON.stringify(input)
  ].join("\n");
}

async function fetchJson(url, { fetchImpl, body, timeoutMs }) {
  if (typeof fetchImpl !== "function") {
    const error = new Error("Fetch is not available in this Node runtime.");
    error.code = "FETCH_UNAVAILABLE";
    throw error;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = new Error(`Ollama returned HTTP ${response.status}.`);
      error.code = "OLLAMA_REQUEST_FAILED";
      throw error;
    }

    return await response.json();
  } catch (error) {
    if (error.code) {
      throw error;
    }

    error.code = error.name === "AbortError" ? "TIMEOUT" : "RUNTIME_ERROR";
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
}

function normalizeErrorCode(error) {
  if (error && error.code === "TIMEOUT") {
    return "TIMEOUT";
  }

  return "RUNTIME_ERROR";
}

module.exports = {
  OllamaRuntimeAdapter,
  buildPrompt,
  fetchJson
};
