const { createDevelopmentEventStore } = require("../events/event-store");
const { createDevelopmentCandidateReviewInbox } = require("../events/candidate-review-inbox");
const { createDevelopmentMaintainerManager } = require("../events/maintainer-manager");
const { createDevelopmentMemoryRetrieval } = require("../retrieval/index");
const { getLegacyMemoryPaths } = require("./project-paths");

function createDevelopmentMemoryServices(projectRegistry, options = {}) {
  function resolvePaths(slug = null) {
    if (!projectRegistry) {
      return getLegacyMemoryPaths(options.repoRoot);
    }
    return projectRegistry.resolveMemoryPaths(slug);
  }

  function forProject(slug = null) {
    const paths = resolvePaths(slug);
    const sharedOptions = {
      eventsDir: paths.eventsDir,
      candidatesRoot: paths.candidatesRoot,
      maintainerRoot: paths.maintainerRoot,
      getVaultAdapter: options.getVaultAdapter
    };

    return {
      paths,
      slug: paths.slug || slug || null,
      eventStore: createDevelopmentEventStore({ dataDir: paths.eventsDir }),
      reviewInbox: createDevelopmentCandidateReviewInbox(sharedOptions),
      maintainerManager: createDevelopmentMaintainerManager(sharedOptions),
      retrieval: createDevelopmentMemoryRetrieval({
        candidatesRoot: paths.candidatesRoot,
        maintainerRoot: paths.maintainerRoot
      })
    };
  }

  function forActiveProject() {
    if (!projectRegistry) {
      return forProject(null);
    }

    const active = projectRegistry.getActiveProject();
    return forProject(active ? active.slug : null);
  }

  return {
    resolvePaths,
    forProject,
    forActiveProject
  };
}

module.exports = {
  createDevelopmentMemoryServices
};
