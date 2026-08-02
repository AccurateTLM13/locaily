/**
 * scripts/test-node-event-bus.js
 *
 * Acceptance test suite for CTK-03 Local Node Event Bus and Transport Adapter.
 */

const assert = require("assert");
const { createEventBus, topicMatches } = require("../companion/capability-kernel/event-bus");
const { LocalTransport, RelayTransport, signRequest, verifyRequestSignature } = require("../companion/capability-kernel/transport-adapter");
const { normalizeNodeConfig } = require("../companion/capability-kernel/node-manager");

let passed = 0;
let failed = 0;

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL  ${name}`);
    console.error(`        ${err.message}`);
    failed++;
  }
}

console.log("\n## CTK-03 Local Node Event Bus and Transport Adapter");

async function main() {
  try {
    // AC 1: Wildcard Topic Matching
    await runTest("AC 1: Event bus supports topic pattern matching with wildcards (*, #)", () => {
      assert.strictEqual(topicMatches("project.status.changed", "project.status.changed"), true);
      assert.strictEqual(topicMatches("project.*.changed", "project.status.changed"), true);
      assert.strictEqual(topicMatches("project.*", "project.status"), true);
      assert.strictEqual(topicMatches("ctk.#", "ctk.event.trigger.run"), true);
      assert.strictEqual(topicMatches("ctk.#", "ctk"), true);
      assert.strictEqual(topicMatches("project.*", "project.status.changed"), false);
    });

    // AC 2: Pub/Sub Dispatch & Local Transport
    await runTest("AC 2: Pub/Sub event bus dispatches events to registered subscribers via LocalTransport", async () => {
      const bus = createEventBus();
      const nodeConfig = normalizeNodeConfig({ node_id: "node-brain-01" });
      const transport = new LocalTransport({ bus, nodeConfig });

      let receivedEvent = null;
      bus.subscribe("project.status.changed", (evt) => {
        receivedEvent = evt;
      }, { node_id: "subscriber-worker-01" });

      const eventEnvelope = {
        schema_version: "1.0",
        event_id: "evt_test_001",
        event_type: "project.status.changed",
        occurred_at: new Date().toISOString(),
        source: { node_id: "node-brain-01", adapter_id: "local" },
        correlation_id: "corr_001",
        payload: { current_status: "review_ready" }
      };

      const pubRes = await transport.send(eventEnvelope);
      assert.strictEqual(pubRes.ok, true);
      assert.strictEqual(receivedEvent.event_id, "evt_test_001");
      assert.strictEqual(pubRes.provenance.delivered_count, 1);
    });

    // AC 3: Delivery Provenance
    await runTest("AC 3: Event bus records complete delivery provenance (delivered_to, latency_ms)", async () => {
      const bus = createEventBus();
      bus.subscribe("ctk.#", () => {}, { node_id: "sub-1" });
      bus.subscribe("ctk.#", () => {}, { node_id: "sub-2" });

      const eventEnvelope = {
        schema_version: "1.0",
        event_id: "evt_prov_001",
        event_type: "ctk.event.fired",
        occurred_at: new Date().toISOString(),
        source: { node_id: "node-brain-01", adapter_id: "local" },
        correlation_id: "corr_prov",
        payload: { trigger_id: "trig_1" }
      };

      const pubRes = await bus.publish(eventEnvelope);
      assert.strictEqual(pubRes.ok, true);
      assert.strictEqual(pubRes.provenance.delivered_count, 2);
      assert.ok(typeof pubRes.provenance.latency_ms === "number");
      assert.strictEqual(pubRes.provenance.deliveries.length, 2);
    });

    // AC 4: Error Isolation & Failure Provenance
    await runTest("AC 4: Subscriber execution errors are caught without crashing event bus", async () => {
      const bus = createEventBus();
      bus.subscribe("app.error", () => {
        throw new Error("Subscriber crash!");
      }, { node_id: "buggy-sub" });

      const eventEnvelope = {
        schema_version: "1.0",
        event_id: "evt_err_001",
        event_type: "app.error",
        occurred_at: new Date().toISOString(),
        source: { node_id: "node-brain-01", adapter_id: "local" },
        correlation_id: "corr_err",
        payload: { error_msg: "test" }
      };

      const pubRes = await bus.publish(eventEnvelope);
      assert.strictEqual(pubRes.ok, false);
      assert.strictEqual(pubRes.provenance.failed_count, 1);
      assert.strictEqual(pubRes.errors[0].error, "Subscriber crash!");
    });
  } catch (err) {
    console.error("Unhandled test suite error:", err);
    failed++;
  }

  console.log(`\n## Results: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

main();
