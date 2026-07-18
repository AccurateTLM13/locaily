function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function extractObjectiveToken(statement) {
  const match = String(statement || "").match(/\b([a-z0-9][a-z0-9-]{2,})\b/i);
  return match ? match[1].toLowerCase() : null;
}

function detectVaultDrift({ statement, vaultContent, vaultReadable, targetVaultPath }) {
  if (!vaultReadable) {
    return {
      driftStatus: "missing_target",
      driftDetail: `Target vault page '${targetVaultPath}' is missing or unreadable.`
    };
  }

  const normalizedStatement = normalizeText(statement);
  const normalizedVault = normalizeText(vaultContent);

  if (normalizedStatement && normalizedVault.includes(normalizedStatement)) {
    return {
      driftStatus: "statement_already_present",
      driftDetail: "Proposed statement already exists in the target vault page."
    };
  }

  const objectiveToken = extractObjectiveToken(statement);
  if (objectiveToken && normalizedVault.includes(objectiveToken) && !normalizedVault.includes(normalizedStatement)) {
    return {
      driftStatus: "content_drift",
      driftDetail: `Vault page mentions '${objectiveToken}' with different wording than the approved candidate.`
    };
  }

  return {
    driftStatus: "none",
    driftDetail: "No duplicate statement detected; maintainer can plan a section update."
  };
}

function isApplyAllowedByDefault(candidate) {
  return candidate.reviewRisk === "low"
    && candidate.contradictionStatus === "none"
    && candidate.reviewRisk !== "high";
}

function resolvePlannedAction(driftStatus, candidate) {
  if (driftStatus === "statement_already_present") {
    return "skip_duplicate";
  }

  if (candidate.reviewRisk === "high" || candidate.reviewRisk === "medium" || candidate.contradictionStatus !== "none") {
    return "review_required";
  }

  if (driftStatus === "missing_target" && candidate.suggestedOperation === "create_file") {
    return "create_file";
  }

  return "append_section";
}

module.exports = {
  normalizeText,
  detectVaultDrift,
  isApplyAllowedByDefault,
  resolvePlannedAction
};
