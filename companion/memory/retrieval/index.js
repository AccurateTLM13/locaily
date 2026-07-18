const path = require("node:path");
const { createEvidenceIndexBuilder } = require("./evidence-index");
const { selectRetrievalAwareFiles } = require("./selection");
const { buildEvidenceReferences, buildRetrievalWarnings } = require("./retrieval-warnings");

const DEFAULT_CONTEXT_BUDGET_CHARS = 3200;
const DEFAULT_MAINTAINER_PAGE_BUDGET = 4;
const DEFAULT_EXCERPT_CHAR_LIMIT = 400;

function createDevelopmentMemoryRetrieval(options = {}) {
  const evidenceBuilder = createEvidenceIndexBuilder(options);

  function enrichContextPackRequest(adapter, request = {}) {
    const preferCanonicalPages = request.preferCanonicalPages !== false;
    const contextBudgetChars = normalizeContextBudget(request.contextBudgetChars);
    const maintainerPageBudget = normalizeMaintainerPageBudget(request.maintainerPageBudget);
    const excerptCharLimit = normalizeExcerptLimit(request.excerptCharLimit);

    const evidenceIndex = evidenceBuilder.buildEvidenceIndex(request.project);

    return {
      preferCanonicalPages,
      contextBudgetChars,
      maintainerPageBudget,
      excerptCharLimit,
      evidenceIndex
    };
  }

  function selectFiles(adapter, params) {
    return selectRetrievalAwareFiles(adapter, params);
  }

  function attachRetrievalMetadata(contextPack, filesUsed, evidenceIndex) {
    const { warnings, staleWarnings, contradictionWarnings } = buildRetrievalWarnings(filesUsed, evidenceIndex);
    const evidenceReferences = buildEvidenceReferences(filesUsed, evidenceIndex);

    contextPack.warnings = dedupeStrings([...(contextPack.warnings || []), ...warnings]);

    if (evidenceReferences.length > 0) {
      contextPack.evidenceReferences = evidenceReferences;
    }

    contextPack.retrieval = {
      projectSlug: evidenceIndex.projectSlug,
      preferCanonicalPages: true,
      staleWarnings,
      contradictionWarnings,
      evidenceCount: evidenceReferences.length
    };

    return contextPack;
  }

  return {
    enrichContextPackRequest,
    selectFiles,
    attachRetrievalMetadata,
    buildEvidenceIndex: evidenceBuilder.buildEvidenceIndex
  };
}

function normalizeContextBudget(value) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return DEFAULT_CONTEXT_BUDGET_CHARS;
  }

  return Math.min(parsed, 12000);
}

function normalizeMaintainerPageBudget(value) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return DEFAULT_MAINTAINER_PAGE_BUDGET;
  }

  return Math.min(parsed, 10);
}

function normalizeExcerptLimit(value) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return DEFAULT_EXCERPT_CHAR_LIMIT;
  }

  return Math.min(parsed, 1200);
}

function dedupeStrings(items) {
  return Array.from(new Set(items.filter(Boolean)));
}

function defaultRetrievalRoots() {
  return {
    candidatesRoot: path.join(__dirname, "..", "..", "..", "data", "memory", "development-candidates"),
    maintainerRoot: path.join(__dirname, "..", "..", "..", "data", "memory", "development-maintainer")
  };
}

module.exports = {
  createDevelopmentMemoryRetrieval,
  defaultRetrievalRoots,
  DEFAULT_CONTEXT_BUDGET_CHARS,
  DEFAULT_MAINTAINER_PAGE_BUDGET,
  DEFAULT_EXCERPT_CHAR_LIMIT
};
