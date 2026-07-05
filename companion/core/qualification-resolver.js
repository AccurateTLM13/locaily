const path = require("node:path");

const QUALIFICATION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const QUALIFIED_STATES = ["qualified", "conditional"];
const UNQUALIFIED_STATES = ["rejected", "revalidation_required"];
const UNTESTED_STATES = ["untested", "screening", "candidate"];

function createQualificationResolver(options = {}) {
  const loader = options.loader;
  const ttlMs = options.ttlMs != null ? options.ttlMs : QUALIFICATION_TTL_MS;
  const now = options.now || (() => new Date());

  function resolveEntryState(qualifiedForEntry, record) {
    const currentTime = now();

    if (!record || !qualifiedForEntry) {
      return { state: "untested", reason: "No qualification record found." };
    }

    if (record._invalid) {
      return {
        state: "invalid",
        reason: record._invalidReason || "Qualification record failed validation.",
        recordId: record.recordId
      };
    }

    if (record.expiresAt && new Date(record.expiresAt) <= currentTime) {
      return {
        state: "expired",
        reason: `Qualification expired at ${record.expiresAt}.`,
        recordId: record.recordId,
        expiresAt: record.expiresAt
      };
    }

    const recordStatus = record.status || "untested";
    const isRecordDefinitive = !UNTESTED_STATES.includes(recordStatus);

    if (!isRecordDefinitive) {
      return {
        state: "untested",
        reason: `Record-level status '${recordStatus}' is not a definitive pass or fail.`,
        recordId: record.recordId,
        entryStatus: qualifiedForEntry.status
      };
    }

    const generatedAt = record.generatedAt ? new Date(record.generatedAt) : null;
    const isExpirableState = QUALIFIED_STATES.includes(qualifiedForEntry.status);

    if (isExpirableState && generatedAt && (currentTime - generatedAt) > ttlMs) {
      return {
        state: "stale",
        reason: `Qualification generated at ${record.generatedAt} exceeds TTL of ${ttlMs}ms.`,
        recordId: record.recordId,
        generatedAt: record.generatedAt,
        ttlMs
      };
    }

    if (UNQUALIFIED_STATES.includes(qualifiedForEntry.status)) {
      return {
        state: "unqualified",
        reason: `Qualification status is '${qualifiedForEntry.status}'.`,
        recordId: record.recordId,
        entryStatus: qualifiedForEntry.status
      };
    }

    if (QUALIFIED_STATES.includes(qualifiedForEntry.status)) {
      return {
        state: "qualified",
        reason: `Qualification status is '${qualifiedForEntry.status}'.`,
        recordId: record.recordId,
        entryStatus: qualifiedForEntry.status,
        score: typeof qualifiedForEntry.score === "number" ? qualifiedForEntry.score : null,
        conditions: qualifiedForEntry.conditions || [],
        limits: qualifiedForEntry.limits || null
      };
    }

    return {
      state: "untested",
      reason: `Qualification entry status '${qualifiedForEntry.status}' is not a definitive pass or fail.`,
      recordId: record.recordId,
      entryStatus: qualifiedForEntry.status
    };
  }

  function resolveAllCapabilities() {
    const records = loader.list();
    const capabilities = [];

    for (const record of records) {
      if (!Array.isArray(record.qualifiedFor)) continue;

      for (const entry of record.qualifiedFor) {
        const resolution = resolveEntryState(entry, record);
        capabilities.push({
          modelId: record.subject?.id || "unknown",
          role: entry.role,
          trackId: entry.trackId,
          contractId: entry.contractId,
          state: resolution.state,
          reason: resolution.reason,
          recordId: record.recordId,
          score: resolution.score || null,
          generatedAt: record.generatedAt || null,
          expiresAt: record.expiresAt || null,
          conditions: resolution.conditions || null,
          limits: resolution.limits || null,
          evidenceIds: record.evidence?.evidenceIds || []
        });
      }
    }

    return capabilities;
  }

  function resolveForCapability({ modelId, role, trackId, contractId }) {
    const matches = loader.findForRole({ modelId, role, trackId, contractId });

    if (matches.length === 0) {
      return {
        state: "untested",
        reason: `No qualification record found for model '${modelId}', role '${role}', track '${trackId}'.`,
        capabilities: []
      };
    }

    const results = [];
    for (const match of matches) {
      const record = findRecordById(match.recordId);
      const entry = {
        role: match.role,
        trackId: match.trackId,
        contractId: match.contractId,
        status: match.status,
        score: match.score,
        evidenceIds: match.evidenceIds
      };
      const resolution = resolveEntryState(entry, record);
      results.push({
        modelId: match.modelId,
        role: match.role,
        trackId: match.trackId,
        contractId: match.contractId,
        state: resolution.state,
        reason: resolution.reason,
        recordId: match.recordId,
        score: resolution.score,
        generatedAt: match.generatedAt,
        evidenceIds: match.evidenceIds
      });
    }

    const bestState = pickWorstState(results.map((r) => r.state));

    return {
      state: bestState,
      reason: bestState === "qualified"
        ? `All matching qualifications are valid.`
        : `Best available state is '${bestState}'.`,
      capabilities: results
    };
  }

  function getDryRunRecommendation({ modelId, role, trackId, contractId, policy }) {
    const resolution = resolveForCapability({ modelId, role, trackId, contractId });
    const state = resolution.state;
    const policyLabel = policy || "advisory";
    const eligible = state === "qualified";
    const blocks = [];

    if (state === "unqualified") {
      blocks.push("Model is known to fail qualification for this capability.");
    }
    if (state === "expired") {
      blocks.push("Qualification evidence has expired. Regenerate before routing.");
    }
    if (state === "stale") {
      blocks.push("Qualification evidence is stale. Consider regenerating.");
    }
    if (state === "invalid") {
      blocks.push("Qualification record is invalid. Review and fix the record.");
    }
    if (state === "untested") {
      blocks.push("No qualification evidence exists. Model has not been tested for this capability.");
    }

    if (policyLabel === "require_qualified" && state !== "qualified") {
      blocks.push(`Policy '${policyLabel}' requires qualified state, but state is '${state}'.`);
    }

    return {
      ok: true,
      modelId,
      role,
      trackId,
      contractId,
      policy: policyLabel,
      eligible,
      state,
      blocks: blocks.length > 0 ? blocks : null,
      recommendation: eligible
        ? "Capability is qualified and can be routed."
        : `Capability is not eligible. ${blocks[0] || ""}`,
      details: resolution.capabilities
    };
  }

  function findRecordById(recordId) {
    return loader.list().find((r) => r.recordId === recordId) || null;
  }

  function getAllSummary() {
    const records = loader.list();
    const byState = { qualified: 0, unqualified: 0, expired: 0, stale: 0, invalid: 0, untested: 0 };
    const byRole = {};
    const byTrack = {};
    let latestGeneratedAt = null;

    for (const record of records) {
      if (!Array.isArray(record.qualifiedFor)) continue;

      for (const entry of record.qualifiedFor) {
        const resolution = resolveEntryState(entry, record);
        byState[resolution.state] = (byState[resolution.state] || 0) + 1;

        const role = entry.role || "unknown";
        byRole[role] = byRole[role] || { qualified: 0, unqualified: 0, expired: 0, stale: 0, invalid: 0, untested: 0 };
        byRole[role][resolution.state]++;

        const track = entry.trackId || "unknown";
        byTrack[track] = byTrack[track] || { qualified: 0, unqualified: 0, expired: 0, stale: 0, invalid: 0, untested: 0 };
        byTrack[track][resolution.state]++;
      }

      if (record.generatedAt && (!latestGeneratedAt || record.generatedAt > latestGeneratedAt)) {
        latestGeneratedAt = record.generatedAt;
      }
    }

    return {
      totalCapabilities: Object.values(byState).reduce((a, b) => a + b, 0),
      byState,
      byRole,
      byTrack,
      latestGeneratedAt,
      records: records.length
    };
  }

  return {
    resolveEntryState,
    resolveAllCapabilities,
    resolveForCapability,
    getDryRunRecommendation,
    getAllSummary
  };
}

function pickWorstState(states) {
  const rank = {
    invalid: 0,
    expired: 1,
    stale: 2,
    unqualified: 3,
    untested: 4,
    qualified: 5
  };
  let worst = "qualified";
  for (const s of states) {
    if ((rank[s] || 0) < (rank[worst] || 5)) {
      worst = s;
    }
  }
  return worst;
}

module.exports = { createQualificationResolver, QUALIFICATION_TTL_MS };
