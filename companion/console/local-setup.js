const { mkdirSync, readFileSync, writeFileSync, existsSync } = require("node:fs");
const { join } = require("node:path");

const DEFAULT_SETUP = {
  pageSpeedApiKey: null,
  memoryValidationVaultPath: null,
  updatedAt: null
};

function createLocalSetupStore({ dataDir }) {
  const setupDir = join(dataDir, "console");
  const setupPath = join(setupDir, "local-setup.json");
  let cache = null;

  function ensureDir() {
    mkdirSync(setupDir, { recursive: true });
  }

  function readSetup() {
    if (cache) {
      return { ...cache };
    }

    if (!existsSync(setupPath)) {
      cache = { ...DEFAULT_SETUP };
      return { ...cache };
    }

    try {
      const parsed = JSON.parse(readFileSync(setupPath, "utf8"));
      cache = normalizeSetup(parsed);
      return { ...cache };
    } catch {
      cache = { ...DEFAULT_SETUP };
      return { ...cache };
    }
  }

  function writeSetup(nextSetup) {
    ensureDir();
    cache = normalizeSetup(nextSetup);
    writeFileSync(setupPath, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
    return getPublicSetup();
  }

  function getPageSpeedApiKey() {
    const envKey = process.env.PAGESPEED_API_KEY;
    if (envKey && String(envKey).trim()) {
      return String(envKey).trim();
    }

    const setup = readSetup();
    return setup.pageSpeedApiKey || null;
  }

  function getMemoryValidationVaultPath() {
    const envPath = process.env.MEMORY_VALIDATION_VAULT_PATH;
    if (envPath && String(envPath).trim()) {
      return String(envPath).trim();
    }

    const setup = readSetup();
    return setup.memoryValidationVaultPath || null;
  }

  function getPublicSetup() {
    const pageSpeedConfigured = Boolean(getPageSpeedApiKey());
    const memoryConfigured = Boolean(getMemoryValidationVaultPath());

    return {
      pageSpeed: {
        configured: pageSpeedConfigured,
        source: pageSpeedConfigured && process.env.PAGESPEED_API_KEY ? "environment" : pageSpeedConfigured ? "local" : "none"
      },
      memory: {
        configured: memoryConfigured,
        source: memoryConfigured && process.env.MEMORY_VALIDATION_VAULT_PATH ? "environment" : memoryConfigured ? "local" : "none"
      },
      updatedAt: readSetup().updatedAt
    };
  }

  function savePageSpeedApiKey(apiKey) {
    const trimmed = String(apiKey || "").trim();

    if (!trimmed) {
      const error = new Error("PageSpeed API key is required.");
      error.code = "INVALID_PAGESPEED_KEY";
      error.statusCode = 400;
      throw error;
    }

    const setup = readSetup();
    return writeSetup({
      ...setup,
      pageSpeedApiKey: trimmed,
      updatedAt: new Date().toISOString()
    });
  }

  function saveMemoryValidationVaultPath(vaultPath) {
    const trimmed = String(vaultPath || "").trim();

    if (!trimmed) {
      const error = new Error("Memory vault path is required.");
      error.code = "INVALID_MEMORY_VAULT_PATH";
      error.statusCode = 400;
      throw error;
    }

    const setup = readSetup();
    return writeSetup({
      ...setup,
      memoryValidationVaultPath: trimmed,
      updatedAt: new Date().toISOString()
    });
  }

  return {
    getPageSpeedApiKey,
    getMemoryValidationVaultPath,
    getPublicSetup,
    savePageSpeedApiKey,
    saveMemoryValidationVaultPath
  };
}

function normalizeSetup(value) {
  return {
    pageSpeedApiKey: value && value.pageSpeedApiKey ? String(value.pageSpeedApiKey).trim() : null,
    memoryValidationVaultPath: value && value.memoryValidationVaultPath
      ? String(value.memoryValidationVaultPath).trim()
      : null,
    updatedAt: value && value.updatedAt ? value.updatedAt : null
  };
}

module.exports = {
  createLocalSetupStore
};
