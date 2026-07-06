const { readFileSync, writeFileSync, renameSync, mkdirSync } = require("node:fs");
const { readFile, writeFile, rename, mkdir } = require("node:fs/promises");
const { join, dirname } = require("node:path");
const { randomUUID } = require("node:crypto");
const { validateResult } = require("./result-validator");
const policySchema = require("../schemas/internal/enforcement-policy.schema.json");
const {
  createEnforcementPolicyAudit,
  normalizeAuditEvent
} = require("./enforcement-policy-audit");

const ALLOWED_STATES = ["disabled", "shadow", "eligible", "enforced", "suspended"];
const DEFAULT_STATE = "shadow";
const MIN_SCORE = 0.7;
const MIN_SHADOW_EVIDENCE_COUNT = 3;
const POLICY_VERSION = "enforcement-policy.v1";

const ALLOWED_TRANSITIONS = {
  disabled: ["shadow"],
  shadow: ["disabled", "eligible"],
  eligible: ["shadow", "enforced", "suspended"],
  enforced: ["suspended", "eligible", "shadow"],
  suspended: ["shadow", "eligible", "disabled"]
};

function createEnforcementPolicyStore(options = {}) {
  const dataDir = options.dataDir;
  const policyDir = dataDir ? join(dataDir, "policy") : null;
  const policyPath = dataDir ? join(policyDir, "enforcement-policy.json") : null;
  const getCapabilityRegistry = options.getCapabilityRegistry || (() => null);
  const getProviderStatus = options.getProviderStatus || (async () => ({ available: true, modelReady: true }));
  const getShadowEvidence = options.getShadowEvidence || (async () => []);

  const audit = dataDir ? createEnforcementPolicyAudit({ dataDir }) : createNullAudit();

  let pending = [];
  let flushing = false;
  let policy = null;
  let loadError = null;
  let safeFallback = false;
  let enforcementLocked = false;
  let auditHealthy = true;

  function createNullAudit() {
    return { record: async () => {} };
  }

  // Synchronous initialization — eager in constructor
  if (dataDir) {
    initializeSync();
  } else {
    policy = createDefaultPolicy();
    safeFallback = true;
  }

  // Allow sync seeding by other modules
  const syncApi = {
    _seedTrackStateSync(trackId, state) {
      if (!policy.tracks[trackId]) {
        policy.tracks[trackId] = {
          state: "shadow",
          approved: false,
          updatedAt: new Date().toISOString(),
          updatedBy: "system",
          reason: null
        };
      }
      policy.tracks[trackId].state = state;
      policy.tracks[trackId].updatedAt = new Date().toISOString();
    },
    _seedApprovalSync(trackId) {
      if (!policy.tracks[trackId]) {
        policy.tracks[trackId] = {
          state: "shadow",
          approved: true,
          updatedAt: new Date().toISOString(),
          updatedBy: "system",
          reason: null
        };
      } else {
        policy.tracks[trackId].approved = true;
        policy.tracks[trackId].updatedAt = new Date().toISOString();
      }
    },
    _seedOverrideSync({ trackId, role, modelId, reason }) {
      const existing = policy.overrides.findIndex(
        (o) => o.trackId === trackId && o.role === role && o.modelId === modelId
      );
      if (existing === -1) {
        policy.overrides.push({
          overrideId: `override_sync_${randomUUID().replace(/-/g, "").slice(0, 8)}`,
          trackId, role, modelId,
          reason: reason || "Legacy seed",
          createdAt: new Date().toISOString(),
          createdBy: "system"
        });
      }
    }
  };

  function initializeSync() {
    try {
      mkdirSync(policyDir, { recursive: true });
    } catch { }

    try {
      const raw = readFileSync(policyPath, "utf8");
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (parseError) {
        handleCorruptFileSync(parseError, "MALFORMED_JSON", "Policy file contains malformed JSON.");
        return;
      }

      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        handleCorruptFileSync(new Error("Not an object"), "INVALID_STRUCTURE", "Policy file root is not a JSON object.");
        return;
      }

      if (parsed.schemaVersion !== POLICY_VERSION) {
        handleCorruptFileSync(
          new Error(`Unsupported schema version: ${parsed.schemaVersion}`),
          "UNSUPPORTED_SCHEMA_VERSION",
          `Policy file has schema version '${parsed.schemaVersion}', expected '${POLICY_VERSION}'.`
        );
        return;
      }

      const validation = validateResult(parsed, policySchema, "enforcement-policy");
      if (!validation.ok) {
        handleCorruptFileSync(
          new Error("Schema validation failed"),
          "SCHEMA_VALIDATION_FAILED",
          `Policy file failed schema validation: ${(validation.errors || []).join("; ")}`
        );
        return;
      }

      policy = deepClone(parsed);
      safeFallback = false;
      enforcementLocked = false;
      loadError = null;

      const auditEvent = normalizeAuditEvent({
        action: "policy.loaded",
        actor: "system",
        committedRevision: policy.revision,
        reason: "Policy loaded successfully from disk.",
        result: "success"
      });
      fireAndForgetAudit(auditEvent);
    } catch (error) {
      if (error.code === "ENOENT") {
        policy = createDefaultPolicy();
        safeFallback = true;
        enforcementLocked = false;
        loadError = null;

        const auditEvent = normalizeAuditEvent({
          action: "policy.initialized",
          actor: "system",
          committedRevision: 0,
          reason: "No policy file found. Initialized safe default shadow policy.",
          result: "success"
        });
        fireAndForgetAudit(auditEvent);
      } else {
        throw error;
      }
    }
  }

  function handleCorruptFileSync(originalError, code, message) {
    loadError = {
      code,
      message,
      originalError: originalError.message
    };
    policy = createDefaultPolicy();
    safeFallback = true;
    enforcementLocked = true;

    const auditEvent = normalizeAuditEvent({
      action: "policy.load.rejected",
      actor: "system",
      committedRevision: 0,
      reason: message,
      result: "rejected",
      errorCode: code,
      errorMessage: message
    });

    // Sync audit write for startup load rejection
    try {
      const auditFilePath = join(dataDir, "enforcement-policy-audit.jsonl");
      mkdirSync(dirname(auditFilePath), { recursive: true });
      const { appendFileSync } = require("node:fs");
      appendFileSync(auditFilePath, JSON.stringify(auditEvent) + "\n", "utf8");
    } catch (syncAuditError) {
      // Ignore sync audit errors during startup
    }
  }

  function createDefaultPolicy() {
    return {
      schemaVersion: POLICY_VERSION,
      revision: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: "system",
      tracks: {},
      overrides: [],
      metadata: {
        defaultState: DEFAULT_STATE,
        minimumScoreThreshold: MIN_SCORE
      }
    };
  }

  async function initialize() {
    return getStoreHealth();
  }

  async function mutate(mutationFn, auditData = {}) {
    return new Promise((resolve, reject) => {
      pending.push({ resolve, reject, mutationFn, auditData });
      processQueue();
    });
  }

  async function processQueue() {
    if (flushing || pending.length === 0) return;
    flushing = true;

    while (pending.length > 0) {
      const item = pending.shift();
      try {
        const result = await executeMutation(item.mutationFn, item.auditData);
        item.resolve(result);
      } catch (error) {
        item.reject(error);
      }
    }

    flushing = false;
  }

  async function executeMutation(mutationFn, auditData, { skipAuditFill } = {}) {
    const beforeRevision = policy.revision;
    const candidate = deepClone(policy);
    const auditPayload = { before: null, after: null, ...auditData };
    let mutationResult;

    try {
      mutationResult = mutationFn(candidate);
      if (mutationResult === false || (mutationResult && mutationResult.ok === false)) {
        const rejEvent = normalizeAuditEvent({
          action: auditPayload.action || "track.state.changed",
          actor: auditPayload.actor || "operator",
          trackId: auditPayload.trackId || null,
          overrideId: auditPayload.overrideId || null,
          previousRevision: beforeRevision,
          committedRevision: null,
          reason: auditPayload.reason || null,
          result: "rejected",
          errorCode: mutationResult.code || "MUTATION_REJECTED",
          errorMessage: mutationResult.message || "Mutation was rejected."
        });
        await safeAudit(rejEvent);
        return mutationResult;
      }
    } catch (error) {
      const errEvent = normalizeAuditEvent({
        action: auditPayload.action || "track.state.changed",
        actor: auditPayload.actor || "operator",
        trackId: auditPayload.trackId || null,
        overrideId: auditPayload.overrideId || null,
        previousRevision: beforeRevision,
        committedRevision: null,
        reason: auditPayload.reason || null,
        result: "failed",
        errorCode: error.code || "MUTATION_FAILED",
        errorMessage: error.message
      });
      await safeAudit(errEvent);
      throw error;
    }

    if (mutationResult === true || (mutationResult && mutationResult.ok !== false)) {
      candidate.revision += 1;
      candidate.updatedAt = new Date().toISOString();
      candidate.updatedBy = auditPayload.actor || "operator";

      const validation = validateResult(candidate, policySchema, "enforcement-policy");
      if (!validation.ok) {
        const errEvent = normalizeAuditEvent({
          action: "policy.write.failed",
          actor: auditPayload.actor || "operator",
          trackId: auditPayload.trackId || null,
          overrideId: auditPayload.overrideId || null,
          previousRevision: beforeRevision,
          committedRevision: null,
          reason: `Candidate schema validation failed: ${(validation.errors || []).join("; ")}`,
          result: "failed",
          errorCode: "ENFORCEMENT_POLICY_INVALID",
          errorMessage: "Candidate document failed schema validation."
        });
        await safeAudit(errEvent);
        return {
          ok: false,
          code: "ENFORCEMENT_POLICY_INVALID",
          message: `Cannot persist: candidate document failed schema validation.`,
          errors: validation.errors || []
        };
      }

      const writeOk = await atomicWrite(candidate);
      if (!writeOk) {
        return {
          ok: false,
          code: "ENFORCEMENT_POLICY_WRITE_FAILED",
          message: "Atomic write failed. Policy state was not updated."
        };
      }

      policy = candidate;

      let auditAfter = auditPayload.after;
      if (!skipAuditFill && mutationResult && typeof mutationResult === "object") {
        if (mutationResult.overrideId && !auditPayload.overrideId) {
          auditPayload.overrideId = mutationResult.overrideId;
        }
        if (mutationResult.auditAfter) {
          auditAfter = mutationResult.auditAfter;
        } else if (auditPayload.trackId && candidate.tracks[auditPayload.trackId]) {
          const track = candidate.tracks[auditPayload.trackId];
          auditAfter = { ...(auditAfter || {}), state: track.state, approved: track.approved };
        }
      }

      await safeAudit(normalizeAuditEvent({
        action: auditPayload.action || "track.state.changed",
        actor: auditPayload.actor || "operator",
        trackId: auditPayload.trackId || null,
        overrideId: auditPayload.overrideId || null,
        previousRevision: beforeRevision,
        committedRevision: candidate.revision,
        before: auditPayload.before || null,
        after: auditAfter,
        reason: auditPayload.reason || null,
        result: "success"
      }));
    }

    const result = {
      ok: true,
      revision: policy.revision,
      ...(mutationResult === true ? {} : (mutationResult || {}))
    };

    if (!auditHealthy) {
      result.warnings = result.warnings || [];
      result.warnings.push({
        code: "POLICY_AUDIT_WRITE_FAILED",
        message: "Policy was committed but its audit event could not be recorded."
      });
    }

    return result;
  }

  async function atomicWrite(candidate) {
    if (!policyPath) {
      return true;
    }
    const tmpPath = policyPath + ".tmp." + randomUUID().replace(/-/g, "").slice(0, 12);

    try {
      mkdirSync(policyDir, { recursive: true });
      writeFileSync(tmpPath, JSON.stringify(candidate, null, 2), { encoding: "utf8" });
      renameSync(tmpPath, policyPath);
      return true;
    } catch (error) {
      return false;
    }
  }

  function getCanonical() {
    return policy ? deepClone(policy) : null;
  }

  function getStoreHealth() {
    return {
      initialized: true,
      healthy: !loadError,
      auditHealthy,
      safeFallback,
      enforcementLocked,
      revision: policy ? policy.revision : 0,
      schemaVersion: POLICY_VERSION,
      loadError: loadError || null
    };
  }

  function isHealthy() {
    return !loadError;
  }

  function isEnforcementLocked() {
    return enforcementLocked;
  }

  function getTrackState(trackId) {
    if (!policy) return DEFAULT_STATE;
    const track = policy.tracks[trackId];
    return track ? track.state : (policy.metadata.defaultState || DEFAULT_STATE);
  }

  function getTrackRecord(trackId) {
    if (!policy) return null;
    return policy.tracks[trackId] || null;
  }

  function getTrackStates() {
    if (!policy) return {};
    const result = {};
    for (const [id, rec] of Object.entries(policy.tracks)) {
      result[id] = rec.state;
    }
    return result;
  }

  function isTrackApproved(trackId) {
    if (!policy) return false;
    const track = policy.tracks[trackId];
    return track ? track.approved : false;
  }

  function getOverrides() {
    if (!policy) return [];
    return policy.overrides.map((o) => ({ ...o }));
  }

  function hasOverride({ trackId, role, modelId }) {
    if (!policy) return false;
    return policy.overrides.some((o) => o.trackId === trackId && o.role === role && o.modelId === modelId);
  }

  function getOverrideById(overrideId) {
    if (!policy) return null;
    return policy.overrides.find((o) => o.overrideId === overrideId) || null;
  }

  // ========== State Transition ==========

  function isValidTransition(currentState, targetState) {
    if (!ALLOWED_STATES.includes(targetState)) return false;
    if (currentState === targetState) return true;
    const allowed = ALLOWED_TRANSITIONS[currentState];
    return allowed ? allowed.includes(targetState) : false;
  }

  function validateStateTransition(currentState, targetState) {
    if (!ALLOWED_STATES.includes(targetState)) {
      return {
        ok: false,
        code: "INVALID_ENFORCEMENT_STATE",
        message: `'${targetState}' is not a valid enforcement state.`,
        nextStep: `Use one of: ${ALLOWED_STATES.join(", ")}.`
      };
    }

    if (currentState === targetState) return { ok: true };

    if (!isValidTransition(currentState, targetState)) {
      return {
        ok: false,
        code: "INVALID_STATE_TRANSITION",
        message: `Cannot transition from '${currentState}' to '${targetState}'.`,
        nextStep: `Allowed transitions from '${currentState}': ${(ALLOWED_TRANSITIONS[currentState] || []).join(", ")}.`
      };
    }

    return { ok: true };
  }

  // ========== Set Track State ==========

  async function setTrackState(trackId, targetState, opts = {}) {
    if (enforcementLocked && (targetState === "eligible" || targetState === "enforced")) {
      return {
        ok: false,
        code: "ENFORCEMENT_POLICY_INVALID",
        message: "Policy store is in degraded state. Escalation to 'eligible' or 'enforced' is locked.",
        nextStep: "Fix the corrupted policy file and restart the companion server."
      };
    }

    const currentState = getTrackState(trackId);
    const transitionResult = validateStateTransition(currentState, targetState);
    if (!transitionResult.ok) return transitionResult;

    if (targetState === "eligible" && opts.forceGate !== true) {
      const syncGate = checkEligibilityGate(trackId, opts);
      if (!syncGate.ok) return syncGate;
    }

    let gateToken = null;
    if (targetState === "enforced") {
      if (currentState !== "eligible") {
        return {
          ok: false,
          code: "INVALID_STATE_TRANSITION",
          message: "Cannot transition directly to 'enforced'. Track must be in 'eligible' state first.",
          nextStep: "Set the track to 'eligible' state first, then request 'enforced'."
        };
      }
      // Capture gate token BEFORE async checks to prevent TOCTOU race.
      // The token records revision, state, and approval at this deterministic point.
      // After async checks (which may yield), the mutation revalidates against this token.
      const best = getBestQualifiedCapability(trackId, opts.role);
      gateToken = {
        expectedRevision: policy.revision,
        expectedState: "eligible",
        expectedApproved: isTrackApproved(trackId),
        expectedModelId: best ? best.modelId : null,
        expectedScore: best ? (best.score || 0) : 0,
        expectedThreshold: policy.metadata.minimumScoreThreshold
      };

      const asyncGate = await checkEnforcementGateAsync(trackId, opts);
      if (!asyncGate.ok) return asyncGate;
    }

    return mutate((candidate) => {
      const actor = opts.updatedBy || "operator";
      const reason = opts.reason || null;

      if (targetState === "enforced" && gateToken && opts.forceGate !== true) {
        const candidateRec = candidate.tracks[trackId];
        const candidateState = candidateRec ? candidateRec.state : DEFAULT_STATE;
        if (candidateState !== gateToken.expectedState) {
          return {
            ok: false,
            code: "STATE_CHANGED_DURING_TRANSITION",
            message: `Track '${trackId}' state changed from '${gateToken.expectedState}' to '${candidateState}' before the transition could commit.`,
            nextStep: "Retry the transition."
          };
        }
        if (candidate.revision !== gateToken.expectedRevision) {
          return {
            ok: false,
            code: "REVISION_CHANGED_DURING_TRANSITION",
            message: "Policy was modified by another operation before this transition could commit.",
            nextStep: "Retry the transition."
          };
        }
        if (gateToken.expectedApproved !== (candidateRec ? candidateRec.approved : false)) {
          return {
            ok: false,
            code: "APPROVAL_CHANGED_DURING_TRANSITION",
            message: `Track '${trackId}' approval status changed before the transition could commit.`,
            nextStep: "Retry the transition."
          };
        }
        if (gateToken.expectedModelId) {
          const currentBest = getBestQualifiedCapability(trackId, opts.role);
          if (!currentBest || currentBest.modelId !== gateToken.expectedModelId) {
            return {
              ok: false,
              code: "QUALIFICATION_CHANGED_DURING_TRANSITION",
              message: `The qualified capability for track '${trackId}' changed (expected '${gateToken.expectedModelId}', ${currentBest ? "got '" + currentBest.modelId + "'" : "none available"}) before enforcement could commit.`,
              nextStep: "Retry the transition."
            };
          }
          const currentScore = currentBest.score || 0;
          if (currentScore < gateToken.expectedThreshold) {
            return {
              ok: false,
              code: "SCORE_CHANGED_DURING_TRANSITION",
              message: `Score for '${currentBest.modelId}' fell to ${currentScore} (below threshold ${gateToken.expectedThreshold}) before enforcement could commit.`,
              nextStep: "Retry the transition."
            };
          }
        }
      }

      if (!candidate.tracks[trackId]) {
        candidate.tracks[trackId] = {
          state: DEFAULT_STATE,
          approved: false,
          updatedAt: new Date().toISOString(),
          updatedBy: "system",
          reason: null
        };
      }

      candidate.tracks[trackId].state = targetState;
      candidate.tracks[trackId].updatedAt = new Date().toISOString();
      candidate.tracks[trackId].updatedBy = actor;
      if (reason !== null) {
        candidate.tracks[trackId].reason = reason;
      }

      return { ok: true, trackId, state: targetState, transition: { from: currentState, to: targetState } };
    }, {
      action: "track.state.changed",
      trackId,
      actor: opts.updatedBy || "operator",
      before: { state: getTrackState(trackId) },
      after: { state: targetState },
      reason: opts.reason || null
    });
  }

  function checkEligibilityGate(trackId, opts) {
    if (opts.forceGate !== true) {
      if (!isTrackApproved(trackId)) {
        return {
          ok: false,
          code: "TRACK_NOT_APPROVED",
          message: `Track '${trackId}' is not approved for enforcement.`,
          nextStep: `Approve the track first via approveTrack or POST /enforcement/approve.`
        };
      }

      const caps = getCapabilitiesForTrack(trackId);
      if (!caps || caps.length === 0) {
        return {
          ok: false,
          code: "NO_QUALIFIED_CAPABILITY",
          message: `Track '${trackId}' has no qualified capabilities.`,
          nextStep: "Run Benchmark Lab to generate qualification evidence for this track."
        };
      }

      const current = caps.filter((c) => c.state === "qualified");
      if (current.length === 0) {
        return {
          ok: false,
          code: "NO_QUALIFIED_CAPABILITY",
          message: `Track '${trackId}' has qualified capabilities but none are currently qualified.`,
          nextStep: "Re-run qualification or check qualification records."
        };
      }
    }

    return { ok: true };
  }

  async function checkEnforcementGateAsync(trackId, opts) {
    if (opts.forceGate === true) return { ok: true };

    if (!isTrackApproved(trackId)) {
      return {
        ok: false,
        code: "TRACK_NOT_APPROVED",
        message: `Track '${trackId}' is not approved.`,
        nextStep: "Approve the track first."
      };
    }

    const best = getBestQualifiedCapability(trackId, opts.role);
    if (!best) {
      return {
        ok: false,
        code: "NO_QUALIFIED_CAPABILITY",
        message: `Track '${trackId}' has no currently qualified capability for enforcement.`,
        nextStep: "Run Benchmark Lab and ensure a qualified capability exists."
      };
    }

    const score = best.score || 0;
    const threshold = policy.metadata.minimumScoreThreshold;
    if (score < threshold) {
      return {
        ok: false,
        code: "INSUFFICIENT_SCORE",
        message: `Score ${score} is below the minimum threshold ${threshold}.`,
        nextStep: "Improve model qualification score."
      };
    }

    if (hasOverride({ trackId, role: opts.role || best.role, modelId: best.modelId })) {
      return {
        ok: false,
        code: "ACTIVE_OVERRIDE",
        message: `An active override blocks the recommended capability for track '${trackId}'.`,
        nextStep: "Clear the override before enforcing."
      };
    }

    try {
      const providerStatus = await getProviderStatus(best.modelId);
      if (!providerStatus.available) {
        return {
          ok: false,
          code: "RUNTIME_UNAVAILABLE",
          message: `Runtime is not available for model '${best.modelId}'.`,
          nextStep: "Start the runtime provider (e.g. Ollama) and ensure it is accessible."
        };
      }
      if (!providerStatus.modelReady) {
        return {
          ok: false,
          code: "MODEL_NOT_READY",
          message: `Model '${best.modelId}' is not ready on the runtime.`,
          nextStep: "Pull the model on the runtime provider."
        };
      }
    } catch (error) {
      return {
        ok: false,
        code: "RUNTIME_CHECK_FAILED",
        message: `Failed to check runtime status: ${error.message}`,
        nextStep: "Verify runtime provider connectivity."
      };
    }

    try {
      const evidence = await getShadowEvidence(trackId);
      const count = (evidence && Array.isArray(evidence)) ? evidence.length : 0;
      if (count < MIN_SHADOW_EVIDENCE_COUNT) {
        return {
          ok: false,
          code: "INSUFFICIENT_EVIDENCE",
          message: `Track '${trackId}' has ${count} shadow comparisons; at least ${MIN_SHADOW_EVIDENCE_COUNT} required.`,
          nextStep: `Run the track in shadow mode to collect at least ${MIN_SHADOW_EVIDENCE_COUNT} shadow comparisons.`
        };
      }
    } catch (error) {
      return {
        ok: false,
        code: "EVIDENCE_CHECK_FAILED",
        message: `Failed to check shadow evidence: ${error.message}`,
        nextStep: "Verify the shadow evidence store."
      };
    }

    return { ok: true };
  }

  function getCapabilitiesForTrack(trackId) {
    const registry = getCapabilityRegistry();
    if (!registry) return [];
    if (typeof registry.listCapabilities === "function") {
      return registry.listCapabilities().filter((c) => c.trackId === trackId);
    }
    if (typeof registry.list === "function") {
      return registry.list().filter((c) => c.trackId === trackId);
    }
    return [];
  }

  function getBestQualifiedCapability(trackId, role) {
    const caps = getCapabilitiesForTrack(trackId);
    const qualified = caps.filter((c) => c.state === "qualified");
    if (role) {
      const roleFiltered = qualified.filter((c) => c.role === role);
      if (roleFiltered.length > 0) {
        roleFiltered.sort((a, b) => (b.score || 0) - (a.score || 0));
        return roleFiltered[0];
      }
    }
    qualified.sort((a, b) => (b.score || 0) - (a.score || 0));
    return qualified[0] || null;
  }

  // ========== Approval ==========

  async function approveTrack(trackId, opts = {}) {
    const actor = opts.updatedBy || "operator";
    const reason = opts.reason || null;

    return mutate((candidate) => {
      if (!candidate.tracks[trackId]) {
        candidate.tracks[trackId] = {
          state: DEFAULT_STATE,
          approved: true,
          updatedAt: new Date().toISOString(),
          updatedBy: actor,
          reason
        };
      } else {
        candidate.tracks[trackId].approved = true;
        candidate.tracks[trackId].updatedAt = new Date().toISOString();
        candidate.tracks[trackId].updatedBy = actor;
        if (reason !== null) {
          candidate.tracks[trackId].reason = reason;
        }
      }

      return { ok: true, trackId };
    }, {
      action: "track.approved",
      trackId,
      actor,
      before: { approved: isTrackApproved(trackId) },
      after: { approved: true },
      reason
    });
  }

  async function revokeApproval(trackId, opts = {}) {
    const actor = opts.updatedBy || "operator";
    const reason = opts.reason || null;

    return mutate((candidate) => {
      const record = candidate.tracks[trackId];
      if (!record) {
        return {
          ok: false,
          code: "TRACK_NOT_APPROVED",
          message: `Track '${trackId}' has no approval record to revoke.`,
          nextStep: "The track must be approved first."
        };
      }

      const currentState = record.state;

      record.approved = false;
      record.updatedAt = new Date().toISOString();
      record.updatedBy = actor;
      if (reason !== null) {
        record.reason = reason;
      }

      if (currentState === "enforced") {
        record.state = "suspended";
      } else if (currentState === "eligible") {
        record.state = "shadow";
      }

      return {
        ok: true,
        trackId,
        state: record.state,
        compound: {
          approvalRevoked: true,
          stateTransition: currentState !== record.state ? { from: currentState, to: record.state } : null
        },
        auditAfter: { approved: false, state: record.state }
      };
    }, {
      action: "track.approval.revoked",
      trackId,
      actor,
      before: { approved: true, state: getTrackState(trackId) },
      after: { approved: false, state: null },
      reason
    });
  }

  // ========== Suspension / Restoration ==========

  async function suspendTrack(trackId, opts = {}) {
    return setTrackState(trackId, "suspended", opts);
  }

  async function restoreTrack(trackId, opts = {}) {
    const current = getTrackState(trackId);
    if (current !== "suspended") {
      return {
        ok: false,
        code: "INVALID_STATE_TRANSITION",
        message: `Track '${trackId}' is not suspended (current: '${current}').`,
        nextStep: "Only suspended tracks can be restored."
      };
    }
    return setTrackState(trackId, "shadow", opts);
  }

  // ========== Overrides ==========

  async function setOverride({ trackId, role, modelId, reason, updatedBy }, opts = {}) {
    const actor = updatedBy || "operator";

    return mutate((candidate) => {
      const existing = candidate.overrides.findIndex(
        (o) => o.trackId === trackId && o.role === role && o.modelId === modelId
      );
      if (existing !== -1) {
        return {
          ok: false,
          code: "DUPLICATE_OVERRIDE",
          message: `An active override already exists for ${trackId}:${role}:${modelId}.`,
          nextStep: "Clear the existing override before creating a new one."
        };
      }

      const overrideId = `override_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
      const now = new Date().toISOString();
      const overrideRec = {
        overrideId,
        trackId,
        role,
        modelId,
        reason: reason || null,
        createdAt: now,
        createdBy: actor
      };

      candidate.overrides.push(overrideRec);

      return { ok: true, overrideId };
    }, {
      action: "override.added",
      trackId,
      actor,
      overrideId: null,
      before: { hasOverride: hasOverride({ trackId, role, modelId }) },
      after: { hasOverride: true },
      reason
    });
  }

  async function clearOverride(identifier, opts = {}) {
    const actor = opts.updatedBy || "operator";
    const reason = opts.reason || null;

    return mutate((candidate) => {
      let idx = -1;
      let matchedOverride = null;

      if (typeof identifier === "string") {
        idx = candidate.overrides.findIndex((o) => o.overrideId === identifier);
        if (idx === -1) {
          return {
            ok: false,
            code: "OVERRIDE_NOT_FOUND",
            message: `No override found with overrideId '${identifier}'.`,
            nextStep: "Use a valid overrideId from GET /enforcement/policy or GET /enforcement/status."
          };
        }
        matchedOverride = candidate.overrides[idx];
      } else if (identifier && identifier.trackId && identifier.role && identifier.modelId) {
        idx = candidate.overrides.findIndex(
          (o) => o.trackId === identifier.trackId && o.role === identifier.role && o.modelId === identifier.modelId
        );
        if (idx === -1) {
          return {
            ok: false,
            code: "OVERRIDE_NOT_FOUND",
            message: `No override found for ${identifier.trackId}:${identifier.role}:${identifier.modelId}.`,
            nextStep: "Check existing overrides via GET /enforcement/policy."
          };
        }
        matchedOverride = candidate.overrides[idx];
      } else {
        return {
          ok: false,
          code: "INVALID_INPUT",
          message: "Must provide overrideId string or { trackId, role, modelId } object.",
          nextStep: "Use overrideId from GET /enforcement/policy."
        };
      }

      candidate.overrides.splice(idx, 1);

      return { ok: true, clearedOverrideId: matchedOverride.overrideId };
    }, {
      action: "override.cleared",
      trackId: identifier && typeof identifier === "object" ? identifier.trackId : null,
      actor,
      overrideId: typeof identifier === "string" ? identifier : null,
      before: { overrideExists: true },
      after: { overrideExists: false },
      reason
    });
  }

  // ========== Deep inspection ==========

  function inspectPolicy() {
    if (!policy) return createDefaultPolicy();
    return deepClone(policy);
  }

  async function seedTrackState(trackId, targetState) {
    return mutate((candidate) => {
      if (!candidate.tracks[trackId]) {
        candidate.tracks[trackId] = {
          state: DEFAULT_STATE,
          approved: false,
          updatedAt: new Date().toISOString(),
          updatedBy: "system",
          reason: null
        };
      }
      candidate.tracks[trackId].state = targetState;
      candidate.tracks[trackId].updatedAt = new Date().toISOString();
      candidate.tracks[trackId].updatedBy = "system";
      return { ok: true, trackId, state: targetState };
    }, {
      action: "track.state.changed",
      trackId,
      actor: "system",
      before: { state: getTrackState(trackId) },
      after: { state: targetState },
      reason: "Legacy seed from options"
    });
  }

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function fireAndForgetAudit(event) {
    safeAudit(event).catch(() => {});
  }

  async function safeAudit(event) {
    try {
      await audit.record(event);
    } catch (error) {
      auditHealthy = false;
      console.error("[Enforcement Policy Audit] Failed to record audit event:", error.message);
      try {
        await audit.record(normalizeAuditEvent({
          action: "policy.audit.failed",
          actor: "system",
          reason: error.message,
          result: "failed",
          errorCode: "AUDIT_WRITE_FAILED",
          errorMessage: error.message
        }));
      } catch { }
    }
  }

  return {
    initialize,
    getCanonical,
    getStoreHealth,
    isHealthy,
    isEnforcementLocked,
    getTrackState,
    getTrackRecord,
    getTrackStates,
    isTrackApproved,
    getOverrides,
    hasOverride,
    getOverrideById,
    setTrackState,
    approveTrack,
    revokeApproval,
    suspendTrack,
    restoreTrack,
    setOverride,
    clearOverride,
    inspectPolicy,
    ALLOWED_STATES,
    DEFAULT_STATE,
    POLICY_VERSION,
    ALLOWED_TRANSITIONS,
    mutate,
    getBestQualifiedCapability,
    seedTrackState,
    syncApi
  };
}

module.exports = {
  createEnforcementPolicyStore,
  ALLOWED_STATES,
  DEFAULT_STATE,
  MIN_SHADOW_EVIDENCE_COUNT,
  POLICY_VERSION,
  ALLOWED_TRANSITIONS
};
