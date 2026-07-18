const assert = require("node:assert");
const { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { createDevelopmentEventStore } = require("../companion/memory/events/event-store");
const {
  containsSecretText,
  validateEventHasNoSecrets,
  redactStringSecrets
} = require("../companion/memory/events/event-redaction");
const { readJson } = require("../benchmark-lab/engine/fs-utils");

const ROOT = join(__dirname, "..");
const VALID_EVENT_PATH = join(ROOT, "companion/schemas/fixtures/development-memory/event.valid.json");

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === "function") {
      return result.then(() => {
        passed += 1;
        console.log(`PASS: ${name}`);
      }).catch((error) => {
        failed += 1;
        console.error(`FAIL: ${name}`);
        console.error(`  ${error.message}`);
      });
    }
    passed += 1;
    console.log(`PASS: ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL: ${name}`);
    console.error(`  ${error.message}`);
  }
}

function makeStore() {
  const dir = mkdtempSync(join(tmpdir(), "locaily-dm-events-"));
  const store = createDevelopmentEventStore({ dataDir: join(dir, "events") });
  return { store, dir };
}

async function loadValidEvent(overrides = {}) {
  const event = await readJson(VALID_EVENT_PATH);
  return { ...event, ...overrides };
}

async function run() {
  const pending = [];

  pending.push(check("secret detector rejects bearer tokens", () => {
    assert.strictEqual(containsSecretText("Authorization: Bearer abcdef1234567890"), true);
    assert.strictEqual(containsSecretText("Added schema files."), false);
  }));

  pending.push(check("validateEventHasNoSecrets rejects password fields", () => {
    const result = validateEventHasNoSecrets({ summary: "password=supersecret" });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, "SECRET_CONTENT_REJECTED");
  }));

  pending.push(check("redactStringSecrets masks token patterns", () => {
    const redacted = redactStringSecrets("token=abc123456789012345678901234567890");
    assert.ok(redacted.includes("[REDACTED]"));
  }));

  pending.push(check("appendEvent persists valid event", async () => {
    const { store, dir } = makeStore();
    try {
      const event = await loadValidEvent({ eventId: "evt_test_persist_001" });
      const result = await store.appendEvent(event);
      assert.ok(result.ok, JSON.stringify(result.error));
      assert.strictEqual(result.result.duplicate, false);
      const filePath = join(dir, "events", "evt_test_persist_001.json");
      assert.ok(existsSync(filePath));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }));

  pending.push(check("appendEvent rejects invalid schema", async () => {
    const { store, dir } = makeStore();
    try {
      const result = await store.appendEvent({ eventId: "evt_bad", summary: "missing fields" });
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.error.code, "EVENT_SCHEMA_INVALID");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }));

  pending.push(check("appendEvent rejects secret content", async () => {
    const { store, dir } = makeStore();
    try {
      const event = await loadValidEvent({
        eventId: "evt_test_secret_001",
        summary: "Deploy failed because token=abc123456789012345678901234567890 leaked"
      });
      const result = await store.appendEvent(event);
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.error.code, "SECRET_CONTENT_REJECTED");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }));

  pending.push(check("duplicate submissions are idempotent", async () => {
    const { store, dir } = makeStore();
    try {
      const event = await loadValidEvent({ eventId: "evt_test_duplicate_001" });
      const first = await store.appendEvent(event);
      const second = await store.appendEvent(event);
      assert.ok(first.ok);
      assert.ok(second.ok);
      assert.strictEqual(second.result.duplicate, true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }));

  pending.push(check("conflicting eventId payloads are rejected", async () => {
    const { store, dir } = makeStore();
    try {
      const event = await loadValidEvent({ eventId: "evt_test_conflict_001" });
      const changed = await loadValidEvent({
        eventId: "evt_test_conflict_001",
        summary: "Different summary for same eventId."
      });
      assert.ok((await store.appendEvent(event)).ok);
      const conflict = await store.appendEvent(changed);
      assert.strictEqual(conflict.ok, false);
      assert.strictEqual(conflict.error.code, "EVENT_ID_CONFLICT");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }));

  pending.push(check("queryEvents filters by project and eventType", async () => {
    const { store, dir } = makeStore();
    try {
      const eventA = await loadValidEvent({ eventId: "evt_query_a", project: "locaily", eventType: "commit_created" });
      const eventB = await loadValidEvent({
        eventId: "evt_query_b",
        project: "other",
        eventType: "task_accepted",
        source: { adapter: "supervisor" }
      });
      await store.appendEvent(eventA);
      await store.appendEvent(eventB);

      const filtered = await store.queryEvents({ project: "locaily", eventType: "commit_created" });
      assert.ok(filtered.ok);
      assert.strictEqual(filtered.result.count, 1);
      assert.strictEqual(filtered.result.events[0].eventId, "evt_query_a");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }));

  pending.push(check("queryEvents filters by correlation objectiveId", async () => {
    const { store, dir } = makeStore();
    try {
      const event = await loadValidEvent({
        eventId: "evt_query_objective",
        correlation: {
          runId: "run_1",
          objectiveId: "dm2-event-store",
          taskId: "task_1",
          sessionId: null
        }
      });
      await store.appendEvent(event);
      const filtered = await store.queryEvents({ objectiveId: "dm2-event-store" });
      assert.strictEqual(filtered.result.count, 1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }));

  pending.push(check("getEvent returns stored record", async () => {
    const { store, dir } = makeStore();
    try {
      const event = await loadValidEvent({ eventId: "evt_get_one" });
      await store.appendEvent(event);
      const loaded = await store.getEvent("evt_get_one");
      assert.ok(loaded.ok);
      assert.strictEqual(loaded.result.eventId, "evt_get_one");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }));

  pending.push(check("interrupted temp write does not replace final event file", async () => {
    const { store, dir } = makeStore();
    try {
      const event = await loadValidEvent({ eventId: "evt_interrupt_safe" });
      await store.appendEvent(event);
      const filePath = join(dir, "events", "evt_interrupt_safe.json");
      writeFileSync(`${filePath}.999999.tmp`, "{ incomplete", "utf8");
      const loaded = await store.getEvent("evt_interrupt_safe");
      assert.ok(loaded.ok);
      assert.strictEqual(loaded.result.eventId, "evt_interrupt_safe");
      assert.doesNotThrow(() => JSON.parse(readFileSync(filePath, "utf8")));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }));

  pending.push(check("purgeExpiredEvents removes old records when enabled", async () => {
    const { store, dir } = makeStore();
    try {
      const oldEvent = await loadValidEvent({
        eventId: "evt_old",
        occurredAt: "2020-01-01T00:00:00.000Z",
        capturedAt: "2020-01-01T00:00:01.000Z"
      });
      const newEvent = await loadValidEvent({ eventId: "evt_new" });
      await store.appendEvent(oldEvent);
      await store.appendEvent(newEvent);
      const purge = await store.purgeExpiredEvents({ keepRawEvents: true, retentionDays: 30 });
      assert.ok(purge.ok);
      assert.ok(purge.result.purged >= 1);
      const oldLoaded = await store.getEvent("evt_old");
      assert.strictEqual(oldLoaded.ok, false);
      const newLoaded = await store.getEvent("evt_new");
      assert.ok(newLoaded.ok);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }));

  await Promise.all(pending);

  console.log(`\n${passed}/${passed + failed} development memory event tests passed`);
  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
