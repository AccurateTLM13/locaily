function formatHandoffMarkdown(handoff) {
  if (!handoff || typeof handoff !== "object") {
    return "";
  }

  const url = handoff.url || "unknown-url";
  const summary = handoff.developerSummary || handoff.clientSummary || "No summary provided.";
  const priorityFixes = Array.isArray(handoff.priorityFixes) ? handoff.priorityFixes : [];
  const checklist = Array.isArray(handoff.handoffChecklist) ? handoff.handoffChecklist : [];
  const impact = handoff.estimatedImpact || "Medium";

  const priorityLines = priorityFixes.length > 0
    ? priorityFixes.map((fix, index) => {
      const label = String(fix.priority || "medium").toUpperCase();
      return `${index + 1}. **${fix.title}** (${label}) — ${fix.reason || "No reason provided."}`;
    }).join("\n")
    : "1. No priority fixes identified.";

  const checklistLines = checklist.length > 0
    ? checklist.map((item) => `- [ ] ${item}`).join("\n")
    : "- [ ] Review Lighthouse findings manually.";

  const sections = [
    `# Developer Handoff: ${url}`,
    "",
    "## Executive Summary",
    summary,
    ""
  ];

  if (handoff.projectContextSection) {
    sections.push(
      "## Project Context Used",
      handoff.projectContextSection,
      ""
    );
  }

  sections.push(
    "## Priority Fixes",
    priorityLines,
    ""
  );

  if (Array.isArray(handoff.needsReview) && handoff.needsReview.length > 0) {
    const reviewLines = handoff.needsReview.map((fix, index) => {
      const label = String(fix.priority || "medium").toUpperCase();
      return `${index + 1}. **${fix.title}** (${label}) — ${fix.reason || "Needs review before implementation."}`;
    }).join("\n");

    sections.push(
      "## Needs Review",
      "These model-suggested fixes were not confirmed against measured Lighthouse audit data.",
      reviewLines,
      ""
    );
  }

  sections.push(
    "## Implementation Checklist",
    checklistLines,
    "",
    "## Verification",
    `- Re-run Lighthouse on ${url}`,
    `- Target estimated impact: ${impact}`,
    "",
    "## Agent Instructions",
    handoff.memoryUsed
      ? "Use this handoff to implement fixes. Project memory informed constraints only; Lighthouse/PageSpeed metrics remain authoritative. Do not modify unrelated files."
      : "Use this handoff to implement fixes. Do not modify unrelated files."
  );

  return sections.join("\n");
}

module.exports = {
  formatHandoffMarkdown
};
