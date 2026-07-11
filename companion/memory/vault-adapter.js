const { existsSync, readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } = require("node:fs");
const { join, resolve, relative, sep } = require("node:path");

const DEFAULT_MEMORY_BRIDGE_CONFIG = {
  enabled: false,
  vaultPath: null,
  mode: "local_markdown_vault",
  readPolicy: "allowlist",
  writebackMode: "proposal_only",
  rawAccess: false,
  allowApply: false,
  allowedPaths: ["index.md", "log.md", "SCHEMA.md", "projects/", "topics/"],
  blockedPaths: ["raw/", "private/", "personal/", ".git/", ".memory-bridge/writeback-inbox/"]
};

const PROJECT_PATH_PREFIXES = ["projects/", "wiki/projects/"];
const TOPIC_PATH_PREFIXES = ["topics/", "wiki/topics/", "wiki/concepts/", "wiki/entities/"];

function createVaultAdapter(options = {}) {
  const baseConfig = normalizeMemoryBridgeConfig({
    ...DEFAULT_MEMORY_BRIDGE_CONFIG,
    ...options
  });
  const effectiveConfig = loadEffectiveConfig(baseConfig);

  return {
    getEffectiveConfig() {
      return {
        enabled: effectiveConfig.enabled,
        mode: effectiveConfig.mode,
        vaultPathConfigured: Boolean(effectiveConfig.vaultPath),
        readPolicy: effectiveConfig.readPolicy,
        writebackMode: effectiveConfig.writebackMode,
        rawAccess: effectiveConfig.rawAccess,
        effectiveAllowedPaths: [...effectiveConfig.allowedPaths],
        effectiveBlockedPaths: [...effectiveConfig.blockedPaths]
      };
    },

    getStatus() {
      const warnings = [];
      const summary = this.getEffectiveConfig();

      if (!summary.enabled) {
        warnings.push("Memory bridge is disabled.");
        return {
          ...summary,
          readable: false,
          projectCount: 0,
          topicCount: 0,
          warnings
        };
      }

      if (!summary.vaultPathConfigured) {
        warnings.push("Memory vault path is not configured.");
        return {
          ...summary,
          readable: false,
          projectCount: 0,
          topicCount: 0,
          warnings
        };
      }

      const vaultRoot = resolveVaultRoot(effectiveConfig.vaultPath);

      if (!vaultRoot) {
        warnings.push("Configured memory vault path is invalid.");
        return {
          ...summary,
          readable: false,
          projectCount: 0,
          topicCount: 0,
          warnings
        };
      }

      if (!existsSync(vaultRoot)) {
        warnings.push("Configured memory vault path does not exist.");
        return {
          ...summary,
          readable: false,
          projectCount: 0,
          topicCount: 0,
          warnings
        };
      }

      const indexReadable = this.isPathAllowed("index.md") && existsSync(join(vaultRoot, "index.md"));

      if (!indexReadable) {
        warnings.push("index.md is missing or not allowlisted.");
      }

      const counts = this.countProjectsAndTopics();
      const readable = indexReadable && counts.totalAllowlistedMarkdown > 0;

      if (!readable) {
        warnings.push("Vault is partially readable or has no allowlisted Markdown files.");
      }

      return {
        ...summary,
        readable,
        projectCount: counts.projectCount,
        topicCount: counts.topicCount,
        warnings
      };
    },

    isPathAllowed(relativePath) {
      const normalized = normalizeRelativePath(relativePath);

      if (!normalized || !normalized.endsWith(".md")) {
        return false;
      }

      if (isBlockedPath(normalized, effectiveConfig.blockedPaths)) {
        return false;
      }

      if (effectiveConfig.readPolicy === "allowlist") {
        return isAllowedPath(normalized, effectiveConfig.allowedPaths);
      }

      return false;
    },

    listMarkdownFiles() {
      const vaultRoot = resolveVaultRoot(effectiveConfig.vaultPath);

      if (!vaultRoot || !effectiveConfig.enabled) {
        return [];
      }

      const files = [];

      walkDirectory(vaultRoot, vaultRoot, (absolutePath) => {
        const rel = normalizeRelativePath(relative(vaultRoot, absolutePath));

        if (this.isPathAllowed(rel)) {
          files.push(rel);
        }
      });

      return files.sort();
    },

    readMarkdownFile(relativePath) {
      const normalized = normalizeRelativePath(relativePath);

      if (!this.isPathAllowed(normalized)) {
        return {
          ok: false,
          error: {
            code: "PATH_NOT_ALLOWED",
            message: `Path is not allowlisted or is blocked: ${normalized}`
          }
        };
      }

      const vaultRoot = resolveVaultRoot(effectiveConfig.vaultPath);
      const absolutePath = join(vaultRoot, ...normalized.split("/"));

      if (!isInsideVault(vaultRoot, absolutePath)) {
        return {
          ok: false,
          error: {
            code: "PATH_TRAVERSAL",
            message: "Path escapes the configured vault root."
          }
        };
      }

      try {
        const content = readFileSync(absolutePath, "utf8");
        return { ok: true, path: normalized, content };
      } catch (error) {
        return {
          ok: false,
          error: {
            code: "READ_FAILED",
            message: error.message
          }
        };
      }
    },

    countProjectsAndTopics() {
      const files = this.listMarkdownFiles();
      let projectCount = 0;
      let topicCount = 0;

      for (const filePath of files) {
        if (PROJECT_PATH_PREFIXES.some((prefix) => filePath.startsWith(prefix))) {
          projectCount += 1;
        }

        if (TOPIC_PATH_PREFIXES.some((prefix) => filePath.startsWith(prefix))) {
          topicCount += 1;
        }
      }

      return {
        projectCount,
        topicCount,
        totalAllowlistedMarkdown: files.length
      };
    },

    getVaultRoot() {
      if (!effectiveConfig.enabled || !effectiveConfig.vaultPath) {
        return null;
      }

      return resolveVaultRoot(effectiveConfig.vaultPath);
    },

    getWritebackInboxDir() {
      const vaultRoot = this.getVaultRoot();

      if (!vaultRoot) {
        return null;
      }

      return join(vaultRoot, ".memory-bridge", "writeback-inbox");
    },

    ensureWritebackInbox() {
      const inboxDir = this.getWritebackInboxDir();

      if (!inboxDir) {
        return {
          ok: false,
          error: {
            code: "VAULT_NOT_CONFIGURED",
            message: "Memory vault is not configured for writeback."
          }
        };
      }

      mkdirSync(inboxDir, { recursive: true });
      return { ok: true, inboxDir };
    },

    writeProposalFile(fileName, content) {
      const inboxResult = this.ensureWritebackInbox();

      if (!inboxResult.ok) {
        return inboxResult;
      }

      const safeName = sanitizeFileName(fileName);
      const absolutePath = join(inboxResult.inboxDir, safeName);

      if (!isInsideVault(this.getVaultRoot(), absolutePath)) {
        return {
          ok: false,
          error: {
            code: "PATH_TRAVERSAL",
            message: "Writeback path escapes the vault root."
          }
        };
      }

      writeFileSync(absolutePath, content, "utf8");

      return {
        ok: true,
        proposalPath: normalizeRelativePath(relative(this.getVaultRoot(), absolutePath)),
        proposalId: safeName.replace(/\.md$/i, "")
      };
    },

    getAllowApply() {
      return Boolean(effectiveConfig.allowApply) || effectiveConfig.writebackMode === "apply";
    },

    search(query, { limit = 10, paths } = {}) {
      const status = this.getStatus();

      if (!status.enabled || !status.readable) {
        return {
          ok: false,
          error: {
            code: "MEMORY_NOT_READABLE",
            message: "Memory vault is not enabled or not readable."
          }
        };
      }

      if (!query || typeof query !== "string" || !query.trim()) {
        return {
          ok: false,
          error: {
            code: "MISSING_QUERY",
            message: "A non-empty search query is required."
          }
        };
      }

      const lowerQuery = query.toLowerCase();
      const terms = lowerQuery.split(/\s+/).filter(Boolean);
      const candidates = Array.isArray(paths) && paths.length > 0
        ? paths.map((p) => normalizeRelativePath(p)).filter((p) => this.isPathAllowed(p))
        : this.listMarkdownFiles();

      const hits = [];

      for (const relPath of candidates) {
        const readResult = this.readMarkdownFile(relPath);

        if (!readResult.ok) {
          continue;
        }

        const lines = readResult.content.split("\n");
        const matchedLines = [];
        let score = 0;

        lines.forEach((line, index) => {
          const lowerLine = line.toLowerCase();
          const matched = terms.filter((term) => lowerLine.includes(term));

          if (matched.length > 0) {
            score += matched.length;
            matchedLines.push({ line: index + 1, snippet: line.trim().slice(0, 200) });
          }
        });

        if (score > 0) {
          hits.push({
            path: relPath,
            score,
            matches: matchedLines.slice(0, 5)
          });
        }
      }

      hits.sort((a, b) => b.score - a.score);

      return {
        ok: true,
        result: {
          query,
          count: hits.length,
          hits: hits.slice(0, limit)
        }
      };
    },

    applyWriteback({ targetPath, content }) {
      const status = this.getStatus();

      if (!status.enabled) {
        return {
          ok: false,
          error: {
            code: "MEMORY_DISABLED",
            message: "Memory bridge is not enabled."
          }
        };
      }

      if (!this.getAllowApply()) {
        return {
          ok: false,
          error: {
            code: "WRITEBACK_APPLY_DISABLED",
            message: "Writeback apply is disabled. Enable memoryBridge.allowApply (or set writebackMode to 'apply')."
          }
        };
      }

      if (!targetPath || typeof targetPath !== "string" || !targetPath.trim()) {
        return {
          ok: false,
          error: {
            code: "MISSING_TARGET_PATH",
            message: "targetPath is required for writeback apply."
          }
        };
      }

      const normalized = normalizeRelativePath(targetPath);

      if (!normalized || !normalized.endsWith(".md")) {
        return {
          ok: false,
          error: {
            code: "INVALID_TARGET_PATH",
            message: "targetPath must be a relative .md path inside the vault."
          }
        };
      }

      if (!this.isPathAllowed(normalized)) {
        return {
          ok: false,
          error: {
            code: "PATH_NOT_ALLOWED",
            message: `targetPath is not allowlisted or is blocked: ${normalized}`
          }
        };
      }

      const vaultRoot = this.getVaultRoot();
      const absolutePath = join(vaultRoot, ...normalized.split("/"));

      if (!isInsideVault(vaultRoot, absolutePath)) {
        return {
          ok: false,
          error: {
            code: "PATH_TRAVERSAL",
            message: "targetPath escapes the configured vault root."
          }
        };
      }

      mkdirSync(join(absolutePath, ".."), { recursive: true });
      writeFileSync(absolutePath, content, "utf8");

      return {
        ok: true,
        result: {
          writtenPath: normalized,
          appliedAt: new Date().toISOString()
        }
      };
    }
  };
}

function normalizeMemoryBridgeConfig(config) {
  const vaultPath = process.env.LOCAL_MEMORY_VAULT_PATH || config.vaultPath || null;

  return {
    enabled: Boolean(config.enabled),
    vaultPath: vaultPath ? String(vaultPath) : null,
    mode: config.mode || DEFAULT_MEMORY_BRIDGE_CONFIG.mode,
    readPolicy: config.readPolicy || DEFAULT_MEMORY_BRIDGE_CONFIG.readPolicy,
    writebackMode: config.writebackMode || DEFAULT_MEMORY_BRIDGE_CONFIG.writebackMode,
    rawAccess: Boolean(config.rawAccess),
    allowApply: Boolean(config.allowApply),
    allowedPaths: normalizePathList(config.allowedPaths, DEFAULT_MEMORY_BRIDGE_CONFIG.allowedPaths),
    blockedPaths: normalizePathList(config.blockedPaths, DEFAULT_MEMORY_BRIDGE_CONFIG.blockedPaths)
  };
}

function loadEffectiveConfig(baseConfig) {
  const vaultRoot = resolveVaultRoot(baseConfig.vaultPath);

  if (!vaultRoot) {
    return baseConfig;
  }

  const vaultConfigPath = join(vaultRoot, ".memory-bridge", "config.json");

  if (!existsSync(vaultConfigPath)) {
    return baseConfig;
  }

  try {
    const vaultOverrides = JSON.parse(readFileSync(vaultConfigPath, "utf8"));
  const merged = {
    ...baseConfig,
    ...vaultOverrides,
    allowedPaths: vaultOverrides.allowedPaths
      ? normalizePathList(vaultOverrides.allowedPaths, baseConfig.allowedPaths)
      : baseConfig.allowedPaths,
    blockedPaths: vaultOverrides.blockedPaths
      ? normalizePathList(vaultOverrides.blockedPaths, baseConfig.blockedPaths)
      : baseConfig.blockedPaths
  };

  // Vault-local config cannot enable raw access when companion disallows it.
  if (!baseConfig.rawAccess) {
    merged.rawAccess = false;
  }

  // Vault-local config cannot enable writeback apply when companion disallows it.
  if (!baseConfig.allowApply) {
    merged.allowApply = false;
  }

  return merged;
  } catch (_error) {
    return baseConfig;
  }
}

function resolveVaultRoot(vaultPath) {
  if (!vaultPath || typeof vaultPath !== "string") {
    return null;
  }

  return resolve(vaultPath);
}

function normalizePathList(value, fallback) {
  if (!Array.isArray(value)) {
    return [...fallback];
  }

  return value
    .map((entry) => normalizeRelativePath(String(entry)))
    .filter(Boolean);
}

function normalizeRelativePath(input) {
  if (!input || typeof input !== "string") {
    return "";
  }

  const cleaned = input.replace(/\\/g, "/").replace(/^\/+/, "");

  if (cleaned.includes("..")) {
    return "";
  }

  return cleaned;
}

function isBlockedPath(relativePath, blockedPaths) {
  return blockedPaths.some((blocked) => pathMatchesPrefix(relativePath, blocked));
}

function isAllowedPath(relativePath, allowedPaths) {
  return allowedPaths.some((allowed) => pathMatchesPrefix(relativePath, allowed));
}

function pathMatchesPrefix(relativePath, prefix) {
  const normalizedPrefix = normalizeRelativePath(prefix);

  if (!normalizedPrefix) {
    return false;
  }

  if (normalizedPrefix.endsWith("/")) {
    return relativePath.startsWith(normalizedPrefix);
  }

  return relativePath === normalizedPrefix;
}

function isInsideVault(vaultRoot, targetPath) {
  const resolvedRoot = resolve(vaultRoot);
  const resolvedTarget = resolve(targetPath);
  const rel = relative(resolvedRoot, resolvedTarget);

  return rel === "" || (!rel.startsWith("..") && !rel.includes(`..${sep}`));
}

function walkDirectory(rootDir, currentDir, onFile) {
  if (!existsSync(currentDir)) {
    return;
  }

  const entries = readdirSync(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = join(currentDir, entry.name);

    if (entry.isDirectory()) {
      walkDirectory(rootDir, absolutePath, onFile);
      continue;
    }

    if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      onFile(absolutePath);
    }
  }
}

function sanitizeFileName(fileName) {
  return String(fileName)
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120) || "writeback-proposal.md";
}

module.exports = {
  createVaultAdapter,
  DEFAULT_MEMORY_BRIDGE_CONFIG,
  isBlockedPath,
  isAllowedPath,
  normalizeRelativePath,
  pathMatchesPrefix
};
