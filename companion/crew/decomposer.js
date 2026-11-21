const fs = require("node:fs");
const path = require("node:path");
const { validateResult } = require("../core/result-validator");
const { getDefaultWorkflowPackRegistry } = require("../packs");

const TRACKS_DIR = path.join(__dirname, "tracks");
const taskTrackSchema = require("../schemas/internal/task-track.schema.json");

function listTracks() {
  const tracks = [];
  const seen = new Set();

  if (fs.existsSync(TRACKS_DIR)) {
    for (const file of fs.readdirSync(TRACKS_DIR).filter((f) => f.endsWith(".track.json"))) {
      const track = loadTrackFile(path.join(TRACKS_DIR, file));
      seen.add(track.track_id);
      tracks.push({
        track_id: track.track_id,
        version: track.version,
        name: track.name,
        description: track.description,
        steps: Array.isArray(track.steps) ? track.steps.map((step) => step.id) : []
      });
    }
  }

  for (const packTrack of getDefaultWorkflowPackRegistry().listPackTracks()) {
    if (!seen.has(packTrack.track_id)) {
      seen.add(packTrack.track_id);
      tracks.push(packTrack);
    }
  }

  return tracks;
}

function loadTrack(trackId) {
  if (!trackId || typeof trackId !== "string") {
    throw trackError("INVALID_TRACK", "Track id is required.", "Send track_id in the request body.");
  }

  const normalized = trackId.trim();
  const directPath = path.join(TRACKS_DIR, `${normalized}.track.json`);

  if (fs.existsSync(directPath)) {
    return loadTrackFile(directPath);
  }

  if (fs.existsSync(TRACKS_DIR)) {
    const entries = fs.readdirSync(TRACKS_DIR).filter((file) => file.endsWith(".track.json"));

    for (const file of entries) {
      const track = loadTrackFile(path.join(TRACKS_DIR, file));
      if (track.track_id === normalized) {
        return track;
      }
    }
  }

  const packTrack = getDefaultWorkflowPackRegistry().getPackTrack(normalized);
  if (packTrack) {
    return packTrack;
  }

  throw trackError(
    "TRACK_NOT_FOUND",
    `Track '${normalized}' was not found.`,
    "Use GET /tracks to list available track ids."
  );
}

function validateLoadedTrackFile(track, filePath) {
  const validation = validateResult(track, taskTrackSchema, "track");

  if (validation.ok) {
    return validation;
  }

  const trackName = path.basename(filePath);
  const error = new Error(`Track file '${trackName}' did not match task-track.schema.json.`);
  error.code = "TASK_TRACK_INVALID";
  error.trackPath = filePath;
  error.trackName = trackName;
  error.nextStep = "Fix the track JSON file or update companion/schemas/internal/task-track.schema.json.";
  error.validation = validation;
  throw error;
}

function loadTrackFile(filePath) {
  let track;

  try {
    track = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    throw trackError(
      "TRACK_CONFIG_INVALID",
      `Failed to parse track config '${path.basename(filePath)}': ${err.message}`,
      "Fix the track JSON file."
    );
  }

  validateLoadedTrackFile(track, filePath);

  return track;
}

function trackError(code, message, nextStep) {
  const error = new Error(message);
  error.code = code;
  error.nextStep = nextStep;
  return error;
}

module.exports = {
  listTracks,
  loadTrack,
  validateLoadedTrackFile
};
