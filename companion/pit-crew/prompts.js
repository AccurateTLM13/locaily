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
  PROMPT_TEMPLATES
};
