const FLAT_ALLOWED_PATHS = [
  "index.md",
  "log.md",
  "SCHEMA.md",
  "projects/",
  "topics/"
];

const WIKI_ALLOWED_PATHS = [
  "index.md",
  "log.md",
  "SCHEMA.md",
  "wiki/projects/",
  "wiki/topics/",
  "wiki/concepts/",
  "wiki/entities/"
];

const DEFAULT_BLOCKED_PATHS = [
  "raw/",
  "private/",
  "personal/",
  ".git/",
  ".memory-bridge/writeback-inbox/"
];

function mergeAllowedPaths(...lists) {
  return Array.from(new Set(lists.flat().filter(Boolean)));
}

module.exports = {
  FLAT_ALLOWED_PATHS,
  WIKI_ALLOWED_PATHS,
  DEFAULT_BLOCKED_PATHS,
  mergeAllowedPaths
};
