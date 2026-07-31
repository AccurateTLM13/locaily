const { computeDependencyGraph } = require("../core/dag-graph");
const { assertContract, hasSchema } = require("./contracts");
const { hashCanonical } = require("./canonical");

function buildExecutionPlan({
  runId,
  event,
  eventHash,
  capability,
  nodeConfig,
  handlerRegistry
}) {
  const manifest = capability.manifest;
  const graphTrack = {
    steps: manifest.tracks.map((track) => ({
      id: track.track_id,
      depends_on: track.depends_on || []
    }))
  };
  const graph = computeDependencyGraph(graphTrack);

  if (!graph.valid || graph.sorted.length !== manifest.tracks.length) {
    const error = new Error("Capability track graph is invalid.");
    error.code = "CAPABILITY_GRAPH_INVALID";
    error.details = {
      cycles: graph.cycles,
      missing: graph.missing
    };
    throw error;
  }

  const byId = new Map(manifest.tracks.map((track) => [track.track_id, track]));
  const steps = graph.sorted.map((trackId, index) => {
    const track = byId.get(trackId);

    if (!hasSchema(track.input_schema) || !hasSchema(track.output_schema)) {
      const error = new Error(`Capability track '${trackId}' references an unavailable schema.`);
      error.code = "SCHEMA_UNAVAILABLE";
      error.trackId = trackId;
      throw error;
    }

    if (!handlerRegistry.has(track.handler_type, track.handler_id)) {
      const error = new Error(
        `Handler '${track.handler_type}:${track.handler_id}' is unavailable on node '${nodeConfig.node_id}'.`
      );
      error.code = "HANDLER_UNAVAILABLE";
      error.trackId = trackId;
      throw error;
    }

    return {
      sequence: index + 1,
      track_id: track.track_id,
      handler_type: track.handler_type,
      handler_id: track.handler_id,
      depends_on: track.depends_on || [],
      input_schema: track.input_schema,
      output_schema: track.output_schema,
      timeout_ms: track.timeout_ms || 1000,
      retry: {
        max_attempts: track.retry.max_attempts,
        retryable_codes: track.retry.retryable_codes || []
      }
    };
  });

  const plan = {
    schema_version: "1.0",
    run_id: runId,
    node_id: nodeConfig.node_id,
    event_id: event.event_id,
    event_hash: eventHash,
    capability_id: manifest.capability_id,
    capability_version: manifest.version,
    manifest_hash: capability.manifestHash,
    node_config_hash: hashCanonical(nodeConfig),
    policy_hash: hashCanonical(nodeConfig.policy),
    steps,
    plan_hash: ""
  };
  const hashInput = {
    ...plan,
    run_id: undefined,
    plan_hash: undefined
  };
  plan.plan_hash = hashCanonical(hashInput);

  assertContract(plan, "execution-plan.v1", "EXECUTION_PLAN_INVALID", "execution-plan");
  return plan;
}

module.exports = {
  buildExecutionPlan
};
