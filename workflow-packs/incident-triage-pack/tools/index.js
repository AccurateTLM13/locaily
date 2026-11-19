function extractServiceName(text, explicitService) {
  if (typeof explicitService === "string" && explicitService.trim()) {
    return explicitService.trim();
  }
  const match = text.match(/\b([a-z0-9-]+-(?:api|service|worker|db|gateway|proxy))\b/i);
  return match ? match[1].toLowerCase() : "unknown-service";
}

function extractSeverity(text) {
  const sevMatch = text.match(/\b(sev[1-4]|p[0-3])\b/i);
  if (sevMatch) {
    const token = sevMatch[1].toLowerCase();
    if (token === "p0" || token === "sev1") return "sev1";
    if (token === "p1" || token === "sev2") return "sev2";
    if (token === "p2" || token === "sev3") return "sev3";
    return "sev4";
  }
  if (/\b(503|500|outage|down|unreachable|crashloop|panic)\b/i.test(text)) {
    return "sev1";
  }
  if (/\b(timeout|degraded|latency|spike|429)\b/i.test(text)) {
    return "sev2";
  }
  return "sev3";
}

function extractErrorCodes(text) {
  const codes = new Set();
  const httpMatches = text.match(/\b(4\d{2}|5\d{2})\b/g) || [];
  for (const code of httpMatches) codes.add(`HTTP_${code}`);
  const namedMatches = text.match(/\b([A-Z][A-Z0-9_]{3,})\b/g) || [];
  for (const code of namedMatches) {
    if (/^(ERROR|WARN|INFO|HTTP|SEV[1-4]|UTC|GMT)$/.test(code)) continue;
    codes.add(code);
  }
  return [...codes].slice(0, 12);
}

function extractTimestamps(text) {
  const matches = text.match(/\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:?\d{2})?\b/g) || [];
  return [...new Set(matches)].slice(0, 8);
}

function parseIncident(input) {
  const rawText = String(input.incident_text || "").trim();
  const service = extractServiceName(rawText, input.service);
  const environment = (typeof input.environment === "string" && input.environment.trim())
    ? input.environment.trim()
    : (/\b(prod|production)\b/i.test(rawText) ? "production" : (/\bstaging\b/i.test(rawText) ? "staging" : "unspecified"));
  const severity = extractSeverity(rawText);
  const errorCodes = extractErrorCodes(rawText);
  const timestamps = extractTimestamps(rawText);

  const summaryText = [
    `Service: ${service} (${environment}), severity=${severity}.`,
    errorCodes.length > 0 ? `Observed codes: ${errorCodes.join(", ")}.` : "No explicit error codes extracted.",
    `Details: ${rawText.slice(0, 600)}`
  ].join(" ");

  return {
    service,
    environment,
    severity,
    error_codes: errorCodes,
    timestamps,
    raw_excerpt: rawText.slice(0, 400),
    summary_text: summaryText
  };
}

function assembleBrief(input) {
  const parsed = input.parsed || {};
  const classification = input.classification || null;
  const summary = input.summary || {};
  const service = parsed.service || "unknown-service";
  const environment = parsed.environment || "unspecified";
  const severity = parsed.severity || "sev3";
  const category = (classification && classification.category) ? classification.category : "unclassified";
  const errorCodes = Array.isArray(parsed.error_codes) ? parsed.error_codes : [];
  const keyPoints = Array.isArray(summary.key_points) ? summary.key_points : [];
  const summaryText = typeof summary.summary === "string" && summary.summary.trim()
    ? summary.summary.trim()
    : (parsed.summary_text || "Incident parsed without summary.");

  const nextActions = [
    `Verify health checks and recent deploys for ${service} (${environment}).`,
    errorCodes.length > 0
      ? `Inspect logs and upstream dependencies emitting ${errorCodes.slice(0, 4).join(", ")}.`
      : "Inspect recent error logs and metrics around the incident window.",
    "Confirm rollback or mitigation owner before closing the incident."
  ];

  const title = `[${severity.toUpperCase()}] ${service} (${environment}) — ${category}`;
  const markdown = [
    `# ${title}`,
    "",
    `- **Service:** ${service}`,
    `- **Environment:** ${environment}`,
    `- **Severity:** ${severity}`,
    `- **Category:** ${category}`,
    `- **Error Codes:** ${errorCodes.length > 0 ? errorCodes.join(", ") : "none"}`,
    "",
    "## Summary",
    summaryText,
    "",
    ...(keyPoints.length > 0 ? ["## Key Signals", ...keyPoints.map((kp) => `- ${kp}`), ""] : []),
    "## Immediate Next Actions",
    ...nextActions.map((act, i) => `${i + 1}. ${act}`)
  ].join("\n");

  return {
    title,
    service,
    environment,
    severity,
    category,
    error_codes: errorCodes,
    timestamps: Array.isArray(parsed.timestamps) ? parsed.timestamps : [],
    summary: summaryText,
    key_points: keyPoints,
    next_actions: nextActions,
    markdown
  };
}

module.exports = {
  "incident-parser": {
    validateInput(input) {
      if (!input || typeof input !== "object" || Array.isArray(input)) {
        return {
          code: "INVALID_INPUT",
          message: "Incident parser input must be an object.",
          nextStep: "Pass incident_text or parsed incident data."
        };
      }
      if (Object.prototype.hasOwnProperty.call(input, "parsed")) {
        if (!input.parsed || typeof input.parsed !== "object") {
          return {
            code: "INVALID_INPUT",
            message: "assemble_brief requires a 'parsed' object.",
            nextStep: "Pass parsed incident signals from incident_triage.parse."
          };
        }
        return null;
      }
      if (typeof input.incident_text !== "string" || !input.incident_text.trim()) {
        return {
          code: "INVALID_INPUT",
          message: "Incident parser requires non-empty incident_text.",
          nextStep: "Provide incident_text describing the outage or alert."
        };
      }
      return null;
    },
    async handle({ task, input }) {
      if (task === "parse") {
        return parseIncident(input);
      }
      if (task === "assemble_brief") {
        return assembleBrief(input);
      }
      const err = new Error(`Unsupported incident-parser task '${task}'.`);
      err.code = "UNKNOWN_TASK";
      throw err;
    }
  }
};
