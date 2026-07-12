const { ROUTING_POLICY, NODE_STATUS } = require("./protocol");
const { buildAuditEvent } = require("../core/audit-log");

function resolveStepRole(step) {
  if (!step || !step.executor) {
    return null;
  }

  return step.executor.role || step.executor.model_role || null;
}

function decideTarget({ step, localCapable, policy, registry }) {
  if (!step || step.executor.type !== "model") {
    return { target: "local", node: null };
  }

  if (policy === ROUTING_POLICY.LOCAL_ONLY) {
    return { target: "local", node: null };
  }

  const role = resolveStepRole(step);
  const node = role ? registry.selectForRole(role) : null;

  if (!node) {
    return { target: "local", node: null };
  }

  if (policy === ROUTING_POLICY.PREFER_RELAY) {
    return { target: "relay", node };
  }

  if (policy === ROUTING_POLICY.ROUTE_IF_UNAVAILABLE) {
    return localCapable ? { target: "local", node } : { target: "relay", node };
  }

  return { target: "local", node: null };
}

function minimizeContext(step, context) {
  if (context == null) {
    return { input: {}, artifacts: {} };
  }

  const inputMap = step && step.input_map;

  if (!inputMap || typeof inputMap !== "object" || typeof inputMap === "string") {
    return context;
  }

  const referencedStepIds = new Set();

  function walkValue(value) {
    if (typeof value === "string") {
      const match = value.match(/^\$artifacts\.([^.]+)/);
      if (match) {
        referencedStepIds.add(match[1]);
      }
    } else if (Array.isArray(value)) {
      for (const item of value) {
        walkValue(item);
      }
    }
  }

  for (const key of Object.keys(inputMap)) {
    walkValue(inputMap[key]);
  }

  const filteredArtifacts = {};
  const sourceArtifacts = context.artifacts || {};

  for (const stepId of referencedStepIds) {
    if (stepId in sourceArtifacts) {
      filteredArtifacts[stepId] = sourceArtifacts[stepId];
    }
  }

  return {
    input: context.input || {},
    artifacts: filteredArtifacts
  };
}

function createRelayRouter({ registry, connector, auditLog, options = {} }) {
  const defaultPolicy = options.policy || ROUTING_POLICY.ROUTE_IF_UNAVAILABLE;

  async function recordFallbackAudit({ step, node, error, identity, runId }) {
    if (!auditLog || typeof auditLog.record !== "function") {
      return;
    }

    try {
      await auditLog.record(buildAuditEvent({
        identity: identity || null,
        tool: { id: "relay-router" },
        responseBody: {
          tool: "relay-router",
          ok: false,
          code: "RELAY_FALLBACK",
          message: `Relay node '${node.nodeId}' failed for step '${step && step.id}'. Falling back to local execution.`,
          details: {
            nodeId: node.nodeId,
            nodeBaseUrl: node.baseUrl,
            stepId: step && step.id,
            errorCode: error.code || "RELAY_ERROR",
            errorMessage: error.message,
            runId: runId || null,
            warning: "Relay nodes are ephemeral; local fallback used. No state was lost."
          }
        },
        statusCode: 200
      }));
    } catch (auditError) {
      console.error("Failed to record relay fallback audit event:", auditError.message);
    }
  }

  async function executeStepWithFallback({
    step,
    context,
    runtime,
    options = {},
    toolRegistry,
    meta = {},
    localExecute
  }) {
    const policy = options.relay?.policy || defaultPolicy;
    const enabled = options.relay?.enabled !== false;

    if (!enabled || !connector) {
      return localExecute();
    }

    const localCapable = options.relay?.localCapable !== false;
    const decision = decideTarget({ step, localCapable, policy, registry });

    if (decision.target !== "relay" || !decision.node) {
      return localExecute();
    }

    const node = decision.node;

    try {
      const minimized = minimizeContext(step, context);
      const remote = await connector.executeRemoteStep({
        node,
        step,
        context: minimized,
        options,
        meta
      });

      if (!remote.ok) {
        const failure = new Error(remote.meta?.error?.message || "Relay node returned ok:false for step.");
        failure.code = remote.meta?.error?.code || "RELAY_STEP_FAILED";

        registry.recordDispatch(node.nodeId, false);
        registry.markUnhealthy(node.nodeId);

        await recordFallbackAudit({
          step,
          node,
          error: failure,
          identity: meta,
          runId: (meta && meta.run_id) || null
        });

        return localExecute();
      }

      registry.recordDispatch(node.nodeId, true);

      return {
        output: remote.output,
        meta: {
          ...(remote.meta || {}),
          nodeId: node.nodeId,
          relay: true,
          fallback: false
        }
      };
    } catch (error) {
      registry.recordDispatch(node.nodeId, false);
      registry.markUnhealthy(node.nodeId);

      await recordFallbackAudit({
        step,
        node,
        error,
        identity: meta,
        runId: (meta && meta.run_id) || null
      });

      return localExecute();
    }
  }

  async function executeStepWithAssignedNode({
    step,
    context,
    runtime,
    options = {},
    toolRegistry,
    meta = {},
    assignedNodeId,
    localExecute
  }) {
    const enabled = options.relay?.enabled !== false;

    if (!enabled || !connector || !assignedNodeId || step.executor.type !== "model") {
      return localExecute();
    }

    const node = registry.get(assignedNodeId);

    if (!node || !node.healthy || node.status === NODE_STATUS.UNHEALTHY) {
      return localExecute();
    }

    try {
      const minimized = minimizeContext(step, context);
      const remote = await connector.executeRemoteStep({
        node,
        step,
        context: minimized,
        options,
        meta
      });

      if (!remote.ok) {
        const failure = new Error(remote.meta?.error?.message || "Relay node returned ok:false for step.");
        failure.code = remote.meta?.error?.code || "RELAY_STEP_FAILED";

        registry.recordDispatch(node.nodeId, false);
        registry.markUnhealthy(node.nodeId);

        await recordFallbackAudit({
          step,
          node,
          error: failure,
          identity: meta,
          runId: (meta && meta.run_id) || null
        });

        return localExecute();
      }

      registry.recordDispatch(node.nodeId, true);

      return {
        output: remote.output,
        meta: {
          ...(remote.meta || {}),
          nodeId: node.nodeId,
          relay: true,
          fallback: false
        }
      };
    } catch (error) {
      registry.recordDispatch(node.nodeId, false);
      registry.markUnhealthy(node.nodeId);

      await recordFallbackAudit({
        step,
        node,
        error,
        identity: meta,
        runId: (meta && meta.run_id) || null
      });

      return localExecute();
    }
  }

  return {
    decideTarget,
    executeStepWithFallback,
    executeStepWithAssignedNode,
    defaultPolicy
  };
}

function executeStepViaRelayIfNeeded({
  step,
  context,
  runtime,
  options = {},
  toolRegistry,
  meta = {},
  localExecute,
  stepId
}) {
  const relay = options && options.relay;

  if (relay && relay.enabled !== false && relay.router && step.executor.type === "model") {
    const id = stepId || step.id;
    const assignment = relay.assignments && relay.assignments[id];

    if (assignment && assignment.nodeId) {
      return relay.router.executeStepWithAssignedNode({
        step,
        context,
        runtime,
        options,
        toolRegistry,
        meta,
        assignedNodeId: assignment.nodeId,
        localExecute
      });
    }

    return relay.router.executeStepWithFallback({
      step,
      context,
      runtime,
      options,
      toolRegistry,
      meta,
      localExecute
    });
  }

  return localExecute();
}

module.exports = {
  createRelayRouter,
  decideTarget,
  resolveStepRole,
  executeStepViaRelayIfNeeded,
  minimizeContext,
  ROUTING_POLICY,
  NODE_STATUS
};
