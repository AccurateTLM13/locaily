const SCENARIO_REGISTRY = [];

function defineScenario(def) { SCENARIO_REGISTRY.push(def); return def; }

function buildA11yAnalyzerPrompt(caseData) {
  return [
    "Analyze the Lighthouse accessibility audit results below.",
    "For each failing audit, identify the relevant WCAG success criterion and describe the issue in plain language.",
    "Use only supplied Lighthouse audit IDs and titles. Do not invent audits not present in the input.",
    "Severity: critical (blocks access), high (significant barrier), medium (moderate barrier), low (minor issue).",
    "Return JSON only matching the schema.",
    "",
    `Page URL: ${caseData.url}`,
    `Audit count: ${caseData.auditCount || 0}`,
    `Failing audits: ${caseData.failCount || 0}`,
    `Extracted audits: ${JSON.stringify((caseData.failures || []).slice(0, 15))}`
  ].join("\n");
}

function buildA11yRecommenderPrompt(caseData) {
  return [
    "Generate specific, actionable accessibility remediation recommendations for the identified issues below.",
    "Each recommendation must reference a real Lighthouse audit ID present in the analysis findings.",
    "Implementation guide should be specific enough for a developer to act on.",
    "Effort: low (simple HTML/CSS change), medium (multiple elements or script change), high (structural refactor).",
    "Return JSON only matching the schema.",
    "",
    `Page URL: ${caseData.url}`,
    `Analysis findings: ${JSON.stringify((caseData.findings || []).slice(0, 10))}`,
    `Extracted audits: ${JSON.stringify((caseData.extractedAudits || {}))}`
  ].join("\n");
}

// ============================================================
// SCENARIOS: a11y_analyzer
// ============================================================
defineScenario({
  id: "a11y-001",
  title: "Missing image alt text on product page",
  category: "accessibility",
  role: "a11y_analyzer",
  difficulty: "easy",
  prompt: buildA11yAnalyzerPrompt({
    url: "https://example.com/products/chair",
    auditCount: 4,
    failCount: 2,
    failures: [
      { id: "image-alt", title: "Image elements do not have [alt] attributes", severity: "high" },
      { id: "link-name", title: "Links do not have a discernible name", severity: "high" }
    ]
  }),
  expectedFindings: ["image-alt", "link-name"],
  evaluate(output, caseData) {
    const errors = [];
    if (!output || typeof output !== "object") return { pass: false, errors: ["No valid output object"] };
    if (!output.summary) errors.push("Missing summary");
    if (!Array.isArray(output.findings) || output.findings.length === 0) errors.push("Missing or empty findings");
    else {
      const foundIds = output.findings.map(f => f.auditId);
      for (const expected of this.expectedFindings) {
        if (!foundIds.includes(expected)) errors.push(`Missing expected finding: ${expected}`);
      }
      for (const f of output.findings) {
        if (!["critical","high","medium","low"].includes(f.severity)) errors.push(`Invalid severity: ${f.severity}`);
        if (!f.finding || f.finding.length < 5) errors.push(`Finding too short for ${f.auditId}`);
      }
    }
    return { pass: errors.length === 0, errors };
  }
});

defineScenario({
  id: "a11y-002",
  title: "Low contrast text on landing page",
  category: "accessibility",
  role: "a11y_analyzer",
  difficulty: "easy",
  prompt: buildA11yAnalyzerPrompt({
    url: "https://example.com/landing",
    auditCount: 6,
    failCount: 1,
    failures: [
      { id: "color-contrast", title: "Background and foreground colors do not have a sufficient contrast ratio", severity: "high" }
    ]
  }),
  expectedFindings: ["color-contrast"],
  evaluate(output, caseData) {
    const errors = [];
    if (!output || typeof output !== "object") return { pass: false, errors: ["No valid output object"] };
    if (!output.summary) errors.push("Missing summary");
    if (!Array.isArray(output.findings) || output.findings.length === 0) errors.push("Missing findings");
    else {
      if (!output.findings.some(f => f.auditId === "color-contrast")) errors.push("Missing expected finding: color-contrast");
    }
    return { pass: errors.length === 0, errors };
  }
});

defineScenario({
  id: "a11y-003",
  title: "Form inputs missing labels",
  category: "accessibility",
  role: "a11y_analyzer",
  difficulty: "medium",
  prompt: buildA11yAnalyzerPrompt({
    url: "https://example.com/checkout",
    auditCount: 8,
    failCount: 3,
    failures: [
      { id: "label", title: "Form elements do not have associated labels", severity: "high" },
      { id: "select-name", title: "Select elements do not have associated labels", severity: "high" },
      { id: "aria-hidden-focus", title: "ARIA hidden element contains focusable elements", severity: "medium" }
    ]
  }),
  expectedFindings: ["label", "select-name", "aria-hidden-focus"],
  evaluate(output, caseData) {
    const errors = [];
    if (!output || typeof output !== "object") return { pass: false, errors: ["No valid output object"] };
    if (!Array.isArray(output.findings)) errors.push("Missing findings array");
    else {
      for (const expected of this.expectedFindings) {
        if (!output.findings.some(f => f.auditId === expected)) errors.push(`Missing: ${expected}`);
      }
    }
    return { pass: errors.length === 0, errors };
  }
});

// ============================================================
// SCENARIOS: a11y_recommender
// ============================================================
defineScenario({
  id: "a11y-rec-001",
  title: "Recommend fixes for missing alt text",
  category: "accessibility",
  role: "a11y_recommender",
  difficulty: "medium",
  prompt: buildA11yRecommenderPrompt({
    url: "https://example.com/products/chair",
    findings: [
      { auditId: "image-alt", title: "Image elements do not have [alt] attributes", severity: "high", finding: "Product images lack descriptive alt text, making the page inaccessible to screen reader users." }
    ],
    extractedAudits: { auditCount: 4, failCount: 1 }
  }),
  expectedAuditIds: ["image-alt"],
  evaluate(output, caseData) {
    const errors = [];
    if (!output || typeof output !== "object") return { pass: false, errors: ["No valid output object"] };
    if (!Array.isArray(output.recommendations) || output.recommendations.length === 0) errors.push("Missing recommendations");
    else {
      for (const rec of output.recommendations) {
        if (!rec.auditId || !rec.action || !rec.implementationGuide) errors.push(`Incomplete recommendation for ${rec.auditId}`);
        if (!["low","medium","high"].includes(rec.effort)) errors.push(`Invalid effort for ${rec.auditId}`);
      }
    }
    return { pass: errors.length === 0, errors };
  }
});

module.exports = { scenarios: SCENARIO_REGISTRY, defineScenario };
