const SCENARIO_REGISTRY = [];

function defineScenario(def) { SCENARIO_REGISTRY.push(def); return def; }

function buildSeoAnalyzerPrompt(caseData) {
  return [
    "Analyze the Lighthouse SEO audit results below.",
    "For each failing audit, describe the search visibility impact and why it matters.",
    "Use only supplied Lighthouse audit IDs and titles. Do not invent audits.",
    "Severity: critical (deindexing risk), high (significant ranking impact), medium (moderate impact), low (minor).",
    "Return JSON only matching the schema.",
    "",
    `Page URL: ${caseData.url}`,
    `Failing audits: ${caseData.failCount || 0}`,
    `Extracted audits: ${JSON.stringify((caseData.failures || []).slice(0, 10))}`
  ].join("\n");
}

function buildSeoRecommenderPrompt(caseData) {
  return [
    "Generate prioritized SEO fix recommendations for the identified issues below.",
    "Each recommendation must reference a real Lighthouse audit ID present in the analysis findings.",
    "Priority: high (immediate search impact), medium (important but not blocking), low (nice to have).",
    "Rationale should explain the search engine behavior and ranking impact.",
    "Return JSON only matching the schema.",
    "",
    `Page URL: ${caseData.url}`,
    `Analysis findings: ${JSON.stringify((caseData.findings || []).slice(0, 10))}`,
    `Extracted audits: ${JSON.stringify((caseData.extractedAudits || {}))}`
  ].join("\n");
}

defineScenario({
  id: "seo-001",
  title: "Missing meta description on blog post",
  category: "seo",
  role: "seo_analyzer",
  difficulty: "easy",
  prompt: buildSeoAnalyzerPrompt({
    url: "https://example.com/blog/post-1",
    failCount: 1,
    failures: [
      { id: "meta-description", title: "Document does not have a meta description", severity: "high" }
    ]
  }),
  expectedFindings: ["meta-description"],
  evaluate(output, caseData) {
    const errors = [];
    if (!output || typeof output !== "object") return { pass: false, errors: ["No valid output object"] };
    if (!output.summary) errors.push("Missing summary");
    if (!Array.isArray(output.findings) || output.findings.length === 0) errors.push("Missing findings");
    else {
      if (!output.findings.some(f => f.auditId === "meta-description")) errors.push("Missing meta-description finding");
    }
    return { pass: errors.length === 0, errors };
  }
});

defineScenario({
  id: "seo-002",
  title: "Multiple SEO issues on product page",
  category: "seo",
  role: "seo_analyzer",
  difficulty: "medium",
  prompt: buildSeoAnalyzerPrompt({
    url: "https://example.com/products/chair",
    failCount: 3,
    failures: [
      { id: "meta-description", title: "Document does not have a meta description", severity: "high" },
      { id: "document-title", title: "Document does not have a valid title", severity: "critical" },
      { id: "link-text", title: "Links do not have descriptive text", severity: "medium" }
    ]
  }),
  expectedFindings: ["meta-description", "document-title", "link-text"],
  evaluate(output, caseData) {
    const errors = [];
    if (!output || typeof output !== "object") return { pass: false, errors: ["No valid output object"] };
    if (!Array.isArray(output.findings)) errors.push("Missing findings");
    else {
      for (const expected of this.expectedFindings) {
        if (!output.findings.some(f => f.auditId === expected)) errors.push(`Missing: ${expected}`);
      }
    }
    return { pass: errors.length === 0, errors };
  }
});

defineScenario({
  id: "seo-rec-001",
  title: "Recommend SEO fixes for product page",
  category: "seo",
  role: "seo_recommender",
  difficulty: "medium",
  prompt: buildSeoRecommenderPrompt({
    url: "https://example.com/products/chair",
    findings: [
      { auditId: "meta-description", title: "Document does not have a meta description", severity: "high", impact: "Search snippets will show generic text, reducing CTR", finding: "Product page lacks a meta description tag." },
      { auditId: "document-title", title: "Document does not have a valid title", severity: "critical", impact: "Search engines cannot determine page topic", finding: "Page has no <title> element." }
    ],
    extractedAudits: { auditCount: 5, failCount: 2 }
  }),
  evaluate(output, caseData) {
    const errors = [];
    if (!output || typeof output !== "object") return { pass: false, errors: ["No valid output object"] };
    if (!Array.isArray(output.recommendations) || output.recommendations.length === 0) errors.push("Missing recommendations");
    else {
      for (const rec of output.recommendations) {
        if (!rec.auditId || !rec.action || !rec.rationale) errors.push(`Incomplete rec for ${rec.auditId}`);
        if (!["high","medium","low"].includes(rec.priority)) errors.push(`Invalid priority for ${rec.auditId}`);
      }
    }
    return { pass: errors.length === 0, errors };
  }
});

module.exports = { scenarios: SCENARIO_REGISTRY, defineScenario };
