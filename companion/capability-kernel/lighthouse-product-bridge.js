const ALLOWED_ORIGIN_PATTERNS = [
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
  /^http:\/\/localhost(:\d+)?$/,
  /^chrome-extension:\/\/[a-z0-9]+$/
];

function validateCorsOrigin(origin) {
  if (!origin) return false;
  return ALLOWED_ORIGIN_PATTERNS.some(pattern => pattern.test(origin));
}

function convertPagespeedToMarkdown(pagespeedData, options = {}) {
  if (!pagespeedData || (typeof pagespeedData !== "object")) {
    if (!options.demo && !options.fixture) {
      throw new Error("INVALID_AUDIT_INPUT: PageSpeed data must be a valid object.");
    }
  }

  const isDemo = Boolean(options.demo || options.fixture);
  const url = pagespeedData?.url || pagespeedData?.requestedUrl || (isDemo ? "https://example.com" : null);

  if (!url) {
    throw new Error("INVALID_AUDIT_INPUT: Missing target URL in PageSpeed audit data.");
  }

  const defaultScores = isDemo ? { performance: 85, accessibility: 92, seo: 95, best_practices: 90 } : { performance: 0, accessibility: 0, seo: 0, best_practices: 0 };
  const scores = pagespeedData?.scores || defaultScores;
  const issues = pagespeedData?.issues || (isDemo ? [
    { id: "color-contrast", category: "accessibility", title: "Background and foreground colors do not have a sufficient contrast ratio.", score: 0.5 },
    { id: "render-blocking-resources", category: "performance", title: "Eliminate render-blocking resources", score: 0.2 }
  ] : []);

  const lines = [];
  lines.push(`# Lighthouse Handoff Audit Report`);
  lines.push(`\n**Target URL:** ${url}`);
  lines.push(`**Generated:** ${new Date().toISOString()}\n`);

  lines.push(`## Audit Scores`);
  lines.push(`- **Performance:** ${scores.performance}/100`);
  lines.push(`- **Accessibility:** ${scores.accessibility}/100`);
  lines.push(`- **SEO:** ${scores.seo}/100`);
  lines.push(`- **Best Practices:** ${scores.best_practices}/100\n`);

  lines.push(`## Key Issues`);
  if (issues.length === 0) {
    lines.push(`- No critical issues identified.`);
  } else {
    for (const issue of issues) {
      const icon = issue.score < 0.5 ? "🔴" : "🟡";
      lines.push(`- ${icon} **[${issue.category ? issue.category.toUpperCase() : "GENERAL"}]** ${issue.title}`);
    }
  }

  return lines.join("\n");
}

function enhanceReportWithLocalAI(reportMarkdown, aiSummary = null, options = {}) {
  const isDemo = Boolean(options.demo || options.fixture);
  let summaryBlock = aiSummary;

  if (!summaryBlock) {
    if (isDemo) {
      summaryBlock = [
        `\n## 🤖 Local AI Recommendations`,
        `> [!IMPORTANT]`,
        `> 1. Fix color contrast issues to achieve WCAG AA compliance.`,
        `> 2. Defer non-critical CSS/JS to improve First Contentful Paint (FCP).`
      ].join("\n");
    } else {
      summaryBlock = [
        `\n## 🤖 Local AI Recommendations`,
        `> [!NOTE]`,
        `> AI enhancement unavailable.`
      ].join("\n");
    }
  }

  return `${reportMarkdown}\n\n${summaryBlock}\n`;
}

module.exports = {
  validateCorsOrigin,
  convertPagespeedToMarkdown,
  enhanceReportWithLocalAI
};
