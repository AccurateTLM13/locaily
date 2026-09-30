const fs = require("node:fs");
const path = require("node:path");
const { validateResult } = require("../core/result-validator");

const CAPABILITIES_PATH = path.join(__dirname, "registry", "capabilities.json");
const capabilityContractSchema = require("../schemas/internal/capability-contract.schema.json");

function loadCapabilityRegistryFile() {
  return JSON.parse(fs.readFileSync(CAPABILITIES_PATH, "utf8"));
}

function validateCapabilityContracts(registry) {
  const errors = [];

  for (const contract of registry.capabilities) {
    const validation = validateResult(contract, capabilityContractSchema, `capability:${contract.capability_id}`);

    if (!validation.ok) {
      errors.push(...validation.errors);
    }
  }

  return { ok: errors.length === 0, errors };
}

function listCapabilities() {
  const registry = loadCapabilityRegistryFile();
  const validation = validateCapabilityContracts(registry);

  if (!validation.ok) {
    const error = new Error("Capability registry did not match capability-contract.schema.json.");
    error.code = "CAPABILITY_REGISTRY_INVALID";
    error.nextStep = "Fix companion/orchestration/registry/capabilities.json.";
    error.validation = validation;
    throw error;
  }

  return registry.capabilities.map((contract) => ({
    capability_id: contract.capability_id,
    purpose: contract.purpose,
    status: contract.status,
    providers: contract.providers,
    required_tools: contract.required_tools,
    model_roles: contract.model_roles
  }));
}

function getCapability(capabilityId) {
  if (!capabilityId || typeof capabilityId !== "string") {
    const error = new Error("Capability id is required.");
    error.code = "INVALID_CAPABILITY";
    error.nextStep = "Use GET /orchestration/capabilities to list capability ids.";
    throw error;
  }

  const registry = loadCapabilityRegistryFile();
  const contract = registry.capabilities.find((entry) => entry.capability_id === capabilityId.trim());

  if (!contract) {
    const error = new Error(`Capability '${capabilityId}' was not found.`);
    error.code = "CAPABILITY_NOT_FOUND";
    error.nextStep = "Use GET /orchestration/capabilities to list available capability ids.";
    throw error;
  }

  return contract;
}

function getGenericProviderTracks(capabilityId) {
  const contract = getCapability(capabilityId);
  return contract.providers
    .filter((provider) => provider.kind === "track" && provider.scope === "generic")
    .map((provider) => provider.id);
}

module.exports = {
  listCapabilities,
  getCapability,
  getGenericProviderTracks,
  validateCapabilityContracts
};
