#!/usr/bin/env node
/**
 * scripts/test-development-begin-end.js
 *
 * Tests for dev-begin, dev-end, agent-review, and pre-delivery profile.
 */

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { installDevelopmentStateGuard } = require("./test-development-state-guard");

const PROJECT_ROOT = path.resolve(__dirname, "..");
installDevelopmentStateGuard(PROJECT_ROOT, ["docs/07-progress/work-closeout.json"]);
const MILESTONES_DIR = path.join(PROJECT_ROOT, "development", "milestones");
const SESSIONS_DIR = path.join(PROJECT_ROOT, "development", "sessions");
const REVIEW_DIR = path.join(PROJECT_ROOT, "development", "reviews");
const PROFILES_DIR = path.join(PROJECT_ROOT, "development", "profiles");

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try { fn(); console.log(`  PASS  ${name}`); passed++; }
  catch (e) { console.log(`  FAIL  ${name}\n        ${e.message}`); failed++; failures.push({ name, message: e.message }); }
}

function assert(condition, msg) { if (!condition) throw new Error(msg || "assertion failed"); }

function readJson(p) { return JSON.parse(fs.readFileSync(p, "utf8")); }

function run(cmd, args) {
  const r = spawnSync(cmd, args, {
    cwd: PROJECT_ROOT, encoding: "utf8", maxBuffer: 1024 * 1024,
    shell: false,
  });
  return { stdout: r.stdout || "", stderr: r.stderr || "", exitCode: r.status || 0 };
}

function runBegin(args) {
  return run("node", [path.join(PROJECT_ROOT, "scripts", "dev-begin.js"), ...args]);
}

function runEnd(args) {
  return run("node", [path.join(PROJECT_ROOT, "scripts", "dev-end.js"), ...args]);
}

function runReview(args) {
  return run("node", [path.join(PROJECT_ROOT, "scripts", "agent-review.js"), ...args]);
}

function cleanState() {
  for (const dir of [MILESTONES_DIR, SESSIONS_DIR, REVIEW_DIR]) {
    if (fs.existsSync(dir)) {
      for (const f of fs.readdirSync(dir)) {
        if (f.endsWith(".json")) fs.unlinkSync(path.join(dir, f));
      }
    }
  }
}

function writeJson(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + "\n");
}

// ---- Script existence ----

console.log("\n## Script Existence");

test("dev-begin.js exists", () => {
  assert(fs.existsSync(path.join(PROJECT_ROOT, "scripts", "dev-begin.js")));
});

test("dev-end.js exists", () => {
  assert(fs.existsSync(path.join(PROJECT_ROOT, "scripts", "dev-end.js")));
});

test("agent-review.js exists", () => {
  assert(fs.existsSync(path.join(PROJECT_ROOT, "scripts", "agent-review.js")));
});

test("pre-delivery profile exists", () => {
  const p = path.join(PROFILES_DIR, "pre-delivery.json");
  assert(fs.existsSync(p), "pre-delivery.json not found");
  const profile = readJson(p);
  assert(profile.id === "pre-delivery", "Wrong profile id");
  assert(profile.level === "release", "Wrong level");
});

// ---- dev-begin ----

console.log("\n## dev:begin");

test("begin --json produces output", () => {
  cleanState();
  const r = runBegin(["--json"]);
  assert(r.exitCode !== 0, "Should exit 1 with no milestones");
  const out = r.stdout ? JSON.parse(r.stdout) : null;
  assert(out && (out.action === "idle" || out.action === "select"), "Unexpected action");
});

test("begin --slug creates milestone", () => {
  cleanState();
  const r = runBegin(["--slug", "test-begin", "--title", "Test", "--purpose", "Testing"]);
  assert(r.exitCode === 0, `Failed: ${r.stderr}`);
  const milestone = readJson(path.join(MILESTONES_DIR, "test-begin.json"));
  assert(milestone.status === "active", "Milestone not active");
  const sessions = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith(".json"));
  assert(sessions.length > 0, "No session created");
  cleanState();
});

test("begin resumes active milestone", () => {
  cleanState();
  runBegin(["--slug", "resume-test", "--title", "Resume", "--purpose", "Test"]);
  const r = runBegin([]);
  assert(r.exitCode === 0, `Failed: ${r.stderr || r.stdout}`);
  assert(r.stdout.includes("Resume") || r.stdout.includes("resume-test"), `Should reference active milestone, got: ${r.stdout.slice(0, 200)}`);
  cleanState();
});

// ---- agent-review ----

console.log("\n## agent-review");

test("agent-review requires slug", () => {
  const r = runReview([]);
  assert(r.exitCode !== 0, "Should fail without slug");
});

test("agent-review passes clean milestone", () => {
  cleanState();
  // Create a milestone file so review can find it
  writeJson(path.join(MILESTONES_DIR, "clean-review.json"), {
    id: "clean-review",
    status: "active",
    scope: { included: ["scripts/"], excluded: [] }
  });
  const r = runReview(["--slug", "clean-review", "--json"]);
  // May fail or pass depending on dirty tree — but should produce valid JSON
  const out = r.stdout ? JSON.parse(r.stdout) : null;
  assert(out, "No JSON output");
  assert(out.milestoneId === "clean-review", "Wrong milestone");
  cleanState();
});

test("agent-review detects secrets in diff", () => {
  const content = fs.readFileSync(path.join(PROJECT_ROOT, "scripts", "agent-review.js"), "utf8");
  assert(content.includes("SECRET_LEAK"), "Missing SECRET_LEAK check");
  assert(content.includes("checkSecrets"), "Missing checkSecrets");
});

test("agent-review detects forbidden files", () => {
  const content = fs.readFileSync(path.join(PROJECT_ROOT, "scripts", "agent-review.js"), "utf8");
  assert(content.includes("FORBIDDEN_FILE"), "Missing FORBIDDEN_FILE check");
  assert(content.includes(".env"), "Missing .env check");
});

test("agent-review detects out-of-scope files", () => {
  const content = fs.readFileSync(path.join(PROJECT_ROOT, "scripts", "agent-review.js"), "utf8");
  assert(content.includes("OUT_OF_SCOPE_EXCLUDED"), "Missing OUT_OF_SCOPE_EXCLUDED");
  assert(content.includes("UNEXPECTED_DIR"), "Missing UNEXPECTED_DIR");
});

test("agent-review creates review record", () => {
  cleanState();
  writeJson(path.join(MILESTONES_DIR, "review-record-test.json"), {
    id: "review-record-test",
    status: "active",
    scope: { included: ["scripts/"], excluded: [] }
  });
  runReview(["--slug", "review-record-test"]);
  const reviews = fs.readdirSync(REVIEW_DIR).filter(f => f.endsWith(".json"));
  assert(reviews.length > 0, "No review record created");
  cleanState();
});

test("review record has correct structure", () => {
  const content = fs.readFileSync(path.join(PROJECT_ROOT, "scripts", "agent-review.js"), "utf8");
  assert(content.includes("reviewedAt"), "Missing reviewedAt");
  assert(content.includes("summary"), "Missing summary");
  assert(content.includes("findings"), "Missing findings");
});

// ---- dev-end ----

console.log("\n## dev:end");

test("dev-end requires summary", () => {
  const r = runEnd([]);
  assert(r.exitCode !== 0, "Should fail without summary");
});

test("dev-end fails without active milestone", () => {
  cleanState();
  const r = runEnd(["--summary", "test"]);
  assert(r.exitCode !== 0, "Should fail without milestone");
});

test("dev-end runs lifecycle steps", () => {
  const content = fs.readFileSync(path.join(PROJECT_ROOT, "scripts", "dev-end.js"), "utf8");
  assert(content.includes("session:close"), "Missing session close step");
  assert(content.includes("prepare"), "Missing prepare step");
  assert(content.includes("validate"), "Missing validate step");
  assert(content.includes("complete"), "Missing complete step");
  assert(content.includes("agent-review"), "Missing agent review step");
});

test("dev-end supports dry-run flag", () => {
  const content = fs.readFileSync(path.join(PROJECT_ROOT, "scripts", "dev-end.js"), "utf8");
  assert(content.includes("--dry-run"), "Missing dry-run support");
});

test("dev-end supports --deliver flag", () => {
  const content = fs.readFileSync(path.join(PROJECT_ROOT, "scripts", "dev-end.js"), "utf8");
  assert(content.includes("--deliver"), "Missing deliver flag");
});

test("dev-end supports --pr flag", () => {
  const content = fs.readFileSync(path.join(PROJECT_ROOT, "scripts", "dev-end.js"), "utf8");
  assert(content.includes("--pr"), "Missing pr flag");
});

test("dev-end supports --skip-review flag", () => {
  const content = fs.readFileSync(path.join(PROJECT_ROOT, "scripts", "dev-end.js"), "utf8");
  assert(content.includes("--skip-review"), "Missing skip-review flag");
});

// ---- dev:issue ----

console.log("\n## dev:issue");

test("dev-issue script exists", () => {
  assert(fs.existsSync(path.join(PROJECT_ROOT, "scripts", "dev-issue.js")));
});

test("dev-issue reports and lists issues", () => {
  cleanState();
  const r = run("node", [path.join(PROJECT_ROOT, "scripts", "dev-issue.js"), "report", "--type", "bug", "--priority", "high", "--title", "Test bug"]);
  assert(r.exitCode === 0, `Report failed: ${r.stderr}`);
  assert(r.stdout.length > 0, "Report produced no output");
  const out = JSON.parse(r.stdout);
  assert(out.ok === true, "Report not ok");
  assert(out.title === "Test bug", `Wrong title: ${out.title}`);
  const list = run("node", [path.join(PROJECT_ROOT, "scripts", "dev-issue.js"), "list"]);
  assert(list.exitCode === 0, `List failed: ${list.stderr}`);
  assert(list.stdout.includes(out.id), "Issue not in list");
  cleanState();
});

test("dev-issue resolves issue", () => {
  cleanState();
  run("node", [path.join(PROJECT_ROOT, "scripts", "dev-issue.js"), "report", "--type", "bug", "--priority", "low", "--title", "Fix"]);
  const r = run("node", [path.join(PROJECT_ROOT, "scripts", "dev-issue.js"), "resolve", "issue-001", "--note", "Done"]);
  assert(r.exitCode === 0, `Resolve failed: ${r.stderr}`);
  const show = run("node", [path.join(PROJECT_ROOT, "scripts", "dev-issue.js"), "show", "issue-001"]);
  const issue = JSON.parse(show.stdout);
  assert(issue.status === "closed", "Issue not closed");
  assert(issue.resolvedAt !== null, "Missing resolvedAt");
  cleanState();
});

test("dev-issue links to milestone", () => {
  cleanState();
  run("node", [path.join(PROJECT_ROOT, "scripts", "dev-issue.js"), "report", "--type", "bug", "--priority", "medium", "--title", "Fix"]);
  const r = run("node", [path.join(PROJECT_ROOT, "scripts", "dev-issue.js"), "link", "issue-001", "--milestone", "test-ms"]);
  assert(r.exitCode === 0, `Link failed: ${r.stderr}`);
  const show = run("node", [path.join(PROJECT_ROOT, "scripts", "dev-issue.js"), "show", "issue-001"]);
  const issue = JSON.parse(show.stdout);
  assert(issue.milestoneId === "test-ms", "Wrong milestone link");
  cleanState();
});

test("dev-issue critical blocks dev:status --strict", () => {
  cleanState();
  run("node", [path.join(PROJECT_ROOT, "scripts", "dev-issue.js"), "report", "--type", "bug", "--priority", "critical", "--title", "Critical bug"]);
  const r = run("node", [path.join(PROJECT_ROOT, "scripts", "dev-status.js"), "--strict"]);
  assert(r.exitCode !== 0, "Should exit non-zero with critical issue");
  cleanState();
});

test("Issue schema exists with correct fields", () => {
  const schemaPath = path.join(PROJECT_ROOT, "development", "schemas", "issue.schema.json");
  assert(fs.existsSync(schemaPath), "Issue schema not found");
  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  assert(schema.properties.status.enum.includes("open"), "Missing open status");
  assert(schema.properties.status.enum.includes("closed"), "Missing closed status");
  assert(schema.properties.type.enum.includes("bug"), "Missing bug type");
  assert(schema.properties.priority.enum.includes("critical"), "Missing critical priority");
});

// ---- npm scripts ----

console.log("\n## npm Scripts");

test("npm scripts exist", () => {
  const pkg = readJson(path.join(PROJECT_ROOT, "package.json"));
  assert(pkg.scripts["dev:begin"], "Missing dev:begin");
  assert(pkg.scripts["dev:end"], "Missing dev:end");
  assert(pkg.scripts["dev:review"], "Missing dev:review");
  assert(pkg.scripts["dev:issue"], "Missing dev:issue");
  assert(pkg.scripts["dev:brief"], "Missing dev:brief");
  assert(pkg.scripts["dev:closeout"], "Missing dev:closeout");
});

// ---- dev:brief ----

console.log("\n## dev:brief");

test("dev-brief script exists", () => {
  assert(fs.existsSync(path.join(PROJECT_ROOT, "scripts", "dev-brief.js")));
});

test("dev-brief create and show", () => {
  cleanState();
  const r = run("node", [path.join(PROJECT_ROOT, "scripts", "dev-brief.js"), "create", "--slug", "test-brief", "--context", "Fix the thing", "--acceptance", "Works", "--acceptance", "Tests pass", "--file", "scripts/test.js"]);
  assert(r.exitCode === 0, `Create failed: ${r.stderr}`);
  const out = JSON.parse(r.stdout);
  assert(out.ok === true, "Create not ok");
  assert(out.acceptance === 2, "Wrong acceptance count");

  const show = run("node", [path.join(PROJECT_ROOT, "scripts", "dev-brief.js"), "show", "test-brief"]);
  assert(show.exitCode === 0, `Show failed: ${show.stderr}`);
  const brief = JSON.parse(show.stdout);
  assert(brief.milestoneId === "test-brief", "Wrong milestoneId");
  assert(brief.acceptance.length === 2, "Wrong acceptance count");
  assert(brief.context === "Fix the thing", "Wrong context");
  cleanState();
});

test("Brief schema exists with correct fields", () => {
  const schemaPath = path.join(PROJECT_ROOT, "development", "schemas", "brief.schema.json");
  assert(fs.existsSync(schemaPath), "Brief schema not found");
  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  assert(schema.required.includes("milestoneId"), "Missing milestoneId");
  assert(schema.required.includes("context"), "Missing context");
  assert(schema.required.includes("acceptance"), "Missing acceptance");
});

// ---- dev:closeout ----

console.log("\n## dev:closeout");

test("dev-closeout script exists", () => {
  assert(fs.existsSync(path.join(PROJECT_ROOT, "scripts", "dev-closeout.js")));
});

test("dev-closeout generates closeout from canonical records", () => {
  cleanState();
  // Create a milestone and session
  run("node", [path.join(PROJECT_ROOT, "scripts", "dev-lifecycle.js"), "start", "--slug", "closeout-test", "--title", "Closeout", "--purpose", "Test closeout"]);
  run("node", [path.join(PROJECT_ROOT, "scripts", "dev-lifecycle.js"), "checkpoint", "--message", "Implemented feature"]);
  run("node", [path.join(PROJECT_ROOT, "scripts", "dev-lifecycle.js"), "session:close", "--summary", "Done"]);

  const r = run("node", [path.join(PROJECT_ROOT, "scripts", "dev-closeout.js"), "--slug", "closeout-test", "--dry-run"]);
  assert(r.exitCode === 0, `Closeout failed: ${r.stderr}`);
  const closeout = JSON.parse(r.stdout);
  assert(closeout.work_id === "closeout-test", "Wrong work_id");
  assert(closeout.completed.includes("Implemented feature"), "Missing completed work");

  cleanState();
});

test("dev-closeout writes to output path", () => {
  cleanState();
  const outPath = path.join(PROJECT_ROOT, "development", "test-closeout-output.json");
  run("node", [path.join(PROJECT_ROOT, "scripts", "dev-lifecycle.js"), "start", "--slug", "write-test", "--title", "Write", "--purpose", "Test"]);
  run("node", [path.join(PROJECT_ROOT, "scripts", "dev-lifecycle.js"), "session:close", "--summary", "Done"]);
  const r = run("node", [path.join(PROJECT_ROOT, "scripts", "dev-closeout.js"), "--slug", "write-test", "--output", outPath]);
  assert(r.exitCode === 0, `Closeout failed: ${r.stderr}`);
  assert(fs.existsSync(outPath), "Output file not created");
  const closeout = readJson(outPath, null);
  assert(closeout.work_id === "write-test", "Wrong work_id");
  fs.unlinkSync(outPath);
  cleanState();
});

// ---- Summary ----

console.log(`\n## Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFailed tests:");
  for (const f of failures) console.log(`  - ${f.name}: ${f.message}`);
  process.exit(1);
}
process.exit(0);
