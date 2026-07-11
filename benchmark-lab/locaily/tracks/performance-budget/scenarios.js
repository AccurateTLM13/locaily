const SCENARIO_REGISTRY = [];

function defineScenario(def) { SCENARIO_REGISTRY.push(def); return def; }

function buildBudgetAnalyzerPrompt(caseData) {
  return [
    "Analyze the Lighthouse performance audit results and identify budget gaps.",
    "Compare current metric values against reasonable performance budget targets.",
    "Use only supplied Lighthouse audit IDs and scores. Do not invent metrics.",
    "Target budgets: LCP < 2.5s, FCP < 1.8s, TBT < 200ms, CLS < 0.1, Speed Index < 3.4s, total JS < 300KB, total images < 1MB.",
    "Gap severity: critical (>> 2x target), significant (> 1.5x target), moderate (exceeds target), within_budget.",
    "Return JSON only matching the schema.",
    "",
    `Page URL: ${caseData.url}`,
    `Scores: ${JSON.stringify(caseData.scores || {})}`,
    `Audit count: ${caseData.auditCount || 0}`,
    `Extracted audits: ${JSON.stringify((caseData.failures || []).slice(0, 15))}`
  ].join("\n");
}

function buildBudgetRecommenderPrompt(caseData) {
  return [
    "Generate performance budget rules and an enforcement strategy based on the budget gap analysis below.",
    "Each budget rule must reference a real Lighthouse audit or metric present in the analysis.",
    "Budget rules should be specific, measurable thresholds suitable for CI/CD enforcement.",
    "Condition: less_than (metric must be below), greater_than (metric must be above), equals.",
    "Return JSON only matching the schema.",
    "",
    `Page URL: ${caseData.url}`,
    `Scores: ${JSON.stringify(caseData.scores || {})}`,
    `Budget gaps: ${JSON.stringify((caseData.budgetGaps || []).slice(0, 10))}`,
    `Extracted audits: ${JSON.stringify((caseData.extractedAudits || {}))}`
  ].join("\n");
}

defineScenario({
  id: "budget-001",
  title: "High LCP on e-commerce product page",
  category: "performance",
  role: "budget_analyzer",
  difficulty: "easy",
  prompt: buildBudgetAnalyzerPrompt({
    url: "https://example.com/products/chair",
    scores: { performance: 35, accessibility: 90, "best-practices": 85, seo: 92 },
    auditCount: 12,
    failCount: 3,
    failures: [
      { id: "largest-contentful-paint-element", title: "Largest Contentful Paint element", severity: "high" },
      { id: "render-blocking-resources", title: "Eliminate render-blocking resources", severity: "high" },
      { id: "unused-javascript", title: "Reduce unused JavaScript", severity: "medium" }
    ]
  }),
  expectedGaps: ["largest-contentful-paint-element", "render-blocking-resources"],
  evaluate(output, caseData) {
    const errors = [];
    if (!output || typeof output !== "object") return { pass: false, errors: ["No valid output object"] };
    if (!output.summary) errors.push("Missing summary");
    if (!Array.isArray(output.budgetGaps) || output.budgetGaps.length === 0) errors.push("Missing or empty budgetGaps");
    else {
      for (const gap of output.budgetGaps) {
        if (!gap.auditId || !gap.currentValue || !gap.target) errors.push(`Incomplete gap entry for ${gap.auditId}`);
        if (!["critical","significant","moderate","within_budget"].includes(gap.gapSeverity)) errors.push(`Invalid gapSeverity: ${gap.gapSeverity}`);
      }
    }
    return { pass: errors.length === 0, errors };
  }
});

defineScenario({
  id: "budget-002",
  title: "Excessive JavaScript bundle size",
  category: "performance",
  role: "budget_analyzer",
  difficulty: "medium",
  prompt: buildBudgetAnalyzerPrompt({
    url: "https://example.com/app",
    scores: { performance: 22, accessibility: 78, "best-practices": 80, seo: 85 },
    auditCount: 15,
    failCount: 5,
    failures: [
      { id: "largest-contentful-paint-element", title: "Largest Contentful Paint element", severity: "high" },
      { id: "render-blocking-resources", title: "Eliminate render-blocking resources", severity: "high" },
      { id: "unused-javascript", title: "Reduce unused JavaScript", severity: "critical" },
      { id: "mainthread-work-breakdown", title: "Minimize main-thread work", severity: "high" },
      { id: "bootup-time", title: "JavaScript execution time", severity: "medium" }
    ]
  }),
  expectedGaps: ["unused-javascript", "mainthread-work-breakdown"],
  evaluate(output, caseData) {
    const errors = [];
    if (!output || typeof output !== "object") return { pass: false, errors: ["No valid output object"] };
    if (!Array.isArray(output.budgetGaps)) errors.push("Missing budgetGaps");
    else if (output.budgetGaps.length === 0) errors.push("Empty budgetGaps - expected at least 2 gaps");
    return { pass: errors.length === 0, errors };
  }
});

defineScenario({
  id: "budget-rec-001",
  title: "Recommend budget rules for LCP",
  category: "performance",
  role: "budget_recommender",
  difficulty: "medium",
  prompt: buildBudgetRecommenderPrompt({
    url: "https://example.com/products/chair",
    scores: { performance: 35 },
    budgetGaps: [
      { auditId: "largest-contentful-paint-element", title: "Largest Contentful Paint element", currentValue: "8.2s", target: "2.5s", gapSeverity: "critical" },
      { auditId: "render-blocking-resources", title: "Eliminate render-blocking resources", currentValue: "2.8s savings", target: "< 1.0s", gapSeverity: "significant" }
    ],
    extractedAudits: { auditCount: 12, failCount: 3 }
  }),
  evaluate(output, caseData) {
    const errors = [];
    if (!output || typeof output !== "object") return { pass: false, errors: ["No valid output object"] };
    if (!Array.isArray(output.budgetRules) || output.budgetRules.length === 0) errors.push("Missing budgetRules");
    else {
      for (const rule of output.budgetRules) {
        if (!rule.metric || !rule.budget || !rule.condition) errors.push(`Incomplete rule for ${rule.metric}`);
        if (!["less_than","greater_than","equals"].includes(rule.condition)) errors.push(`Invalid condition: ${rule.condition}`);
      }
    }
    if (!Array.isArray(output.enforcementStrategy)) errors.push("Missing enforcementStrategy");
    return { pass: errors.length === 0, errors };
  }
});

module.exports = { scenarios: SCENARIO_REGISTRY, defineScenario };
