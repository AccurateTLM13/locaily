const KNOWN_ERROR_SIGNATURES = [
  "AssertionError",
  "TypeError",
  "ReferenceError",
  "SyntaxError",
  "RangeError",
  "ENOENT",
  "EACCES",
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EADDRINUSE",
  "ERR_MODULE_NOT_FOUND",
  "ERR_ASSERTION"
];

function extractFailingTests(lines) {
  const found = new Set();
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    if (/^(FAIL|not ok|\u2715|\u2716)\b/i.test(trimmed) || /^FAILED\s+/.test(trimmed)) {
      found.add(trimmed.slice(0, 140));
    }
  }
  return [...found].slice(0, 12);
}

function extractStackLocations(text) {
  const matches = text.match(/\b[a-zA-Z0-9_./-]+\.(?:js|cjs|mjs|ts|tsx|py|go|rs):\d+(?::\d+)?/g) || [];
  return [...new Set(matches)].slice(0, 12);
}

function extractErrorSignatures(text) {
  const found = [];
  for (const sig of KNOWN_ERROR_SIGNATURES) {
    if (text.includes(sig)) {
      found.push(sig);
    }
  }
  return found.slice(0, 12);
}

function extractExitCode(text) {
  const match = text.match(/\bexit(?:ed with)? code\s+(\d+)\b/i);
  if (!match) return 1;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : 1;
}

function parseCiLog(input) {
  const rawLog = String(input.log_text || "").trim();
  const lines = rawLog.split(/\r?\n/);
  const jobName = (typeof input.job_name === "string" && input.job_name.trim())
    ? input.job_name.trim()
    : "ci-job";
  const runnerOs = (typeof input.runner_os === "string" && input.runner_os.trim())
    ? input.runner_os.trim()
    : (/\bwindows\b/i.test(rawLog) ? "windows-latest" : (/\bubuntu|linux\b/i.test(rawLog) ? "ubuntu-latest" : "unspecified"));

  const failingTests = extractFailingTests(lines);
  const stackLocations = extractStackLocations(rawLog);
  const errorSignatures = extractErrorSignatures(rawLog);
  const exitCode = extractExitCode(rawLog);
  const likelyFlake = /\b(ETIMEDOUT|ECONNRESET|EADDRINUSE|timeout|timed out|flak(?:y|e))\b/i.test(rawLog);

  const summaryText = [
    `CI job '${jobName}' (${runnerOs}) exited with code ${exitCode}.`,
    errorSignatures.length > 0 ? `Error signatures: ${errorSignatures.join(", ")}.` : "No named runtime exception token found.",
    failingTests.length > 0 ? `Failing tests: ${failingTests.join(" | ")}.` : "Check full log excerpt for failure marker.",
    stackLocations.length > 0 ? `Stack frames: ${stackLocations.slice(0, 5).join(", ")}.` : "",
    `Excerpt: ${rawLog.slice(0, 500)}`
  ].filter(Boolean).join(" ");

  return {
    job_name: jobName,
    runner_os: runnerOs,
    exit_code: exitCode,
    failing_tests: failingTests,
    stack_locations: stackLocations,
    error_signatures: errorSignatures,
    likely_flake: likelyFlake,
    summary_text: summaryText
  };
}

function assembleBrief(input) {
  const parsed = input.parsed || {};
  const classification = input.classification || null;
  const summary = input.summary || {};

  const jobName = parsed.job_name || "ci-job";
  const runnerOs = parsed.runner_os || "unspecified";
  const exitCode = Number.isInteger(parsed.exit_code) ? parsed.exit_code : 1;
  const category = (classification && classification.category) ? classification.category : "unclassified";
  const failingTests = Array.isArray(parsed.failing_tests) ? parsed.failing_tests : [];
  const stackLocations = Array.isArray(parsed.stack_locations) ? parsed.stack_locations : [];
  const errorSignatures = Array.isArray(parsed.error_signatures) ? parsed.error_signatures : [];
  const likelyFlake = Boolean(parsed.likely_flake);

  const summaryText = typeof summary.summary === "string" && summary.summary.trim()
    ? summary.summary.trim()
    : (parsed.summary_text || "CI failure log parsed.");
  const keyPoints = Array.isArray(summary.key_points) ? summary.key_points : [];

  const debugSteps = [
    failingTests.length > 0
      ? `Reproduce first failing test locally: ${failingTests[0]}`
      : `Re-run CI command for job '${jobName}' locally to reproduce exit code ${exitCode}.`,
    stackLocations.length > 0
      ? `Inspect top stack location at ${stackLocations[0]} for root cause.`
      : "Inspect full assertion output around the first error line.",
    likelyFlake
      ? "Investigate timer, port contention, or transient I/O flake before masking with retries."
      : "Verify deterministic inputs and recent commits affecting the failing assertions."
  ];

  const title = `[CI Triage] ${jobName} (${runnerOs}) — ${category}`;
  const markdown = [
    `# ${title}`,
    "",
    `- **Job:** ${jobName}`,
    `- **Runner OS:** ${runnerOs}`,
    `- **Exit Code:** ${exitCode}`,
    `- **Category:** ${category}`,
    `- **Likely Flake:** ${likelyFlake ? "yes" : "no"}`,
    `- **Error Signatures:** ${errorSignatures.length > 0 ? errorSignatures.join(", ") : "none"}`,
    "",
    "## Summary",
    summaryText,
    "",
    ...(keyPoints.length > 0 ? ["## Key Signals", ...keyPoints.map((kp) => `- ${kp}`), ""] : []),
    "## Failing Tests",
    ...(failingTests.length > 0 ? failingTests.map((t) => `- ${t}`) : ["- None isolated by marker; review raw log."]),
    "",
    "## Stack Locations",
    ...(stackLocations.length > 0 ? stackLocations.map((s) => `- \`${s}\``) : ["- None extracted."]),
    "",
    "## Recommended Debug Steps",
    ...debugSteps.map((step, idx) => `${idx + 1}. ${step}`)
  ].join("\n");

  return {
    title,
    job_name: jobName,
    runner_os: runnerOs,
    category,
    exit_code: exitCode,
    failing_tests: failingTests,
    stack_locations: stackLocations,
    error_signatures: errorSignatures,
    likely_flake: likelyFlake,
    summary: summaryText,
    debug_steps: debugSteps,
    markdown
  };
}

module.exports = {
  "ci-log-parser": {
    validateInput(input) {
      if (!input || typeof input !== "object" || Array.isArray(input)) {
        return {
          code: "INVALID_INPUT",
          message: "CI log parser input must be an object.",
          nextStep: "Pass log_text or parsed CI failure data."
        };
      }
      if (Object.prototype.hasOwnProperty.call(input, "parsed")) {
        if (!input.parsed || typeof input.parsed !== "object") {
          return {
            code: "INVALID_INPUT",
            message: "assemble_brief requires a 'parsed' object.",
            nextStep: "Pass parsed CI signals from ci_failure_triage.parse."
          };
        }
        return null;
      }
      if (typeof input.log_text !== "string" || !input.log_text.trim()) {
        return {
          code: "INVALID_INPUT",
          message: "CI log parser requires non-empty log_text.",
          nextStep: "Provide raw CI log text in log_text."
        };
      }
      return null;
    },
    async handle({ task, input }) {
      if (task === "parse") {
        return parseCiLog(input);
      }
      if (task === "assemble_brief") {
        return assembleBrief(input);
      }
      const err = new Error(`Unsupported ci-log-parser task '${task}'.`);
      err.code = "UNKNOWN_TASK";
      throw err;
    }
  }
};
