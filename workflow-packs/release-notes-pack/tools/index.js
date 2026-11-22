function parseCommitLine(rawLine) {
  const line = rawLine.replace(/^[-*]\s+/, "").trim();
  const match = line.match(/^(?:[a-f0-9]{7,12}\s+)?(feat|fix|perf|security|docs|refactor|chore|build|ci)(?:\(([^)]+)\))?(!)?:\s*(.+)$/i);
  if (!match) {
    return null;
  }
  return {
    type: match[1].toLowerCase(),
    scope: match[2] ? match[2].trim() : null,
    bang: Boolean(match[3]),
    subject: match[4].trim(),
    raw: line
  };
}

function parseReleaseCommits(input) {
  const rawText = String(input.commits_text || "").trim();
  const version = (typeof input.version === "string" && input.version.trim())
    ? input.version.trim()
    : "unreleased";
  const previousVersion = (typeof input.previous_version === "string" && input.previous_version.trim())
    ? input.previous_version.trim()
    : "previous";

  const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const breakingChanges = [];
  const features = [];
  const fixes = [];
  const otherChanges = [];
  const prRefs = new Set();

  const prMatches = rawText.match(/#(\d{1,7})\b/g) || [];
  for (const ref of prMatches) {
    prRefs.add(ref);
  }

  for (const line of lines) {
    if (/^BREAKING CHANGE:/i.test(line)) {
      breakingChanges.push(line.replace(/^BREAKING CHANGE:\s*/i, ""));
      continue;
    }

    const commit = parseCommitLine(line);
    if (!commit) {
      otherChanges.push(line.slice(0, 180));
      continue;
    }

    const formatted = commit.scope ? `**${commit.scope}:** ${commit.subject}` : commit.subject;
    if (commit.bang) {
      breakingChanges.push(formatted);
    }

    if (commit.type === "feat") {
      features.push(formatted);
    } else if (commit.type === "fix" || commit.type === "security") {
      fixes.push(formatted);
    } else {
      otherChanges.push(`${commit.type}: ${formatted}`);
    }
  }

  let releaseType = "patch";
  if (breakingChanges.length > 0) {
    releaseType = "major";
  } else if (features.length > 0) {
    releaseType = "minor";
  }

  const summaryText = [
    `Release ${version} (from ${previousVersion}, recommended bump=${releaseType}).`,
    `Breaking changes: ${breakingChanges.length}, features: ${features.length}, fixes: ${fixes.length}, other: ${otherChanges.length}.`,
    prRefs.size > 0 ? `Referenced PRs: ${[...prRefs].join(", ")}.` : "",
    `Excerpt: ${rawText.slice(0, 500)}`
  ].filter(Boolean).join(" ");

  return {
    version,
    previous_version: previousVersion,
    release_type: releaseType,
    pr_refs: [...prRefs],
    breaking_changes: breakingChanges,
    features,
    fixes,
    other_changes: otherChanges,
    summary_text: summaryText
  };
}

function assembleBrief(input) {
  const parsed = input.parsed || {};
  const classification = input.classification || null;
  const summary = input.summary || {};

  const version = parsed.version || "unreleased";
  const previousVersion = parsed.previous_version || "previous";
  const releaseType = parsed.release_type || "patch";
  const category = (classification && classification.category) ? classification.category : "minor_feature_release";
  const breakingChanges = Array.isArray(parsed.breaking_changes) ? parsed.breaking_changes : [];
  const features = Array.isArray(parsed.features) ? parsed.features : [];
  const fixes = Array.isArray(parsed.fixes) ? parsed.fixes : [];
  const otherChanges = Array.isArray(parsed.other_changes) ? parsed.other_changes : [];
  const prRefs = Array.isArray(parsed.pr_refs) ? parsed.pr_refs : [];

  const summaryText = typeof summary.summary === "string" && summary.summary.trim()
    ? summary.summary.trim()
    : (parsed.summary_text || "Release commits parsed.");
  const keyPoints = Array.isArray(summary.key_points) ? summary.key_points : [];
  const highlights = keyPoints.length > 0
    ? keyPoints
    : [
      ...breakingChanges.slice(0, 2).map((b) => `Breaking: ${b}`),
      ...features.slice(0, 3),
      ...fixes.slice(0, 2)
    ].slice(0, 5);
  if (highlights.length === 0) {
    highlights.push(`Release ${version} includes ${otherChanges.length} maintenance update(s).`);
  }

  const upgradeNotes = breakingChanges.length > 0
    ? breakingChanges.map((b) => `Review breaking change before upgrading: ${b}`)
    : [`No breaking changes detected between ${previousVersion} and ${version}; standard upgrade expected.`];

  const title = `Release Notes ${version} (${releaseType} — ${category})`;
  const markdown = [
    `# ${title}`,
    "",
    `- **Version:** ${version}`,
    `- **Previous Version:** ${previousVersion}`,
    `- **Recommended Bump:** ${releaseType}`,
    `- **Category:** ${category}`,
    ...(prRefs.length > 0 ? [`- **Referenced PRs:** ${prRefs.join(", ")}`] : []),
    "",
    "## Summary",
    summaryText,
    "",
    "## Breaking Changes",
    ...(breakingChanges.length > 0 ? breakingChanges.map((b) => `- ${b}`) : ["- None"]),
    "",
    "## Features",
    ...(features.length > 0 ? features.map((f) => `- ${f}`) : ["- None"]),
    "",
    "## Fixes & Security",
    ...(fixes.length > 0 ? fixes.map((f) => `- ${f}`) : ["- None"]),
    "",
    "## Other Changes",
    ...(otherChanges.length > 0 ? otherChanges.map((o) => `- ${o}`) : ["- None"]),
    "",
    "## Upgrade Notes",
    ...upgradeNotes.map((u) => `- ${u}`)
  ].join("\n");

  return {
    title,
    version,
    previous_version: previousVersion,
    release_type: releaseType,
    category,
    breaking_changes: breakingChanges,
    highlights,
    features,
    fixes,
    other_changes: otherChanges,
    upgrade_notes: upgradeNotes,
    summary: summaryText,
    markdown
  };
}

module.exports = {
  "release-log-parser": {
    validateInput(input) {
      if (!input || typeof input !== "object" || Array.isArray(input)) {
        return {
          code: "INVALID_INPUT",
          message: "Release log parser input must be an object.",
          nextStep: "Pass commits_text or parsed commit data."
        };
      }
      if (Object.prototype.hasOwnProperty.call(input, "parsed")) {
        if (!input.parsed || typeof input.parsed !== "object") {
          return {
            code: "INVALID_INPUT",
            message: "assemble_brief requires a 'parsed' object.",
            nextStep: "Pass parsed release data from release_notes.parse."
          };
        }
        return null;
      }
      if (typeof input.commits_text !== "string" || !input.commits_text.trim()) {
        return {
          code: "INVALID_INPUT",
          message: "Release log parser requires non-empty commits_text.",
          nextStep: "Provide commit log lines in commits_text."
        };
      }
      return null;
    },
    async handle({ task, input }) {
      if (task === "parse") {
        return parseReleaseCommits(input);
      }
      if (task === "assemble_brief") {
        return assembleBrief(input);
      }
      const err = new Error(`Unsupported release-log-parser task '${task}'.`);
      err.code = "UNKNOWN_TASK";
      throw err;
    }
  }
};
