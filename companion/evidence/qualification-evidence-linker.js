const { listAllRecords, loadRecordsByWorkflow } = require("./track-run-record-store");

function createQualificationEvidenceLinker(options = {}) {
  const resolver = options.resolver;
  const loader = options.loader;

  async function findLinkedRecords(recordId) {
    const allRecords = await listAllRecords();
    return allRecords.filter((record) => {
      return record.routing?.qualificationRecordId === recordId;
    });
  }

  async function findRecordsByEvidenceId(evidenceId) {
    const allRecords = await listAllRecords();
    return allRecords.filter((record) => {
      const routingEvidenceIds = record.routing?.qualificationRecordId
        ? [record.routing.qualificationRecordId]
        : [];
      return routingEvidenceIds.some((rid) => rid.includes(evidenceId));
    });
  }

  async function findRecordsByCapability({ modelId, role, trackId, contractId }) {
    const matches = loader.findForRole({ modelId, role, trackId, contractId });
    if (matches.length === 0) return [];

    const recordIds = new Set(matches.map((m) => m.recordId));
    const allRecords = await listAllRecords();
    return allRecords.filter((record) => {
      return record.routing?.qualificationRecordId
        && recordIds.has(record.routing.qualificationRecordId);
    });
  }

  async function getLinkSummary() {
    const allRecords = await listAllRecords();
    const allQualifications = loader.list();
    const qualificationRecordIds = new Set(
      allQualifications.map((q) => q.recordId)
    );

    const linked = allRecords.filter((r) => {
      return r.routing?.qualificationRecordId
        && qualificationRecordIds.has(r.routing.qualificationRecordId);
    });

    const unlinked = allRecords.filter((r) => {
      return !r.routing?.qualificationRecordId;
    });

    return {
      totalTrackRunRecords: allRecords.length,
      linkedToQualification: linked.length,
      unlinked: unlinked.length,
      totalQualifications: allQualifications.length,
      qualificationsWithLinkedRecords: new Set(
        linked.map((r) => r.routing.qualificationRecordId)
      ).size
    };
  }

  function getDryRunRoutingEvidence({ modelId, role, trackId, contractId }) {
    const resolution = resolver.resolveForCapability({ modelId, role, trackId, contractId });
    const recommendation = resolver.getDryRunRecommendation({ modelId, role, trackId, contractId });

    return {
      resolution,
      recommendation,
      linkedRecordCount: 0
    };
  }

  return {
    findLinkedRecords,
    findRecordsByEvidenceId,
    findRecordsByCapability,
    getLinkSummary,
    getDryRunRoutingEvidence
  };
}

module.exports = { createQualificationEvidenceLinker };
