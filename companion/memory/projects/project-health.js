const path = require("node:path");
const fs = require("node:fs");
const { createDevelopmentCaptureProcessor } = require("../events/capture/capture-processor");
const { createDevelopmentEventStore } = require("../events/event-store");
const { createDevelopmentCandidateStore } = require("../events/candidate-store");
const { createDevelopmentCandidateReviewStore } = require("../events/candidate-review-store");
const { createDevelopmentSessionStore } = require("../events/session-store");
const { validateImportVault } = require("./vault-import");

async function buildProjectHealthReport(projectRegistry, projectSlug = null) {
  const slug = projectSlug || projectRegistry.getActiveProjectSlug();
  const project = projectRegistry.getProject(slug);

  if (!project) {
    return {
      ok: false,
      error: {
        code: "PROJECT_NOT_FOUND",
        message: `Project '${slug}' is not registered.`,
        nextStep: "Register the project first."
      },
      warnings: []
    };
  }

  const paths = projectRegistry.resolveMemoryPaths(slug);
  const warnings = [];

  const eventStore = createDevelopmentEventStore({ dataDir: paths.eventsDir });
  const sessionStore = createDevelopmentSessionStore({ rootDir: paths.sessionsRoot });
  const candidateStore = createDevelopmentCandidateStore({ rootDir: paths.candidatesRoot });
  const reviewStore = createDevelopmentCandidateReviewStore({ rootDir: paths.candidatesRoot });

  const processor = createDevelopmentCaptureProcessor({
    project: slug,
    eventsDir: paths.eventsDir,
    sessionsRoot: paths.sessionsRoot,
    candidatesRoot: paths.candidatesRoot,
    maintainerRoot: paths.maintainerRoot,
    processorRoot: paths.processorRoot,
    vaultPath: project.vaultPath,
    policyPath: project.capturePolicyPath || path.join(paths.processorRoot, "capture-policy.json")
  });

  const captureStatus = await processor.getStatus();
  const events = await eventStore.queryEvents({ project: slug, limit: 1 });
  const candidates = candidateStore.listCandidates({ project: slug });
  const openSessions = sessionStore.listManifests()
    .map((file) => sessionStore.readManifest(file.replace(/\.json$/, "")))
    .filter((manifest) => manifest && manifest.status === "open");

  let pendingHumanReview = 0;
  for (const candidate of candidates) {
    const review = reviewStore.readReview(candidate.candidateId);
    if (!review || review.status === "pending" || review.status === "deferred") {
      pendingHumanReview += 1;
    }
  }

  let vaultHealth = null;
  if (project.vaultPath) {
    vaultHealth = validateImportVault({
      vaultPath: project.vaultPath,
      slug,
      allowedPaths: project.allowedPaths,
      blockedPaths: project.blockedPaths || []
    });
    if (vaultHealth.warnings.length > 0) {
      warnings.push(...vaultHealth.warnings);
    }
  } else {
    warnings.push("Vault path is not configured for this project.");
  }

  if (project.storageLayout === "namespaced" && slug !== projectRegistry.getActiveProjectSlug()) {
    warnings.push("Health report generated for inactive project; active project isolation preserved.");
  }

  return {
    ok: true,
    result: {
      slug,
      displayName: project.displayName,
      active: projectRegistry.getActiveProjectSlug() === slug,
      storageLayout: project.storageLayout,
      repositoryIdentity: project.repositoryIdentity,
      vaultPath: project.vaultPath,
      captureEnabled: project.captureEnabled,
      memoryPaths: {
        eventsDir: paths.eventsDir,
        sessionsRoot: paths.sessionsRoot,
        candidatesRoot: paths.candidatesRoot,
        processorRoot: paths.processorRoot
      },
      capture: captureStatus.result,
      eventCountHint: events.result.count,
      candidateCount: candidates.length,
      openSessions: openSessions.length,
      pendingHumanReview,
      vault: vaultHealth && vaultHealth.ok ? vaultHealth.result : null,
      warnings: [...new Set([...(captureStatus.result.warnings || []), ...warnings])]
    },
    warnings
  };
}

async function buildAllProjectsHealthReport(projectRegistry) {
  const projects = projectRegistry.listProjects();
  const reports = [];

  for (const project of projects) {
    const report = await buildProjectHealthReport(projectRegistry, project.slug);
    reports.push(report.ok ? report.result : { slug: project.slug, error: report.error });
  }

  return {
    ok: true,
    result: {
      activeProjectSlug: projectRegistry.getActiveProjectSlug(),
      projectCount: projects.length,
      projects: reports
    },
    warnings: []
  };
}

module.exports = {
  buildProjectHealthReport,
  buildAllProjectsHealthReport
};
