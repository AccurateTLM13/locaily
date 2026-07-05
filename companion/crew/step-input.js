const { resolveInputMap } = require("./input-map-resolver");

/**
 * @deprecated Legacy Lighthouse tool step-id mapping for tracks that do not declare input_map.
 * Remove once all track files use declarative input_map (see docs/02-track-system/step-input-mapping.md).
 */
function buildLegacyToolStepInput(step, context) {
  const input = context.input || {};
  const artifacts = context.artifacts || {};

  if (step.id === "extract_metrics") {
    return input;
  }

  if (step.id === "classify_issues") {
    return {
      opportunities: input.opportunities || []
    };
  }

  if (step.id === "validate_priority_fixes") {
    return {
      opportunities: input.opportunities || [],
      priorityFixes: artifacts.prioritize_fixes?.priorityFixes || [],
      thinking: artifacts.prioritize_fixes?.thinking || ""
    };
  }

  if (step.id === "match_fixes") {
    return {
      issues: artifacts.classify_issues?.issues || [],
      priorityFixes: artifacts.validate_priority_fixes?.priorityFixes || []
    };
  }

  if (step.id === "write_handoff") {
    return {
      url: input.url,
      metrics: artifacts.extract_metrics || {},
      classifiedIssues: artifacts.classify_issues || {},
      prioritizedFixes: artifacts.validate_priority_fixes || artifacts.prioritize_fixes || {},
      matchedFixes: artifacts.match_fixes || {},
      opportunities: input.opportunities || [],
      rankedOpportunities: artifacts.classify_issues?.rankedOpportunities
        || artifacts.extract_metrics?.rankedOpportunities
        || []
    };
  }

  if (step.id === "verify_output") {
    return {
      handoff: artifacts.write_handoff || {}
    };
  }

  return input;
}

/**
 * @deprecated Legacy model step-id mapping for tracks that do not declare input_map.
 * Remove when all model steps declare input_map (see docs/02-track-system/step-input-mapping.md).
 */
function buildLegacyModelStepInput(step, context) {
  const input = context.input || {};
  const artifacts = context.artifacts || {};

  if (step.id === "prioritize_fixes") {
    const classified = artifacts.classify_issues || {};

    return {
      url: input.url,
      scores: input.scores || {},
      rankedOpportunities: classified.rankedOpportunities || [],
      classifiedIssues: classified.issues || []
    };
  }

  return null;
}

function buildStepInput(step, context) {
  if (step.input_map !== undefined && step.input_map !== null) {
    return resolveInputMap(step.input_map, context);
  }

  return buildLegacyToolStepInput(step, context);
}

function buildModelStepInput(step, context) {
  if (step.input_map !== undefined && step.input_map !== null) {
    return resolveInputMap(step.input_map, context);
  }

  return buildLegacyModelStepInput(step, context);
}

module.exports = {
  buildLegacyToolStepInput,
  buildLegacyModelStepInput,
  buildStepInput,
  buildModelStepInput
};
