const fs = require("node:fs");
const path = require("node:path");
const { loadTrack } = require("../pit-crew/decomposer");

const METADATA_PATH = path.join(__dirname, "registry", "track-metadata.json");

function loadTrackMetadataFile() {
  return JSON.parse(fs.readFileSync(METADATA_PATH, "utf8"));
}

function getWorkerTypeForStep(step) {
  if (step.executor.type === "model") {
    return {
      type: "model",
      role: step.executor.role || "default_worker"
    };
  }

  return {
    type: "tool",
    tool: step.executor.tool,
    task: step.executor.task
  };
}

function trackRequiresModel(track) {
  return track.steps.some((step) => step.executor.type === "model");
}

function inferPreferredWorkerType(track) {
  const modelStep = track.steps.find((step) => step.executor.type === "model");
  return modelStep ? (modelStep.executor.role || "default_worker") : "tool_only";
}

function buildTrackRegistryEntry(trackId) {
  const track = loadTrack(trackId);
  const metadataByTrack = loadTrackMetadataFile();
  const metadata = metadataByTrack[trackId] || {};

  return {
    track_id: track.track_id,
    name: track.name,
    version: track.version,
    purpose: metadata.purpose || track.description || "",
    input_type: metadata.input_type || "object",
    output_type: metadata.output_type || "object",
    requires_model: trackRequiresModel(track),
    preferred_worker_type: metadata.preferred_worker_type || inferPreferredWorkerType(track),
    fallback_behavior: metadata.fallback_behavior || "fail_when_runtime_unavailable",
    validation_expectations: metadata.validation_expectations || {
      output_schema: track.output_schema || null
    },
    step_count: track.steps.length,
    steps: track.steps.map((step) => ({
      step_id: step.id,
      worker_type: getWorkerTypeForStep(step)
    }))
  };
}

function listTrackRegistry() {
  const metadataByTrack = loadTrackMetadataFile();
  return Object.keys(metadataByTrack).map((trackId) => buildTrackRegistryEntry(trackId));
}

function getTrackRegistryEntry(trackId) {
  const metadataByTrack = loadTrackMetadataFile();

  if (!metadataByTrack[trackId]) {
    const error = new Error(`Track '${trackId}' is not registered for orchestration.`);
    error.code = "TRACK_REGISTRY_NOT_FOUND";
    error.nextStep = "Use GET /orchestration/tracks to list registered tracks.";
    throw error;
  }

  return buildTrackRegistryEntry(trackId);
}

module.exports = {
  getWorkerTypeForStep,
  listTrackRegistry,
  getTrackRegistryEntry
};
