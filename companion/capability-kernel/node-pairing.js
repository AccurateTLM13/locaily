const crypto = require("crypto");
const { addTrustRecord, getTrustRecord } = require("./trust-store");

function generateChallengeNonce() {
  return crypto.randomBytes(16).toString("hex");
}

function generateSecretToken() {
  return `tok_${crypto.randomBytes(24).toString("hex")}`;
}

function initiatePairing(hostNodeConfig, peerNodeId, secretToken = null) {
  const challengeHost = generateChallengeNonce();
  const sharedSecretToken = secretToken || generateSecretToken();
  return {
    step: 1,
    action: "DISCOVERY_CHALLENGE",
    hostNodeId: hostNodeConfig.node_id,
    peerNodeId,
    challengeHost,
    sharedSecretToken,
    initiatedAt: new Date().toISOString()
  };
}

function respondChallenge(peerNodeConfig, pairingRequest) {
  if (pairingRequest.peerNodeId !== peerNodeConfig.node_id) {
    throw new Error(`Pairing target mismatch. Expected ${pairingRequest.peerNodeId}, got ${peerNodeConfig.node_id}`);
  }

  if (!pairingRequest.sharedSecretToken) {
    throw new Error("Missing sharedSecretToken in pairing request.");
  }

  const challengePeer = generateChallengeNonce();
  const sharedSecretToken = pairingRequest.sharedSecretToken;

  const hmac = crypto.createHmac("sha256", sharedSecretToken);
  hmac.update(`${pairingRequest.challengeHost}:${challengePeer}:${peerNodeConfig.node_id}`);
  const proofSignature = hmac.digest("hex");

  return {
    step: 2,
    action: "CHALLENGE_RESPONSE",
    peerNodeId: peerNodeConfig.node_id,
    challengeHost: pairingRequest.challengeHost,
    challengePeer,
    proofSignature
  };
}

function verifyPairingResponse(hostNodeConfig, pairingRequest, peerResponse) {
  if (peerResponse.challengeHost !== pairingRequest.challengeHost) {
    return { ok: false, code: "NONCE_MISMATCH", error: "Host challenge nonce mismatch." };
  }

  if (!pairingRequest.sharedSecretToken) {
    return { ok: false, code: "MISSING_HOST_TOKEN", error: "Host secret token unavailable." };
  }

  const hmac = crypto.createHmac("sha256", pairingRequest.sharedSecretToken);
  hmac.update(`${pairingRequest.challengeHost}:${peerResponse.challengePeer}:${peerResponse.peerNodeId}`);
  const computedProof = hmac.digest("hex");

  if (!crypto.timingSafeEqual(Buffer.from(peerResponse.proofSignature, "hex"), Buffer.from(computedProof, "hex"))) {
    return { ok: false, code: "PROOF_VERIFICATION_FAILED", error: "HMAC proof signature mismatch." };
  }

  return {
    ok: true,
    step: 3,
    action: "VERIFICATION_SUCCESS",
    peerNodeId: peerResponse.peerNodeId,
    sharedSecretToken: pairingRequest.sharedSecretToken
  };
}

function executePairingCeremony(hostNodeConfig, peerNodeConfig, customTrustStorePath = null, peerTrustStorePath = null) {
  // Step 1: Initiate Challenge with host-generated secret token
  const req = initiatePairing(hostNodeConfig, peerNodeConfig.node_id);

  // Step 2: Peer Response using host challenge & token
  const resp = respondChallenge(peerNodeConfig, req);

  // Step 3: Host Verification against host token
  const verifyRes = verifyPairingResponse(hostNodeConfig, req, resp);
  if (!verifyRes.ok) {
    return {
      ok: false,
      code: verifyRes.code,
      error: verifyRes.error,
      provenance: {
        hostNodeId: hostNodeConfig.node_id,
        peerNodeId: peerNodeConfig.node_id,
        status: "rejected",
        timestamp: new Date().toISOString()
      }
    };
  }

  // Step 4: Token Enrollment in host & peer Trust Stores
  const hostEnrollment = addTrustRecord(peerNodeConfig.node_id, {
    status: "active",
    tier: "trusted_local",
    secretToken: req.sharedSecretToken
  }, customTrustStorePath);

  const targetPeerStore = peerTrustStorePath || customTrustStorePath;
  const peerEnrollment = addTrustRecord(hostNodeConfig.node_id, {
    status: "active",
    tier: "trusted_local",
    secretToken: req.sharedSecretToken
  }, targetPeerStore);

  return {
    ok: true,
    step: 4,
    action: "ENROLLED",
    hostNodeId: hostNodeConfig.node_id,
    peerNodeId: peerNodeConfig.node_id,
    secretToken: req.sharedSecretToken,
    hostRecord: hostEnrollment,
    peerRecord: peerEnrollment,
    provenance: {
      hostNodeId: hostNodeConfig.node_id,
      peerNodeId: peerNodeConfig.node_id,
      status: "paired",
      timestamp: new Date().toISOString()
    }
  };
}

module.exports = {
  initiatePairing,
  respondChallenge,
  verifyPairingResponse,
  executePairingCeremony
};
