function getPathValue(source, path) {
  if (source === undefined || source === null) {
    return undefined;
  }

  if (!path) {
    return source;
  }

  let current = source;

  for (const segment of path.split(".")) {
    if (current === undefined || current === null) {
      return undefined;
    }

    current = current[segment];
  }

  return current;
}

function resolveReference(reference, context) {
  const input = context.input || {};
  const artifacts = context.artifacts || {};

  if (reference === "$input") {
    return input;
  }

  if (reference.startsWith("$input.")) {
    return getPathValue(input, reference.slice("$input.".length));
  }

  if (reference.startsWith("$artifacts.")) {
    const remainder = reference.slice("$artifacts.".length);
    const dotIndex = remainder.indexOf(".");

    if (dotIndex === -1) {
      return artifacts[remainder];
    }

    const stepId = remainder.slice(0, dotIndex);
    const artifactPath = remainder.slice(dotIndex + 1);
    return getPathValue(artifacts[stepId], artifactPath);
  }

  const error = new Error(`Unsupported input_map reference '${reference}'.`);
  error.code = "INPUT_MAP_INVALID";
  error.nextStep = "Use $input, $input.field, $artifacts.step_id, or $artifacts.step_id.field references.";
  throw error;
}

function resolveInputMapValue(value, context) {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return [];
    }

    for (let index = 0; index < value.length - 1; index += 1) {
      const candidate = value[index];

      if (typeof candidate === "string" && candidate.startsWith("$")) {
        const resolved = resolveReference(candidate, context);

        if (resolved !== undefined && resolved !== null) {
          return resolved;
        }

        continue;
      }

      return candidate;
    }

    return resolveInputMapValue(value[value.length - 1], context);
  }

  if (typeof value === "string" && value.startsWith("$")) {
    return resolveReference(value, context);
  }

  return value;
}

function resolveInputMap(inputMap, context) {
  if (typeof inputMap === "string" && inputMap.startsWith("$")) {
    return resolveInputMapValue(inputMap, context);
  }

  if (!inputMap || typeof inputMap !== "object" || Array.isArray(inputMap)) {
    const error = new Error("Step input_map must be a reference string or an object map.");
    error.code = "INPUT_MAP_INVALID";
    error.nextStep = "Declare input_map on the track step (see docs/02-track-system/step-input-mapping.md).";
    throw error;
  }

  const resolved = {};

  for (const [field, value] of Object.entries(inputMap)) {
    resolved[field] = resolveInputMapValue(value, context);
  }

  return resolved;
}

module.exports = {
  getPathValue,
  resolveReference,
  resolveInputMapValue,
  resolveInputMap
};
