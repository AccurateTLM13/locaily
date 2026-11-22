const SENSITIVE_PATTERN = /\b(auth|token|secret|security|policy|permission|permissions|schema|migration|server|config|env|key)\b/i;

function isSensitivePath(filePath) {
  return SENSITIVE_PATTERN.test(String(filePath || "").replace(/[/_.-]+/g, " "));
}

function parseDiff(input) {
  const rawDiff = String(input.diff_text || "");
  const prTitle = (typeof input.pr_title === "string" && input.pr_title.trim())
    ? input.pr_title.trim()
    : "Untitled Pull Request";
  const baseBranch = (typeof input.base_branch === "string" && input.base_branch.trim())
    ? input.base_branch.trim()
    : "main";

  const lines = rawDiff.split(/\r?\n/);
  const fileStats = new Map();
  let currentFile = null;

  const ensureFile = (filePath) => {
    const normalized = String(filePath || "").replace(/^b\//, "").trim();
    if (!normalized || normalized === "/dev/null") return null;
    if (!fileStats.has(normalized)) {
      fileStats.set(normalized, {
        file: normalized,
        additions: 0,
        deletions: 0,
        sensitive: isSensitivePath(normalized)
      });
    }
    return fileStats.get(normalized);
  };

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      const parts = line.split(" ");
      const bPath = parts[parts.length - 1] || "";
      currentFile = ensureFile(bPath);
      continue;
    }
    if (line.startsWith("+++ ")) {
      const targetPath = line.slice(4).trim();
      if (targetPath !== "/dev/null") {
        currentFile = ensureFile(targetPath);
      }
      continue;
    }
    if (line.startsWith("--- ") || line.startsWith("@@")) {
      continue;
    }
    if (!currentFile && (line.startsWith("+") || line.startsWith("-"))) {
      currentFile = ensureFile("inline-patch");
    }
    if (currentFile) {
      if (line.startsWith("+")) {
        currentFile.additions += 1;
      } else if (line.startsWith("-")) {
        currentFile.deletions += 1;
      }
    }
  }

  const entries = [...fileStats.values()];
  if (entries.length === 0) {
    entries.push({
      file: "patch-excerpt",
      additions: lines.length,
      deletions: 0,
      sensitive: isSensitivePath(rawDiff)
    });
  }

  let totalAdditions = 0;
  let totalDeletions = 0;
  const sensitiveFiles = [];
  const riskItems = [];

  for (const entry of entries) {
    totalAdditions += entry.additions;
    totalDeletions += entry.deletions;
    if (entry.sensitive) {
      sensitiveFiles.push(entry.file);
    }
    const churn = entry.additions + entry.deletions;
    const churnScore = Math.min(10, Math.max(1, Math.ceil(churn / 10)));
    const riskScore = (entry.sensitive ? 7 : 3) + (churn > 40 ? 2 : 0);
    riskItems.push({
      file: entry.file,
      additions: entry.additions,
      deletions: entry.deletions,
      sensitive: entry.sensitive,
      risk_score: riskScore,
      churn_score: churnScore
    });
  }

  const filesChanged = entries.map((e) => e.file);
  const summaryText = [
    `PR '${prTitle}' -> ${baseBranch}: ${filesChanged.length} file(s) changed (+${totalAdditions}/-${totalDeletions}).`,
    sensitiveFiles.length > 0
      ? `Sensitive areas touched: ${sensitiveFiles.join(", ")}.`
      : "No sensitive path keywords detected.",
    `Changed files: ${filesChanged.join(", ")}.`,
    `Diff excerpt: ${rawDiff.slice(0, 600)}`
  ].join(" ");

  return {
    pr_title: prTitle,
    base_branch: baseBranch,
    files_changed: filesChanged,
    total_additions: totalAdditions,
    total_deletions: totalDeletions,
    sensitive_files: sensitiveFiles,
    risk_items: riskItems,
    summary_text: summaryText
  };
}

function assembleBrief(input) {
  const parsed = input.parsed || {};
  const classification = input.classification || null;
  const prioritized = input.prioritized || null;
  const summary = input.summary || {};

  const prTitle = parsed.pr_title || "Untitled Pull Request";
  const baseBranch = parsed.base_branch || "main";
  const category = (classification && classification.category) ? classification.category : "unclassified";
  const filesChanged = Array.isArray(parsed.files_changed) ? parsed.files_changed : [];
  const sensitiveFiles = Array.isArray(parsed.sensitive_files) ? parsed.sensitive_files : [];
  const rawRisks = (prioritized && Array.isArray(prioritized.ranked) && prioritized.ranked.length > 0)
    ? prioritized.ranked
    : (Array.isArray(parsed.risk_items) ? parsed.risk_items : []);
  const topRisks = rawRisks.slice(0, 6).map((item) => ({
    file: String(item.file || "unknown"),
    risk_score: typeof item.score === "number" ? item.score : (typeof item.risk_score === "number" ? item.risk_score : 1),
    sensitive: Boolean(item.sensitive),
    additions: Number(item.additions || 0),
    deletions: Number(item.deletions || 0)
  }));

  const summaryText = typeof summary.summary === "string" && summary.summary.trim()
    ? summary.summary.trim()
    : (parsed.summary_text || "PR diff parsed cleanly.");
  const keyPoints = Array.isArray(summary.key_points) ? summary.key_points : [];

  const reviewChecklist = [
    `Verify behavioral correctness across ${filesChanged.length} modified file(s) targeting ${baseBranch}.`,
    sensitiveFiles.length > 0
      ? `Audit sensitive path changes carefully: ${sensitiveFiles.join(", ")}.`
      : "Confirm error handling, input validation, and edge cases in modified functions.",
    "Check backward compatibility of schemas, HTTP envelopes, and exported helper signatures."
  ];

  const suggestedTests = filesChanged.slice(0, 5).map((f) => `Add or verify targeted tests covering ${f}`);
  if (suggestedTests.length === 0) {
    suggestedTests.push("Run unit and contract test suites for affected modules.");
  }

  const title = `[PR Review] ${prTitle} (${category})`;
  const markdown = [
    `# ${title}`,
    "",
    `- **Base Branch:** ${baseBranch}`,
    `- **Category:** ${category}`,
    `- **Files Changed:** ${filesChanged.length} (+${Number(parsed.total_additions || 0)}/-${Number(parsed.total_deletions || 0)})`,
    `- **Sensitive Paths:** ${sensitiveFiles.length > 0 ? sensitiveFiles.join(", ") : "none detected"}`,
    "",
    "## Summary",
    summaryText,
    "",
    ...(keyPoints.length > 0 ? ["## Key Signals", ...keyPoints.map((kp) => `- ${kp}`), ""] : []),
    "## Highest-Risk Files",
    ...topRisks.map((r) => `- \`${r.file}\` (score=${r.risk_score}, +${r.additions}/-${r.deletions}${r.sensitive ? ", sensitive" : ""})`),
    "",
    "## Review Checklist",
    ...reviewChecklist.map((c, idx) => `${idx + 1}. ${c}`),
    "",
    "## Suggested Test Focus",
    ...suggestedTests.map((t) => `- ${t}`)
  ].join("\n");

  return {
    title,
    pr_title: prTitle,
    base_branch: baseBranch,
    category,
    files_changed: filesChanged,
    total_additions: Number(parsed.total_additions || 0),
    total_deletions: Number(parsed.total_deletions || 0),
    sensitive_files: sensitiveFiles,
    top_risks: topRisks,
    review_checklist: reviewChecklist,
    suggested_tests: suggestedTests,
    summary: summaryText,
    markdown
  };
}

module.exports = {
  "pr-diff-parser": {
    validateInput(input) {
      if (!input || typeof input !== "object" || Array.isArray(input)) {
        return {
          code: "INVALID_INPUT",
          message: "PR diff parser input must be an object.",
          nextStep: "Pass diff_text or parsed PR diff data."
        };
      }
      if (Object.prototype.hasOwnProperty.call(input, "parsed")) {
        if (!input.parsed || typeof input.parsed !== "object") {
          return {
            code: "INVALID_INPUT",
            message: "assemble_brief requires a 'parsed' object.",
            nextStep: "Pass parsed diff signals from pr_diff_review.parse."
          };
        }
        return null;
      }
      if (typeof input.diff_text !== "string" || !input.diff_text.trim()) {
        return {
          code: "INVALID_INPUT",
          message: "PR diff parser requires non-empty diff_text.",
          nextStep: "Provide unified git diff text in diff_text."
        };
      }
      return null;
    },
    async handle({ task, input }) {
      if (task === "parse") {
        return parseDiff(input);
      }
      if (task === "assemble_brief") {
        return assembleBrief(input);
      }
      const err = new Error(`Unsupported pr-diff-parser task '${task}'.`);
      err.code = "UNKNOWN_TASK";
      throw err;
    }
  }
};
