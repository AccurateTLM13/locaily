/**
 * scripts/test-relay-trust-pairing.js
 *
 * Acceptance test suite for M09A Relay Trust and Node Pairing Ceremony.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { normalizeNodeConfig } = require("../companion/capability-kernel/node-manager");
const { executePairingCeremony, initiatePairing, respondChallenge, verifyPairingResponse } = require("../companion/capability-kernel/node-pairing");
const { loadTrustStore, getTrustRecord, revokeTrustRecord } = require("../companion/capability-kernel/trust-store");
const { RelayTransport, signRequest, verifyRequestSignature } = require("../companion/capability-kernel/transport-adapter");

const TEMP_DIR = path.join(__dirname, "..", "data", "test-trust-tmp");
const TRUST_STORE_PATH = path.join(TEMP_DIR, "node-trust-store.json");

function setup() {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

function cleanup() {
  try {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  } catch {}
}

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

console.log("\n## M09A Relay Trust and Node Pairing Ceremony");

async function main() {
  setup();

  try {
    // AC 1: 4-Step Pairing Ceremony
    await runTest("AC 1: Nodes complete 4-step challenge-response pairing ceremony and acquire trust tokens", () => {
      const hostNode = normalizeNodeConfig({ node_id: "node-brain-host" });
      const peerNode = normalizeNodeConfig({ node_id: "node-worker-peer" });

      const pairingResult = executePairingCeremony(hostNode, peerNode, TRUST_STORE_PATH);
      assert.strictEqual(pairingResult.ok, true);
      assert.strictEqual(pairingResult.step, 4);
      assert.strictEqual(pairingResult.action, "ENROLLED");
      assert.ok(pairingResult.secretToken.startsWith("tok_"));

      const record = getTrustRecord("node-worker-peer", TRUST_STORE_PATH);
      assert.strictEqual(record.status, "active");
      assert.strictEqual(record.secretToken, pairingResult.secretToken);
    });

    // AC 2: Signed Request Verification
    await runTest("AC 2: Inter-node requests are signed with HMAC-SHA256 and verified against node secret tokens", () => {
      const token = "tok_test_secret_key_001";
      const payload = { event_id: "evt_123", action: "ping" };

      const { timestamp, signature } = signRequest(payload, token);
      assert.ok(signature.length === 64); // SHA256 hex string length

      const verifyResult = verifyRequestSignature(payload, timestamp, signature, token);
      assert.strictEqual(verifyResult.ok, true);

      const badResult = verifyRequestSignature(payload, timestamp, "invalid_sig_0000000000000000000000000000000000000000000000000000000000000", token);
      assert.strictEqual(badResult.ok, false);
      assert.strictEqual(badResult.code, "INVALID_SIGNATURE");

      const malformedTimeResult = verifyRequestSignature(payload, "invalid-date-string", signature, token);
      assert.strictEqual(malformedTimeResult.ok, false);
      assert.strictEqual(malformedTimeResult.code, "REPLAY_WINDOW_EXPIRED");

      const replayResult = verifyRequestSignature(payload, timestamp, signature, token);
      assert.strictEqual(replayResult.ok, false);
      assert.strictEqual(replayResult.code, "REPLAY_ATTACK");
    });

    // AC 3: Untrusted Node Rejection & Unhandled Transport Rejection
    await runTest("AC 3: Requests to or from untrusted, unpaired nodes are rejected with UNTRUSTED_NODE", async () => {
      const hostNode = normalizeNodeConfig({ node_id: "node-brain-host" });
      const trustStore = { getTrustRecord: (id) => getTrustRecord(id, TRUST_STORE_PATH) };

      const relayTransport = new RelayTransport({
        nodeConfig: hostNode,
        peerNodeId: "unpaired-stranger-node",
        trustStore
      });

      const eventEnvelope = {
        schema_version: "1.0",
        event_id: "evt_stranger",
        event_type: "ctk.test",
        occurred_at: new Date().toISOString(),
        source: { node_id: "node-brain-host", adapter_id: "relay" },
        correlation_id: "corr_stranger",
        payload: {}
      };

      try {
        await relayTransport.send(eventEnvelope);
        assert.fail("Should have thrown UNTRUSTED_NODE");
      } catch (err) {
        assert.strictEqual(err.code, "UNTRUSTED_NODE");
      }

      // Test paired node without transport handler
      const pairedRelay = new RelayTransport({
        nodeConfig: hostNode,
        peerNodeId: "node-worker-peer",
        trustStore
      });

      try {
        await pairedRelay.send(eventEnvelope);
        assert.fail("Should have thrown UNHANDLED_TRANSPORT");
      } catch (err) {
        assert.strictEqual(err.code, "UNHANDLED_TRANSPORT");
      }
    });

    // AC 4: Node Revocation
    await runTest("AC 4: Revoked nodes are immediately rejected from inter-node execution", async () => {
      const hostNode = normalizeNodeConfig({ node_id: "node-brain-host" });

      // Revoke previously paired node
      const revokeRes = revokeTrustRecord("node-worker-peer", "Security key compromised", TRUST_STORE_PATH);
      assert.strictEqual(revokeRes.ok, true);
      assert.strictEqual(revokeRes.record.status, "revoked");

      const trustStore = { getTrustRecord: (id) => getTrustRecord(id, TRUST_STORE_PATH) };
      const relayTransport = new RelayTransport({
        nodeConfig: hostNode,
        peerNodeId: "node-worker-peer",
        trustStore
      });

      const eventEnvelope = {
        schema_version: "1.0",
        event_id: "evt_revoked",
        event_type: "ctk.test",
        occurred_at: new Date().toISOString(),
        source: { node_id: "node-brain-host", adapter_id: "relay" },
        correlation_id: "corr_revoked",
        payload: {}
      };

      try {
        await relayTransport.send(eventEnvelope);
        assert.fail("Should have thrown UNTRUSTED_NODE for revoked node");
      } catch (err) {
        assert.strictEqual(err.code, "UNTRUSTED_NODE");
      }
    });

  } finally {
    cleanup();
  }

  console.log(`\n## Results: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

main();
