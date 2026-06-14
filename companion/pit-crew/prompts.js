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
  prioritize_fixes(context) {
    const classified = context.artifacts.classify_issues || {};
    const input = context.input || {};
    const scores = input.scores || {};
    return [
      "Review the classified Lighthouse issues below.",
      "Select the top critical priority fixes (max 3) and explain the reason for each.",
      "Return JSON only conforming to the schema.",
      "",
      'In "thinking", write a 2-4 sentence executive summary for a developer.',
      "Include: page URL, weakest Lighthouse category/score, and the top priority theme.",
      "Mention the top 2-3 fix areas by plain-language theme.",
      'Do not use filler phrases like "Based on the severity of each issue".',
      "Do not restate that you are analyzing the report.",
      "Make it useful as the Executive Summary section of a coding-agent handoff.",
      "",
      `Page URL: ${input.url || "unknown"}`,
      `Scores: ${JSON.stringify(scores)}`,
      `Classified Issues: ${JSON.stringify(classified.issues || [])}`
    ].join("\n");
  }
};

function buildPrompt(templateKey, context) {
  const builder = PROMPT_TEMPLATES[templateKey];

  if (!builder) {
    throw new Error(`Unknown prompt template '${templateKey}'.`);
  }

  return builder(context);
}

module.exports = {
  buildPrompt,
  PROMPT_TEMPLATES
};
