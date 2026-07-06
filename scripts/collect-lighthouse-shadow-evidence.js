const http = require("node:http");
const { readFileSync, writeFileSync, mkdirSync } = require("node:fs");
const { join } = require("node:path");

const SERVER = "http://127.0.0.1:31313";
const TRACK_ID = "website_audit.lighthouse_handoff";
const RECORDS_DIR = join(__dirname, "..", "data", "evidence", "track-run-records");

const CASES = [
  { id: "lh-shadow-001", title: "Severe LCP caused by hero image", url: "https://example.com/landing", scores: { performance: 28, accessibility: 85, bestPractices: 92, seo: 95 }, opportunities: [{ id: "largest-contentful-paint-element", title: "Largest Contentful Paint element", severity: "high" }, { id: "render-blocking-resources", title: "Eliminate render-blocking resources", severity: "high" }] },
  { id: "lh-shadow-002", title: "Render-blocking CSS and JavaScript", url: "https://example.com/blog/post", scores: { performance: 35, accessibility: 90, bestPractices: 88, seo: 92 }, opportunities: [{ id: "render-blocking-resources", title: "Eliminate render-blocking resources", severity: "high" }, { id: "unused-javascript", title: "Remove unused JavaScript", severity: "high" }] },
  { id: "lh-shadow-003", title: "Third-party script overhead", url: "https://example.com/news/article", scores: { performance: 32, accessibility: 78, bestPractices: 75, seo: 88 }, opportunities: [{ id: "third-party-summary", title: "Minimize third-party usage", severity: "high" }, { id: "render-blocking-resources", title: "Eliminate render-blocking resources", severity: "high" }] },
  { id: "lh-shadow-004", title: "Excessive unused JavaScript", url: "https://example.com/dashboard", scores: { performance: 25, accessibility: 82, bestPractices: 80, seo: 90 }, opportunities: [{ id: "unused-javascript", title: "Remove unused JavaScript", severity: "high" }, { id: "unused-css-rules", title: "Reduce unused CSS", severity: "medium" }] },
  { id: "lh-shadow-005", title: "Image compression opportunities", url: "https://example.com/gallery", scores: { performance: 45, accessibility: 88, bestPractices: 85, seo: 92 }, opportunities: [{ id: "uses-optimized-images", title: "Efficiently encode images", severity: "medium" }, { id: "modern-image-formats", title: "Serve images in next-gen formats", severity: "medium" }] },
  { id: "lh-shadow-006", title: "Font-loading issues", url: "https://example.com/typography", scores: { performance: 55, accessibility: 92, bestPractices: 90, seo: 95 }, opportunities: [{ id: "font-display", title: "Ensure text remains visible during webfont load", severity: "medium" }, { id: "render-blocking-resources", title: "Eliminate render-blocking resources", severity: "medium" }] },
  { id: "lh-shadow-007", title: "Mostly healthy page with minor findings", url: "https://example.com/healthy", scores: { performance: 72, accessibility: 91, bestPractices: 88, seo: 85 }, opportunities: [{ id: "uses-responsive-images", title: "Properly size images", severity: "low" }, { id: "offscreen-images", title: "Defer offscreen images", severity: "low" }] },
  { id: "lh-shadow-008", title: "WordPress asset bloat", url: "https://example.com/wp-blog", scores: { performance: 22, accessibility: 75, bestPractices: 65, seo: 80 }, opportunities: [{ id: "render-blocking-resources", title: "Eliminate render-blocking resources", severity: "high" }, { id: "unused-javascript", title: "Remove unused JavaScript", severity: "high" }, { id: "unused-css-rules", title: "Reduce unused CSS", severity: "high" }] },
  { id: "lh-shadow-009", title: "Shopify theme and third-party overhead", url: "https://example.com/shop/product", scores: { performance: 18, accessibility: 72, bestPractices: 70, seo: 78 }, opportunities: [{ id: "third-party-summary", title: "Minimize third-party usage", severity: "high" }, { id: "render-blocking-resources", title: "Eliminate render-blocking resources", severity: "high" }, { id: "unused-javascript", title: "Remove unused JavaScript", severity: "high" }] },
  { id: "lh-shadow-010", title: "Multiple competing high-priority issues", url: "https://example.com/competing", scores: { performance: 15, accessibility: 65, bestPractices: 60, seo: 70 }, opportunities: [{ id: "largest-contentful-paint-element", title: "Largest Contentful Paint element", severity: "high" }, { id: "render-blocking-resources", title: "Eliminate render-blocking resources", severity: "high" }, { id: "unused-javascript", title: "Remove unused JavaScript", severity: "high" }, { id: "third-party-summary", title: "Minimize third-party usage", severity: "high" }] },
  { id: "lh-shadow-011", title: "Needs inspection — unclear root cause", url: "https://example.com/mystery-slow", scores: { performance: 42, accessibility: 87, bestPractices: 83, seo: 90 }, opportunities: [{ id: "speed-index", title: "Speed Index", severity: "medium" }, { id: "total-blocking-time", title: "Total Blocking Time", severity: "medium" }] },
  { id: "lh-shadow-012", title: "Strong mobile/desktop score differences", url: "https://example.com/responsive", scores: { performance: 38, accessibility: 80, bestPractices: 82, seo: 85 }, opportunities: [{ id: "uses-responsive-images", title: "Properly size images", severity: "high" }, { id: "viewport", title: "Has a viewport meta tag", severity: "low" }] },
  { id: "lh-shadow-013", title: "Current default selection is preferable", url: "https://example.com/simple-page", scores: { performance: 85, accessibility: 95, bestPractices: 92, seo: 98 }, opportunities: [] },
  { id: "lh-shadow-014", title: "Accessibility-focused issues", url: "https://example.com/accessible-site", scores: { performance: 75, accessibility: 52, bestPractices: 80, seo: 82 }, opportunities: [{ id: "color-contrast", title: "Background and foreground colors", severity: "high" }, { id: "document-title", title: "Document does not have a title element", severity: "high" }] },
  { id: "lh-shadow-015", title: "Best practices and security issues", url: "https://example.com/security-site", scores: { performance: 65, accessibility: 90, bestPractices: 45, seo: 88 }, opportunities: [{ id: "no-vulnerable-libraries", title: "Avoid using vulnerable libraries", severity: "high" }, { id: "errors-in-console", title: "Errors logged to console", severity: "medium" }] },
  { id: "lh-shadow-016", title: "SE O meta issues", url: "https://example.com/seo-site", scores: { performance: 70, accessibility: 88, bestPractices: 85, seo: 45 }, opportunities: [{ id: "meta-description", title: "Document does not have a meta description", severity: "high" }, { id: "link-text", title: "Links do not have descriptive text", severity: "high" }] },
  { id: "lh-shadow-017", title: "Heavy JavaScript framework SPA", url: "https://example.com/react-app", scores: { performance: 20, accessibility: 70, bestPractices: 72, seo: 60 }, opportunities: [{ id: "unused-javascript", title: "Remove unused JavaScript", severity: "high" }, { id: "render-blocking-resources", title: "Eliminate render-blocking resources", severity: "high" }, { id: "bootup-time", title: "Reduce JavaScript execution time", severity: "high" }] },
  { id: "lh-shadow-018", title: "E-commerce checkout flow issues", url: "https://example.com/store/checkout", scores: { performance: 30, accessibility: 78, bestPractices: 75, seo: 82 }, opportunities: [{ id: "render-blocking-resources", title: "Eliminate render-blocking resources", severity: "high" }, { id: "unused-javascript", title: "Remove unused JavaScript", severity: "high" }, { id: "third-party-summary", title: "Minimize third-party usage", severity: "high" }] },
];

const CONSISTENCY_CASES = ["lh-shadow-001", "lh-shadow-007", "lh-shadow-010"];

function postJson(path, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const options = new URL(SERVER + path);
    const req = http.request({
      hostname: options.hostname,
      port: options.port,
      path: options.pathname,
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function getJson(path) {
  return new Promise((resolve, reject) => {
    const options = new URL(SERVER + path);
    http.get({ hostname: options.hostname, port: options.port, path: options.pathname }, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    }).on("error", reject);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function checkServer() {
  try {
    const health = await getJson("/health");
    if (!health.body.ok) { console.error("Server not healthy"); process.exit(1); }
    const quals = health.body.qualifications;
    const lhCap = quals.summary.byTrack["website_audit.lighthouse_handoff"];
    console.log(`Lighthouse capabilities: ${JSON.stringify(lhCap)}`);
    const phRole = quals.summary.byRole["priority_helper"];
    console.log(`Priority helper qualified: ${JSON.stringify(phRole)}`);
    return true;
  } catch (e) {
    console.error("Server not reachable:", e.message);
    process.exit(1);
  }
}

async function runCase(caseData) {
  const start = Date.now();
  const result = await postJson("/tracks/run", {
    track_id: TRACK_ID,
    input: {
      url: caseData.url,
      scores: caseData.scores,
      opportunities: caseData.opportunities || []
    },
    options: {}
  });
  const durationMs = Date.now() - start;
  return { ...result, durationMs, caseData };
}

async function main() {
  console.log("=== Lighthouse Shadow Evidence Collection ===\n");
  await checkServer();

  const results = [];
  const failures = [];
  const consistencyResults = [];

  // Phase 1: Run all evaluation cases
  console.log(`\n--- Phase 1: Running ${CASES.length} evaluation cases ---\n`);
  for (const c of CASES) {
    console.log(`  Running ${c.id} (${c.title})...`);
    const r = await runCase(c);
    if (r.status === 200 && r.body.ok) {
      const recordId = r.body.evidence?.trackRunRecordId || "unknown";
      console.log(`    → OK recordId=${recordId} (${r.durationMs}ms)`);
      results.push({ caseId: c.id, recordId, status: "success", durationMs: r.durationMs, response: r.body });
    } else {
      console.log(`    → FAILED: ${r.body?.error?.message || r.body?.message || "unknown"} (${r.durationMs}ms)`);
      failures.push({ caseId: c.id, status: "failed", error: r.body, durationMs: r.durationMs });
    }
    await sleep(500);
  }

  // Phase 2: Consistency runs
  console.log(`\n--- Phase 2: Consistency trials (${CONSISTENCY_CASES.length} cases x 3 each) ---\n`);
  for (const caseId of CONSISTENCY_CASES) {
    const c = CASES.find(x => x.id === caseId);
    for (let trial = 1; trial <= 3; trial++) {
      console.log(`  ${caseId} trial ${trial}/3...`);
      const r = await runCase(c);
      if (r.status === 200 && r.body.ok) {
        const recordId = r.body.evidence?.trackRunRecordId || "unknown";
        console.log(`    → OK recordId=${recordId} (${r.durationMs}ms)`);
        consistencyResults.push({ caseId, trial, recordId, status: "success", durationMs: r.durationMs, response: r.body });
      } else {
        console.log(`    → FAILED: ${r.body?.error?.message || "unknown"}`);
        consistencyResults.push({ caseId, trial, status: "failed", error: r.body, durationMs: r.durationMs });
      }
      await sleep(500);
    }
  }

  // Phase 3: Get shadow reviews
  console.log(`\n--- Phase 3: Reading shadow evidence ---\n`);
  const enforcementReview = await getJson(`/enforcement/review?trackId=${TRACK_ID}`);
  const enforcementStatus = await getJson("/enforcement/status");
  const disagreements = await getJson(`/enforcement/decisions?trackId=${TRACK_ID}`);

  // Build summary
  const summary = {
    collectedAt: new Date().toISOString(),
    trackId: TRACK_ID,
    totalCases: CASES.length,
    successfulRuns: results.length,
    failedRuns: failures.length,
    consistencyCases: CONSISTENCY_CASES.length,
    consistencyTrials: consistencyResults.length,
    consistencySuccess: consistencyResults.filter(r => r.status === "success").length,
    consistencyFailures: consistencyResults.filter(r => r.status === "failed").length,
    evaluationResults: results.map(r => ({ caseId: r.caseId, recordId: r.recordId, durationMs: r.durationMs })),
    consistencyResults: consistencyResults.map(r => ({ caseId: r.caseId, trial: r.trial, recordId: r.recordId || null, durationMs: r.durationMs })),
    enforcementReview: enforcementReview.body,
    enforcementStatus: enforcementStatus.body,
    disagreements: disagreements.body
  };

  const outPath = join(__dirname, "..", "data", "evidence", "shadow-collection-summary.json");
  mkdirSync(join(__dirname, "..", "data", "evidence"), { recursive: true });
  writeFileSync(outPath, JSON.stringify(summary, null, 2));
  console.log(`\nSummary written to ${outPath}`);

  // Print quick stats
  const totalAttempts = results.length + consistencyResults.length;
  const totalSuccess = results.filter(r => r.status === "success").length + consistencyResults.filter(r => r.status === "success").length;
  console.log(`\n=== Collection Complete ===`);
  console.log(`Cases: ${results.length} (${results.filter(r => r.status === "success").length} ok, ${failures.length} failed)`);
  console.log(`Consistency: ${consistencyResults.length} trials (${consistencyResults.filter(r => r.status === "success").length} ok)`);
  console.log(`Total: ${totalAttempts} attempts, ${totalSuccess} successful`);
  console.log(`\nCheck /enforcement/review or /enforcement/status for shadow comparison counts.`);
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
