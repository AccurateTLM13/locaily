const DEFAULT_BASE_URL = "http://127.0.0.1:11434";
const DEFAULT_TIMEOUT_MS = 120000;

class ToolEvalRuntime {
  constructor({
    baseUrl = DEFAULT_BASE_URL,
    model,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    temperature = 0,
    numPredict = 2048,
    maxTurns = 8,
    fetchImpl = globalThis.fetch
  }) {
    this.baseUrl = String(baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
    this.model = model;
    this.timeoutMs = timeoutMs;
    this.temperature = temperature;
    this.numPredict = numPredict;
    this.maxTurns = maxTurns;
    this.fetchImpl = fetchImpl;
  }

  async chat({ messages, tools, toolChoice = "auto", responseFormat = null }) {
    const startedAt = Date.now();
    const body = {
      model: this.model,
      messages,
      stream: false,
      options: {
        temperature: this.temperature,
        num_predict: this.numPredict
      }
    };

    if (Array.isArray(tools) && tools.length > 0) {
      body.tools = tools;
    }

    if (toolChoice === "none") {
      body.tool_choice = "none";
    } else if (toolChoice === "required") {
      body.tool_choice = "required";
    }

    if (responseFormat) {
      body.format = responseFormat;
    }

    try {
      const response = await this.fetchImpl(`${this.baseUrl}/api/chat`, {
        method: "POST",
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        let errorBody = "";
        try { errorBody = await response.text(); } catch {}
        return { ok: false, errorCode: "RUNTIME_ERROR", message: `Ollama returned HTTP ${response.status}: ${errorBody}`, durationMs: Date.now() - startedAt };
      }

      const data = await response.json();
      const message = data.message || {};

      return {
        ok: true,
        content: message.content || "",
        toolCalls: (message.tool_calls || []).map((call, index) => ({
          id: call.id || `call_${Date.now()}_${index}`,
          name: call.function?.name || "unknown",
          arguments: parseArgs(call.function?.arguments)
        })),
        durationMs: Date.now() - startedAt,
        doneReason: data.done_reason || "stop"
      };
    } catch (error) {
      const errorCode = error.name === "TimeoutError" || error.name === "AbortError" ? "TIMEOUT" : "RUNTIME_ERROR";
      return { ok: false, errorCode, message: error.message, durationMs: Date.now() - startedAt };
    }
  }
}

function parseArgs(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

module.exports = { ToolEvalRuntime };
