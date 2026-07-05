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
  prioritize_fixes(context, stepInput) {
    if (stepInput && typeof stepInput === "object") {
      return buildPrioritizeFixesPrompt(stepInput);
    }

    /**
     * @deprecated Legacy path reads broad track context directly.
     * Remove when all model steps declare input_map in track JSON.
     */
    const classified = context.artifacts.classify_issues || {};
    const input = context.input || {};

    return buildPrioritizeFixesPrompt({
      url: input.url,
      scores: input.scores || {},
      rankedOpportunities: classified.rankedOpportunities || [],
      classifiedIssues: classified.issues || []
    });
  },
  rank_editorial_opportunities(_context, stepInput) {
    return buildRankEditorialOpportunitiesPrompt(stepInput || {});
  },
  write_operator_log(_context, stepInput) {
    return buildOperatorLogPrompt(stepInput || {});
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
  buildRankEditorialOpportunitiesPrompt,
  buildOperatorLogPrompt,
  PROMPT_TEMPLATES
};
