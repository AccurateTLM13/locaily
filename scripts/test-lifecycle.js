const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const lifecycle = require("./objective-lifecycle");

const PASS = "PASS";
const FAIL = "FAIL";
let passed = 0;
let failed = 0;
let errors = [];

function test(name, fn) {
  try {
    fn();
    console.log(`  ${PASS}  ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ${FAIL}  ${name}`);
    console.error(`       ${e.message}`);
    failed++;
    errors.push({ name, message: e.message });
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || "assertion failed");
}

function assertDeepEqual(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(msg || `Expected ${e}, got ${a}`);
}

// ---- State Machine Tests ----

console.log("\n## State Machine");

test("STATES are frozen", () => {
  assert(lifecycle.STATES.PLANNED === "planned");
  assert(lifecycle.STATES.COMPLETED === "completed");
  assert(lifecycle.STATES.FAILED === "failed");
  assert(lifecycle.STATES.ABANDONED === "abandoned");
  assert(lifecycle.STATES.SUPERSEDED === "superseded");
});

test("isTerminal identifies terminal states", () => {
  assert(lifecycle.isTerminal("completed") === true);
  assert(lifecycle.isTerminal("failed") === true);
  assert(lifecycle.isTerminal("abandoned") === true);
  assert(lifecycle.isTerminal("queued") === false);
  assert(lifecycle.isTerminal("active") === false);
});

test("isValidTransition enforces legal transitions", () => {
  assert(lifecycle.isValidTransition("queued", "active") === true);
  assert(lifecycle.isValidTransition("active", "completed") === true);
  assert(lifecycle.isValidTransition("active", "failed") === true);
  assert(lifecycle.isValidTransition("active", "held") === true);
  assert(lifecycle.isValidTransition("completed", "superseded") === true);
  assert(lifecycle.isValidTransition("queued", "completed") === false);
  assert(lifecycle.isValidTransition("completed", "active") === false);
  assert(lifecycle.isValidTransition("abandoned", "active") === false);
});

test("Terminal states have no outgoing transitions", () => {
  assert(lifecycle.isValidTransition("completed", "active") === false);
  assert(lifecycle.isValidTransition("failed", "active") === false);
});

// ---- Objective Meta Tests ----

console.log("\n## Objective Meta");

test("createObjectiveMeta produces default meta", () => {
  const meta = lifecycle.createObjectiveMeta({ objective_id: "test-01", slug: "test-objective" });
  assert(meta.objective_id === "test-01");
  assert(meta.slug === "test-objective");
  assert(meta.status === "queued");
  assert(meta.revision === 1);
});

test("createObjectiveMeta accepts overrides", () => {
  const meta = lifecycle.createObjectiveMeta({
    objective_id: "m07",
    slug: "durable-background",
    status: "completed",
    completion_commit: "abc123",
  });
  assert(meta.objective_id === "m07");
  assert(meta.status === "completed");
  assert(meta.completion_commit === "abc123");
});

// ---- Parsing Tests ----

console.log("\n## Objective Parsing");

test("parseObjectiveId extracts prefix and slug", () => {
  const r = lifecycle.parseObjectiveId("06-trusted-relay-execution.md");
  assert(r.prefix === "06");
  assert(r.slug === "trusted-relay-execution");
});

test("parseObjectiveId handles no prefix", () => {
  const r = lifecycle.parseObjectiveId("track-learning-evidence-loop.md");
  assert(r.prefix === null);
  assert(r.slug === "track-learning-evidence-loop");
});

// ---- Duplicate Detection Tests ----

console.log("\n## Duplicate Detection");

test("detectDuplicates finds slug duplicates", () => {
  const files = [
    { name: "07-durable-background-execution.md" },
    { name: "07-durable-background-execution.md", subdir: "completed" },
  ];
  const issues = lifecycle.detectDuplicates(files);
  const dup = issues.find(i => i.type === "duplicate_slug");
  assert(dup, "Expected duplicate_slug issue");
  assert(dup.slug === "durable-background-execution");
  assert(dup.locations.length === 2);
});

test("detectDuplicates finds prefix collisions", () => {
  const files = [
    { name: "10-locaily-v1-packaging.md" },
    { name: "10-track-learning-evidence-loop.md" },
  ];
  const issues = lifecycle.detectDuplicates(files);
  const coll = issues.find(i => i.type === "colliding_prefix");
  assert(coll, "Expected colliding_prefix issue");
  assert(coll.prefix === "10");
});

test("detectDuplicates handles unique files cleanly", () => {
  const files = [
    { name: "06-trusted-relay-execution.md", subdir: "completed" },
    { name: "07-durable-background-execution.md", subdir: "completed" },
  ];
  const issues = lifecycle.detectDuplicates(files);
  assert(issues.length === 0, "Expected no issues");
});

// ---- Objective ID Collision Detection ----

console.log("\n## Objective ID Collisions");

test("detectObjectiveIdCollisions catches shared objective_id across different slugs", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lifecycle-test-"));
  fs.mkdirSync(path.join(dir, "queued"), { recursive: true });
  const file1 = path.join(dir, "queued", "10-packaging.md");
  const file2 = path.join(dir, "queued", "10-learning-loop.md");
  fs.writeFileSync(file1, "# M10", "utf8");
  fs.writeFileSync(file2, "# M10 alt", "utf8");
  fs.writeFileSync(path.join(dir, "queued", "10-packaging.meta.json"), JSON.stringify({ objective_id: "m10", slug: "locaily-v1-packaging" }));
  fs.writeFileSync(path.join(dir, "queued", "10-learning-loop.meta.json"), JSON.stringify({ objective_id: "m10", slug: "track-learning-loop" }));
  const files = [
    { name: "10-packaging.md", subdir: "queued" },
    { name: "10-learning-loop.md", subdir: "queued" },
  ];
  const issues = lifecycle.detectObjectiveIdCollisions(files, dir);
  const dup = issues.find(i => i.type === "duplicate_objective_id");
  assert(dup, "Expected duplicate_objective_id issue");
  assert(dup.objective_id === "m10");
  assert(dup.slugs.includes("locaily-v1-packaging"));
  assert(dup.slugs.includes("track-learning-loop"));
  assert(dup.severity === "error");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("detectObjectiveIdCollisions accepts unique objective_ids", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lifecycle-test-"));
  fs.mkdirSync(path.join(dir, "held"), { recursive: true });
  fs.writeFileSync(path.join(dir, "held", "test.meta.json"), JSON.stringify({ objective_id: "m12", slug: "foo" }));
  fs.writeFileSync(path.join(dir, "held", "test.md"), "# Test", "utf8");
  const files = [{ name: "test.md", subdir: "held" }];
  const issues = lifecycle.detectObjectiveIdCollisions(files, dir);
  assert(issues.length === 0, "Expected no issues with unique objective_ids");
  fs.rmSync(dir, { recursive: true, force: true });
});

// ---- Encoding Checks ----

console.log("\n## Encoding");

test("checkEncoding detects UTF-16 LE BOM", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lifecycle-test-"));
  const fpath = path.join(dir, "test.md");
  fs.writeFileSync(fpath, Buffer.from([0xFF, 0xFE, 0x48, 0x00, 0x69, 0x00])); // "Hi" in UTF-16 LE
  const issues = lifecycle.checkEncoding(fpath);
  const utf16 = issues.find(i => i.type === "utf16le_bom");
  assert(utf16, "Expected utf16le_bom issue");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("checkEncoding passes clean UTF-8", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lifecycle-test-"));
  const fpath = path.join(dir, "test.md");
  fs.writeFileSync(fpath, "# Hello World", "utf8");
  const issues = lifecycle.checkEncoding(fpath);
  assert(issues.length === 0, "Expected no encoding issues");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("normalizeToUtf8 converts UTF-16 LE to clean UTF-8", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lifecycle-test-"));
  const src = path.join(dir, "src.md");
  const dst = path.join(dir, "dst.md");
  fs.writeFileSync(src, Buffer.from([0xFF, 0xFE, 0x23, 0x00, 0x20, 0x00])); // "# " in UTF-16 LE
  lifecycle.normalizeToUtf8(src, dst);
  const content = fs.readFileSync(dst, "utf8");
  assert(content === "# ", "Expected clean UTF-8");
  const buf = fs.readFileSync(dst);
  assert(buf[0] !== 0xFF && buf[1] !== 0xFE, "BOM should be removed");
  fs.rmSync(dir, { recursive: true, force: true });
});

// ---- Transactional Archive Tests ----

console.log("\n## Transactional Archive");

test("transactionalArchive archives with encoding normalization", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lifecycle-test-"));
  const src = path.join(dir, "test-objective.md");
  const destDir = path.join(dir, "completed");
  fs.writeFileSync(src, "# Test Objective\n\nSome content.", "utf8");
  const result = lifecycle.transactionalArchive({
    sourcePath: src,
    destDir,
    status: "completed",
    objectiveId: "test-01",
    slug: "test-objective",
    commit: "abc123def456",
  });
  assert(result.ok === true, `Archive failed: ${JSON.stringify(result.errors)}`);
  assert(result.destPath, "Expected destPath");
  assert(result.metaPath, "Expected metaPath");
  assert(fs.existsSync(result.destPath), "Destination should exist");
  assert(fs.existsSync(result.metaPath), "Meta should exist");
  assert(fs.existsSync(src) === false, "Source should be removed");
  const meta = JSON.parse(fs.readFileSync(result.metaPath, "utf8"));
  assert(meta.objective_id === "test-01");
  assert(meta.status === "completed");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("transactionalArchive reports error when source missing", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lifecycle-test-"));
  const result = lifecycle.transactionalArchive({
    sourcePath: path.join(dir, "nonexistent.md"),
    destDir: path.join(dir, "completed"),
  });
  assert(result.ok === false);
  assert(result.errors.length > 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

// ---- Startup Continuity Tests ----

console.log("\n## Startup Continuity");

test("checkStartupContinuity returns unresolved when closeout shows unsafe", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lifecycle-test-"));
  const closeoutPath = path.join(dir, "closeout.json");
  fs.writeFileSync(closeoutPath, JSON.stringify({
    work_id: "test-session",
    original_goal: "Implement feature X",
    status: "incomplete",
    safe_to_start_unrelated_work: false,
    completed: ["Did part A"],
    remaining: ["Need to do part B"],
    working_branch: "feature/x",
    last_commit: "abc123",
    blockers: [],
    validation: { passed: ["test A"], failed: [], not_run: ["test B"] },
    next_required_action: "Finish part B",
    recommended_next_agent: "worker",
  }));
  const result = lifecycle.checkStartupContinuity(closeoutPath);
  assert(result.unresolved === true);
  assert(result.work_id === "test-session");
  assert(result.remaining.includes("Need to do part B"));
  assert(result.validation.passed.includes("test A"));
  fs.rmSync(dir, { recursive: true, force: true });
});

test("checkStartupContinuity returns safe when closeout is clean", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lifecycle-test-"));
  const closeoutPath = path.join(dir, "closeout.json");
  fs.writeFileSync(closeoutPath, JSON.stringify({
    work_id: "test-session",
    status: "complete",
    safe_to_start_unrelated_work: true,
    original_goal: "Do something",
  }));
  const result = lifecycle.checkStartupContinuity(closeoutPath);
  assert(result.unresolved === false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("checkStartupContinuity handles missing closeout", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lifecycle-test-"));
  const result = lifecycle.checkStartupContinuity(path.join(dir, "nonexistent.json"));
  assert(result.unresolved === false);
  assert(result.reason.includes("No closeout record"));
  fs.rmSync(dir, { recursive: true, force: true });
});

test("checkStartupContinuity handles corrupted closeout", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lifecycle-test-"));
  const closeoutPath = path.join(dir, "closeout.json");
  fs.writeFileSync(closeoutPath, "not json", "utf8");
  const result = lifecycle.checkStartupContinuity(closeoutPath);
  assert(result.unresolved === false);
  assert(result.reason.includes("corrupted") || result.reason.includes("unreadable"));
  fs.rmSync(dir, { recursive: true, force: true });
});

// ---- Real Repository Integrity Check ----

console.log("\n## Repository Integrity");

test("real repository integrity check runs without throwing", () => {
  const issues = lifecycle.runIntegrityCheck();
  assert(Array.isArray(issues), "Expected array of issues");
  // We should find at least some expected issues from the cleanup
  // (duplicates removed, stale milestones fixed, etc.)
  console.log(`  ${issues.length} issue(s) found (expected after partial cleanup)`);
});

// ---- Summary ----

console.log(`\n## Results: ${passed} passed, ${failed} failed${errors.length > 0 ? `, ${errors.length} error(s)` : ""}`);
if (failed > 0) {
  console.log("\nFailed tests:");
  for (const e of errors) {
    console.log(`  - ${e.name}: ${e.message}`);
  }
}
process.exit(failed > 0 ? 1 : 0);
