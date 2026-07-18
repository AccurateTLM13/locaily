const { buildProposalId } = require("../writeback-proposal");

function bucketStatement(candidate, statement) {
  const empty = [];
  const payload = {
    whatChanged: [...empty],
    decisionsMade: [...empty],
    newLessons: [...empty],
    suggestedUpdates: [...empty]
  };

  switch (candidate.candidateType) {
    case "decision":
      payload.decisionsMade = [statement];
      break;
    case "lesson":
    case "workflow_observation":
      payload.newLessons = [statement];
      break;
    case "blocker":
    case "open_question":
    case "resume_instruction":
      payload.suggestedUpdates = [statement];
      break;
    default:
      payload.whatChanged = [statement];
      break;
  }

  return payload;
}

function renderCandidateProposalMarkdown(candidate, statement, policy) {
  const evidenceLines = (candidate.evidenceEventIds || []).map((eventId) => `- ${eventId}`);
  const sections = [
    `# Development Memory Candidate: ${candidate.candidateType}`,
    "",
    "## Proposed Statement",
    statement,
    "",
    "## Suggested Vault Target",
    `- Path: ${candidate.suggestedVaultPath}`,
    `- Operation: ${candidate.suggestedOperation}`,
    "",
    "## Evidence Events",
    ...(evidenceLines.length > 0 ? evidenceLines : ["- (none listed)"]),
    "",
    "## Review Metadata",
    `- Candidate ID: ${candidate.candidateId}`,
    `- Review risk: ${candidate.reviewRisk}`,
    `- Contradiction status: ${candidate.contradictionStatus}`,
    `- Delivery mode: ${policy.deliveryMode}`,
    "",
    "## Requires Human Review",
    policy.requiresHumanReview ? "Yes." : "No.",
    "",
    "## Auto Apply",
    "Disabled for development memory candidates (DM6 review inbox policy)."
  ];

  return `${sections.join("\n")}\n`;
}

function buildWritebackRequestFromCandidate(candidate, editedStatement = null) {
  const statement = String(editedStatement || candidate.proposedStatement || "").trim();

  if (!statement) {
    return {
      ok: false,
      error: {
        code: "EMPTY_STATEMENT",
        message: "Candidate statement is empty.",
        nextStep: "Provide editedStatement or ensure candidate.proposedStatement is set."
      }
    };
  }

  const buckets = bucketStatement(candidate, statement);

  return {
    ok: true,
    request: {
      taskId: candidate.candidateId,
      project: candidate.targetProject,
      task: `development-memory:${candidate.candidateType}`,
      whatChanged: buckets.whatChanged,
      decisionsMade: buckets.decisionsMade,
      newLessons: buckets.newLessons,
      suggestedUpdates: buckets.suggestedUpdates,
      requiresHumanReview: true
    },
    statement
  };
}

function createCandidateWritebackProposal(adapter, candidate, options = {}) {
  const built = buildWritebackRequestFromCandidate(candidate, options.editedStatement);
  if (!built.ok) {
    return built;
  }

  const policy = options.policy || {
    deliveryMode: "proposal_only",
    requiresHumanReview: true
  };

  const proposalId = buildProposalId(candidate.targetProject, candidate.candidateType);
  const fileName = `${proposalId}-${candidate.candidateId}.md`;
  const markdown = renderCandidateProposalMarkdown(candidate, built.statement, policy);
  const writeResult = adapter.writeProposalFile(fileName, markdown);

  if (!writeResult.ok) {
    return {
      ok: false,
      error: writeResult.error,
      warnings: []
    };
  }

  return {
    ok: true,
    result: {
      proposalId: writeResult.proposalId,
      proposalPath: writeResult.proposalPath,
      requiresHumanReview: true,
      deliveryMode: "proposal_only"
    },
    warnings: []
  };
}

module.exports = {
  buildWritebackRequestFromCandidate,
  renderCandidateProposalMarkdown,
  createCandidateWritebackProposal
};
