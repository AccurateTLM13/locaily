const assert = require("node:assert/strict");
const { loadTrack } = require("../companion/pit-crew/decomposer");
const { buildStepInput } = require("../companion/pit-crew/tool-router");
const { buildModelStepInput } = require("../companion/pit-crew/step-input");
const { resolveInputMap } = require("../companion/pit-crew/input-map-resolver");
const { buildPrompt } = require("../companion/pit-crew/prompts");

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

function checkMissingInputMapErrors() {
  assert.throws(
    () => buildStepInput({ id: "missing_map" }, SAMPLE_CONTEXT),
    (error) => error.code === "STEP_INPUT_MAP_MISSING",
    "Expected missing input_map to throw STEP_INPUT_MAP_MISSING."
  );

  assert.throws(
    () => buildModelStepInput({ id: "missing_map" }, SAMPLE_CONTEXT),
    (error) => error.code === "STEP_INPUT_MAP_MISSING",
    "Expected missing model input_map to throw STEP_INPUT_MAP_MISSING."
  );
}

function checkLighthouseToolStepInputMaps() {
  const track = loadTrack("website_audit.lighthouse_handoff");
  const toolSteps = track.steps.filter((step) => step.executor.type === "tool");

  for (const step of toolSteps) {
    assert(step.input_map !== undefined && step.input_map !== null, `Expected input_map on tool step '${step.id}'.`);
    assert(typeof buildStepInput(step, SAMPLE_CONTEXT) === "object", `Expected resolved input for '${step.id}'.`);
  }

  const classifyStep = track.steps.find((step) => step.id === "classify_issues");
  assertDeepEqual(
    buildStepInput(classifyStep, SAMPLE_CONTEXT),
    { opportunities: SAMPLE_CONTEXT.input.opportunities },
    "classify_issues should map opportunities from track input."
  );
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

  assertDeepEqual(
    declarative.prioritizedFixes,
    withoutValidated.artifacts.prioritize_fixes,
    "write_handoff prioritizedFixes coalesce should fall back to prioritize_fixes artifact."
  );
}

function checkPassthroughInputReference() {
  const track = loadTrack("website_audit.lighthouse_handoff");
  const extractStep = track.steps.find((step) => step.id === "extract_metrics");
  const resolved = buildStepInput(extractStep, SAMPLE_CONTEXT);

  assertDeepEqual(resolved, SAMPLE_CONTEXT.input, "extract_metrics should pass through full track input.");
}

const DEALSNIPER_SAMPLE_CONTEXT = {
  input: {
    title: "Used Honda Generator",
    price: 450,
    description: "Runs good, pickup only.",
    location: "Jackson, TN",
    sellerInfo: "Seller joined 2021",
    source: "facebook-marketplace"
  },
  artifacts: {
    prepare_listing: {
      title: "Used Honda Generator",
      price: 450,
      description: "Runs good, pickup only.",
      location: "Jackson, TN",
      sellerInfo: "Seller joined 2021",
      source: "facebook-marketplace"
    },
    analyze_listing: {
      dealScore: 72,
      riskLevel: "medium",
      summary: "Reasonable local pickup deal.",
      redFlags: [],
      positiveSignals: ["Runs good"],
      negotiationTip: "Ask about recent maintenance.",
      nextAction: "Inspect before paying."
    }
  }
};

function checkDealSniperTrackInputMaps() {
  const track = loadTrack("marketplace.dealsniper");
  const toolSteps = track.steps.filter((step) => step.executor.type === "tool");

  assert(toolSteps.length === 3, "Expected three DealSniper tool steps.");

  for (const step of toolSteps) {
    assert(step.input_map !== undefined && step.input_map !== null, `Expected input_map on '${step.id}'.`);
  }

  const prepareStep = track.steps.find((step) => step.id === "prepare_listing");
  const prepared = buildStepInput(prepareStep, DEALSNIPER_SAMPLE_CONTEXT);
  assertDeepEqual(
    prepared,
    DEALSNIPER_SAMPLE_CONTEXT.artifacts.prepare_listing,
    "prepare_listing should map listing fields from track input."
  );

  const analyzeStep = track.steps.find((step) => step.id === "analyze_listing");
  const analyzeInput = buildStepInput(analyzeStep, DEALSNIPER_SAMPLE_CONTEXT);
  assertDeepEqual(
    analyzeInput,
    DEALSNIPER_SAMPLE_CONTEXT.artifacts.prepare_listing,
    "analyze_listing should receive prepared listing artifact."
  );

  const validateStep = track.steps.find((step) => step.id === "validate_analysis");
  const validateInput = buildStepInput(validateStep, DEALSNIPER_SAMPLE_CONTEXT);
  assertDeepEqual(
    validateInput.analysis,
    DEALSNIPER_SAMPLE_CONTEXT.artifacts.analyze_listing,
    "validate_analysis should receive analyze_listing artifact."
  );
}

function checkPrioritizeFixesModelInputMap() {
  const track = loadTrack("website_audit.lighthouse_handoff");
  const prioritizeStep = track.steps.find((step) => step.id === "prioritize_fixes");

  assert(prioritizeStep, "Expected prioritize_fixes model step.");
  assert(prioritizeStep.input_map, "Expected input_map on prioritize_fixes model step.");

  const expected = {
    url: SAMPLE_CONTEXT.input.url,
    scores: SAMPLE_CONTEXT.input.scores,
    rankedOpportunities: SAMPLE_CONTEXT.artifacts.classify_issues.rankedOpportunities,
    classifiedIssues: SAMPLE_CONTEXT.artifacts.classify_issues.issues
  };
  const declarative = buildModelStepInput(prioritizeStep, SAMPLE_CONTEXT);

  assertDeepEqual(
    declarative,
    expected,
    "prioritize_fixes input_map should map url, scores, and classify_issues artifacts."
  );

  const declarativePrompt = buildPrompt("prioritize_fixes", SAMPLE_CONTEXT, declarative);

  assert(
    declarativePrompt.includes(SAMPLE_CONTEXT.input.url),
    "prioritize_fixes prompt should include page URL from input_map."
  );
  assert(
    declarativePrompt.includes("Classified ranked"),
    "prioritize_fixes prompt should include ranked opportunities from input_map."
  );
}

function checkLighthouseTrackInputMapCoverage() {
  const track = loadTrack("website_audit.lighthouse_handoff");

  for (const step of track.steps) {
    assert(step.input_map !== undefined && step.input_map !== null, `Expected input_map on step '${step.id}'.`);
  }
}

function checkAllTrackFilesDeclareInputMap() {
  const trackIds = [
    "website_audit.lighthouse_handoff",
    "marketplace.dealsniper",
    "publishing.operator_log_discovery",
    "publishing.operator_log_draft"
  ];

  for (const trackId of trackIds) {
    const track = loadTrack(trackId);

    for (const step of track.steps) {
      assert(step.input_map !== undefined && step.input_map !== null, `Expected input_map on '${trackId}' step '${step.id}'.`);
    }
  }
}

function main() {
  checkMissingInputMapErrors();
  checkPassthroughInputReference();
  checkLighthouseToolStepInputMaps();
  checkWriteHandoffCoalesceFallback();
  checkPrioritizeFixesModelInputMap();
  checkLighthouseTrackInputMapCoverage();
  checkDealSniperTrackInputMaps();
  checkAllTrackFilesDeclareInputMap();
  console.log("track-input-map-unit-test: all checks passed.");
}

main();
