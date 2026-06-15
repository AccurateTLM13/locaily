const assert = require("node:assert/strict");
const { loadTrack } = require("../companion/pit-crew/decomposer");
const { buildStepInput, buildLegacyStepInput } = require("../companion/pit-crew/tool-router");
const { resolveInputMap } = require("../companion/pit-crew/input-map-resolver");

const SAMPLE_CONTEXT = {
  input: {
    url: "https://example.com",
    scores: {
      performance: 72,
      accessibility: 96,
      bestPractices: 100,
      seo: 92
    },
    opportunities: [{ title: "Reduce render-blocking resources" }],
    diagnostics: [{ title: "Total Blocking Time" }]
  },
  artifacts: {
    extract_metrics: {
      rankedOpportunities: [{ title: "Metric ranked" }]
    },
    classify_issues: {
      issues: [{ title: "Reduce render-blocking resources", category: "performance" }],
      rankedOpportunities: [{ title: "Classified ranked" }]
    },
    prioritize_fixes: {
      priorityFixes: [{ title: "Reduce render-blocking resources" }],
      thinking: "Focus on render blocking first."
    },
    validate_priority_fixes: {
      priorityFixes: [{ title: "Reduce render-blocking resources" }]
    },
    match_fixes: {
      matches: [{ title: "Reduce render-blocking resources" }]
    },
    write_handoff: {
      summary: "Example handoff"
    }
  }
};

function assertDeepEqual(actual, expected, message) {
  assert.deepEqual(actual, expected, message);
}

function checkLegacyMatchesDeclarativeForTrack() {
  const track = loadTrack("website_audit.lighthouse_handoff");
  const toolSteps = track.steps.filter((step) => step.executor.type === "tool");

  for (const step of toolSteps) {
    assert(step.input_map !== undefined && step.input_map !== null, `Expected input_map on tool step '${step.id}'.`);

    const declarative = buildStepInput(step, SAMPLE_CONTEXT);
    const legacy = buildLegacyStepInput(step, SAMPLE_CONTEXT);
    assertDeepEqual(
      declarative,
      legacy,
      `Declarative input_map for '${step.id}' must match legacy mapping.`
    );
  }
}

function checkWriteHandoffCoalesceFallback() {
  const track = loadTrack("website_audit.lighthouse_handoff");
  const writeStep = track.steps.find((step) => step.id === "write_handoff");

  const withoutValidated = {
    ...SAMPLE_CONTEXT,
    artifacts: {
      ...SAMPLE_CONTEXT.artifacts,
      validate_priority_fixes: undefined
    }
  };

  const declarative = resolveInputMap(writeStep.input_map, withoutValidated);
  const legacy = buildLegacyStepInput(writeStep, withoutValidated);

  assertDeepEqual(
    declarative.prioritizedFixes,
    legacy.prioritizedFixes,
    "write_handoff prioritizedFixes coalesce should fall back to prioritize_fixes artifact."
  );
}

function checkPassthroughInputReference() {
  const track = loadTrack("website_audit.lighthouse_handoff");
  const extractStep = track.steps.find((step) => step.id === "extract_metrics");
  const resolved = buildStepInput(extractStep, SAMPLE_CONTEXT);

  assertDeepEqual(resolved, SAMPLE_CONTEXT.input, "extract_metrics should pass through full track input.");
}

function main() {
  checkPassthroughInputReference();
  checkLegacyMatchesDeclarativeForTrack();
  checkWriteHandoffCoalesceFallback();
  console.log("track-input-map-unit-test: all checks passed.");
}

main();
