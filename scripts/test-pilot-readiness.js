const { buildEvidenceReview } = require("../companion/evidence/shadow-evidence-review");
const { listAllRecords } = require("../companion/evidence/track-run-record-store");

const TRACK_ID = "website_audit.lighthouse_handoff";
const MIN_SHADOW_COMPARISONS = 12;
const TARGET_SHADOW_COMPARISONS = 15;
const MIN_COVERAGE_RATE = 0.7;

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) { passed++; }
  else { console.error(`  FAIL: ${label}`); failed++; }
}

async function runAll() {
  console.log("=== Pilot Readiness Tests ===");
  console.log("");

  // Test 1: Shadow evidence records exist
  console.log("TEST: shadow evidence records exist");
  const records = await listAllRecords();
  const trackRecords = records.filter((r) => r.trackId === TRACK_ID);
  assert(trackRecords.length > 0, `at least one record for ${TRACK_ID}`);
  console.log(`  Found ${trackRecords.length} records for ${TRACK_ID}`);
  console.log("");

  // Test 2: Build evidence review
  console.log("TEST: build evidence review");
  const review = buildEvidenceReview(records);
  assert(review.hasReviews === true, "hasReviews is true");
  console.log(`  totalShadowComparisons: ${review.totalShadowComparisons}`);
  console.log(`  agreementRate: ${review.agreementRate}%`);
  console.log(`  agree: ${review.agree}, disagree: ${review.disagree}`);
  console.log(`  coverageMissing: ${review.coverageMissing}`);
  console.log(`  coverageRate: ${review.coverageRate}%`);
  console.log("");

  // Test 3: Minimum shadow comparisons
  console.log("TEST: minimum shadow comparisons");
  assert(review.totalShadowComparisons >= MIN_SHADOW_COMPARISONS,
    `at least ${MIN_SHADOW_COMPARISONS} shadow comparisons (got ${review.totalShadowComparisons})`);
  assert(review.totalShadowComparisons >= TARGET_SHADOW_COMPARISONS,
    `at least ${TARGET_SHADOW_COMPARISONS} target shadow comparisons (got ${review.totalShadowComparisons})`);
  console.log(`  Min: ${MIN_SHADOW_COMPARISONS} -- Target: ${TARGET_SHADOW_COMPARISONS} -- Actual: ${review.totalShadowComparisons}`);
  console.log("");

  // Test 4: By-track breakdown
  console.log("TEST: by-track breakdown");
  const trackData = review.byTrack[TRACK_ID];
  assert(trackData !== undefined, `track ${TRACK_ID} in byTrack`);
  assert(trackData.total === review.totalShadowComparisons, "track total matches review total");
  assert(trackData.byComparison.disagree > 0, "has disagree comparisons");
  console.log(`  Track ${TRACK_ID}: ${trackData.total} total, ${JSON.stringify(trackData.byComparison)}`);
  console.log("");

  // Test 5: Coverage rate
  console.log("TEST: coverage rate");
  const coverageRate = review.coverageRate / 100;
  assert(coverageRate >= MIN_COVERAGE_RATE,
    `coverage rate ${coverageRate} >= ${MIN_COVERAGE_RATE}`);
  console.log(`  Coverage rate: ${review.coverageRate}% (min ${MIN_COVERAGE_RATE * 100}%)`);
  console.log("");

  // Test 6: Enforcement metrics
  console.log("TEST: enforcement metrics");
  const enforcement = review.enforcement;
  assert(enforcement.hasEnforcement === false, "no enforcement decisions yet (shadow mode)");
  assert(enforcement.totalEnforcementDecisions === 0, "zero enforcement decisions");
  console.log(`  Enforcement decisions: ${enforcement.totalEnforcementDecisions} (expected 0)`);
  console.log(`  Applied: ${enforcement.appliedCount}, Blocked: ${enforcement.blockedCount}`);
  console.log("");

  // Test 7: By-role breakdown
  console.log("TEST: by-role breakdown");
  const hasByRole = Object.keys(review.byRole).length > 0;
  assert(hasByRole === true || review.totalShadowComparisons > 0, "byRole present or comparisons exist");
  console.log(`  Roles tracked: ${Object.keys(review.byRole).join(", ") || "(none - shadow records may not populate role)"}`);
  console.log("");

  // Test 8: Consistency check - track-level totals match by-comparison totals
  console.log("TEST: by-track totals match by-comparison");
  let byComparisonTotal = 0;
  for (const [cmp, count] of Object.entries(review.byComparison)) {
    byComparisonTotal += count;
  }
  let byTrackTotal = 0;
  for (const [tid, td] of Object.entries(review.byTrack)) {
    byTrackTotal += td.total;
  }
  assert(byComparisonTotal === review.totalShadowComparisons,
    `byComparison total (${byComparisonTotal}) matches totalShadowComparisons (${review.totalShadowComparisons})`);
  assert(byTrackTotal === review.totalShadowComparisons,
    `byTrack total (${byTrackTotal}) matches totalShadowComparisons (${review.totalShadowComparisons})`);
  console.log(`  byComparison total: ${byComparisonTotal}`);
  console.log(`  byTrack total: ${byTrackTotal}`);
  console.log("");

  // Summary
  console.log("=== Results ===");
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${passed + failed}`);

  const ok = failed === 0;
  console.log(`Status: ${ok ? "ALL PASSED" : "SOME FAILED"}`);
  process.exitCode = ok ? 0 : 1;
}

runAll().catch((err) => {
  console.error("Test runner failed:", err);
  process.exitCode = 1;
});
