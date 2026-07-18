const { createDevelopmentProjectRegistry } = require("./project-registry");
const { generateStarterVault, buildCapturePolicy } = require("./vault-generator");
const { validateImportVault } = require("./vault-import");
const { buildProjectHealthReport, buildAllProjectsHealthReport } = require("./project-health");
const { runProjectSetupStep } = require("./project-setup");
const {
  DEFAULT_ALLOWED_PATHS,
  DEFAULT_BLOCKED_PATHS,
  getRepoRoot,
  getLegacyMemoryPaths,
  getNamespacedMemoryPaths,
  resolveProjectMemoryPaths,
  normalizeProjectSlug
} = require("./project-paths");

module.exports = {
  createDevelopmentProjectRegistry,
  generateStarterVault,
  buildCapturePolicy,
  validateImportVault,
  buildProjectHealthReport,
  buildAllProjectsHealthReport,
  runProjectSetupStep,
  DEFAULT_ALLOWED_PATHS,
  DEFAULT_BLOCKED_PATHS,
  getRepoRoot,
  getLegacyMemoryPaths,
  getNamespacedMemoryPaths,
  resolveProjectMemoryPaths,
  normalizeProjectSlug
};
