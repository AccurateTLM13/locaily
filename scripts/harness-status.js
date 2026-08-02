#!/usr/bin/env node

const { buildHarnessSnapshot, listHarnessFixtures } = require("../companion/harness");

function getArg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const fixture = getArg("--fixture", "codex");
const asJson = process.argv.includes("--json");
const result = buildHarnessSnapshot({ fixture });

if (!result.ok) {
  if (asJson) {
    console.log(JSON.stringify({ ok: false, error: result.error }, null, 2));
  } else {
    console.error(`${result.error.code}: ${result.error.message}`);
    console.error(result.error.nextStep);
  }
  process.exit(1);
}

if (asJson) {
  console.log(JSON.stringify(result.result, null, 2));
  process.exit(0);
}

const snapshot = result.result;
const evidenceCounts = snapshot.evidence.records.reduce((counts, record) => {
  counts[record.status] = (counts[record.status] || 0) + 1;
  return counts;
}, {});

console.log("=== Harness Operations Status ===");
console.log(`Harness:     ${snapshot.harness.name} (${snapshot.harness.id})`);
console.log(`Snapshot:    ${snapshot.snapshotId}`);
console.log(`State:       ${snapshot.state.overallStatus} / ${snapshot.state.lifecycleStatus}`);
console.log(`Workers:     ${snapshot.workers.length}`);
console.log(`Worktrees:   ${snapshot.worktrees.length}`);
console.log(`Objectives:  ${snapshot.objectives.length}`);
console.log(`Checks:      ${snapshot.checks.length}`);
console.log(`Evidence:    ${JSON.stringify(evidenceCounts)}`);
console.log(`Locaily:     milestone=${snapshot.locailyLinks.milestone.status || "unavailable"}, session=${snapshot.locailyLinks.session.status || "unavailable"}, validation=${snapshot.locailyLinks.validation.status || "unavailable"}`);
console.log("Read-only:   yes (fixture-derived; no live harness integration claimed)");
console.log(`Fixtures:    ${listHarnessFixtures().join(", ")}`);
