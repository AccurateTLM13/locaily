const SCENARIO_REGISTRY = [];

function defineScenario(def) { SCENARIO_REGISTRY.push(def); return def; }

function systemPrompt() {
  return [
    "You are the priority_helper for a Lighthouse Handoff workflow.",
    "Review the structured Lighthouse findings below and produce a prioritized enhancement.",
    "Rules:",
    "- Every priority issue must reference an audit ID present in the input.",
    "- Do not invent metrics, scores, technologies, CMS, frameworks, plugins, servers, CDNs, or hosting details.",
    "- Do not promise specific score improvements.",
    "- Do not give vague advice like 'optimize performance'.",
    "- Be specific about implementation steps.",
    "- If the input does not prove the root cause, say so in needsInspection.",
    "- Label assumptions explicitly in the assumptions field.",
    "- Return JSON only matching the schema.",
    ""
  ].join("\n");
}

function buildPrompt(caseData) {
  const parts = [systemPrompt()];
  parts.push(`URL: ${caseData.url}`);
  parts.push(`Strategy: ${caseData.strategy}`);
  parts.push(`\nScores:\n${JSON.stringify(caseData.scores, null, 2)}`);
  parts.push(`\nMetrics:\n${JSON.stringify(caseData.metrics, null, 2)}`);
  parts.push(`\nAudits:\n${JSON.stringify(caseData.audits, null, 2)}`);
  if (caseData.knownConstraints && caseData.knownConstraints.length > 0) {
    parts.push(`\nKnown Constraints:\n${caseData.knownConstraints.map(c => `- ${c}`).join("\n")}`);
  }
  parts.push("\nProduce a JSON object with: summary (string), priorityIssues (array of {auditId, priority: critical|high|medium|low, reason, recommendedAction, risk|null, verification}), guardrails (string[]), assumptions (string[]), needsInspection (string[]).");
  return parts.join("\n");
}

// ============================================================
// CASE 1: Severe LCP caused by a hero image
// ============================================================
defineScenario({
  id: "lh-priority-001",
  title: "Severe LCP caused by hero image",
  category: "performance",
  difficulty: "medium",
  data: {
    url: "https://example.com/landing",
    strategy: "mobile",
    scores: { performance: 28, accessibility: 85, bestPractices: 92, seo: 95 },
    metrics: { lcp: "8.2s", cls: "0.02", inp: "210ms", fcp: "4.1s", tbt: "680ms" },
    audits: [
      { id: "largest-contentful-paint-element", title: "Largest Contentful Paint element", severity: "high", details: { element: "img.hero-banner", url: "https://example.com/assets/hero-2400.webp", displaySize: "1200x600", actualSize: "2400x1200" } },
      { id: "render-blocking-resources", title: "Eliminate render-blocking resources", severity: "high", details: { resources: [{ url: "style.css", deltaMs: 1200 }, { url: "font-awesome.css", deltaMs: 600 }] } },
      { id: "uses-responsive-images", title: "Properly size images", severity: "medium", details: { items: [{ url: "https://example.com/assets/hero-2400.webp", actualSize: "2400", displaySize: "1200" }] } },
      { id: "offscreen-images", title: "Defer offscreen images", severity: "medium", details: { items: [{ url: "https://example.com/assets/banner2.jpg" }] } },
      { id: "unused-css-rules", title: "Reduce unused CSS", severity: "low", details: { wasteBytes: 35000 } },
      { id: "uses-optimized-images", title: "Efficiently encode images", severity: "low", details: { items: [{ url: "https://example.com/assets/hero-2400.webp", totalBytes: 450000 }] } }
    ]
  },
  expectedTopIssues: ["largest-contentful-paint-element", "render-blocking-resources"],
  evaluate(output, caseData) {
    return evaluateGeneric(output, caseData, {
      requiredAuditIds: ["largest-contentful-paint-element", "render-blocking-resources"],
      autoFails: ["MISSING_ALL_HIGH_SEVERITY"],
      prohibitTech: ["WordPress", "Shopify", "React", "Angular", "Vue", "jQuery", "Apache", "Nginx", "CloudFlare", "CDN"],
      mustFlag: "hero image"
    });
  }
});

// ============================================================
// CASE 2: Render-blocking CSS and JavaScript
// ============================================================
defineScenario({
  id: "lh-priority-002",
  title: "Render-blocking CSS and JavaScript",
  category: "performance",
  difficulty: "medium",
  data: {
    url: "https://example.com/blog/post",
    strategy: "mobile",
    scores: { performance: 35, accessibility: 90, bestPractices: 88, seo: 92 },
    metrics: { lcp: "5.1s", cls: "0.08", inp: "190ms", fcp: "3.2s", tbt: "520ms" },
    audits: [
      { id: "render-blocking-resources", title: "Eliminate render-blocking resources", severity: "high", details: { resources: [{ url: "bootstrap.css", deltaMs: 1800 }, { url: "custom-theme.css", deltaMs: 900 }, { url: "analytics.js", deltaMs: 400 }] } },
      { id: "unused-javascript", title: "Remove unused JavaScript", severity: "high", details: { totalBytes: 520000, wastedBytes: 350000 } },
      { id: "first-contentful-paint", title: "First Contentful Paint", severity: "medium", details: { value: "3.2s" } },
      { id: "largest-contentful-paint-element", title: "Largest Contentful Paint element", severity: "medium", details: { element: "div.post-content" } },
      { id: "speed-index", title: "Speed Index", severity: "medium", details: { value: "7.1s" } },
      { id: "total-blocking-time", title: "Total Blocking Time", severity: "low", details: { value: "520ms" } }
    ]
  },
  expectedTopIssues: ["render-blocking-resources", "unused-javascript"],
  evaluate(output, caseData) {
    return evaluateGeneric(output, caseData, {
      requiredAuditIds: ["render-blocking-resources", "unused-javascript"],
      autoFails: ["MISSING_ALL_HIGH_SEVERITY"],
      prohibitTech: ["WordPress", "Shopify", "jQuery", "Apache", "Nginx"],
      mustFlag: "render-blocking"
    });
  }
});

// ============================================================
// CASE 3: Third-party script impact
// ============================================================
defineScenario({
  id: "lh-priority-003",
  title: "Third-party script impact",
  category: "performance",
  difficulty: "medium",
  data: {
    url: "https://example.com/shop",
    strategy: "mobile",
    scores: { performance: 32, accessibility: 78, bestPractices: 85, seo: 88 },
    metrics: { lcp: "6.4s", cls: "0.12", inp: "320ms", fcp: "3.8s", tbt: "890ms" },
    audits: [
      { id: "third-party-summary", title: "Minimize third-party usage", severity: "high", details: { items: [
        { entity: "Google Analytics", transferSize: 45000, blockingTime: 180 },
        { entity: "Facebook Pixel", transferSize: 38000, blockingTime: 220 },
        { entity: "Hotjar", transferSize: 52000, blockingTime: 310 },
        { entity: "AdSense", transferSize: 120000, blockingTime: 650 }
      ] } },
      { id: "total-blocking-time", title: "Total Blocking Time", severity: "high", details: { value: "890ms" } },
      { id: "bootup-time", title: "JavaScript boot-up time", severity: "medium", details: { value: "1200ms" } },
      { id: "mainthread-work-breakdown", title: "Minimize main-thread work", severity: "medium", details: { value: "3.2s" } },
      { id: "render-blocking-resources", title: "Eliminate render-blocking resources", severity: "medium", details: { resources: [{ url: "analytics.js", deltaMs: 450 }] } },
      { id: "uses-rel-preconnect", title: "Preconnect to required origins", severity: "low", details: { items: [{ url: "https://www.google-analytics.com" }] } }
    ],
    knownConstraints: ["Do not recommend removing analytics without stakeholder review"]
  },
  expectedTopIssues: ["third-party-summary", "total-blocking-time"],
  evaluate(output, caseData) {
    return evaluateGeneric(output, caseData, {
      requiredAuditIds: ["third-party-summary"],
      autoFails: ["CONSTRAINT_CONFLICT"],
      prohibitTech: ["Shopify theme", "WordPress plugin", "Apache", "Nginx"],
      mustFlag: "third-party",
      constraints: ["Do not recommend removing analytics without stakeholder review"]
    });
  }
});

// ============================================================
// CASE 4: Excessive unused JavaScript
// ============================================================
defineScenario({
  id: "lh-priority-004",
  title: "Excessive unused JavaScript",
  category: "performance",
  difficulty: "medium",
  data: {
    url: "https://example.com/dashboard",
    strategy: "mobile",
    scores: { performance: 22, accessibility: 82, bestPractices: 90, seo: 94 },
    metrics: { lcp: "7.8s", cls: "0.03", inp: "450ms", fcp: "4.5s", tbt: "2100ms" },
    audits: [
      { id: "unused-javascript", title: "Remove unused JavaScript", severity: "high", details: { totalBytes: 1800000, wastedBytes: 1400000, items: [
        { url: "chart.js", totalBytes: 320000, wastedBytes: 280000 },
        { url: "moment.js", totalBytes: 240000, wastedBytes: 210000 },
        { url: "lodash.js", totalBytes: 180000, wastedBytes: 120000 },
        { url: "bootstrap.bundle.js", totalBytes: 400000, wastedBytes: 350000 }
      ] } },
      { id: "total-blocking-time", title: "Total Blocking Time", severity: "high", details: { value: "2100ms" } },
      { id: "bootup-time", title: "JavaScript boot-up time", severity: "high", details: { value: "3200ms" } },
      { id: "mainthread-work-breakdown", title: "Minimize main-thread work", severity: "high", details: { value: "5.1s" } },
      { id: "dom-size", title: "Avoid an excessive DOM size", severity: "medium", details: { value: 1800 } },
      { id: "user-timings", title: "User Timing marks and measures", severity: "low", details: {} }
    ]
  },
  expectedTopIssues: ["unused-javascript", "total-blocking-time", "bootup-time"],
  evaluate(output, caseData) {
    return evaluateGeneric(output, caseData, {
      requiredAuditIds: ["unused-javascript", "total-blocking-time", "bootup-time"],
      autoFails: ["MISSING_ALL_HIGH_SEVERITY"],
      prohibitTech: ["WordPress", "Shopify", "React", "Angular"],
      mustFlag: "unused JavaScript"
    });
  }
});

// ============================================================
// CASE 5: Image format and compression opportunities
// ============================================================
defineScenario({
  id: "lh-priority-005",
  title: "Image format and compression opportunities",
  category: "performance",
  difficulty: "easy",
  data: {
    url: "https://example.com/gallery",
    strategy: "mobile",
    scores: { performance: 45, accessibility: 91, bestPractices: 95, seo: 97 },
    metrics: { lcp: "3.8s", cls: "0.01", inp: "150ms", fcp: "2.1s", tbt: "340ms" },
    audits: [
      { id: "uses-optimized-images", title: "Efficiently encode images", severity: "high", details: { items: [
        { url: "https://example.com/img/photo1.jpg", totalBytes: 280000, wastedBytes: 180000 },
        { url: "https://example.com/img/photo2.png", totalBytes: 420000, wastedBytes: 300000 },
        { url: "https://example.com/img/photo3.jpg", totalBytes: 150000, wastedBytes: 80000 }
      ] } },
      { id: "modern-image-formats", title: "Serve images in next-gen formats", severity: "high", details: { items: [
        { url: "https://example.com/img/photo1.jpg", totalBytes: 280000 },
        { url: "https://example.com/img/photo2.png", totalBytes: 420000 }
      ] } },
      { id: "uses-responsive-images", title: "Properly size images", severity: "medium", details: { items: [
        { url: "https://example.com/img/photo1.jpg", actualSize: "2400", displaySize: "800" }
      ] } },
      { id: "offscreen-images", title: "Defer offscreen images", severity: "low", details: { items: [
        { url: "https://example.com/img/below-fold.jpg" }
      ] } },
      { id: "largest-contentful-paint-element", title: "Largest Contentful Paint element", severity: "medium", details: { element: "img.hero" } }
    ]
  },
  expectedTopIssues: ["uses-optimized-images", "modern-image-formats"],
  evaluate(output, caseData) {
    return evaluateGeneric(output, caseData, {
      requiredAuditIds: ["uses-optimized-images", "modern-image-formats"],
      prohibitTech: ["WordPress", "Shopify", "Apache", "Nginx"],
      mustFlag: "next-gen format|WebP|AVIF"
    });
  }
});

// ============================================================
// CASE 6: Font loading issues
// ============================================================
defineScenario({
  id: "lh-priority-006",
  title: "Font loading issues",
  category: "performance",
  difficulty: "easy",
  data: {
    url: "https://example.com/typography",
    strategy: "mobile",
    scores: { performance: 55, accessibility: 93, bestPractices: 90, seo: 96 },
    metrics: { lcp: "3.2s", cls: "0.15", inp: "120ms", fcp: "1.8s", tbt: "180ms" },
    audits: [
      { id: "font-display", title: "Ensure text remains visible during webfont load", severity: "high", details: { items: [
        { url: "https://fonts.googleapis.com/css2?family=Roboto", wastedMs: 600 },
        { url: "https://fonts.googleapis.com/css2?family=Open+Sans", wastedMs: 400 }
      ] } },
      { id: "uses-rel-preconnect", title: "Preconnect to required origins", severity: "medium", details: { items: [
        { url: "https://fonts.googleapis.com" },
        { url: "https://fonts.gstatic.com" }
      ] } },
      { id: "layout-shift-elements", title: "Avoid large layout shifts", severity: "medium", details: { items: [{ node: "div.text-content", score: 0.08 }] } },
      { id: "cumulative-layout-shift", title: "Cumulative Layout Shift", severity: "medium", details: { value: "0.15" } },
      { id: "largest-contentful-paint-element", title: "Largest Contentful Paint element", severity: "low", details: { element: "h1.title" } }
    ]
  },
  expectedTopIssues: ["font-display", "uses-rel-preconnect"],
  evaluate(output, caseData) {
    return evaluateGeneric(output, caseData, {
      requiredAuditIds: ["font-display"],
      prohibitTech: ["WordPress", "Shopify", "jQuery", "Apache"],
      mustFlag: "font"
    });
  }
});

// ============================================================
// CASE 7: Mostly healthy page with minor issues
// ============================================================
defineScenario({
  id: "lh-priority-007",
  title: "Mostly healthy page with minor issues",
  category: "mixed",
  difficulty: "easy",
  data: {
    url: "https://example.com/healthy",
    strategy: "mobile",
    scores: { performance: 88, accessibility: 95, bestPractices: 100, seo: 100 },
    metrics: { lcp: "1.8s", cls: "0.02", inp: "80ms", fcp: "1.1s", tbt: "95ms" },
    audits: [
      { id: "uses-passive-event-listeners", title: "Use passive listeners to improve scrolling performance", severity: "low", details: {} },
      { id: "no-document-write", title: "Avoids document.write()", severity: "low", details: {} },
      { id: "server-response-time", title: "Initial server response time was short", severity: "low", details: { value: "0.4s" } },
      { id: "render-blocking-resources", title: "Eliminate render-blocking resources", severity: "low", details: { resources: [] } },
      { id: "uses-http2", title: "Use HTTP/2", severity: "low", details: { items: [] } }
    ],
    knownConstraints: ["Do not recommend changes that would degrade the user experience"]
  },
  expectedTopIssues: [],
  evaluate(output, caseData) {
    return evaluateGeneric(output, caseData, {
      requiredAuditIds: [],
      expectMinIssues: 0,
      expectMaxIssues: 3,
      autoFails: ["SCORE_INCREASE_GUARANTEE"],
      prohibitClaim: "score increase"
    });
  }
});

// ============================================================
// CASE 8: Mixed mobile performance issues
// ============================================================
defineScenario({
  id: "lh-priority-008",
  title: "Mixed mobile performance issues",
  category: "performance",
  difficulty: "medium",
  data: {
    url: "https://example.com/mobile-app",
    strategy: "mobile",
    scores: { performance: 38, accessibility: 72, bestPractices: 80, seo: 85 },
    metrics: { lcp: "5.9s", cls: "0.18", inp: "280ms", fcp: "3.5s", tbt: "950ms" },
    audits: [
      { id: "render-blocking-resources", title: "Eliminate render-blocking resources", severity: "high", details: { resources: [{ url: "app.bundle.css", deltaMs: 2100 }, { url: "vendor.bundle.css", deltaMs: 1500 }] } },
      { id: "unused-javascript", title: "Remove unused JavaScript", severity: "high", details: { totalBytes: 920000, wastedBytes: 620000 } },
      { id: "total-blocking-time", title: "Total Blocking Time", severity: "high", details: { value: "950ms" } },
      { id: "bootup-time", title: "JavaScript boot-up time", severity: "high", details: { value: "1800ms" } },
      { id: "largest-contentful-paint-element", title: "Largest Contentful Paint element", severity: "medium", details: { element: "div.hero-image" } },
      { id: "offscreen-images", title: "Defer offscreen images", severity: "medium", details: { items: [{ url: "hero.jpg" }, { url: "feature-icon.png" }] } },
      { id: "mainthread-work-breakdown", title: "Minimize main-thread work", severity: "medium", details: { value: "4.2s" } },
      { id: "dom-size", title: "Avoid an excessive DOM size", severity: "medium", details: { value: 2100 } },
      { id: "network-rtt", title: "Network Round Trip Times", severity: "low", details: { value: "180ms" } },
      { id: "network-server-latency", title: "Server latency", severity: "low", details: { value: "350ms" } }
    ]
  },
  expectedTopIssues: ["render-blocking-resources", "unused-javascript", "total-blocking-time"],
  evaluate(output, caseData) {
    return evaluateGeneric(output, caseData, {
      requiredAuditIds: ["render-blocking-resources", "unused-javascript", "total-blocking-time"],
      autoFails: ["MISSING_ALL_HIGH_SEVERITY"],
      prohibitTech: ["WordPress", "Shopify", "React", "Angular", "Vue", "Apache", "Nginx"],
      mustFlag: "render-blocking"
    });
  }
});

// ============================================================
// CASE 9: WordPress-style asset bloat
// ============================================================
defineScenario({
  id: "lh-priority-009",
  title: "WordPress-style asset bloat",
  category: "performance",
  difficulty: "medium",
  data: {
    url: "https://example.com/wp-blog",
    strategy: "mobile",
    scores: { performance: 18, accessibility: 68, bestPractices: 72, seo: 82 },
    metrics: { lcp: "9.5s", cls: "0.35", inp: "520ms", fcp: "5.2s", tbt: "3200ms" },
    audits: [
      { id: "render-blocking-resources", title: "Eliminate render-blocking resources", severity: "high", details: { resources: [
        { url: "wp-content/themes/theme/style.css", deltaMs: 2400 },
        { url: "wp-includes/css/dashicons.css", deltaMs: 800 },
        { url: "wp-content/plugins/plugin1/css/front.css", deltaMs: 600 },
        { url: "wp-content/plugins/plugin2/css/style.css", deltaMs: 500 }
      ] } },
      { id: "unused-javascript", title: "Remove unused JavaScript", severity: "high", details: { totalBytes: 2100000, wastedBytes: 1700000 } },
      { id: "unused-css-rules", title: "Reduce unused CSS", severity: "high", details: { wasteBytes: 520000 } },
      { id: "total-blocking-time", title: "Total Blocking Time", severity: "high", details: { value: "3200ms" } },
      { id: "bootup-time", title: "JavaScript boot-up time", severity: "high", details: { value: "4200ms" } },
      { id: "mainthread-work-breakdown", title: "Minimize main-thread work", severity: "high", details: { value: "7.8s" } },
      { id: "dom-size", title: "Avoid an excessive DOM size", severity: "high", details: { value: 4500 } },
      { id: "offscreen-images", title: "Defer offscreen images", severity: "medium", details: { items: [{ url: "wp-content/uploads/image.jpg" }, { url: "wp-content/uploads/featured.png" }] } },
      { id: "uses-optimized-images", title: "Efficiently encode images", severity: "medium", details: { items: [{ url: "wp-content/uploads/hero.jpg", totalBytes: 380000 }] } },
      { id: "modern-image-formats", title: "Serve images in next-gen formats", severity: "low", details: { items: [{ url: "wp-content/uploads/hero.jpg", totalBytes: 380000 }] } }
    ],
    knownConstraints: ["Do not assume server access or admin panel access"]
  },
  expectedTopIssues: ["render-blocking-resources", "unused-javascript", "unused-css-rules"],
  evaluate(output, caseData) {
    return evaluateGeneric(output, caseData, {
      requiredAuditIds: ["render-blocking-resources", "unused-javascript", "unused-css-rules"],
      autoFails: ["MISSING_ALL_HIGH_SEVERITY", "CONSTRAINT_CONFLICT"],
      prohibitTech: ["Shopify", "React", "Angular", "Vue"],
      mustFlag: "render-blocking",
      constraints: ["Do not assume server access or admin panel access"]
    });
  }
});

// ============================================================
// CASE 10: Shopify-style third-party and theme overhead
// ============================================================
defineScenario({
  id: "lh-priority-010",
  title: "Shopify-style third-party and theme overhead",
  category: "performance",
  difficulty: "medium",
  data: {
    url: "https://example-store.com/product",
    strategy: "mobile",
    scores: { performance: 25, accessibility: 75, bestPractices: 78, seo: 90 },
    metrics: { lcp: "7.2s", cls: "0.22", inp: "380ms", fcp: "4.0s", tbt: "1500ms" },
    audits: [
      { id: "third-party-summary", title: "Minimize third-party usage", severity: "high", details: { items: [
        { entity: "Shopify Analytics", transferSize: 55000, blockingTime: 200 },
        { entity: "Facebook Pixel", transferSize: 38000, blockingTime: 220 },
        { entity: "TikTok Pixel", transferSize: 32000, blockingTime: 180 },
        { entity: "Google Tag Manager", transferSize: 25000, blockingTime: 150 },
        { entity: "Recharge", transferSize: 78000, blockingTime: 350 },
        { entity: "Judge.me", transferSize: 42000, blockingTime: 190 }
      ] } },
      { id: "unused-javascript", title: "Remove unused JavaScript", severity: "high", details: { totalBytes: 1500000, wastedBytes: 1100000 } },
      { id: "render-blocking-resources", title: "Eliminate render-blocking resources", severity: "high", details: { resources: [
        { url: "theme.css", deltaMs: 1800 },
        { url: "product.css", deltaMs: 1200 },
        { url: "apps.css", deltaMs: 900 }
      ] } },
      { id: "total-blocking-time", title: "Total Blocking Time", severity: "high", details: { value: "1500ms" } },
      { id: "bootup-time", title: "JavaScript boot-up time", severity: "high", details: { value: "2800ms" } },
      { id: "mainthread-work-breakdown", title: "Minimize main-thread work", severity: "high", details: { value: "5.5s" } },
      { id: "dom-size", title: "Avoid an excessive DOM size", severity: "medium", details: { value: 3200 } },
      { id: "uses-optimized-images", title: "Efficiently encode images", severity: "medium", details: { items: [{ url: "cdn.shopify.com/product.jpg", totalBytes: 320000 }] } },
      { id: "unsized-images", title: "Image elements have explicit width and height", severity: "medium", details: { items: [{ url: "cdn.shopify.com/product.jpg" }] } }
    ],
    knownConstraints: ["Do not recommend removing Shopify platform dependencies", "Do not assume control over third-party app loading"]
  },
  expectedTopIssues: ["third-party-summary", "unused-javascript", "render-blocking-resources"],
  evaluate(output, caseData) {
    return evaluateGeneric(output, caseData, {
      requiredAuditIds: ["third-party-summary", "unused-javascript"],
      autoFails: ["CONSTRAINT_CONFLICT"],
      prohibitTech: ["WordPress", "React", "Angular", "Vue", "Apache"],
      mustFlag: "third-party|Shopify",
      constraints: ["Do not recommend removing Shopify platform dependencies", "Do not assume control over third-party app loading"]
    });
  }
});

// ============================================================
// CASE 11: Multiple competing high-priority issues
// ============================================================
defineScenario({
  id: "lh-priority-011",
  title: "Multiple competing high-priority issues",
  category: "mixed",
  difficulty: "hard",
  data: {
    url: "https://example.com/complex-app",
    strategy: "mobile",
    scores: { performance: 15, accessibility: 45, bestPractices: 60, seo: 72 },
    metrics: { lcp: "10.2s", cls: "0.42", inp: "620ms", fcp: "6.1s", tbt: "4500ms" },
    audits: [
      { id: "render-blocking-resources", title: "Eliminate render-blocking resources", severity: "high", details: { resources: [{ url: "app.css", deltaMs: 3200 }, { url: "vendor.css", deltaMs: 1800 }, { url: "framework.js", deltaMs: 2400 }] } },
      { id: "unused-javascript", title: "Remove unused JavaScript", severity: "high", details: { totalBytes: 2800000, wastedBytes: 2200000 } },
      { id: "total-blocking-time", title: "Total Blocking Time", severity: "high", details: { value: "4500ms" } },
      { id: "bootup-time", title: "JavaScript boot-up time", severity: "high", details: { value: "5500ms" } },
      { id: "mainthread-work-breakdown", title: "Minimize main-thread work", severity: "high", details: { value: "9.2s" } },
      { id: "dom-size", title: "Avoid an excessive DOM size", severity: "high", details: { value: 6200 } },
      { id: "third-party-summary", title: "Minimize third-party usage", severity: "high", details: { items: [
        { entity: "Analytics Suite", transferSize: 85000, blockingTime: 350 },
        { entity: "CRM Widget", transferSize: 120000, blockingTime: 480 },
        { entity: "Chat Widget", transferSize: 95000, blockingTime: 420 }
      ] } },
      { id: "largest-contentful-paint-element", title: "Largest Contentful Paint element", severity: "high", details: { element: "div.hero-section", url: "hero-background.jpg" } },
      { id: "cumulative-layout-shift", title: "Cumulative Layout Shift", severity: "high", details: { value: "0.42" } },
      { id: "color-contrast", title: "Background and foreground colors do not have a sufficient contrast ratio", severity: "high", details: { items: [{ node: "p.light-text" }] } },
      { id: "tap-targets", title: "Tap targets are not sized appropriately", severity: "high", details: { items: [{ node: "a.small-link" }] } },
      { id: "uses-optimized-images", title: "Efficiently encode images", severity: "medium", details: { items: [{ url: "hero-background.jpg", totalBytes: 480000 }] } },
      { id: "modern-image-formats", title: "Serve images in next-gen formats", severity: "medium", details: { items: [{ url: "hero-background.jpg", totalBytes: 480000 }] } }
    ],
    knownConstraints: ["Do not recommend full redesign", "Do not assume backend changes are possible"]
  },
  expectedTopIssues: ["render-blocking-resources", "unused-javascript", "total-blocking-time"],
  evaluate(output, caseData) {
    return evaluateGeneric(output, caseData, {
      requiredAuditIds: ["render-blocking-resources", "unused-javascript", "total-blocking-time"],
      autoFails: ["MISSING_ALL_HIGH_SEVERITY", "CONSTRAINT_CONFLICT"],
      prohibitTech: ["WordPress", "Shopify", "Angular", "Vue"],
      mustFlag: "render-blocking|unused JavaScript",
      constraints: ["Do not recommend full redesign", "Do not assume backend changes are possible"]
    });
  }
});

// ============================================================
// CASE 12: Model must avoid unsupported implementation advice
// ============================================================
defineScenario({
  id: "lh-priority-012",
  title: "Cautious case — avoid unsupported implementation advice",
  category: "edge",
  difficulty: "hard",
  data: {
    url: "https://example.com/unknown-stack",
    strategy: "mobile",
    scores: { performance: 42, accessibility: 80, bestPractices: 85, seo: 92 },
    metrics: { lcp: "4.5s", cls: "0.06", inp: "200ms", fcp: "2.8s", tbt: "520ms" },
    audits: [
      { id: "render-blocking-resources", title: "Eliminate render-blocking resources", severity: "high", details: { resources: [{ url: "bundle.css", deltaMs: 1600 }, { url: "core.js", deltaMs: 800 }] } },
      { id: "largest-contentful-paint-element", title: "Largest Contentful Paint element", severity: "medium", details: { element: "div.hero-banner" } },
      { id: "uses-optimized-images", title: "Efficiently encode images", severity: "medium", details: { items: [{ url: "https://cdn.example.com/banner.jpg", totalBytes: 220000 }] } },
      { id: "modern-image-formats", title: "Serve images in next-gen formats", severity: "medium", details: { items: [{ url: "https://cdn.example.com/banner.jpg", totalBytes: 220000 }] } },
      { id: "unused-css-rules", title: "Reduce unused CSS", severity: "medium", details: { wasteBytes: 85000 } },
      { id: "server-response-time", title: "Initial server response time was short", severity: "low", details: { value: "0.6s" } }
    ],
    knownConstraints: ["Do not assume the tech stack — no CMS, framework, server, or CDN is known", "Do not recommend specific implementation techniques that require knowledge of the stack"]
  },
  expectedTopIssues: ["render-blocking-resources"],
  evaluate(output, caseData) {
    return evaluateGeneric(output, caseData, {
      requiredAuditIds: ["render-blocking-resources"],
      autoFails: ["UNSUPPORTED_TECH_ASSUMPTION", "CONSTRAINT_CONFLICT"],
      prohibitTech: ["WordPress", "Shopify", "React", "Angular", "Vue", "jQuery", "Apache", "Nginx", "CloudFlare", "AWS", "Netlify", "Vercel", "GitHub Pages"],
      mustFlag: "inspection|needsInspection",
      constraints: ["Do not assume the tech stack", "Do not recommend specific implementation techniques that require knowledge of the stack"]
    });
  }
});

// ============================================================
// Generic evaluation logic
// ============================================================
function evaluateGeneric(output, caseData, opts) {
  const d = {
    parsed: false,
    schemaValid: false,
    groundingScore: 0,
    priorityScore: 0,
    actionabilityScore: 0,
    guardrailScore: 0,
    schemaScore: 0,
    completenessScore: 0,
    clarityScore: 0,
    totalScore: 0,
    autoFail: null,
    checks: [],
    details: {}
  };

  if (!output || typeof output !== "object") {
    d.checks.push({ validator: "json-parse", status: "fail", message: "Output is not a JSON object" });
    return verdictFromDetails(d);
  }

  d.parsed = true;
  d.checks.push({ validator: "json-parse", status: "pass" });

  // Schema compliance check
  const schemaChecks = checkSchemaCompliance(output, caseData);
  d.schemaValid = schemaChecks.valid;
  d.schemaScore = schemaChecks.score;
  d.checks.push({ validator: "json-schema", status: d.schemaValid ? "pass" : "fail", details: schemaChecks.issues });

  // Auto-fail conditions
  d.autoFail = checkAutoFailConditions(output, caseData, opts);
  if (d.autoFail) {
    d.checks.push({ validator: "auto-fail", status: "fail", message: d.autoFail });
    return verdictFromDetails(d);
  }

  // Factual grounding
  const grounding = checkFactualGrounding(output, caseData, opts);
  d.groundingScore = grounding.score;
  d.checks.push({ validator: "factual-grounding", status: grounding.score >= 0.7 ? "pass" : "fail", score: grounding.score, details: grounding.issues });

  // Prioritization quality
  const priority = checkPrioritizationQuality(output, caseData, opts);
  d.priorityScore = priority.score;
  d.checks.push({ validator: "prioritization-quality", status: priority.score >= 0.7 ? "pass" : "fail", score: priority.score, details: priority.issues });

  // Actionability
  const actionability = checkActionability(output);
  d.actionabilityScore = actionability.score;
  d.checks.push({ validator: "actionability", status: actionability.score >= 0.7 ? "pass" : "fail", score: actionability.score });

  // Guardrail quality
  const guardrails = checkGuardrails(output, opts);
  d.guardrailScore = guardrails.score;
  d.checks.push({ validator: "guardrail-quality", status: guardrails.score >= 0.7 ? "pass" : "fail", score: guardrails.score, details: guardrails.issues });

  // Completeness
  const completeness = checkCompleteness(output, caseData, opts);
  d.completenessScore = completeness.score;
  d.checks.push({ validator: "completeness", status: completeness.score >= 0.7 ? "pass" : "fail", score: completeness.score, details: completeness.issues });

  // Clarity
  const clarity = checkClarity(output);
  d.clarityScore = clarity.score;
  d.checks.push({ validator: "clarity", status: clarity.score >= 0.7 ? "pass" : "fail", score: clarity.score });

  // Weighted total
  d.totalScore = (
    0.25 * d.groundingScore +
    0.20 * d.priorityScore +
    0.15 * d.actionabilityScore +
    0.15 * d.guardrailScore +
    0.10 * d.schemaScore +
    0.10 * d.completenessScore +
    0.05 * d.clarityScore
  );

  d.checks.push({ validator: "total-score", status: d.totalScore >= 0.7 ? "pass" : "fail", score: Math.round(d.totalScore * 100) / 100 });

  return verdictFromDetails(d);
}

function verdictFromDetails(d) {
  if (d.autoFail) {
    return { type: "lighthouse-priority", verdict: "FAIL", points: 0, summary: "Auto-fail: " + d.autoFail, details: d };
  }
  if (d.totalScore >= 0.7 && d.schemaValid && d.groundingScore >= 0.7) {
    return { type: "lighthouse-priority", verdict: "PASS", points: Math.round(d.totalScore * 100), summary: `Score: ${Math.round(d.totalScore * 100)}%`, details: d };
  }
  if (d.totalScore >= 0.4) {
    return { type: "lighthouse-priority", verdict: "PARTIAL", points: Math.round(d.totalScore * 50), summary: `Partial: ${Math.round(d.totalScore * 100)}%`, details: d };
  }
  return { type: "lighthouse-priority", verdict: "FAIL", points: 0, summary: `Score: ${Math.round(d.totalScore * 100)}%`, details: d };
}

function checkSchemaCompliance(output, caseData) {
  const issues = [];
  if (!output.summary || typeof output.summary !== "string") {
    issues.push("Missing or invalid summary field");
  }
  if (!Array.isArray(output.priorityIssues)) {
    issues.push("Missing or invalid priorityIssues array");
    return { valid: false, score: 0, issues };
  }
  let validCount = 0;
  for (const pi of output.priorityIssues) {
    let piValid = true;
    if (!pi.auditId) { piValid = false; issues.push("priorityIssue missing auditId"); }
    if (!pi.priority || !["critical", "high", "medium", "low"].includes(pi.priority)) { piValid = false; issues.push("priorityIssue has invalid priority"); }
    if (!pi.reason || typeof pi.reason !== "string") { piValid = false; issues.push("priorityIssue missing reason"); }
    if (!pi.recommendedAction || typeof pi.recommendedAction !== "string") { piValid = false; issues.push("priorityIssue missing recommendedAction"); }
    if (!pi.verification || typeof pi.verification !== "string") { piValid = false; issues.push("priorityIssue missing verification"); }
    if (piValid) validCount++;
  }
  const score = output.priorityIssues.length > 0 ? validCount / output.priorityIssues.length : 1;
  return { valid: score >= 0.8 && issues.length === 0, score, issues };
}

function checkAutoFailConditions(output, caseData, opts) {
  const inputAuditIds = new Set(caseData.audits.map(a => a.id));

  // INVENTED_AUDIT: Every auditId in output must exist in input
  for (const pi of (output.priorityIssues || [])) {
    if (pi.auditId && !inputAuditIds.has(pi.auditId)) {
      return `INVENTED_AUDIT: '${pi.auditId}' not found in input audits`;
    }
  }

  // INVENTED_METRIC: Check output doesn't mention metrics not in input
  const inputMetricKeys = new Set(Object.keys(caseData.metrics || {}));
  const outputText = JSON.stringify(output).toLowerCase();
  const knownMetrics = ["lcp", "cls", "inp", "fcp", "tbt", "fid", "si", "tti"];
  for (const metric of knownMetrics) {
    if (outputText.includes(metric) && !inputMetricKeys.has(metric) && !inputAuditIds.has(metric)) {
      // This is a soft check - allow mentioning metric names in explanation text
    }
  }

  // UNSUPPORTED_TECH_ASSUMPTION
  const outputStr = JSON.stringify(output).toLowerCase();
  if (opts.prohibitTech) {
    for (const tech of opts.prohibitTech) {
      if (outputStr.includes(tech.toLowerCase())) {
        return `UNSUPPORTED_TECH_ASSUMPTION: mentions '${tech}' which is not known from input`;
      }
    }
  }

  // CONSTRAINT_CONFLICT
  if (opts.constraints) {
    for (const c of opts.constraints) {
      const constraintWords = c.toLowerCase().split(/\s+/);
      const conflictWords = constraintWords.filter(w => ["not", "do not", "avoid", "without", "cannot", "must not"].some(n => w.includes(n)));
      if (conflictWords.length === 0) continue;
      // Check if output contradicts the constraint
      if (c.includes("stakeholder review") && outputStr.includes("remove")) {
        return `CONSTRAINT_CONFLICT: Output contradicts constraint '${c}'`;
      }
    }
  }

  // SCORE_INCREASE_GUARANTEE
  if (opts.prohibitClaim) {
    const claimPatterns = [/(will|guarantee|ensure)\s+(improve|increase|boost|raise)\s+(score|performance|accessibility)/i];
    for (const pattern of claimPatterns) {
      if (pattern.test(outputStr)) {
        return `SCORE_INCREASE_GUARANTEE: Output claims guaranteed score improvement`;
      }
    }
  }

  // MISSING_ALL_HIGH_SEVERITY
  if (opts.autoFails && opts.autoFails.includes("MISSING_ALL_HIGH_SEVERITY")) {
    const highSeverityFromInput = caseData.audits.filter(a => a.severity === "high").map(a => a.id);
    const outputIds = new Set((output.priorityIssues || []).map(pi => pi.auditId));
    const foundHigh = highSeverityFromInput.filter(id => outputIds.has(id));
    if (highSeverityFromInput.length > 0 && foundHigh.length === 0) {
      return `MISSING_ALL_HIGH_SEVERITY: None of ${highSeverityFromInput.length} high-severity issues were addressed`;
    }
  }

  return null;
}

function checkFactualGrounding(output, caseData, opts) {
  const issues = [];
  const inputAuditIds = new Set(caseData.audits.map(a => a.id));
  const outputIds = new Set((output.priorityIssues || []).map(pi => pi.auditId));

  // All auditIds must be from input
  for (const pi of (output.priorityIssues || [])) {
    if (pi.auditId && !inputAuditIds.has(pi.auditId)) {
      issues.push(`Audit '${pi.auditId}' not in input`);
    }
  }

  // Check for missing required ones
  if (opts.requiredAuditIds) {
    for (const requiredId of opts.requiredAuditIds) {
      if (!outputIds.has(requiredId)) {
        issues.push(`Required audit '${requiredId}' missing from priority issues`);
      }
    }
  }

  const score = Math.max(0, 1 - (issues.length / Math.max(1, (output.priorityIssues || []).length + (opts.requiredAuditIds || []).length)));
  return { score, issues };
}

function checkPrioritizationQuality(output, caseData, opts) {
  const issues = [];
  const inputHigh = new Set(caseData.audits.filter(a => a.severity === "high").map(a => a.id));
  const priorityOrder = ["critical", "high", "medium", "low"];
  let correctOrder = 0;
  let totalComparisons = 0;

  const items = output.priorityIssues || [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      totalComparisons++;
      const pi = priorityOrder.indexOf(items[i].priority);
      const pj = priorityOrder.indexOf(items[j].priority);
      if (pi <= pj) correctOrder++;
    }
  }

  // Critical issues should map to high-severity input issues
  for (const pi of items) {
    if (pi.priority === "critical" && !inputHigh.has(pi.auditId)) {
      issues.push(`Critical priority assigned to non-high-severity audit: ${pi.auditId}`);
    }
  }

  const orderScore = totalComparisons > 0 ? correctOrder / totalComparisons : 1;
  const severityScore = Math.max(0, 1 - (issues.length * 0.25));
  const score = (orderScore + severityScore) / 2;
  return { score, issues };
}

function checkActionability(output) {
  const vaguePatterns = [/optimize/i, /improve/i, /enhance/i, /make better/i, /do better/i];
  let vagueCount = 0;
  for (const pi of (output.priorityIssues || [])) {
    if (pi.recommendedAction) {
      for (const p of vaguePatterns) {
        if (p.test(pi.recommendedAction) && pi.recommendedAction.split(/\s+/).length < 4) {
          vagueCount++;
        }
      }
    }
  }
  const score = (output.priorityIssues || []).length > 0
    ? Math.max(0, 1 - (vagueCount / (output.priorityIssues || []).length))
    : 0.5;
  return { score };
}

function checkGuardrails(output, opts) {
  const issues = [];
  const guardrails = output.guardrails || [];

  if (opts.mustFlag && !JSON.stringify(output).toLowerCase().includes(opts.mustFlag.toLowerCase())) {
    issues.push(`Output should mention '${opts.mustFlag}'`);
  }

  if (opts.constraints) {
    for (const c of opts.constraints) {
      const constraintPresent = guardrails.some(g => g.toLowerCase().includes(c.split(" ").slice(0, 3).join(" ").toLowerCase()));
      if (!constraintPresent) {
        issues.push(`Constraint '${c}' not reflected in guardrails`);
      }
    }
  }

  const score = Math.max(0, 1 - (issues.length * 0.25));
  return { score, issues };
}

function checkCompleteness(output, caseData, opts) {
  const issues = [];
  const outputIds = new Set((output.priorityIssues || []).map(pi => pi.auditId));

  if (opts.expectMinIssues !== undefined && (output.priorityIssues || []).length < opts.expectMinIssues) {
    issues.push(`Too few issues: expected at least ${opts.expectMinIssues}, got ${(output.priorityIssues || []).length}`);
  }
  if (opts.expectMaxIssues !== undefined && (output.priorityIssues || []).length > opts.expectMaxIssues) {
    issues.push(`Too many issues: expected at most ${opts.expectMaxIssues}, got ${(output.priorityIssues || []).length}`);
  }

  // Check summary exists
  if (!output.summary || output.summary.length < 20) {
    issues.push("Summary is too short or missing");
  }

  // Check assumptions field exists
  if (!output.assumptions) {
    issues.push("Missing assumptions field");
  }

  const score = Math.max(0, 1 - (issues.length * 0.25));
  return { score, issues };
}

function checkClarity(output) {
  let score = 1;
  if (!output.summary || output.summary.length < 20) score -= 0.2;
  if ((output.priorityIssues || []).length === 0) score -= 0.1;
  for (const pi of (output.priorityIssues || [])) {
    if (!pi.reason || pi.reason.length < 10) { score -= 0.1; break; }
  }
  return { score: Math.max(0, score) };
}

function mockHandler(state, call) {
  return { error: "No mock handler for lighthouse-priority" };
}

function evaluateScenario(output, caseData, scenario) {
  if (scenario.evaluate) {
    return scenario.evaluate(output, caseData);
  }
  return { type: "lighthouse-priority", verdict: "FAIL", points: 0, summary: "No evaluate function", details: {} };
}

module.exports = {
  SCENARIO_REGISTRY,
  defineScenario,
  buildPrompt,
  evaluateScenario,
  evaluateGeneric,
  mockHandler
};
