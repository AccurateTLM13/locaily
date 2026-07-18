const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { validateResult } = require("../core/result-validator");
const {
  createDevelopmentMemoryRetrieval,
  defaultRetrievalRoots,
  DEFAULT_CONTEXT_BUDGET_CHARS,
  DEFAULT_EXCERPT_CHAR_LIMIT
} = require("./retrieval/index");

const CONTEXT_PACK_SCHEMA = JSON.parse(
  readFileSync(join(__dirname, "..", "schemas", "context-pack.schema.json"), "utf8")
);

const DEFAULT_MAX_FILES = 8;
const EXCERPT_CHAR_LIMIT = DEFAULT_EXCERPT_CHAR_LIMIT;
const SUMMARY_CHAR_LIMIT = 600;

const HEADING_PATTERNS = {
  decisions: [/^##\s+decisions?\b/i, /^##\s+key decisions?\b/i],
  constraints: [/^##\s+constraints?\b/i, /^##\s+known constraints?\b/i],
  openQuestions: [/^##\s+open questions?\b/i, /^##\s+questions?\b/i]
};

let sharedRetrieval = null;

function getRetrieval(options = {}) {
  if (options.retrieval) {
    return options.retrieval;
  }

  if (!sharedRetrieval) {
    sharedRetrieval = createDevelopmentMemoryRetrieval(defaultRetrievalRoots());
  }

  return sharedRetrieval;
}

function buildContextPack(adapter, request = {}) {
  const warnings = [];
  const status = adapter.getStatus();

  if (!status.enabled) {
    return {
      ok: false,
      warnings: [...status.warnings, "Memory bridge is disabled."],
      error: {
        code: "MEMORY_DISABLED",
        message: "Memory bridge is not enabled.",
        nextStep: "Set memoryBridge.enabled and vaultPath in companion/config.json."
      }
    };
  }

  if (!status.readable) {
    return {
      ok: false,
      warnings: status.warnings,
      error: {
        code: "VAULT_NOT_READABLE",
        message: "Configured memory vault is not readable.",
        nextStep: "Verify vaultPath, index.md, and allowlisted paths."
      }
    };
  }

  const project = String(request.project || "").trim();
  const task = String(request.task || "").trim();
  const maxFiles = normalizeMaxFiles(request.maxFiles);

  if (!project || !task) {
    return {
      ok: false,
      warnings,
      error: {
        code: "INVALID_REQUEST",
        message: "project and task are required.",
        nextStep: "Send project and task strings in the request body."
      }
    };
  }

  const include = normalizeInclude(request.include);
  const retrieval = getRetrieval(request);
  const retrievalOptions = retrieval.enrichContextPackRequest(adapter, request);
  const candidates = retrieval.selectFiles(adapter, {
    project,
    task,
    include,
    maxFiles,
    warnings,
    preferCanonicalPages: retrievalOptions.preferCanonicalPages,
    evidenceIndex: retrievalOptions.evidenceIndex,
    maintainerPageBudget: retrievalOptions.maintainerPageBudget
  });

  const filesUsed = [];
  const excerpts = [];
  const keyDecisions = [];
  const knownConstraints = [];
  const openQuestions = [];
  let excerptBudgetUsed = 0;

  for (const filePath of candidates) {
    const readResult = adapter.readMarkdownFile(filePath);

    if (!readResult.ok) {
      warnings.push(`Skipped unreadable file: ${filePath}`);
      continue;
    }

    const sections = parseMarkdownSections(readResult.content);
    const primaryHeading = sections[0] ? sections[0].heading : filePath;
    const excerptText = truncateText(buildExcerptText(sections), retrievalOptions.excerptCharLimit);

    if (excerptBudgetUsed + excerptText.length > retrievalOptions.contextBudgetChars && filesUsed.length > 0) {
      warnings.push(
        `Context budget reached (${retrievalOptions.contextBudgetChars} chars); skipped ${filePath}.`
      );
      continue;
    }

    filesUsed.push(filePath);
    excerptBudgetUsed += excerptText.length;

    excerpts.push({
      path: filePath,
      heading: primaryHeading,
      text: excerptText
    });

    if (shouldIncludeDecisions(include)) {
      keyDecisions.push(...extractSectionItems(sections, HEADING_PATTERNS.decisions));
    }

    if (shouldIncludeConstraints(include)) {
      knownConstraints.push(...extractSectionItems(sections, HEADING_PATTERNS.constraints));
    }

    if (shouldIncludeOpenQuestions(include)) {
      openQuestions.push(...extractSectionItems(sections, HEADING_PATTERNS.openQuestions));
    }
  }

  if (filesUsed.length === 0) {
    warnings.push("No allowlisted files matched the request; using fallback selection failed.");
    return {
      ok: false,
      warnings,
      error: {
        code: "NO_FILES_MATCHED",
        message: "No allowlisted Markdown files matched this context pack request.",
        nextStep: "Check project/task names and allowedPaths configuration."
      }
    };
  }

  const summary = buildSummary({ project, task, excerpts, filesUsed });
  let contextPack = {
    contextPackId: buildContextPackId(project, task),
    project,
    task,
    summary: truncateText(summary, SUMMARY_CHAR_LIMIT),
    filesUsed,
    excerpts,
    keyDecisions: dedupeStrings(keyDecisions),
    knownConstraints: dedupeStrings(knownConstraints),
    openQuestions: dedupeStrings(openQuestions),
    warnings,
    recommendedNextStep: "Review filesUsed, evidenceReferences, and excerpts before executing the task."
  };

  contextPack = retrieval.attachRetrievalMetadata(
    contextPack,
    filesUsed,
    retrievalOptions.evidenceIndex
  );

  contextPack.retrieval = {
    ...(contextPack.retrieval || {}),
    preferCanonicalPages: retrievalOptions.preferCanonicalPages,
    contextBudget: {
      limit: retrievalOptions.contextBudgetChars,
      used: excerptBudgetUsed,
      filesIncluded: filesUsed.length
    },
    maintainerPageBudget: retrievalOptions.maintainerPageBudget
  };

  const validation = validateResult(contextPack, CONTEXT_PACK_SCHEMA);

  if (!validation.ok) {
    return {
      ok: false,
      warnings: [...warnings, "Context pack failed schema validation."],
      error: {
        code: "SCHEMA_VALIDATION_FAILED",
        message: validation.errors.join(" "),
        nextStep: "Report this as a platform bug."
      }
    };
  }

  if (candidates.length >= maxFiles) {
    warnings.push(`File selection capped at maxFiles=${maxFiles}.`);
  }

  return {
    ok: true,
    result: contextPack,
    warnings
  };
}

function parseMarkdownSections(content) {
  const lines = String(content || "").split(/\r?\n/);
  const sections = [];
  let current = null;

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

    if (headingMatch) {
      if (current) {
        sections.push(current);
      }

      current = {
        heading: headingMatch[2].trim(),
        lines: []
      };
      continue;
    }

    if (current) {
      current.lines.push(line);
    }
  }

  if (current) {
    sections.push(current);
  }

  return sections;
}

function extractSectionItems(sections, patterns) {
  const items = [];

  for (const section of sections) {
    if (!patterns.some((pattern) => pattern.test(`## ${section.heading}`))) {
      continue;
    }

    for (const line of section.lines) {
      const trimmed = line.trim();

      if (/^[-*]\s+/.test(trimmed)) {
        items.push(trimmed.replace(/^[-*]\s+/, "").trim());
      }
    }
  }

  return items;
}

function buildExcerptText(sections) {
  const preferred = sections.find((section) =>
    /current state|summary|overview/i.test(section.heading)
  ) || sections[0];

  if (!preferred) {
    return "";
  }

  return preferred.lines.join("\n").trim();
}

function buildSummary({ project, task, excerpts, filesUsed }) {
  const titles = filesUsed.map((filePath) => filePath.split("/").pop().replace(/\.md$/i, ""));
  const excerptBits = excerpts
    .slice(0, 2)
    .map((entry) => entry.text)
    .filter(Boolean)
    .join(" ");

  return `Context for project '${project}' and task '${task}' from ${titles.join(", ")}. ${excerptBits}`.trim();
}

function buildContextPackId(project, task) {
  const slug = `${project}-${task}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

  return `ctx_${slug || "pack"}`;
}

function normalizeInclude(value) {
  if (!Array.isArray(value)) {
    return ["current_state", "known_decisions", "constraints", "open_questions"];
  }

  return value.map((entry) => String(entry).trim().toLowerCase()).filter(Boolean);
}

function normalizeMaxFiles(value) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return DEFAULT_MAX_FILES;
  }

  return Math.min(parsed, 20);
}

function shouldIncludeDecisions(include) {
  return include.includes("known_decisions") || include.includes("decisions");
}

function shouldIncludeConstraints(include) {
  return include.includes("constraints") || include.includes("known_constraints");
}

function shouldIncludeOpenQuestions(include) {
  return include.includes("open_questions") || include.includes("questions");
}

function dedupeStrings(items) {
  return Array.from(new Set(items.filter(Boolean)));
}

function truncateText(text, limit) {
  const value = String(text || "").trim();

  if (value.length <= limit) {
    return value;
  }

  return `${value.slice(0, limit - 3).trim()}...`;
}

module.exports = {
  buildContextPack,
  buildContextPackId,
  parseMarkdownSections,
  extractSectionItems,
  DEFAULT_CONTEXT_BUDGET_CHARS,
  EXCERPT_CHAR_LIMIT
};
