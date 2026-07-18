const CANONICAL_PROJECT_FILES = [
  "PROJECT.md",
  "STATUS.md",
  "DECISIONS.md",
  "BLOCKERS.md",
  "ARCHITECTURE.md",
  "OPERATING-RULES.md",
  "LESSONS.md",
  "RESUME.md"
];

const INCLUDE_PRIORITY = {
  current_state: ["STATUS.md", "PROJECT.md", "RESUME.md"],
  known_decisions: ["DECISIONS.md", "ARCHITECTURE.md"],
  decisions: ["DECISIONS.md", "ARCHITECTURE.md"],
  constraints: ["OPERATING-RULES.md", "BLOCKERS.md"],
  known_constraints: ["OPERATING-RULES.md", "BLOCKERS.md"],
  open_questions: ["BLOCKERS.md", "STATUS.md"]
};

const RAW_LOG_PREFIXES = ["projects/", "wiki/projects/"];
const RAW_LOG_SUFFIXES = ["/updates/", "/evidence/"];

function normalizeProjectSlug(project) {
  return String(project || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function getCanonicalProjectPaths(projectSlug) {
  const slug = normalizeProjectSlug(projectSlug);

  if (!slug) {
    return [];
  }

  return CANONICAL_PROJECT_FILES.map((fileName) => `projects/${slug}/${fileName}`);
}

function isRawSessionOrEvidencePath(filePath) {
  if (!RAW_LOG_PREFIXES.some((prefix) => filePath.startsWith(prefix))) {
    return false;
  }

  return RAW_LOG_SUFFIXES.some((suffix) => filePath.includes(suffix));
}

function rankCanonicalPages({ availablePaths, task, include = [] }) {
  const taskTokens = tokenize(task);
  const includeHints = Array.isArray(include) ? include.map((entry) => String(entry).toLowerCase()) : [];

  const scored = availablePaths.map((filePath) => {
    const fileName = filePath.split("/").pop();
    let score = CANONICAL_PROJECT_FILES.length - CANONICAL_PROJECT_FILES.indexOf(fileName);

    for (const hint of includeHints) {
      const prioritized = INCLUDE_PRIORITY[hint] || [];

      for (let index = 0; index < prioritized.length; index += 1) {
        if (prioritized[index] === fileName) {
          score += (prioritized.length - index) * 10;
        }
      }
    }

    const stem = fileName.replace(/\.md$/i, "").toLowerCase();

    for (const token of taskTokens) {
      if (stem.includes(token)) {
        score += 5;
      }
    }

    return { path: filePath, score };
  });

  return scored
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.path);
}

function tokenize(text) {
  return String(text)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3);
}

module.exports = {
  CANONICAL_PROJECT_FILES,
  normalizeProjectSlug,
  getCanonicalProjectPaths,
  isRawSessionOrEvidencePath,
  rankCanonicalPages
};
