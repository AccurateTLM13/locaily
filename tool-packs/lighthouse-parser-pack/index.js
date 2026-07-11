const {
  classifyAudits,
  classifyAuditCategory,
  validateAndEnrichPriorityFixes,
  enrichOpportunity
} = require("./audit-truth");

const FIX_KB = {
  performance: {
    effort: "medium",
    impact: "high",
    steps: [
      "Audit render-blocking resources and defer non-critical scripts.",
      "Optimize images and enable modern formats where possible.",
      "Reduce main-thread work and split long JavaScript tasks."
    ]
  },
  accessibility: {
    effort: "medium",
    impact: "high",
    steps: [
      "Fix missing alt text and insufficient color contrast.",
      "Ensure interactive elements have accessible names.",
      "Verify heading order and landmark regions."
    ]
  },
  bestPractices: {
    effort: "low",
    impact: "medium",
    steps: [
      "Resolve browser console errors and deprecated APIs.",
      "Use HTTPS and secure request patterns.",
      "Review third-party script impact."
    ]
  },
  seo: {
    effort: "low",
    impact: "medium",
    steps: [
      "Confirm indexable meta tags and canonical URLs.",
      "Improve page titles and meta descriptions.",
      "Validate structured data and crawlability."
    ]
  }
};

function normalizeScore(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

const implementations = {
  "lighthouse.parse": {
    validateInput(input) {
      if (!input || typeof input !== "object" || Array.isArray(input)) {
        return invalidInput("Lighthouse parse input must be an object.", "Send url and scores.");
      }

      if (typeof input.url !== "string" || !input.url.trim()) {
        return invalidInput("Lighthouse parse input requires url.", "Include the tested page URL.");
      }

      if (!input.scores || typeof input.scores !== "object" || Array.isArray(input.scores)) {
        return invalidInput("Lighthouse parse input requires scores.", "Include performance, accessibility, bestPractices, and seo.");
      }

      return null;
    },
    async handle({ input }) {
      const scores = input.scores || {};
      const classified = classifyAudits(input.opportunities || []);

      return {
        url: input.url.trim(),
        performance: normalizeScore(scores.performance),
        accessibility: normalizeScore(scores.accessibility),
        bestPractices: normalizeScore(scores.bestPractices),
        seo: normalizeScore(scores.seo),
        opportunityCount: Array.isArray(input.opportunities) ? input.opportunities.length : 0,
        diagnosticCount: Array.isArray(input.diagnostics) ? input.diagnostics.length : 0,
        rankedOpportunities: classified.rankedOpportunities
      };
    }
  },
  "lighthouse.classify_audits": {
    validateInput(input) {
      if (!input || typeof input !== "object" || Array.isArray(input)) {
        return invalidInput("Classify audits input must be an object.", "Send opportunities array.");
      }

      if (!Array.isArray(input.opportunities)) {
        return invalidInput("Classify audits input requires opportunities.", "Include parsed Lighthouse opportunities.");
      }

      return null;
    },
    async handle({ input }) {
      const classified = classifyAudits(input.opportunities || []);

      return {
        issues: classified.issues,
        rankedOpportunities: classified.rankedOpportunities,
        source: "deterministic-audit-mapping"
      };
    }
  },
  "lighthouse.validate_priority_fixes": {
    validateInput(input) {
      if (!input || typeof input !== "object" || Array.isArray(input)) {
        return invalidInput("Validate priority fixes input must be an object.", "Send priorityFixes and opportunities.");
      }

      if (!Array.isArray(input.priorityFixes)) {
        return invalidInput("Validate priority fixes input requires priorityFixes.", "Include model priority fixes.");
      }

      if (!Array.isArray(input.opportunities)) {
        return invalidInput("Validate priority fixes input requires opportunities.", "Include fixture opportunities.");
      }

      return null;
    },
    async handle({ input }) {
      const validated = validateAndEnrichPriorityFixes({
        priorityFixes: input.priorityFixes || [],
        opportunities: input.opportunities || [],
        maxFixes: 3
      });

      return {
        thinking: input.thinking || "",
        priorityFixes: validated.priorityFixes,
        needsReview: validated.needsReview
      };
    }
  },
  "lighthouse.match_fixes": {
    validateInput(input) {
      if (!input || typeof input !== "object" || Array.isArray(input)) {
        return invalidInput("Match fixes input must be an object.", "Send priorityFixes array.");
      }

      if (!Array.isArray(input.priorityFixes)) {
        return invalidInput("Match fixes input requires priorityFixes.", "Include prioritized fixes from the prior step.");
      }

      return null;
    },
    async handle({ input }) {
      const fixes = (input.priorityFixes || []).map((fix) => {
        const category = inferCategory(fix, input.issues || []);
        const kb = FIX_KB[category] || FIX_KB.performance;

        return {
          title: fix.title,
          effort: kb.effort,
          impact: priorityToImpact(fix.priority),
          steps: kb.steps,
          needs_review: Boolean(fix.unsupported_priority_fix) || !FIX_KB[category]
        };
      });

      return { fixes };
    }
  },
  "lighthouse.verify_handoff": {
    validateInput(input) {
      if (!input || typeof input !== "object" || !input.handoff) {
        return invalidInput("Verify handoff input requires handoff object.", "Pass the composed handoff result.");
      }

      return null;
    },
    async handle({ input }) {
      const handoff = input.handoff || {};
      const errors = [];
      const required = ["clientSummary", "developerSummary", "priorityFixes", "handoffChecklist", "estimatedImpact"];

      for (const key of required) {
        if (!Object.prototype.hasOwnProperty.call(handoff, key)) {
          errors.push(`handoff.${key} is required.`);
        }
      }

      if (!Array.isArray(handoff.priorityFixes)) {
        errors.push("handoff.priorityFixes must be an array.");
      }

      if (!Array.isArray(handoff.handoffChecklist)) {
        errors.push("handoff.handoffChecklist must be an array.");
      }

      if (handoff.markdown && typeof handoff.markdown === "string") {
        const requiredSections = [
          "# Developer Handoff:",
          "## Executive Summary",
          "## Priority Fixes",
          "## Implementation Checklist",
          "## Verification"
        ];

        for (const section of requiredSections) {
          if (!handoff.markdown.includes(section)) {
            errors.push(`markdown missing section: ${section}`);
          }
        }
      }

      return {
        valid: errors.length === 0,
        errors
      };
    }
  },
  "lighthouse.extract_category_audits": {
    validateInput(input) {
      if (!input || typeof input !== "object" || Array.isArray(input)) {
        return invalidInput("Extract category audits input must be an object.", "Send audits object and category.");
      }
      if (!input.audits || typeof input.audits !== "object" || Array.isArray(input.audits)) {
        return invalidInput("Extract category audits input requires audits object.", "Include the raw Lighthouse audits object keyed by audit ID.");
      }
      if (!input.category || !["accessibility", "seo", "performance"].includes(input.category)) {
        return invalidInput("Extract category audits input requires valid category.", "Include category: accessibility, seo, or performance.");
      }
      return null;
    },
    async handle({ input }) {
      return extractAuditsByCategory(input);
    }
  },
  "lighthouse.assemble_audit_report": {
    validateInput(input) {
      if (!input || typeof input !== "object" || Array.isArray(input)) {
        return invalidInput("Assemble audit report input must be an object.", "Send url, category, extractedAudits, analysis, and recommendations.");
      }
      if (typeof input.url !== "string" || !input.url.trim()) {
        return invalidInput("Assemble audit report input requires url.", "Include the page URL.");
      }
      if (!input.category || !["accessibility", "seo", "performance"].includes(input.category)) {
        return invalidInput("Assemble audit report input requires valid category.", "Include category: accessibility, seo, or performance.");
      }
      if (!input.extractedAudits || typeof input.extractedAudits !== "object") {
        return invalidInput("Assemble audit report input requires extractedAudits.", "Include extracted audit data object.");
      }
      if (!input.analysis || typeof input.analysis !== "object") {
        return invalidInput("Assemble audit report input requires analysis.", "Include analysis object with findings.");
      }
      if (!input.recommendations || typeof input.recommendations !== "object") {
        return invalidInput("Assemble audit report input requires recommendations.", "Include recommendations object.");
      }
      return null;
    },
    async handle({ input }) {
      return assembleAuditReport(input);
    }
  }
};

function inferCategory(fix, issues) {
  if (fix && fix.sourceCategory) {
    return fix.sourceCategory;
  }

  const match = issues.find((issue) => issue.title === fix.title);
  return match && match.category ? match.category : "performance";
}

function priorityToImpact(priority) {
  if (priority === "high") {
    return "high";
  }

  if (priority === "low") {
    return "low";
  }

  return "medium";
}

function invalidInput(message, nextStep) {
  return {
    code: "INVALID_INPUT",
    message,
    nextStep
  };
}

function extractAuditsByCategory({ audits, category, url }) {
  const extracted = [];
  let totalScore = 0;
  let scoreCount = 0;
  let passCount = 0;
  let failCount = 0;

  for (const [auditId, audit] of Object.entries(audits)) {
    const title = audit.title || "";
    const auditCategory = classifyAuditCategory(auditId, title);
    if (auditCategory !== category) continue;

    const score = typeof audit.score === "number" ? audit.score : null;
    extracted.push({
      id: auditId,
      title: audit.title || "",
      description: audit.description || "",
      score,
      scoreDisplayMode: audit.scoreDisplayMode || "",
      numericValue: typeof audit.numericValue === "number" ? audit.numericValue : null,
      numericUnit: audit.numericUnit || "",
      displayValue: audit.displayValue || "",
      metricSavings: audit.metricSavings || {}
    });

    if (score === 1) passCount++;
    else if (score !== null && score < 1) failCount++;
    if (score !== null) { totalScore += score; scoreCount++; }
  }

  return {
    url: url || "",
    category,
    auditCount: extracted.length,
    passCount,
    failCount,
    score: scoreCount > 0 ? Math.round((totalScore / scoreCount) * 100) / 100 : null,
    audits: extracted
  };
}

function assembleAuditReport({ url, category, extractedAudits, analysis, recommendations }) {
  const score = (extractedAudits && typeof extractedAudits.score === "number") ? extractedAudits.score : null;
  const findings = (analysis && Array.isArray(analysis.findings)) ? analysis.findings : [];
  const recs = (recommendations && Array.isArray(recommendations.recommendations)) ? recommendations.recommendations : [];

  const findingsSection = findings.length > 0
    ? findings.map((f) => `- **${f.auditId || f.title || "Audit"}** (${f.severity || "unknown"}): ${f.finding || ""}`).join("\n")
    : "No detailed findings available.";

  const recsSection = recs.length > 0
    ? recs.map((r, i) => `${i + 1}. ${r.title || r.recommendation || JSON.stringify(r)}`).join("\n")
    : "No recommendations available.";

  const reportMarkdown = [
    `# ${category.charAt(0).toUpperCase() + category.slice(1)} Audit Report: ${url}`,
    "",
    "## Summary",
    (analysis && analysis.summary) || "No summary available.",
    "",
    "## Score",
    score !== null ? `${category} score: ${score}` : "Score not available.",
    "",
    "## Findings",
    findingsSection,
    "",
    "## Recommendations",
    recsSection
  ].join("\n");

  return {
    url: url || "",
    category,
    summary: (analysis && analysis.summary) || "",
    score,
    findings,
    recommendations: recs,
    reportMarkdown
  };
}

module.exports = implementations;
module.exports.extractAuditsByCategory = extractAuditsByCategory;
module.exports.assembleAuditReport = assembleAuditReport;
