const { runTrack } = require("../crew/orchestrator");

async function executeLighthouseHandoffTrack({ input, runtime, options, toolRegistry }) {
  if (!toolRegistry) {
    throw new Error("Tool registry is required for crew track execution.");
  }

  const registry = toolRegistry || options.toolRegistry;

  const trackResult = await runTrack({
    trackId: "website_audit.lighthouse_handoff",
    input,
    runtime,
    options,
    toolRegistry: registry,
    meta: options.meta || {}
  });

  return {
    result: trackResult.result,
    steps: trackResult.steps,
    durationMs: trackResult.durationMs,
    schemaValid: trackResult.schemaValid
  };
}

module.exports = {
  executeLighthouseHandoffTrack
};
