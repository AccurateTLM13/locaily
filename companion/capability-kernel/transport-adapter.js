const crypto = require("crypto");
const { assertContract } = require("./contracts");

function canonicalStringify(obj) {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return `[${obj.map(canonicalStringify).join(",")}]`;
  }
  const sortedKeys = Object.keys(obj).sort();
  const keyValues = sortedKeys.map(key => `${JSON.stringify(key)}:${canonicalStringify(obj[key])}`);
  return `{${keyValues.join(",")}}`;
}

const seenSignatures = new Map(); // signature -> timestamp

function pruneSeenSignatures() {
  const now = Date.now();
  for (const [sig, ts] of seenSignatures.entries()) {
    if (now - ts > 5 * 60 * 1000) {
      seenSignatures.delete(sig);
    }
  }
}

function signRequest(payload, secretToken) {
  const timestamp = new Date().toISOString();
  const canonicalPayload = canonicalStringify(payload);
  const canonicalString = `${timestamp}:${canonicalPayload}`;
  const hmac = crypto.createHmac("sha256", secretToken);
  hmac.update(canonicalString);
  const signature = hmac.digest("hex");
  return { timestamp, signature };
}

function verifyRequestSignature(payload, timestamp, signature, secretToken) {
  const now = Date.now();
  const reqTime = new Date(timestamp).getTime();

  if (isNaN(reqTime) || Math.abs(now - reqTime) > 5 * 60 * 1000) {
    return { ok: false, code: "REPLAY_WINDOW_EXPIRED", error: "Request timestamp invalid or outside allowed 5 minute replay window." };
  }

  pruneSeenSignatures();
  if (seenSignatures.has(signature)) {
    return { ok: false, code: "REPLAY_ATTACK", error: "Replay attack detected: signature already processed." };
  }

  const canonicalPayload = canonicalStringify(payload);
  const canonicalString = `${timestamp}:${canonicalPayload}`;
  const hmac = crypto.createHmac("sha256", secretToken);
  hmac.update(canonicalString);
  const computedSignature = hmac.digest("hex");
  const sigBuf = Buffer.from(signature, "hex");
  const compBuf = Buffer.from(computedSignature, "hex");

  if (sigBuf.length !== compBuf.length || !crypto.timingSafeEqual(sigBuf, compBuf)) {
    return { ok: false, code: "INVALID_SIGNATURE", error: "Request signature verification failed." };
  }

  seenSignatures.set(signature, reqTime);

  return { ok: true };
}

class LocalTransport {
  constructor({ bus, nodeConfig }) {
    this.bus = bus;
    this.nodeConfig = nodeConfig;
    this.type = "local";
  }

  async send(eventEnvelope) {
    assertContract(eventEnvelope, "event-envelope.v1", "INVALID_EVENT_ENVELOPE");
    return this.bus.publish(eventEnvelope);
  }
}

class RelayTransport {
  constructor({ nodeConfig, peerNodeId, trustStore, transportHandler }) {
    this.nodeConfig = nodeConfig;
    this.peerNodeId = peerNodeId;
    this.trustStore = trustStore;
    this.transportHandler = transportHandler || null;
    this.type = "relay";
  }

  async send(eventEnvelope) {
    assertContract(eventEnvelope, "event-envelope.v1", "INVALID_EVENT_ENVELOPE");

    const peerTrust = this.trustStore ? this.trustStore.getTrustRecord(this.peerNodeId) : null;

    if (!peerTrust || peerTrust.status !== "active") {
      const error = new Error(`Node '${this.peerNodeId}' is not trusted or paired.`);
      error.code = "UNTRUSTED_NODE";
      throw error;
    }

    const { timestamp, signature } = signRequest(eventEnvelope, peerTrust.secretToken);

    if (!this.transportHandler) {
      const error = new Error(`No relay transport handler configured to reach peer node '${this.peerNodeId}'.`);
      error.code = "UNHANDLED_TRANSPORT";
      throw error;
    }

    return this.transportHandler({
      eventEnvelope,
      senderNodeId: this.nodeConfig.node_id,
      timestamp,
      signature
    });
  }
}

function createTransportAdapter(type, options) {
  if (type === "local") {
    return new LocalTransport(options);
  }
  if (type === "relay") {
    return new RelayTransport(options);
  }
  throw new Error(`Unsupported transport adapter type '${type}'`);
}

module.exports = {
  signRequest,
  verifyRequestSignature,
  LocalTransport,
  RelayTransport,
  createTransportAdapter
};
