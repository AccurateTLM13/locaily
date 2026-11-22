const SUBSYSTEM_HINTS = [
  "console",
  "shell",
  "relay",
  "memory",
  "workflow-packs",
  "orchestration",
  "benchmark",
  "cli",
  "server",
  "qualification",
  "jobs"
];

function detectEnvironment(text) {
  const tokens = [];
  if (/\bwindows(?:\s+1[01])?\b/i.test(text)) tokens.push("Windows");
  if (/\b(?:macos|darwin|osx)\b/i.test(text)) tokens.push("macOS");
  if (/\b(?:linux|ubuntu)\b/i.test(text)) tokens.push("Linux");
  const nodeMatch = text.match(/\bnode(?:\.js)?\s*v?(\d+(?:\.\d+)?)/i);
  if (nodeMatch) tokens.push(`Node ${nodeMatch[1]}`);
  return tokens.length > 0 ? tokens.join(", ") : "unspecified";
}

function detectSubsystems(text) {
  const lower = text.toLowerCase();
  const matched = SUBSYSTEM_HINTS.filter((sub) => lower.includes(sub));
  return matched.length > 0 ? matched : ["general"];
}

function parseIssue(input) {
  const rawIssue = String(input.issue_text || "").trim();
  const issueTitle = (typeof input.issue_title === "string" && input.issue_title.trim())
    ? input.issue_title.trim()
    : (rawIssue.split(/\r?\n/)[0] || "Untitled Issue").slice(0, 100);
  const reporter = (typeof input.reporter === "string" && input.reporter.trim())
    ? input.reporter.trim()
    : "unspecified";

  const hasReproSteps = /\b(steps to reproduce|repro|reproduce|1\.|when i run)\b/i.test(rawIssue);
  const hasExpectedActual = /\bexpected\b/i.test(rawIssue) && /\bactual\b/i.test(rawIssue);
  const environment = detectEnvironment(rawIssue);
  const subsystems = detectSubsystems(`${issueTitle} ${rawIssue}`);

  const missingQuestions = [];
  if (!hasReproSteps) {
    missingQuestions.push("Can you share minimal step-by-step reproduction commands or input payload?");
  }
  if (!hasExpectedActual) {
    missingQuestions.push("What was the expected behavior versus the actual observed output?");
  }
  if (environment === "unspecified") {
    missingQuestions.push("Which OS, Node.js version, and Locaily commit/version are you running?");
  }

  const triageSignals = [];
  if (/\b(crash|exception|unhandled|fatal|data loss|corrupt|security|bypass)\b/i.test(rawIssue)) {
    triageSignals.push({ signal: "crash_or_safety_impact", impact_score: 9, urgency_score: 8 });
  }
  if (/\b(regression|broke|used to work|since v?\d)\b/i.test(rawIssue)) {
    triageSignals.push({ signal: "regression_reported", impact_score: 7, urgency_score: 7 });
  }
  if (hasReproSteps) {
    triageSignals.push({ signal: "reproducible_case", impact_score: 6, urgency_score: 5 });
  }
  if (triageSignals.length === 0) {
    triageSignals.push({ signal: "baseline_report", impact_score: 3, urgency_score: 3 });
  }

  const summaryText = [
    `Issue '${issueTitle}' by ${reporter} targeting ${subsystems.join(", ")}.`,
    `Environment: ${environment}. Repro steps present: ${hasReproSteps}. Expected/actual present: ${hasExpectedActual}.`,
    `Details: ${rawIssue.slice(0, 550)}`
  ].join(" ");

  return {
    issue_title: issueTitle,
    reporter,
    has_repro_steps: hasReproSteps,
    has_expected_actual: hasExpectedActual,
    environment,
    subsystems,
    missing_info_questions: missingQuestions,
    triage_signals: triageSignals,
    summary_text: summaryText
  };
}

function derivePriority(rankedSignals) {
  const topScore = rankedSignals.length > 0
    ? Number(rankedSignals[0].score || rankedSignals[0].impact_score || 0)
    : 0;
  if (topScore >= 35) return "P1-high";
  if (topScore >= 20) return "P2-medium";
  return "P3-low";
}

function assembleBrief(input) {
  const parsed = input.parsed || {};
  const classification = input.classification || null;
  const prioritized = input.prioritized || null;
  const summary = input.summary || {};

  const issueTitle = parsed.issue_title || "Untitled Issue";
  const category = (classification && classification.category) ? classification.category : "bug";
  const hasReproSteps = Boolean(parsed.has_repro_steps);
  const environment = parsed.environment || "unspecified";
  const subsystems = Array.isArray(parsed.subsystems) && parsed.subsystems.length > 0 ? parsed.subsystems : ["general"];
  const missingQuestions = Array.isArray(parsed.missing_info_questions) ? parsed.missing_info_questions : [];

  const rawSignals = (prioritized && Array.isArray(prioritized.ranked) && prioritized.ranked.length > 0)
    ? prioritized.ranked
    : (Array.isArray(parsed.triage_signals) ? parsed.triage_signals : []);
  const rankedSignals = rawSignals.slice(0, 6).map((item) => ({
    signal: String(item.signal || "baseline_report"),
    score: Number(item.score ?? ((item.impact_score || 1) * 3 + (item.urgency_score || 1) * 2))
  }));

  const suggestedPriority = derivePriority(rankedSignals);
  const summaryText = typeof summary.summary === "string" && summary.summary.trim()
    ? summary.summary.trim()
    : (parsed.summary_text || "Issue parsed.");
  const keyPoints = Array.isArray(summary.key_points) ? summary.key_points : [];

  const nextActions = [
    missingQuestions.length > 0
      ? `Request clarification from reporter (${missingQuestions.length} open question(s)).`
      : `Reproduce reported behavior against ${subsystems.join(", ")} in ${environment}.`,
    `Assign priority ${suggestedPriority} under category '${category}'.`,
    "Link existing test coverage or create a targeted regression fixture before coding."
  ];

  const title = `[${suggestedPriority}] ${issueTitle} (${category})`;
  const markdown = [
    `# ${title}`,
    "",
    `- **Category:** ${category}`,
    `- **Suggested Priority:** ${suggestedPriority}`,
    `- **Environment:** ${environment}`,
    `- **Subsystems:** ${subsystems.join(", ")}`,
    `- **Repro Steps Provided:** ${hasReproSteps ? "yes" : "no"}`,
    "",
    "## Summary",
    summaryText,
    "",
    ...(keyPoints.length > 0 ? ["## Key Signals", ...keyPoints.map((kp) => `- ${kp}`), ""] : []),
    "## Missing Information Questions",
    ...(missingQuestions.length > 0 ? missingQuestions.map((q) => `- ${q}`) : ["- Report includes repro and environment details."]),
    "",
    "## Recommended Next Actions",
    ...nextActions.map((act, idx) => `${idx + 1}. ${act}`)
  ].join("\n");

  return {
    title,
    issue_title: issueTitle,
    category,
    suggested_priority: suggestedPriority,
    has_repro_steps: hasReproSteps,
    environment,
    subsystems,
    missing_info_questions: missingQuestions,
    ranked_signals: rankedSignals,
    summary: summaryText,
    next_actions: nextActions,
    markdown
  };
}

module.exports = {
  "issue-parser": {
    validateInput(input) {
      if (!input || typeof input !== "object" || Array.isArray(input)) {
        return {
          code: "INVALID_INPUT",
          message: "Issue parser input must be an object.",
          nextStep: "Pass issue_text or parsed issue data."
        };
      }
      if (Object.prototype.hasOwnProperty.call(input, "parsed")) {
        if (!input.parsed || typeof input.parsed !== "object") {
          return {
            code: "INVALID_INPUT",
            message: "assemble_brief requires a 'parsed' object.",
            nextStep: "Pass parsed issue signals from issue_triage.parse."
          };
        }
        return null;
      }
      if (typeof input.issue_text !== "string" || !input.issue_text.trim()) {
        return {
          code: "INVALID_INPUT",
          message: "Issue parser requires non-empty issue_text.",
          nextStep: "Provide issue description text in issue_text."
        };
      }
      return null;
    },
    async handle({ task, input }) {
      if (task === "parse") {
        return parseIssue(input);
      }
      if (task === "assemble_brief") {
        return assembleBrief(input);
      }
      const err = new Error(`Unsupported issue-parser task '${task}'.`);
      err.code = "UNKNOWN_TASK";
      throw err;
    }
  }
};
