const fs = require("node:fs");
const path = require("node:path");
const { assertContract } = require("./contracts");
const { hashCanonical } = require("./canonical");

const ELIGIBLE_STATUSES = new Set(["tested", "reviewed", "promoted", "active"]);

function createCapabilityRegistry(options = {}) {
  const rootDir = options.rootDir;

  if (!rootDir || typeof rootDir !== "string") {
    const error = new Error("Capability registry requires rootDir.");
    error.code = "CAPABILITY_REGISTRY_PATH_REQUIRED";
    throw error;
  }

  const entries = loadEntries(rootDir);
  const byKey = new Map();

  for (const entry of entries) {
    const key = capabilityKey(entry.manifest.capability_id, entry.manifest.version);

    if (byKey.has(key)) {
      const error = new Error(`Duplicate capability '${key}' is installed.`);
      error.code = "DUPLICATE_CAPABILITY";
      throw error;
    }

    byKey.set(key, entry);
  }

  function list() {
    return entries.map(cloneEntry);
  }

  function listById(capabilityId) {
    return entries
      .filter((entry) => entry.manifest.capability_id === capabilityId)
      .sort(compareEntries)
      .map(cloneEntry);
  }

  function get(capabilityId, version) {
    const entry = byKey.get(capabilityKey(capabilityId, version));
    return entry ? cloneEntry(entry) : null;
  }

  function match(event) {
    return entries
      .filter((entry) => ELIGIBLE_STATUSES.has(entry.manifest.status))
      .filter((entry) => manifestMatchesEvent(entry.manifest, event))
      .sort(compareEntries)
      .map(cloneEntry);
  }

  return {
    rootDir,
    list,
    listById,
    get,
    match
  };
}

function loadEntries(rootDir) {
  if (!fs.existsSync(rootDir)) {
    return [];
  }

  const entries = [];

  for (const directory of fs.readdirSync(rootDir, { withFileTypes: true })) {
    if (!directory.isDirectory()) {
      continue;
    }

    const manifestPath = path.join(rootDir, directory.name, "capability.json");

    if (!fs.existsSync(manifestPath)) {
      continue;
    }

    let manifest;

    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    } catch (error) {
      const parseError = new Error(`Capability manifest '${manifestPath}' is not valid JSON.`);
      parseError.code = "CAPABILITY_MANIFEST_PARSE_INVALID";
      parseError.cause = error;
      throw parseError;
    }

    assertContract(
      manifest,
      "capability-manifest.v1",
      "CAPABILITY_MANIFEST_INVALID",
      `capability:${directory.name}`
    );

    entries.push({
      manifest,
      manifestHash: hashCanonical(manifest),
      manifestPath
    });
  }

  return entries.sort(compareEntries);
}

function manifestMatchesEvent(manifest, event) {
  return manifest.triggers.some((trigger) => {
    if (trigger.event_type !== event.event_type) {
      return false;
    }

    return Object.entries(trigger.conditions || {}).every(([selector, expected]) =>
      valuesEqual(readPath(event, selector), expected)
    );
  });
}

function readPath(value, selector) {
  return String(selector)
    .split(".")
    .reduce((current, part) => (
      current && typeof current === "object" ? current[part] : undefined
    ), value);
}

function valuesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function capabilityKey(capabilityId, version) {
  return `${capabilityId}@${version}`;
}

function compareEntries(left, right) {
  return capabilityKey(left.manifest.capability_id, left.manifest.version)
    .localeCompare(capabilityKey(right.manifest.capability_id, right.manifest.version));
}

function cloneEntry(entry) {
  return {
    manifest: JSON.parse(JSON.stringify(entry.manifest)),
    manifestHash: entry.manifestHash,
    manifestPath: entry.manifestPath
  };
}

module.exports = {
  ELIGIBLE_STATUSES,
  createCapabilityRegistry,
  manifestMatchesEvent,
  readPath,
  capabilityKey
};
