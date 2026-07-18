const fs = require("node:fs");
const path = require("node:path");
const { validateResult } = require("../../core/result-validator");
const { getRepositoryIdentity } = require("../events/capture/git-metadata");
const projectSchema = require("../../schemas/development-memory-project.schema.json");
const registrySchema = require("../../schemas/development-memory-project-registry.schema.json");
const {
  DEFAULT_ALLOWED_PATHS,
  DEFAULT_BLOCKED_PATHS,
  getRepoRoot,
  getLegacyMemoryPaths,
  getNamespacedMemoryPaths,
  resolveProjectMemoryPaths,
  normalizeProjectSlug
} = require("./project-paths");

function createDevelopmentProjectRegistry(options = {}) {
  const repoRoot = options.repoRoot || getRepoRoot();
  const registryRoot = options.registryRoot || path.join(repoRoot, "data", "memory", "projects");
  const registryPath = path.join(registryRoot, "registry.json");

  function ensureDir() {
    fs.mkdirSync(registryRoot, { recursive: true });
  }

  function validateProject(project, label = "project") {
    const validation = validateResult(project, projectSchema, label);
    if (!validation.ok) {
      return {
        ok: false,
        error: {
          code: "PROJECT_SCHEMA_INVALID",
          message: validation.errors.join("; "),
          nextStep: "Fix the project record to match development-memory-project.schema.json."
        }
      };
    }
    return { ok: true };
  }

  function validateRegistry(registry, label = "registry") {
    const validation = validateResult(registry, registrySchema, label);
    if (!validation.ok) {
      return {
        ok: false,
        error: {
          code: "PROJECT_REGISTRY_INVALID",
          message: validation.errors.join("; "),
          nextStep: "Fix the registry to match development-memory-project-registry.schema.json."
        }
      };
    }
    return { ok: true };
  }

  function buildDefaultLocailyProject() {
    const now = new Date().toISOString();
    const identity = getRepositoryIdentity(repoRoot);

    return {
      slug: "locaily",
      displayName: "Locaily",
      workspaceRoot: repoRoot,
      repositoryIdentity: identity,
      vaultPath: null,
      storageLayout: "legacy",
      captureEnabled: process.env.DEVELOPMENT_MEMORY_CAPTURE !== "0",
      allowedPaths: [...DEFAULT_ALLOWED_PATHS],
      blockedPaths: [...DEFAULT_BLOCKED_PATHS],
      capturePolicyPath: path.join(repoRoot, "data", "memory", "development-capture", "capture-policy.json"),
      createdAt: now,
      updatedAt: now
    };
  }

  function readRegistry() {
    ensureDir();

    if (!fs.existsSync(registryPath)) {
      const bootstrap = {
        schemaVersion: "1.0",
        activeProjectSlug: "locaily",
        projects: {
          locaily: buildDefaultLocailyProject()
        },
        updatedAt: new Date().toISOString()
      };
      writeRegistry(bootstrap);
      return bootstrap;
    }

    return JSON.parse(fs.readFileSync(registryPath, "utf8"));
  }

  function writeRegistry(registry) {
    ensureDir();
    const validation = validateRegistry(registry);
    if (!validation.ok) {
      throw new Error(validation.error.message);
    }

    const tempPath = `${registryPath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tempPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
    fs.renameSync(tempPath, registryPath);
    return registry;
  }

  function listProjects() {
    const registry = readRegistry();
    return Object.values(registry.projects).sort((left, right) => left.slug.localeCompare(right.slug));
  }

  function getProject(slug) {
    const normalized = normalizeProjectSlug(slug);
    const registry = readRegistry();
    return registry.projects[normalized] || null;
  }

  function getActiveProjectSlug() {
    const registry = readRegistry();
    return registry.activeProjectSlug;
  }

  function getActiveProject() {
    return getProject(getActiveProjectSlug());
  }

  function setActiveProject(slug) {
    const normalized = normalizeProjectSlug(slug);
    const registry = readRegistry();

    if (!registry.projects[normalized]) {
      return {
        ok: false,
        error: {
          code: "PROJECT_NOT_FOUND",
          message: `Project '${normalized}' is not registered.`,
          nextStep: "Register the project first with POST /memory/projects/register."
        },
        warnings: []
      };
    }

    registry.activeProjectSlug = normalized;
    registry.updatedAt = new Date().toISOString();
    writeRegistry(registry);

    return {
      ok: true,
      result: registry.projects[normalized],
      warnings: []
    };
  }

  function ensureProjectStorage(project) {
    const paths = resolveProjectMemoryPaths(project, repoRoot);
    fs.mkdirSync(paths.eventsDir, { recursive: true });
    fs.mkdirSync(paths.sessionsRoot, { recursive: true });
    fs.mkdirSync(path.join(paths.candidatesRoot, "candidates"), { recursive: true });
    fs.mkdirSync(path.join(paths.candidatesRoot, "reviews"), { recursive: true });
    fs.mkdirSync(path.join(paths.maintainerRoot, "runs"), { recursive: true });
    fs.mkdirSync(paths.processorRoot, { recursive: true });
    return paths;
  }

  function registerProject(input = {}) {
    const slug = normalizeProjectSlug(input.slug || input.displayName);
    const displayName = String(input.displayName || slug).trim();
    const workspaceRoot = path.resolve(input.workspaceRoot || repoRoot);

    if (!slug) {
      return {
        ok: false,
        error: {
          code: "INVALID_PROJECT_SLUG",
          message: "A valid project slug is required.",
          nextStep: "Provide slug or displayName that normalizes to a slug."
        },
        warnings: []
      };
    }

    const registry = readRegistry();
    if (registry.projects[slug]) {
      return {
        ok: false,
        error: {
          code: "PROJECT_ALREADY_REGISTERED",
          message: `Project '${slug}' is already registered.`,
          nextStep: "Use a different slug or update the existing project."
        },
        warnings: []
      };
    }

    const now = new Date().toISOString();
    const identity = input.repositoryIdentity || getRepositoryIdentity(workspaceRoot);
    const project = {
      slug,
      displayName,
      workspaceRoot,
      repositoryIdentity: identity,
      vaultPath: input.vaultPath ? path.resolve(input.vaultPath) : null,
      storageLayout: slug === "locaily" ? "legacy" : "namespaced",
      captureEnabled: input.captureEnabled !== false,
      allowedPaths: Array.isArray(input.allowedPaths) ? input.allowedPaths : [...DEFAULT_ALLOWED_PATHS],
      blockedPaths: Array.isArray(input.blockedPaths) ? input.blockedPaths : [...DEFAULT_BLOCKED_PATHS],
      capturePolicyPath: input.capturePolicyPath || null,
      createdAt: now,
      updatedAt: now
    };

    const validation = validateProject(project);
    if (!validation.ok) {
      return { ok: false, error: validation.error, warnings: [] };
    }

    ensureProjectStorage(project);
    registry.projects[slug] = project;
    registry.updatedAt = now;

    if (input.setActive === true) {
      registry.activeProjectSlug = slug;
    }

    writeRegistry(registry);

    return {
      ok: true,
      result: project,
      warnings: []
    };
  }

  function updateProject(slug, patch = {}) {
    const normalized = normalizeProjectSlug(slug);
    const registry = readRegistry();
    const existing = registry.projects[normalized];

    if (!existing) {
      return {
        ok: false,
        error: {
          code: "PROJECT_NOT_FOUND",
          message: `Project '${normalized}' is not registered.`,
          nextStep: "Register the project first."
        },
        warnings: []
      };
    }

    const updated = {
      ...existing,
      ...patch,
      slug: normalized,
      updatedAt: new Date().toISOString()
    };

    if (patch.vaultPath) {
      updated.vaultPath = path.resolve(patch.vaultPath);
    }

    const validation = validateProject(updated);
    if (!validation.ok) {
      return { ok: false, error: validation.error, warnings: [] };
    }

    registry.projects[normalized] = updated;
    registry.updatedAt = updated.updatedAt;
    writeRegistry(registry);

    return {
      ok: true,
      result: updated,
      warnings: []
    };
  }

  function resolveMemoryPaths(slug = null) {
    const project = slug ? getProject(slug) : getActiveProject();
    if (!project) {
      return getLegacyMemoryPaths(repoRoot);
    }
    return resolveProjectMemoryPaths(project, repoRoot);
  }

  function getRegistrySummary() {
    const registry = readRegistry();
    return {
      schemaVersion: registry.schemaVersion,
      activeProjectSlug: registry.activeProjectSlug,
      projectCount: Object.keys(registry.projects).length,
      projects: listProjects().map((project) => ({
        slug: project.slug,
        displayName: project.displayName,
        storageLayout: project.storageLayout,
        captureEnabled: project.captureEnabled,
        vaultConfigured: Boolean(project.vaultPath)
      })),
      updatedAt: registry.updatedAt
    };
  }

  return {
    getRegistryPath: () => registryPath,
    readRegistry,
    listProjects,
    getProject,
    getActiveProject,
    getActiveProjectSlug,
    setActiveProject,
    registerProject,
    updateProject,
    resolveMemoryPaths,
    ensureProjectStorage,
    getRegistrySummary,
    getRepoRoot: () => repoRoot
  };
}

module.exports = {
  createDevelopmentProjectRegistry
};
