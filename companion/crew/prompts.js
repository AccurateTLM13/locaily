function buildPrioritizeFixesPrompt(stepInput) {
  return [
    "Review the deterministically classified Lighthouse issues below.",
    "Select up to 3 priority fixes using only audit titles that appear in the opportunities list.",
    "Do not invent audits such as 'Unused images'.",
    "Do not prioritize audits with score 1.",
    "Return JSON only conforming to the schema.",
    "",
    "Optional thinking text may refine wording only. Do not include opportunity count, diagnostic count, or guaranteed improvement claims.",
    "",
    `Page URL: ${stepInput.url || "unknown"}`,
    `Scores: ${JSON.stringify(stepInput.scores || {})}`,
    `Ranked actionable opportunities: ${JSON.stringify((stepInput.rankedOpportunities || []).slice(0, 8))}`,
    `Classified Issues: ${JSON.stringify(stepInput.classifiedIssues || [])}`
  ].join("\n");
}

function buildGuardrailWriterPrompt(stepInput) {
  return [
    "Generate implementation guardrails, do-not-break constraints, human-review triggers, risk notes, and verification boundaries for the developer tasks below.",
    "Use only supplied Lighthouse/Priority Helper facts. Do not invent audit IDs, files, implementation details, root causes, or guaranteed score improvements.",
    "Every guardrail must reference a real Lighthouse audit ID present in the priority fixes or ranked opportunities.",
    "Implementation guardrails: specific boundaries for code changes, referencing audit IDs.",
    "Do-not-break constraints: existing behavior that must be preserved, such as analytics, accessibility, third-party integrations.",
    "Human review triggers: specific conditions that warrant a manual review before deployment.",
    "Risk notes: acknowledge edge cases, uncertainty, or potential negative side effects tied to specific audits.",
    "Verification boundaries: actionable steps to confirm the fix works, referencing Lighthouse retests and browser DevTools.",
    "Return JSON only matching the schema.",
    "",
    `Page URL: ${stepInput.url || "unknown"}`,
    `Scores: ${JSON.stringify(stepInput.scores || {})}`,
    `Validated priority fixes: ${JSON.stringify(stepInput.priorityFixes || [])}`,
    `Developer tasks: ${JSON.stringify(stepInput.developerTasks || [])}`,
    `Acceptance criteria: ${JSON.stringify(stepInput.acceptanceCriteria || [])}`,
    `Testing checklist: ${JSON.stringify(stepInput.testingChecklist || [])}`,
    `Ranked opportunities: ${JSON.stringify(stepInput.rankedOpportunities || [])}`,
    `Classified issues: ${JSON.stringify(stepInput.classifiedIssues || [])}`
  ].join("\n");
}

function buildDeveloperTaskWriterPrompt(stepInput) {
  return [
    "Convert the validated Lighthouse priority fixes into coding-agent-ready developer tasks.",
    "Use only supplied Lighthouse/Priority Helper facts. Do not invent audit IDs, files, implementation details, root causes, or guaranteed score improvements.",
    "Every developer task must name a sourceAudit that appears in the validated priority fixes or ranked opportunities.",
    "Tasks must be specific enough for a coding agent: concrete action, affected performance/accessibility/SEO area, and implementation boundary.",
    "Guardrails are mandatory. Include verification language such as retest, measure, preserve behavior, avoid unrelated redesign, and confirm with Lighthouse/browser checks.",
    "Testing checklist items must be actionable commands or checks a developer can perform after implementation.",
    "Return JSON only matching the schema.",
    "",
    `Page URL: ${stepInput.url || "unknown"}`,
    `Scores: ${JSON.stringify(stepInput.scores || {})}`,
    `Validated priority fixes: ${JSON.stringify(stepInput.priorityFixes || [])}`,
    `Ranked opportunities: ${JSON.stringify(stepInput.rankedOpportunities || [])}`,
    `Classified issues: ${JSON.stringify(stepInput.classifiedIssues || [])}`
  ].join("\n");
}

function buildRankEditorialOpportunitiesPrompt(stepInput) {
  return [
    "Act as a rigorous editorial assignment editor for Lemonteed's Operator Log.",
    "Rank and consolidate only the source-linked signals provided below.",
    `Editorial brief: ${stepInput.editorialBrief}`,
    `Inventory receipt: ${stepInput.inventoryId}`,
    `Return no more than ${stepInput.maxOpportunities || 8} opportunities.`,
    "Preserve supporting file paths exactly. Do not invent evidence, links, shipped status, or outcomes.",
    "Prefer a concrete problem + meaningful change + genuinely surprising weird part over broad project summaries.",
    "Penalize duplicate risk, missing facts, vague headlines, and work that is merely planned.",
    "recommendedOpportunity is the zero-based index of the strongest opportunity.",
    "Every opportunity must explain its selectionReason. Return JSON only matching the schema.",
    "",
    `Signals: ${JSON.stringify(stepInput.signals || [])}`
  ].join("\n");
}

function buildTestingChecklistWriterPrompt(stepInput) {
  return [
    "Generate a comprehensive testing checklist for the Lighthouse priority fixes and developer tasks below.",
    "Use only supplied Lighthouse facts. Do not invent audit IDs, files, implementation details, root causes, or guaranteed score improvements.",
    "Every step must reference real Lighthouse audit IDs present in the priority fixes, developer tasks, guardrails, or ranked opportunities.",
    "PageSpeed rerun steps: specific CLI or browser commands to retest after implementing fixes.",
    "Before/after comparisons: concrete metrics and audit scores to compare between runs.",
    "Regression checks: existing behaviors that must remain unchanged (analytics, tracking, layout, third-party integrations).",
    "Manual QA notes: specific things a human tester should verify in the browser.",
    "Coding agent verification: actionable commands or assertions a coding agent can run to confirm fixes work.",
    "Stop-and-ask-human triggers: conditions where automated verification is insufficient and human judgment is needed.",
    "Return JSON only matching the schema.",
    "",
    `Page URL: ${stepInput.url || "unknown"}`,
    `Scores: ${JSON.stringify(stepInput.scores || {})}`,
    `Validated priority fixes: ${JSON.stringify(stepInput.priorityFixes || [])}`,
    `Developer tasks: ${JSON.stringify(stepInput.developerTasks || [])}`,
    `Implementation guardrails: ${JSON.stringify(stepInput.guardrails || [])}`,
    `Testing checklist from tasks: ${JSON.stringify(stepInput.testingChecklist || [])}`,
    `Ranked opportunities: ${JSON.stringify(stepInput.rankedOpportunities || [])}`,
    `Classified issues: ${JSON.stringify(stepInput.classifiedIssues || [])}`
  ].join("\n");
}

function buildA11yAnalyzerPrompt(stepInput) {
  return [
    "Analyze the Lighthouse accessibility audit results below.",
    "For each failing audit, identify the relevant WCAG success criterion and describe the issue in plain language.",
    "Use only supplied Lighthouse audit IDs and titles. Do not invent audits not present in the input.",
    "Severity: critical (blocks access), high (significant barrier), medium (moderate barrier), low (minor issue).",
    "Return JSON only matching the schema.",
    "",
    `Page URL: ${stepInput.url || "unknown"}`,
    `Audit count: ${stepInput.auditCount || 0}`,
    `Failing audits: ${stepInput.failCount || 0}`,
    `Extracted audits: ${JSON.stringify((stepInput.failures || []).slice(0, 15))}`
  ].join("\n");
}

function buildA11yRecommenderPrompt(stepInput) {
  return [
    "Generate specific, actionable accessibility remediation recommendations for the identified issues below.",
    "Each recommendation must reference a real Lighthouse audit ID present in the analysis findings.",
    "Implementation guide should be specific enough for a developer to act on: code patterns, ARIA attributes, semantic HTML.",
    "Effort: low (simple HTML/CSS change), medium (multiple elements or script change), high (structural refactor).",
    "Return JSON only matching the schema.",
    "",
    `Page URL: ${stepInput.url || "unknown"}`,
    `Analysis findings: ${JSON.stringify((stepInput.findings || []).slice(0, 10))}`,
    `Extracted audits: ${JSON.stringify((stepInput.extractedAudits || {}))}`
  ].join("\n");
}

function buildSeoAnalyzerPrompt(stepInput) {
  return [
    "Analyze the Lighthouse SEO audit results below.",
    "For each failing audit, describe the search visibility impact and why it matters.",
    "Use only supplied Lighthouse audit IDs and titles. Do not invent audits.",
    "Severity: critical (deindexing risk), high (significant ranking impact), medium (moderate impact), low (minor).",
    "Return JSON only matching the schema.",
    "",
    `Page URL: ${stepInput.url || "unknown"}`,
    `Failing audits: ${stepInput.failCount || 0}`,
    `Extracted audits: ${JSON.stringify((stepInput.failures || []).slice(0, 10))}`
  ].join("\n");
}

function buildSeoRecommenderPrompt(stepInput) {
  return [
    "Generate prioritized SEO fix recommendations for the identified issues below.",
    "Each recommendation must reference a real Lighthouse audit ID present in the analysis findings.",
    "Priority: high (immediate search impact), medium (important but not blocking), low (nice to have).",
    "Rationale should explain the search engine behavior and ranking impact.",
    "Return JSON only matching the schema.",
    "",
    `Page URL: ${stepInput.url || "unknown"}`,
    `Analysis findings: ${JSON.stringify((stepInput.findings || []).slice(0, 10))}`,
    `Extracted audits: ${JSON.stringify((stepInput.extractedAudits || {}))}`
  ].join("\n");
}

function buildBudgetAnalyzerPrompt(stepInput) {
  return [
    "Analyze the Lighthouse performance audit results and identify budget gaps.",
    "Compare current metric values against reasonable performance budget targets.",
    "Use only supplied Lighthouse audit IDs and scores. Do not invent metrics.",
    "Target budgets: LCP < 2.5s, FCP < 1.8s, TBT < 200ms, CLS < 0.1, Speed Index < 3.4s, total JS < 300KB, total images < 1MB.",
    "Gap severity: critical (>> 2x target), significant (> 1.5x target), moderate (exceeds target), within_budget.",
    "Return JSON only matching the schema.",
    "",
    `Page URL: ${stepInput.url || "unknown"}`,
    `Scores: ${JSON.stringify(stepInput.scores || {})}`,
    `Audit count: ${stepInput.auditCount || 0}`,
    `Extracted audits: ${JSON.stringify((stepInput.failures || []).slice(0, 15))}`
  ].join("\n");
}

function buildBudgetRecommenderPrompt(stepInput) {
  return [
    "Generate performance budget rules and an enforcement strategy based on the budget gap analysis below.",
    "Each budget rule must reference a real Lighthouse audit or metric present in the analysis.",
    "Budget rules should be specific, measurable thresholds suitable for CI/CD enforcement.",
    "Enforcement strategy: how to integrate budgets into the build pipeline (Lighthouse CI, WebPageTest, custom check).",
    "Condition: less_than (metric must be below), greater_than (metric must be above), equals.",
    "Return JSON only matching the schema.",
    "",
    `Page URL: ${stepInput.url || "unknown"}`,
    `Scores: ${JSON.stringify(stepInput.scores || {})}`,
    `Budget gaps: ${JSON.stringify((stepInput.budgetGaps || []).slice(0, 10))}`,
    `Extracted audits: ${JSON.stringify((stepInput.extractedAudits || {}))}`
  ].join("\n");
}

function buildOperatorLogPrompt(stepInput) {
  const publishDate = stepInput.publishDate || new Date().toISOString().slice(0, 10);
  return [
    "You are the Operator Log editor for Lemonteed. Write a complete static HTML entry from the selected evidence packet.",
    "Use only supplied facts. If evidence is insufficient, state uncertainty in the prose; never fabricate a result or link.",
    "Voice: terse, direct, first person, specific about decisions and dead ends, never self-congratulatory.",
    "Banned phrases: 'I'm excited to share', 'In this post, we'll explore', 'This journey taught me'.",
    "Headline says what happened, not what the project is.",
    "Required section order: transmission metadata, headline, The problem, What I did, The weird part, What's next, links out.",
    "The weird part must be a genuine unexpected, counterintuitive, or funny observation grounded in evidence.",
    "Write at least 300 words of real prose, with no padding.",
    "HTML requirements: doctype, lang=en, charset, viewport, title, <=150 character meta description, canonical URL, Open Graph article metadata, one H1, semantic article sections.",
    "Canonical URL format: https://lemonteed.com/operator-log/[slug]/. Slug must be lowercase, descriptive, and hyphenated.",
    `Publish date: ${publishDate}`,
    `Zone URL: ${stepInput.zoneUrl || "not supplied"}`,
    `Tool URL: ${stepInput.toolUrl || "not supplied"}`,
    "Include only links that were supplied. Keep supportingFiles in the JSON result as an evidence receipt, not in public HTML.",
    "Return sitemapEntry as one <url> XML fragment with changefreq never and priority 0.6.",
    "Return JSON only matching the schema.",
    "",
    `Selected opportunity: ${JSON.stringify(stepInput.opportunity || {})}`,
    `Evidence excerpts: ${JSON.stringify(stepInput.evidence || [])}`
  ].join("\n");
}

const PROMPT_TEMPLATES = {
  classify_issues(context) {
    const input = context.input || {};
    return [
      "Analyze the following Lighthouse opportunities and diagnostics.",
      "Classify each opportunity into categories (performance, accessibility, bestPractices, seo)",
      "and assign a severity level (low, medium, high). Return JSON only conforming to the schema.",
      `Opportunities: ${JSON.stringify(input.opportunities || [])}`,
      `Diagnostics: ${JSON.stringify(input.diagnostics || [])}`
    ].join("\n");
  },
  prioritize_fixes(_context, stepInput) {
    if (!stepInput || typeof stepInput !== "object") {
      throw new Error("prioritize_fixes requires step input resolved from input_map.");
    }

    return buildPrioritizeFixesPrompt(stepInput);
  },
  write_developer_tasks(_context, stepInput) {
    return buildDeveloperTaskWriterPrompt(stepInput || {});
  },
  write_guardrails(_context, stepInput) {
    return buildGuardrailWriterPrompt(stepInput || {});
  },
  write_testing_checklist(_context, stepInput) {
    return buildTestingChecklistWriterPrompt(stepInput || {});
  },
  rank_editorial_opportunities(_context, stepInput) {
    return buildRankEditorialOpportunitiesPrompt(stepInput || {});
  },
  write_operator_log(_context, stepInput) {
    return buildOperatorLogPrompt(stepInput || {});
  },
  analyze_a11y(_context, stepInput) {
    return buildA11yAnalyzerPrompt(stepInput || {});
  },
  recommend_a11y(_context, stepInput) {
    return buildA11yRecommenderPrompt(stepInput || {});
  },
  analyze_seo(_context, stepInput) {
    return buildSeoAnalyzerPrompt(stepInput || {});
  },
  recommend_seo(_context, stepInput) {
    return buildSeoRecommenderPrompt(stepInput || {});
  },
  analyze_budget(_context, stepInput) {
    return buildBudgetAnalyzerPrompt(stepInput || {});
  },
  recommend_budget(_context, stepInput) {
    return buildBudgetRecommenderPrompt(stepInput || {});
  }
};

function buildPrompt(templateKey, context, stepInput) {
  const builder = PROMPT_TEMPLATES[templateKey];

  if (!builder) {
    throw new Error(`Unknown prompt template '${templateKey}'.`);
  }

  return builder(context, stepInput);
}

module.exports = {
  buildPrompt,
  buildPrioritizeFixesPrompt,
  buildDeveloperTaskWriterPrompt,
  buildGuardrailWriterPrompt,
  buildTestingChecklistWriterPrompt,
  buildA11yAnalyzerPrompt,
  buildA11yRecommenderPrompt,
  buildSeoAnalyzerPrompt,
  buildSeoRecommenderPrompt,
  buildBudgetAnalyzerPrompt,
  buildBudgetRecommenderPrompt,
  buildRankEditorialOpportunitiesPrompt,
  buildOperatorLogPrompt,
  PROMPT_TEMPLATES
};
