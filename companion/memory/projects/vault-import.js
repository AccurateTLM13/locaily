const fs = require("node:fs");
const path = require("node:path");
const { createVaultAdapter } = require("../vault-adapter");
const { getCanonicalProjectPaths } = require("../retrieval/canonical-pages");
const { DEFAULT_ALLOWED_PATHS, DEFAULT_BLOCKED_PATHS } = require("./project-paths");

function validateImportVault({ vaultPath, slug, allowedPaths = DEFAULT_ALLOWED_PATHS, blockedPaths = DEFAULT_BLOCKED_PATHS }) {
  const warnings = [];
  const targetRoot = path.resolve(vaultPath);

  if (!fs.existsSync(targetRoot)) {
    return {
      ok: false,
      error: {
        code: "VAULT_NOT_FOUND",
        message: `Vault path '${targetRoot}' does not exist.`,
        nextStep: "Create the directory or generate a starter vault first."
      },
      warnings: []
    };
  }

  const adapter = createVaultAdapter({
    enabled: true,
    vaultPath: targetRoot,
    allowedPaths,
    blockedPaths,
    writebackMode: "proposal_only"
  });

  const status = adapter.getStatus();
  if (!status.readable) {
    return {
      ok: false,
      error: {
        code: "VAULT_NOT_READABLE",
        message: "Vault is not readable with the default allowlist.",
        nextStep: "Verify index.md exists and allowedPaths cover your layout."
      },
      warnings: status.warnings
    };
  }

  const files = adapter.listMarkdownFiles();
  const capturePolicyPath = path.join(targetRoot, ".memory-bridge", "capture-policy.json");
  const hasCapturePolicy = fs.existsSync(capturePolicyPath);

  if (!hasCapturePolicy) {
    warnings.push("Missing .memory-bridge/capture-policy.json — setup can generate one.");
  }

  const canonicalPaths = getCanonicalProjectPaths(slug);
  const missingCanonical = canonicalPaths.filter((filePath) => !files.includes(filePath));

  if (missingCanonical.length > 0) {
    warnings.push(`Missing canonical project pages: ${missingCanonical.join(", ")}`);
  }

  return {
    ok: true,
    result: {
      vaultPath: targetRoot,
      slug,
      readable: status.readable,
      fileCount: files.length,
      hasCapturePolicy,
      missingCanonical,
      sampleFiles: files.slice(0, 12)
    },
    warnings
  };
}

module.exports = {
  validateImportVault
};
