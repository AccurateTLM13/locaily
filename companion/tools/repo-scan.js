const { readFileSync, readdirSync, statSync, existsSync } = require("node:fs");
const { join, posix, sep } = require("node:path");

const scanOutputSchema = require("../schemas/repo-structure.schema.json");
const handoffOutputSchema = require("../schemas/repo-review-handoff.schema.json");

const EXCLUDED_DIRS = new Set([
  ".git", "node_modules", "dist", "build", "out", "coverage", ".next", ".cache",
  ".localbrain", ".codegraph", "data"
]);

const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".ico", ".webp", ".avif", ".bmp",
  ".woff", ".woff2", ".ttf", ".eot", ".otf",
  ".zip", ".gz", ".tar", ".7z", ".pdf", ".exe", ".dll", ".so", ".dylib",
  ".mp4", ".mp3", ".wav", ".ogg", ".mov", ".pyc"
]);

const DEFAULT_MAX_FILES = 400;
const DEFAULT_MAX_DEPTH = 10;
const MAX_READ_BYTES = 512 * 1024;
const OVERSIZED_FILE_LINES = 800;
const TODO_DEBT_THRESHOLD = 3;
const MAX_FINDINGS_PER_KIND = 10;
const SUMMARY_TEXT_CAP = 4000;

function toolError(code, message, nextStep) {
  const error = new Error(message);
  error.code = code;
  error.nextStep = nextStep;
  return error;
}

function toPosix(p) {
  return p.split(sep).join(posix.sep);
}

function extensionOf(name) {
  const base = posix.basename(name);
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot).toLowerCase() : "";
}

function isBinary(name) {
  return BINARY_EXTENSIONS.has(extensionOf(name));
}

function listLocalFiles(rootDir, { maxFiles, maxDepth }) {
  const files = [];

  function walk(dir, depth, prefix) {
    if (files.length >= maxFiles || depth > maxDepth) {
      return;
    }

    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (files.length >= maxFiles) {
        return;
      }

      if (entry.name.startsWith(".") && entry.isDirectory() && EXCLUDED_DIRS.has(entry.name)) {
        continue;
      }

      if (entry.isDirectory()) {
        if (EXCLUDED_DIRS.has(entry.name)) {
          continue;
        }
        walk(join(dir, entry.name), depth + 1, prefix ? `${prefix}/${entry.name}` : entry.name);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      files.push({ path: relPath, absolutePath: join(dir, entry.name) });
    }
  }

  walk(rootDir, 1, "");
  return files;
}

function countLines(text) {
  if (!text) {
    return 0;
  }
  return text.split(/\r?\n/).length;
}

function scanHeuristics(fileRecords) {
  const findings = [];
  const readme = fileRecords.find((f) => /^(readme|readme\.md)$/i.test(f.path) && !f.path.includes("/"));

  if (!readme) {
    findings.push({
      id: "scan-readme-missing",
      kind: "docs",
      title: "Root README is missing",
      severity: 6,
      effort: 2,
      area: "repo-root",
      evidence: "No README at repository root."
    });
  }

  const oversized = fileRecords
    .filter((f) => typeof f.lines === "number" && f.lines > OVERSIZED_FILE_LINES)
    .sort((a, b) => b.lines - a.lines)
    .slice(0, MAX_FINDINGS_PER_KIND);

  for (const file of oversized) {
    findings.push({
      id: `scan-oversized-${file.path}`,
      kind: "maintainability",
      title: `Large file: ${file.path}`,
      severity: 5,
      effort: 4,
      area: posix.dirname(file.path),
      evidence: `${file.lines} lines.`
    });
  }

  const todoDebt = fileRecords
    .filter((f) => typeof f.todoCount === "number" && f.todoCount >= TODO_DEBT_THRESHOLD)
    .sort((a, b) => b.todoCount - a.todoCount)
    .slice(0, MAX_FINDINGS_PER_KIND);

  for (const file of todoDebt) {
    findings.push({
      id: `scan-todo-debt-${file.path}`,
      kind: "correctness-debt",
      title: `Marker debt: ${file.path}`,
      severity: Math.min(3 + file.todoCount, 9),
      effort: 5,
      area: posix.dirname(file.path),
      evidence: `${file.todoCount} TODO/FIXME/HACK markers.`
    });
  }

  return findings;
}

function buildSummaryText(repoName, scan, findings) {
  const languageLine = scan.languages
    .slice(0, 6)
    .map((entry) => `${entry.language}:${entry.files}`)
    .join(", ");

  const lines = [
    `Repository '${repoName}': ${scan.file_count} files, ${scan.total_lines} lines.`,
    `Languages: ${languageLine || "unknown"}.`,
    `Findings (${findings.length}):`
  ];

  findings.slice(0, 20).forEach((finding, index) => {
    lines.push(`${index + 1}. [severity ${finding.severity}/effort ${finding.effort}] ${finding.title} (${finding.kind}) — ${finding.evidence}`);
  });

  const text = lines.join("\n");
  return text.length > SUMMARY_TEXT_CAP ? text.slice(0, SUMMARY_TEXT_CAP) : text;
}

function runScan(input) {
  let fileRecords = [];
  let repoName = String(input.repo_name || "").trim();

  if (typeof input.path === "string" && input.path.trim()) {
    const rootDir = input.path.trim();
    if (!existsSync(rootDir)) {
      throw toolError("REPO_PATH_NOT_FOUND", `Repository path '${rootDir}' does not exist.`, "Send a readable local directory path.");
    }

    let stat;
    try {
      stat = statSync(rootDir);
    } catch {
      throw toolError("REPO_PATH_UNREADABLE", `Repository path '${rootDir}' could not be read.`, "Check filesystem permissions.");
    }
    if (!stat.isDirectory()) {
      throw toolError("REPO_PATH_NOT_DIRECTORY", `Repository path '${rootDir}' is not a directory.`, "Send a directory path.");
    }

    repoName = repoName || posix.basename(toPosix(rootDir).replace(/\/+$/, ""));
    const maxFiles = Number.isInteger(input.max_files) && input.max_files > 0 ? Math.min(input.max_files, 5000) : DEFAULT_MAX_FILES;
    const maxDepth = Number.isInteger(input.max_depth) && input.max_depth > 0 ? Math.min(input.max_depth, 24) : DEFAULT_MAX_DEPTH;

    for (const entry of listLocalFiles(rootDir, { maxFiles, maxDepth })) {
      const record = { path: entry.path, lines: null, todoCount: 0 };
      const ext = extensionOf(entry.path);
      record.language = ext ? ext.slice(1) : "none";

      if (!isBinary(entry.path)) {
        try {
          const size = statSync(entry.absolutePath).size;
          if (size <= MAX_READ_BYTES) {
            const content = readFileSync(entry.absolutePath, "utf8");
            record.lines = countLines(content);
            const markers = content.match(/\b(TODO|FIXME|HACK)\b/g);
            record.todoCount = markers ? markers.length : 0;
          }
        } catch {
          // Unreadable files are skipped; the scan stays best-effort and read-only.
        }
      }

      fileRecords.push(record);
    }
  } else if (Array.isArray(input.files)) {
    fileRecords = input.files.map((file) => ({
      path: toPosix(String(file.path || "")),
      lines: Number.isInteger(file.lines) ? file.lines : null,
      todoCount: Number.isInteger(file.todo_count) ? file.todo_count : 0,
      language: file.language || (extensionOf(String(file.path || "")).slice(1) || "none")
    })).filter((file) => file.path);
    repoName = repoName || "inline-repo";
  } else {
    throw toolError(
      "INVALID_INPUT",
      "repo-scan requires either a local 'path' or an inline 'files' manifest.",
      "Send { path } for a local directory or { files: [{path, lines?}] } for offline analysis."
    );
  }

  const languages = new Map();
  const directories = new Map();
  let totalLines = 0;

  for (const file of fileRecords) {
    const lang = file.language || "none";
    languages.set(lang, (languages.get(lang) || 0) + 1);
    const dir = posix.dirname(file.path) === "." ? "." : posix.dirname(file.path);
    directories.set(dir, (directories.get(dir) || 0) + 1);
    totalLines += file.lines || 0;
  }

  const heuristicFindings = scanHeuristics(fileRecords);
  const callerFindings = (Array.isArray(input.findings) ? input.findings : []).map((finding, index) => ({
    id: String(finding.id || `caller-${index + 1}`),
    kind: String(finding.kind || "unclassified"),
    title: String(finding.title || `Finding ${index + 1}`),
    severity: Number.isFinite(finding.severity) ? finding.severity : 5,
    effort: Number.isFinite(finding.effort) ? finding.effort : 5,
    area: String(finding.area || "unknown"),
    evidence: String(finding.evidence || "caller-provided")
  }));

  const findings = [...callerFindings, ...heuristicFindings];
  const scan = {
    repo_name: repoName || "unknown-repo",
    file_count: fileRecords.length,
    total_lines: totalLines,
    languages: Array.from(languages.entries())
      .map(([language, files]) => ({ language, files }))
      .sort((a, b) => b.files - a.files),
    directories: Array.from(directories.entries())
      .map(([path, files]) => ({ path, files }))
      .sort((a, b) => b.files - a.files),
    findings,
    capped: fileRecords.length >= DEFAULT_MAX_FILES && Array.isArray(input.files) === false
  };

  scan.summary_text = buildSummaryText(scan.repo_name, scan, findings);
  return scan;
}

function renderHandoffMarkdown(handoff) {
  const lines = [
    `# ${handoff.title}`,
    "",
    handoff.headline,
    ""
  ];

  for (const section of handoff.sections) {
    lines.push(`## ${section.heading}`, "");
    for (const item of section.items) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}

function runComposeHandoff(input) {
  const scan = input.scan;
  if (!scan || typeof scan !== "object") {
    throw toolError("INVALID_INPUT", "repo-scan compose-handoff requires the upstream 'scan' artifact.", "Wire input_map from the scan composition alias.");
  }

  const ranked = Array.isArray(input.ranked?.ranked)
    ? input.ranked.ranked
    : Array.isArray(input.ranked)
      ? input.ranked
      : scan.findings || [];

  const title = `Repo Review — ${scan.repo_name}`;
  const headline = `${scan.findings?.length || ranked.length} finding(s) across ${scan.file_count} files (${scan.total_lines} lines) for '${scan.repo_name}'.`;

  const sections = [];

  if (input.classification && typeof input.classification.category === "string") {
    sections.push({
      heading: "Classification",
      items: [`Dominant finding category: ${input.classification.category}. ${input.classification.reason || ""}`.trim()]
    });
  }

  sections.push({
    heading: "Priorities",
    items: ranked.slice(0, 12).map((item) => {
      const score = Number.isFinite(item.score) ? `score ${item.score}` : `severity ${item.severity ?? "?"}/effort ${item.effort ?? "?"}`;
      return `${item.title || item.id || "finding"} (${score})${item.area ? ` — ${item.area}` : ""}`;
    })
  });

  if (input.summary && typeof input.summary.summary === "string") {
    sections.push({
      heading: "Summary",
      items: [input.summary.summary, ...(Array.isArray(input.summary.key_points) ? input.summary.key_points : [])]
    });
  }

  const handoff = {
    title,
    repo_name: scan.repo_name,
    headline,
    priorities: ranked.map((item) => ({
      id: item.id || item.title || "finding",
      title: item.title || item.id || "finding",
      severity: Number.isFinite(item.severity) ? item.severity : null,
      effort: Number.isFinite(item.effort) ? item.effort : null,
      score: Number.isFinite(item.score) ? item.score : null
    })),
    sections
  };

  handoff.markdown = renderHandoffMarkdown(handoff);
  return handoff;
}

function validateInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { code: "INVALID_INPUT", message: "repo-scan input must be an object.", nextStep: "Send scan input or compose-handoff input." };
  }
  return null;
}

const repoScanTool = {
  id: "repo-scan",
  name: "Repo Scan",
  pack: "showcase-tools",
  description: "Deterministic repository structure extraction and developer-handoff composition for the Repo Review workflow. Read-only; local paths and inline manifests both supported.",
  tasks: ["scan", "compose-handoff"],
  permissions: [],
  modelRole: null,
  requiresRuntime: false,
  inputSchema: null,
  outputSchema: null,
  input: null,
  output: handoffOutputSchema,
  schemas: {
    scan: scanOutputSchema,
    "compose-handoff": handoffOutputSchema
  },
  validateInput,
  async handle({ task, input }) {
    if (task === "scan") {
      return runScan(input);
    }

    if (task === "compose-handoff") {
      return runComposeHandoff(input);
    }

    throw toolError("UNKNOWN_TASK", `Task '${task}' is not supported by repo-scan.`, "Supported tasks: scan, compose-handoff.");
  }
};

module.exports = repoScanTool;
