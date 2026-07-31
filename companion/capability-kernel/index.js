const path = require("node:path");
const fs = require("node:fs");
const { createCapabilityRegistry } = require("./capability-registry");
const { createHandlerRegistry } = require("./handlers");
const { createProvenanceStore } = require("./provenance-store");
const { createCapabilityKernel } = require("./kernel");
const { buildExecutionPlan } = require("./planner");
const { validateContract } = require("./contracts");

const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const DEFAULT_CAPABILITIES_DIR = path.join(PROJECT_ROOT, "companion", "capabilities");
const DEFAULT_NODE_CONFIG_PATH = path.join(__dirname, "config", "local-node.json");
const DEFAULT_STORE_DIR = path.join(PROJECT_ROOT, "data", "evidence", "capability-kernel");

function createDefaultCapabilityKernel(options = {}) {
  const nodeConfig = options.nodeConfig || JSON.parse(
    fs.readFileSync(options.nodeConfigPath || DEFAULT_NODE_CONFIG_PATH, "utf8")
  );
  const registry = options.registry || createCapabilityRegistry({
    rootDir: options.capabilitiesDir || DEFAULT_CAPABILITIES_DIR
  });
  const handlerRegistry = options.handlerRegistry || createHandlerRegistry({
    toolRegistry: options.toolRegistry,
    rules: options.rules,
    scripts: options.scripts
  });
  const store = options.store || createProvenanceStore({
    rootDir: options.storeDir || DEFAULT_STORE_DIR
  });

  return createCapabilityKernel({
    registry,
    handlerRegistry,
    store,
    nodeConfig,
    clock: options.clock
  });
}

module.exports = {
  PROJECT_ROOT,
  DEFAULT_CAPABILITIES_DIR,
  DEFAULT_NODE_CONFIG_PATH,
  DEFAULT_STORE_DIR,
  createDefaultCapabilityKernel,
  createCapabilityKernel,
  createCapabilityRegistry,
  createHandlerRegistry,
  createProvenanceStore,
  buildExecutionPlan,
  validateContract
};
