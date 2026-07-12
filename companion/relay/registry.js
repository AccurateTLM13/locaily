const { NODE_STATUS, capabilityKey, PROTOCOL_VERSION, RELAY_VALIDATION_CODES } = require("./protocol");

const HEALTH_STALE_MS = 60 * 1000;

function createNodeRecord({ nodeId, baseUrl, label, capabilities, hardware }) {
  const now = Date.now();

  return {
    nodeId,
    baseUrl,
    label: label || nodeId,
    capabilities: Array.isArray(capabilities) ? capabilities.map(String) : [],
    hardware: hardware && typeof hardware === "object" ? hardware : null,
    status: NODE_STATUS.UNKNOWN,
    lastSeen: now,
    registeredAt: now,
    dispatchCount: 0,
    failureCount: 0
  };
}

function normalizeCapability(cap) {
  const str = String(cap);
  return str.startsWith("role:") ? str.slice(5) : str;
}

function createRelayRegistry(options = {}) {
  const nodes = new Map();
  const staleMs = options.staleMs || HEALTH_STALE_MS;
  const allowedCapabilities = options.allowedCapabilities || null;

  function validateCapabilities(capabilities) {
    if (!allowedCapabilities || !Array.isArray(capabilities)) {
      return;
    }

    const denied = [];
    for (const cap of capabilities) {
      const normalized = normalizeCapability(cap);
      if (!allowedCapabilities.has(normalized)) {
        denied.push(normalized);
      }
    }

    if (denied.length > 0) {
      const error = new Error(
        `Unauthorized capability(ies): ${denied.join(", ")}. Allowed: ${[...allowedCapabilities].join(", ")}.`
      );
      error.code = RELAY_VALIDATION_CODES.RELAY_CAPABILITY_UNAUTHORIZED;
      throw error;
    }
  }

  function isHealthy(node) {
    if (node.status === NODE_STATUS.UNHEALTHY) {
      return false;
    }

    return Date.now() - node.lastSeen <= staleMs;
  }

  function toSummary(node) {
    return {
      nodeId: node.nodeId,
      baseUrl: node.baseUrl,
      label: node.label,
      capabilities: [...node.capabilities],
      hardware: node.hardware,
      status: node.status,
      healthy: isHealthy(node),
      lastSeen: node.lastSeen,
      dispatchCount: node.dispatchCount,
      failureCount: node.failureCount
    };
  }

  return {
    register({ nodeId, baseUrl, label, capabilities, hardware, protocolVersion, overwrite }) {
      if (!nodeId || typeof nodeId !== "string" || !nodeId.trim()) {
        const error = new Error("nodeId is required for relay registration.");
        error.code = "RELAY_NODE_ID_REQUIRED";
        throw error;
      }

      if (!baseUrl || typeof baseUrl !== "string" || !baseUrl.trim()) {
        const error = new Error("baseUrl is required for relay registration.");
        error.code = "RELAY_BASE_URL_REQUIRED";
        throw error;
      }

      if (protocolVersion !== undefined && protocolVersion !== null && String(protocolVersion) !== PROTOCOL_VERSION) {
        const error = new Error(
          `Unsupported protocol version "${protocolVersion}". Supported version: "${PROTOCOL_VERSION}".`
        );
        error.code = RELAY_VALIDATION_CODES.RELAY_PROTOCOL_VERSION_UNSUPPORTED;
        throw error;
      }

      if (Array.isArray(capabilities)) {
        validateCapabilities(capabilities);
      }

      const existing = nodes.get(nodeId);

      if (existing && !overwrite) {
        const error = new Error(
          `A relay node with id "${nodeId}" is already registered. Pass overwrite: true to replace it.`
        );
        error.code = RELAY_VALIDATION_CODES.RELAY_NODE_DUPLICATE;
        throw error;
      }

      const record = existing
        ? { ...existing, baseUrl, label: label || existing.label, capabilities: Array.isArray(capabilities) ? capabilities.map(String) : existing.capabilities, hardware: hardware && typeof hardware === "object" ? hardware : existing.hardware, lastSeen: Date.now(), status: NODE_STATUS.HEALTHY }
        : createNodeRecord({ nodeId, baseUrl, label, capabilities, hardware });

      nodes.set(nodeId, record);

      return toSummary(record);
    },

    unregister(nodeId) {
      return nodes.delete(nodeId);
    },

    heartbeat(nodeId, { capabilities, hardware } = {}) {
      const node = nodes.get(nodeId);

      if (!node) {
        return null;
      }

      node.lastSeen = Date.now();
      node.status = NODE_STATUS.HEALTHY;

      if (Array.isArray(capabilities)) {
        node.capabilities = capabilities.map(String);
      }

      if (hardware && typeof hardware === "object") {
        node.hardware = hardware;
      }

      return toSummary(node);
    },

    markUnhealthy(nodeId) {
      const node = nodes.get(nodeId);

      if (!node) {
        return null;
      }

      node.status = NODE_STATUS.UNHEALTHY;
      node.failureCount += 1;

      return toSummary(node);
    },

    recordDispatch(nodeId, ok) {
      const node = nodes.get(nodeId);

      if (!node) {
        return;
      }

      node.dispatchCount += 1;

      if (!ok) {
        node.failureCount += 1;
      }
    },

    get(nodeId) {
      const node = nodes.get(nodeId);

      return node ? toSummary(node) : null;
    },

    list() {
      return Array.from(nodes.values()).map(toSummary);
    },

    listHealthy() {
      return this.list().filter((node) => node.healthy && node.status !== NODE_STATUS.UNHEALTHY);
    },

    getStats() {
      const all = this.list();

      return {
        total: all.length,
        healthy: all.filter((node) => node.healthy).length,
        unhealthy: all.filter((node) => !node.healthy).length,
        totalCapabilities: new Set(all.flatMap((node) => node.capabilities)).size
      };
    },

    selectForRole(role) {
      if (!role) {
        return null;
      }

      const candidates = this.listHealthy().filter((node) =>
        node.capabilities.includes(role) || node.capabilities.includes(`role:${role}`)
      );

      if (candidates.length === 0) {
        return null;
      }

      candidates.sort((a, b) => a.dispatchCount - b.dispatchCount);

      return candidates[0];
    },

    selectForCapability(capabilityId) {
      if (!capabilityId) {
        return null;
      }

      const candidates = this.listHealthy().filter((node) =>
        node.capabilities.includes(capabilityId)
      );

      if (candidates.length === 0) {
        return null;
      }

      candidates.sort((a, b) => b.dispatchCount - a.dispatchCount);

      return candidates[0];
    },

    seedFromConfig(seedNodes = []) {
      for (const seed of seedNodes) {
        if (seed && seed.nodeId && seed.baseUrl) {
          this.register(seed);
        }
      }
    },

    capabilityKey
  };
}

module.exports = {
  createRelayRegistry,
  HEALTH_STALE_MS
};
