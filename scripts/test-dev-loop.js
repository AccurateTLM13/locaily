/**
 * scripts/test-dev-loop.js
 *
 * Acceptance test suite for DEV-LOOP-01 Canonical Queue and Safe Runner Integration.
 */

const assert = require("assert");
const path = require("path");
const fs = require("fs");
const { spawnSync } = require("child_process");

const { enqueueMilestoneTask, runNextDevJob, loadDevJobStore } = require("../companion/capability-kernel/dev-queue-adapter");

const TEST_DATA_DIR = path.join(__dirname, "..", "data", "test-dev-loop-tmp");

function setup() {
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
}

function cleanup() {
  try {
    fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  } catch {}
}

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

console.log("\n## DEV-LOOP-01 Canonical Queue and Safe Runner Integration");

setup();

try {
  // AC 1: Enqueue Milestone Task
  runTest("AC 1: Enqueue milestone task as schema-valid durable job", () => {
    const job = enqueueMilestoneTask({
      milestoneId: "ctk-02-node-roles-capability-capsules",
      taskDescription: "Test DEV-LOOP queueing",
      dataDir: TEST_DATA_DIR
    });

    assert.ok(job.jobId.startsWith("job_"));
    assert.strictEqual(job.status, "queued");
    assert.strictEqual(job.executionType, "track");
    assert.strictEqual(job.input.milestoneId, "ctk-02-node-roles-capability-capsules");
  });

  // AC 2: Claim & Execute Job
  runTest("AC 2: Background worker claims and executes queued dev job", () => {
    const runRes = runNextDevJob({ dataDir: TEST_DATA_DIR, workerId: "worker-test-01" });
    assert.strictEqual(runRes.ok, true);
    assert.strictEqual(runRes.job.status, "completed");
    assert.strictEqual(runRes.job.result.completed, true);
  });

  // AC 3: Durable Job Recording
  runTest("AC 3: Job completion is durably persisted in job store", () => {
    const store = loadDevJobStore(TEST_DATA_DIR);
    const jobs = store.listJobs();
    assert.ok(jobs.length > 0);
    assert.strictEqual(jobs[0].status, "completed");
    assert.ok(jobs[0].timestamps.completedAt);
  });

  // AC 4: CLI Control Commands
  runTest("AC 4: CLI entry point scripts/dev-loop.js supports enqueue, run-next, and status", () => {
    // Status CLI
    const statusRes = spawnSync("node", [path.join(__dirname, "dev-loop.js"), "--status"], {
      cwd: path.join(__dirname, ".."),
      encoding: "utf8",
    shell: false
    });
    assert.strictEqual(statusRes.status, 0);
    assert.ok(statusRes.stdout.includes("Development Job Queue Status"));

    // Enqueue CLI
    const enqueueRes = spawnSync("node", [path.join(__dirname, "dev-loop.js"), "--enqueue", "--slug", "ctk-02-node-roles-capability-capsules", "--desc", "CLI test"], {
      cwd: path.join(__dirname, ".."),
      encoding: "utf8",
    shell: false
    });
    assert.strictEqual(enqueueRes.status, 0);
    assert.ok(enqueueRes.stdout.includes("Enqueued milestone task job:"));

    // Run-next CLI
    const runRes = spawnSync("node", [path.join(__dirname, "dev-loop.js"), "--run-next"], {
      cwd: path.join(__dirname, ".."),
      encoding: "utf8",
    shell: false
    });
    assert.strictEqual(runRes.status, 0);
    assert.ok(runRes.stdout.includes("Executed dev job:"));
  });

} finally {
  cleanup();
}

console.log(`\n## Results: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
