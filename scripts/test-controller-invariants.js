#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const PROJECT_ROOT = path.resolve(__dirname, "..");
const INVARIANTS_PATH = path.join(PROJECT_ROOT, ".opencode", "agents", "controller", "invariants.js");

let passed = 0, failed = 0;
const failures = [];
function assert(c, m) { if (c) passed++; else { failed++; failures.push(m); console.error(`  FAIL: ${m}`); } }
function assertEqual(a, b, m) { if (JSON.stringify(a) === JSON.stringify(b)) passed++; else { failed++; const msg = `${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`; failures.push(msg); console.error(`  FAIL: ${msg}`); } }

let inv;
try { inv = require(INVARIANTS_PATH); } catch (e) { console.error(`Load error: ${e.message}`); process.exit(1); }

// Queue completeness
const qc = inv.validateQueueCompleteness(path.join(PROJECT_ROOT, ".opencode", "agents", "objectives", "queue"));
assert(typeof qc.valid === "boolean", "validateQueueCompleteness returns valid");
assert(Array.isArray(qc.expected || []), "Has expected");
assert(Array.isArray(qc.found || []), "Has found");
assert(Array.isArray(qc.missing || []), "Has missing");

// Milestone records
const slug = "test-invariants-rebuild";
inv.createMilestoneRecord(slug, "agents/worker/test", "abc123");
const r = inv.readMilestoneRecord(slug);
assert(r !== null, "Record created and loaded");
inv.recordAcceptedTask(slug, "task-1", "def456");
const r2 = inv.readMilestoneRecord(slug);
assertEqual(r2.accepted_task_count, 1, "Task recorded");
inv.markMilestoneComplete(slug);
assertEqual(inv.readMilestoneRecord(slug).status, "complete", "Complete recorded");

// Resume
const res = inv.resumeState(slug);
assertEqual(res.can_resume, false, "Complete → cannot resume");
assertEqual(res.reason, "already_complete", "Reason correct");

// Manifest
const manifest = inv.buildMilestoneManifest(slug, path.join(PROJECT_ROOT, ".opencode", "agents", "state", "run-state.json"));
assert(manifest.manifest_version === "1.0.0", "Manifest version");
assert(manifest.unique_commits !== undefined, "Unique commits field");

// Cleanup
try { fs.unlinkSync(inv.milestoneRecordPath ? inv.milestoneRecordPath(slug) : path.join(inv.MILESTONE_DIR, `${slug}.json`)); } catch {}
try { fs.unlinkSync(path.join(inv.MANIFEST_DIR, `${slug}.json`)); } catch {}

console.log(`\nTests: ${passed} passed, ${failed} failed`);
if (failed > 0) { failures.forEach(f => console.error(`  ${f}`)); process.exit(1); }
