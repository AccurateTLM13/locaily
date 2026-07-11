const { PROTOCOL_VERSION, isSupportedProtocolVersion } = require("./protocol");

function defaultFetch() {
  if (typeof fetch === "function") {
    return fetch;
  }

  const error = new Error("Global fetch is not available in this Node.js version.");
  error.code = "RELAY_FETCH_UNAVAILABLE";
  throw error;
}

function createRelayConnector(options = {}) {
  const fetchImpl = options.fetch || defaultFetch();
  const timeoutMs = options.timeoutMs || 15000;

  async function postJson(url, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      const text = await response.text();
      let parsed;

      try {
        parsed = text ? JSON.parse(text) : {};
      } catch (parseError) {
        const error = new Error(`Relay node returned non-JSON response: ${text.slice(0, 200)}`);
        error.code = "RELAY_NODE_BAD_RESPONSE";
        throw error;
      }

      if (!response.ok) {
        const error = new Error(parsed.error?.message || `Relay node returned ${response.status}.`);
        error.code = parsed.error?.code || "RELAY_NODE_ERROR";
        error.status = response.status;
        throw error;
      }

      return parsed;
    } catch (error) {
      if (error.name === "AbortError" || error.code === "ABORT_ERR") {
        const timeoutError = new Error(`Relay node request timed out after ${timeoutMs}ms.`);
        timeoutError.code = "RELAY_NODE_TIMEOUT";
        throw timeoutError;
      }

      if (error.code && error.code.startsWith("RELAY_")) {
        throw error;
      }

      const networkError = new Error(`Relay node unreachable: ${error.message}`);
      networkError.code = "RELAY_NODE_UNREACHABLE";
      networkError.cause = error;
      throw networkError;
    } finally {
      clearTimeout(timer);
    }
  }

  async function executeRemoteStep({ node, step, context, options = {}, meta = {} }) {
    const payload = {
      protocolVersion: PROTOCOL_VERSION,
      step,
      context,
      options,
      meta
    };

    const result = await postJson(`${node.baseUrl.replace(/\/$/, "")}/relay/step`, payload);

    if (!isSupportedProtocolVersion(result.protocolVersion)) {
      const error = new Error(`Relay node protocol mismatch: ${result.protocolVersion || "unknown"}.`);
      error.code = "RELAY_PROTOCOL_MISMATCH";
      throw error;
    }

    return {
      ok: result.ok !== false,
      output: result.output,
      meta: {
        ...(result.meta || {}),
        nodeId: node.nodeId,
        relay: true
      }
    };
  }

  async function registerWithOrchestrator({ orchestratorBaseUrl, self }) {
    return postJson(`${orchestratorBaseUrl.replace(/\/$/, "")}/relay/register`, {
      protocolVersion: PROTOCOL_VERSION,
      ...self
    });
  }

  async function sendHeartbeat({ orchestratorBaseUrl, nodeId, capabilities, hardware }) {
    return postJson(`${orchestratorBaseUrl.replace(/\/$/, "")}/relay/heartbeat`, {
      protocolVersion: PROTOCOL_VERSION,
      nodeId,
      capabilities,
      hardware
    });
  }

  return {
    executeRemoteStep,
    registerWithOrchestrator,
    sendHeartbeat
  };
}

module.exports = {
  createRelayConnector
};
