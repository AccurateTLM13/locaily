const path = require("node:path");
const { generateStarterVault, buildCapturePolicy } = require("./vault-generator");
const { validateImportVault } = require("./vault-import");
const { buildProjectHealthReport } = require("./project-health");

function runProjectSetupStep(projectRegistry, step, input = {}) {
  switch (step) {
    case "register":
      return projectRegistry.registerProject(input);
    case "activate":
      return projectRegistry.setActiveProject(input.slug);
    case "attach-vault":
      return attachVault(projectRegistry, input);
    case "generate-vault":
      return generateVault(projectRegistry, input);
    case "import-vault":
      return importVault(projectRegistry, input);
    case "configure-capture":
      return configureCapture(projectRegistry, input);
    case "enable-capture":
      return enableCapture(projectRegistry, input);
    case "validate":
      return buildProjectHealthReport(projectRegistry, input.slug || projectRegistry.getActiveProjectSlug());
    default:
      return {
        ok: false,
        error: {
          code: "UNKNOWN_SETUP_STEP",
          message: `Unknown setup step '${step}'.`,
          nextStep: "Use register, attach-vault, generate-vault, import-vault, configure-capture, enable-capture, or validate."
        },
        warnings: []
      };
  }
}

function attachVault(projectRegistry, input) {
  const slug = input.slug || projectRegistry.getActiveProjectSlug();
  const project = projectRegistry.getProject(slug);

  if (!project) {
    return {
      ok: false,
      error: {
        code: "PROJECT_NOT_FOUND",
        message: `Project '${slug}' is not registered.`,
        nextStep: "Run the register step first."
      },
      warnings: []
    };
  }

  if (!input.vaultPath) {
    return {
      ok: false,
      error: {
        code: "VAULT_PATH_REQUIRED",
        message: "vaultPath is required.",
        nextStep: "Provide an existing or newly generated vault directory."
      },
      warnings: []
    };
  }

  const importResult = validateImportVault({
    vaultPath: input.vaultPath,
    slug,
    allowedPaths: project.allowedPaths,
    blockedPaths: project.blockedPaths || []
  });

  if (!importResult.ok) {
    return importResult;
  }

  const capturePolicyPath = path.join(path.resolve(input.vaultPath), ".memory-bridge", "capture-policy.json");

  return projectRegistry.updateProject(slug, {
    vaultPath: input.vaultPath,
    capturePolicyPath: importResult.result.hasCapturePolicy ? capturePolicyPath : project.capturePolicyPath
  });
}

function generateVault(projectRegistry, input) {
  const slug = input.slug || projectRegistry.getActiveProjectSlug();
  const project = projectRegistry.getProject(slug);

  if (!project) {
    return {
      ok: false,
      error: {
        code: "PROJECT_NOT_FOUND",
        message: `Project '${slug}' is not registered.`,
        nextStep: "Run the register step first."
      },
      warnings: []
    };
  }

  if (!input.vaultPath) {
    return {
      ok: false,
      error: {
        code: "VAULT_PATH_REQUIRED",
        message: "vaultPath is required for starter vault generation.",
        nextStep: "Provide an empty target directory."
      },
      warnings: []
    };
  }

  const generated = generateStarterVault({
    vaultPath: input.vaultPath,
    slug,
    displayName: project.displayName,
    layout: input.layout || "canonical",
    captureSources: input.captureSources || {}
  });

  if (!generated.ok) {
    return generated;
  }

  const updated = projectRegistry.updateProject(slug, {
    vaultPath: generated.result.vaultPath,
    capturePolicyPath: path.join(generated.result.vaultPath, ".memory-bridge", "capture-policy.json")
  });

  return {
    ok: true,
    result: {
      project: updated.result,
      vault: generated.result
    },
    warnings: generated.warnings
  };
}

function importVault(projectRegistry, input) {
  const slug = input.slug || projectRegistry.getActiveProjectSlug();
  const project = projectRegistry.getProject(slug);

  if (!project) {
    return {
      ok: false,
      error: {
        code: "PROJECT_NOT_FOUND",
        message: `Project '${slug}' is not registered.`,
        nextStep: "Run the register step first."
      },
      warnings: []
    };
  }

  const targetVaultDir = input.vaultPath || project.vaultPath;

  if (!targetVaultDir) {
    return {
      ok: false,
      error: {
        code: "VAULT_PATH_REQUIRED",
        message: "vaultPath is required.",
        nextStep: "Provide a target vault directory."
      },
      warnings: []
    };
  }

  let copiedFiles = 0;
  if (input.sourceDir) {
    const fs = require("node:fs");
    const sourceDir = path.resolve(input.sourceDir);
    if (!fs.existsSync(sourceDir)) {
      return {
        ok: false,
        error: {
          code: "SOURCE_DIR_NOT_FOUND",
          message: `Source directory '${sourceDir}' does not exist.`
        },
        warnings: []
      };
    }

    fs.mkdirSync(targetVaultDir, { recursive: true });
    const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".md")) {
        const srcPath = path.join(sourceDir, entry.name);
        const destPath = path.join(targetVaultDir, entry.name);
        fs.copyFileSync(srcPath, destPath);
        copiedFiles++;
      }
    }
  }

  // Ensure input.vaultPath is set for attachVault
  const attachInput = { ...input, vaultPath: targetVaultDir };
  const attached = attachVault(projectRegistry, attachInput);

  if (!attached.ok) {
    return attached;
  }

  const importValidation = validateImportVault({
    vaultPath: targetVaultDir,
    slug
  });

  return {
    ok: true,
    result: {
      project: attached.result,
      imported: true,
      filesImported: copiedFiles,
      validation: importValidation.ok ? importValidation.result : null
    },
    warnings: [...(attached.warnings || []), ...(importValidation.warnings || [])]
  };
}

function configureCapture(projectRegistry, input) {
  const slug = input.slug || projectRegistry.getActiveProjectSlug();
  const project = projectRegistry.getProject(slug);

  if (!project) {
    return {
      ok: false,
      error: {
        code: "PROJECT_NOT_FOUND",
        message: `Project '${slug}' is not registered.`,
        nextStep: "Run the register step first."
      },
      warnings: []
    };
  }

  const policyPath = project.capturePolicyPath
    || (project.vaultPath
      ? path.join(project.vaultPath, ".memory-bridge", "capture-policy.json")
      : path.join(projectRegistry.resolveMemoryPaths(slug).processorRoot, "capture-policy.json"));

  const fs = require("node:fs");
  fs.mkdirSync(path.dirname(policyPath), { recursive: true });

  const policy = buildCapturePolicy(slug, input.captureSources || {});
  if (input.enabled === true) {
    policy.enabled = true;
  }

  fs.writeFileSync(policyPath, `${JSON.stringify(policy, null, 2)}\n`, "utf8");

  return projectRegistry.updateProject(slug, {
    capturePolicyPath: policyPath,
    captureEnabled: input.enabled === true
  });
}

function enableCapture(projectRegistry, input) {
  const slug = input.slug || projectRegistry.getActiveProjectSlug();
  const configured = configureCapture(projectRegistry, {
    ...input,
    slug,
    enabled: true
  });

  if (!configured.ok) {
    return configured;
  }

  return projectRegistry.updateProject(slug, {
    captureEnabled: true
  });
}

async function validateSetup(projectRegistry, input) {
  const slug = input.slug || projectRegistry.getActiveProjectSlug();
  return buildProjectHealthReport(projectRegistry, slug);
}

module.exports = {
  runProjectSetupStep
};
