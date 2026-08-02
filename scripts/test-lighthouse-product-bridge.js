/**
 * scripts/test-lighthouse-product-bridge.js
 *
 * Acceptance test suite for Lighthouse Handoff Product Bridge.
 */

const assert = require("assert");
const { validateCorsOrigin, convertPagespeedToMarkdown, enhanceReportWithLocalAI } = require("../companion/capability-kernel/lighthouse-product-bridge");

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL  ${name}`);
    console.error(`        ${err.message}`);
    failed++;
  }
}

console.log("\n## Lighthouse Handoff Product Bridge");

try {
  // AC 1: CORS Policy
  runTest("AC 1: Enforces CORS allowlist policy rejecting unauthorized remote origins", () => {
    assert.strictEqual(validateCorsOrigin("http://127.0.0.1:31313"), true);
    assert.strictEqual(validateCorsOrigin("http://localhost:3000"), true);
    assert.strictEqual(validateCorsOrigin("chrome-extension://abcdefghijklmnop"), true);
    assert.strictEqual(validateCorsOrigin("https://malicious-external-site.com"), false);
  });

  // AC 2: PageSpeed Conversion
  runTest("AC 2: PageSpeed JSON payloads are transformed into structured Markdown reports", () => {
    const pagespeed = {
      url: "https://locaily.local",
      scores: { performance: 90, accessibility: 95, seo: 100, best_practices: 88 },
      issues: [
        { id: "img-alt", category: "accessibility", title: "Image elements do not have [alt] attributes", score: 0 }
      ]
    };

    const markdown = convertPagespeedToMarkdown(pagespeed);
    assert.ok(markdown.includes("# Lighthouse Handoff Audit Report"));
    assert.ok(markdown.includes("https://locaily.local"));
    assert.ok(markdown.includes("Performance:** 90/100"));
    assert.ok(markdown.includes("[ACCESSIBILITY]"));
    assert.ok(markdown.includes("Image elements do not have [alt] attributes"));

    // Missing input fail-closed test
    assert.throws(() => {
      convertPagespeedToMarkdown({});
    }, /INVALID_AUDIT_INPUT/);
  });

  // AC 3: Local AI Enhancement
  runTest("AC 3: Local AI enhancement mode adds prioritized recommendation summaries", () => {
    const baseMarkdown = "# Report Base";
    const unenhanced = enhanceReportWithLocalAI(baseMarkdown);
    assert.ok(unenhanced.includes("AI enhancement unavailable"));

    const demoEnhanced = enhanceReportWithLocalAI(baseMarkdown, null, { demo: true });
    assert.ok(demoEnhanced.includes("Local AI Recommendations"));
    assert.ok(demoEnhanced.includes("WCAG AA compliance"));
  });

} catch (err) {
  console.error("Unhandled test suite error:", err);
  failed++;
}

console.log(`\n## Results: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
