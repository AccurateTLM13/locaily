const { resolveInputMap } = require("./input-map-resolver");

function requireInputMap(step) {
  if (step.input_map === undefined || step.input_map === null) {
    const error = new Error(`Track step '${step.id}' must declare input_map.`);
    error.code = "STEP_INPUT_MAP_MISSING";
    error.nextStep = "Declare input_map on the track step (see docs/02-track-system/step-input-mapping.md).";
    throw error;
  }
}

function buildStepInput(step, context) {
  requireInputMap(step);
  return resolveInputMap(step.input_map, context);
}

function buildModelStepInput(step, context) {
  requireInputMap(step);
  return resolveInputMap(step.input_map, context);
}

module.exports = {
  buildStepInput,
  buildModelStepInput
};
