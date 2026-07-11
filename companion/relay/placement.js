const { ROUTING_POLICY, NODE_STATUS } = require("./protocol");

const LOCAL_NODE_ID = "local";
const PLACEMENT_POLICIES = new Set([
  ROUTING_POLICY.LOCAL_ONLY,
  "local_first",
  "distribute"
]);

function pickLeastLoaded(candidates, load) {
  let best = candidates[0];
  let bestLoad = load.get(best.nodeId) || 0;

  for (let i = 1; i < candidates.length; i += 1) {
    const current = candidates[i];
    const currentLoad = load.get(current.nodeId) || 0;

    if (currentLoad < bestLoad) {
      best = current;
      bestLoad = currentLoad;
    }
  }

  return best;
}

function normalizeRole(capability) {
  return capability.indexOf("role:") === 0 ? capability.slice(5) : capability;
}

function createPlacementPlanner({ registry, localNodeId = LOCAL_NODE_ID }) {
  function plan({ steps, policy = ROUTING_POLICY.ROUTE_IF_UNAVAILABLE, localCapableRoles = null }) {
    const strategy = policy;
    const healthy = registry.listHealthy();
    const byRole = new Map();

    for (const node of healthy) {
      for (const capability of node.capabilities) {
        const role = normalizeRole(capability);

        if (!byRole.has(role)) {
          byRole.set(role, []);
        }

        const bucket = byRole.get(role);
        if (!bucket.some((entry) => entry.nodeId === node.nodeId)) {
          bucket.push(node);
        }
      }
    }

    const load = new Map();
    const assignments = {};

    const isLocalCapable = (role) => {
      if (localCapableRoles === null || localCapableRoles === undefined) {
        return true;
      }

      if (localCapableRoles instanceof Set) {
        return localCapableRoles.has(role);
      }

      return Array.isArray(localCapableRoles) && localCapableRoles.includes(role);
    };

    for (const step of steps) {
      const stepId = step.stepId || step.id;
      const role = step.role || (step.executor && step.executor.role) || null;
      const isModel = step.executorType === "model" ||
        (step.executor && step.executor.type === "model");

      if (!isModel || !role) {
        assignments[stepId] = { target: "local", nodeId: null, role };
        continue;
      }

      if (policy === ROUTING_POLICY.LOCAL_ONLY || policy === "local_only") {
        assignments[stepId] = { target: "local", nodeId: null, role };
        continue;
      }

      if (!PLACEMENT_POLICIES.has(policy)) {
        assignments[stepId] = { target: "auto", nodeId: null, role };
        continue;
      }

      const candidates = byRole.get(role) || [];
      let chosen = null;

      if (policy === "local_first" && isLocalCapable(role)) {
        assignments[stepId] = { target: "local", nodeId: null, role };
        continue;
      }

      if (candidates.length > 0) {
        chosen = pickLeastLoaded(candidates, load);
      }

      if (chosen) {
        assignments[stepId] = { target: "relay", nodeId: chosen.nodeId, role };
        load.set(chosen.nodeId, (load.get(chosen.nodeId) || 0) + 1);
      } else {
        assignments[stepId] = { target: "local", nodeId: null, role };
      }
    }

    return { strategy, assignments, summary: summarize({ strategy, assignments, localNodeId }), localNodeId };
  }

  function summarize(planResult) {
    if (!planResult || !planResult.assignments) {
      return null;
    }

    const counts = { local: 0, relay: 0, auto: 0 };
    const byNode = {};

    for (const assignment of Object.values(planResult.assignments)) {
      counts[assignment.target] = (counts[assignment.target] || 0) + 1;

      if (assignment.target === "relay" && assignment.nodeId) {
        byNode[assignment.nodeId] = (byNode[assignment.nodeId] || 0) + 1;
      }
    }

    return {
      strategy: planResult.strategy,
      totalSteps: Object.keys(planResult.assignments).length,
      counts,
      byNode
    };
  }

  return { plan, summarize };
}

function buildPlacementFromTrack({ registry, track, policy, localCapableRoles = null }) {
  if (!track || !Array.isArray(track.steps)) {
    return { strategy: policy, assignments: {}, localNodeId: LOCAL_NODE_ID };
  }

  const planner = createPlacementPlanner({ registry, localNodeId: LOCAL_NODE_ID });
  const steps = track.steps.map((step) => ({
    stepId: step.id,
    role: step.executor && step.executor.role,
    executorType: step.executor && step.executor.type
  }));

  const plan = planner.plan({ steps, policy, localCapableRoles });
  plan.summary = planner.summarize(plan);

  return plan;
}

module.exports = {
  createPlacementPlanner,
  buildPlacementFromTrack,
  LOCAL_NODE_ID,
  PLACEMENT_POLICIES,
  NODE_STATUS
};
