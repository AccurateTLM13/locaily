const {
  getCanonicalProjectPaths,
  isRawSessionOrEvidencePath,
  normalizeProjectSlug,
  rankCanonicalPages
} = require("./canonical-pages");

const PROJECT_PREFIXES = ["projects/", "wiki/projects/"];
const TOPIC_PREFIXES = ["topics/", "wiki/topics/", "wiki/concepts/", "wiki/entities/"];

function selectRetrievalAwareFiles(adapter, {
  project,
  task,
  include,
  maxFiles,
  warnings,
  preferCanonicalPages = true,
  evidenceIndex = null,
  maintainerPageBudget = 4
}) {
  const allFiles = adapter.listMarkdownFiles();
  const selected = [];
  const used = new Set();
  const projectSlug = normalizeProjectSlug(project);
  const projectNeedle = project.toLowerCase();
  const taskTokens = tokenize(task);
  let maintainerPagesUsed = 0;

  const addFile = (filePath, options = {}) => {
    if (selected.length >= maxFiles || used.has(filePath)) {
      return false;
    }

    const maintainerBacked = options.maintainerBacked === true || isMaintainerBacked(filePath);

    if (maintainerBacked && maintainerPagesUsed >= maintainerPageBudget) {
      warnings.push(`Maintainer-backed page budget reached (${maintainerPageBudget}); skipped ${filePath}.`);
      return false;
    }

    selected.push(filePath);
    used.add(filePath);

    if (maintainerBacked) {
      maintainerPagesUsed += 1;
    }

    return true;
  };

  const isMaintainerBacked = (filePath) => {
    if (!evidenceIndex || !evidenceIndex.byVaultPath) {
      return false;
    }

    const entry = evidenceIndex.byVaultPath.get(filePath);
    return Boolean(entry && entry.maintainerRuns && entry.maintainerRuns.some((run) => run.applied));
  };

  if (shouldIncludeCurrentState(include)) {
    if (allFiles.includes("index.md")) {
      addFile("index.md");
    } else {
      warnings.push("index.md is not available for current_state.");
    }

    if (allFiles.includes("log.md")) {
      addFile("log.md");
    }
  }

  if (preferCanonicalPages && projectSlug) {
    const canonicalAvailable = getCanonicalProjectPaths(projectSlug)
      .filter((filePath) => allFiles.includes(filePath));
    const rankedCanonical = rankCanonicalPages({
      availablePaths: canonicalAvailable,
      task,
      include
    });

    for (const filePath of rankedCanonical) {
      addFile(filePath);
    }

    if (canonicalAvailable.length === 0) {
      warnings.push(`No canonical project pages found under projects/${projectSlug}/.`);
    }
  }

  const projectMatches = allFiles.filter((filePath) => {
    if (used.has(filePath) || isRawSessionOrEvidencePath(filePath)) {
      return false;
    }

    if (!PROJECT_PREFIXES.some((prefix) => filePath.startsWith(prefix))) {
      return false;
    }

    const fileName = filePath.split("/").pop().toLowerCase();
    const pathSlug = filePath.split("/")[1] || "";

    return fileName.includes(projectNeedle)
      || projectNeedle.includes(fileName.replace(/\.md$/, ""))
      || pathSlug === projectSlug;
  });

  for (const match of projectMatches) {
    addFile(match);
  }

  if (projectMatches.length === 0 && !preferCanonicalPages) {
    warnings.push(`No project page matched '${project}'.`);
  }

  const topicMatches = rankTopicMatches(allFiles.filter((filePath) => !used.has(filePath) && !isRawSessionOrEvidencePath(filePath)), taskTokens);

  for (const match of topicMatches) {
    addFile(match.path);
  }

  if (topicMatches.length === 0) {
    warnings.push(`No topic page strongly matched task '${task}'.`);
  }

  return selected;
}

function rankTopicMatches(allFiles, taskTokens) {
  const topicFiles = allFiles.filter((filePath) =>
    TOPIC_PREFIXES.some((prefix) => filePath.startsWith(prefix))
  );

  const scored = topicFiles.map((filePath) => {
    const fileName = filePath.split("/").pop().toLowerCase();
    let score = 0;

    for (const token of taskTokens) {
      if (fileName.includes(token)) {
        score += 3;
      }
    }

    return { path: filePath, score };
  });

  return scored
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);
}

function shouldIncludeCurrentState(include) {
  return include.includes("current_state");
}

function tokenize(text) {
  return String(text)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3);
}

module.exports = {
  selectRetrievalAwareFiles
};
