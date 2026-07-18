const path = require("node:path");
const { normalizeProjectSlug } = require("../retrieval/canonical-pages");

const DEFAULT_ALLOWED_PATHS = [
  "index.md",
  "log.md",
  "SCHEMA.md",
  "projects/",
  "topics/",
  "wiki/projects/",
  "wiki/topics/",
  "wiki/concepts/",
  "wiki/entities/"
];

const DEFAULT_BLOCKED_PATHS = [
  "raw/",
  "private/",
  "personal/",
  ".git/",
  ".memory-bridge/writeback-inbox/"
];

function getRepoRoot(options = {}) {
  return options.repoRoot || path.join(__dirname, "..", "..", "..");
}

function getLegacyMemoryPaths(repoRoot = getRepoRoot()) {
  return {
    storageLayout: "legacy",
    eventsDir: path.join(repoRoot, "data", "memory", "development-events"),
    sessionsRoot: path.join(repoRoot, "data", "memory", "development-sessions"),
    candidatesRoot: path.join(repoRoot, "data", "memory", "development-candidates"),
    maintainerRoot: path.join(repoRoot, "data", "memory", "development-maintainer"),
    processorRoot: path.join(repoRoot, "data", "memory", "development-capture"),
    projectsRoot: path.join(repoRoot, "data", "memory", "projects")
  };
}

function getNamespacedMemoryPaths(repoRoot, slug) {
  const base = path.join(repoRoot, "data", "memory", "projects", slug);
  return {
    storageLayout: "namespaced",
    eventsDir: path.join(base, "development-events"),
    sessionsRoot: path.join(base, "development-sessions"),
    candidatesRoot: path.join(base, "development-candidates"),
    maintainerRoot: path.join(base, "development-maintainer"),
    processorRoot: path.join(base, "development-capture"),
    projectsRoot: path.join(repoRoot, "data", "memory", "projects")
  };
}

function resolveProjectMemoryPaths(project, repoRoot = getRepoRoot()) {
  const slug = normalizeProjectSlug(project && project.slug ? project.slug : project);

  if (!slug) {
    return getLegacyMemoryPaths(repoRoot);
  }

  if (project && project.storageLayout === "legacy") {
    return {
      ...getLegacyMemoryPaths(repoRoot),
      slug
    };
  }

  return {
    ...getNamespacedMemoryPaths(repoRoot, slug),
    slug
  };
}

module.exports = {
  DEFAULT_ALLOWED_PATHS,
  DEFAULT_BLOCKED_PATHS,
  getRepoRoot,
  getLegacyMemoryPaths,
  getNamespacedMemoryPaths,
  resolveProjectMemoryPaths,
  normalizeProjectSlug
};
