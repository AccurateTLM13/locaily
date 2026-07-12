const PROTOCOL_VERSION = "1.0";

const STEP_ROLE = {
  DISPATCH: "dispatch",
  RESULT: "result",
  ERROR: "error"
};

const NODE_STATUS = {
  HEALTHY: "healthy",
  DEGRADED: "degraded",
  UNHEALTHY: "unhealthy",
  UNKNOWN: "unknown"
};

const ROUTING_POLICY = {
  ROUTE_IF_UNAVAILABLE: "route_if_unavailable",
  PREFER_RELAY: "prefer_relay",
  LOCAL_ONLY: "local_only"
};

const RELAY_AUTH_CODES = {
  RELAY_AUTH_MISSING: "RELAY_AUTH_MISSING",
  RELAY_AUTH_INVALID: "RELAY_AUTH_INVALID",
  RELAY_AUTH_REQUIRED: "RELAY_AUTH_REQUIRED"
};

function isSupportedProtocolVersion(version) {
  if (!version) {
    return true;
  }

  return String(version) === PROTOCOL_VERSION;
}

function capabilityKey({ role, trackId, contractId } = {}) {
  return [role || "*", trackId || "*", contractId || "*"].join(":");
}

function describeProtocol() {
  return {
    protocol: "locaily-relay-node",
    version: PROTOCOL_VERSION,
    endpoints: {
      register: "POST /relay/register",
      heartbeat: "POST /relay/heartbeat",
      unregister: "POST /relay/unregister",
      nodes: "GET /relay/nodes",
      plan: "POST /relay/plan",
      step: "POST /relay/step"
    },
    messageShapes: {
      nodeRegistration: {
        nodeId: "string",
        baseUrl: "string",
        label: "string?",
        capabilities: "string[] (model roles, tool packs, hardware profiles)",
        hardware: "object?"
      },
      stepDispatch: {
        protocolVersion: PROTOCOL_VERSION,
        step: "track step descriptor",
        context: "track context (input + artifacts)",
        options: "routing/model options",
        meta: "request identity"
      },
      stepResult: {
        protocolVersion: PROTOCOL_VERSION,
        ok: "boolean",
        output: "raw step result object",
        meta: "worker meta (role, model, nodeId)"
      }
    }
  };
}

module.exports = {
  PROTOCOL_VERSION,
  STEP_ROLE,
  NODE_STATUS,
  ROUTING_POLICY,
  RELAY_AUTH_CODES,
  isSupportedProtocolVersion,
  capabilityKey,
  describeProtocol
};
