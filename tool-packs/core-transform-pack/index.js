function getPathValue(source, path) {
  let current = source;

  for (const segment of String(path).split(".")) {
    if (current === undefined || current === null || typeof current !== "object") {
      return undefined;
    }
    current = current[segment];
  }

  return current;
}

function setPathValue(target, path, value) {
  const segments = String(path).split(".");
  let current = target;

  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    if (!current[segment] || typeof current[segment] !== "object" || Array.isArray(current[segment])) {
      current[segment] = {};
    }
    current = current[segment];
  }

  current[segments[segments.length - 1]] = value;
}

function invalidInput(message, nextStep) {
  return {
    code: "INVALID_INPUT",
    message,
    nextStep
  };
}

function validateMappingShape(mapping) {
  if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) {
    return invalidInput("transform.map 'mapping' must be an object of target -> rule.", "Use target dot-paths as keys.");
  }

  for (const [target, rule] of Object.entries(mapping)) {
    if (!target.trim()) {
      return invalidInput("transform.map mapping keys must be non-empty target paths.", "Remove empty target keys.");
    }

    if (typeof rule === "string" && rule.trim()) {
      continue;
    }

    if (rule && typeof rule === "object" && !Array.isArray(rule)) {
      const kinds = ["from", "const", "join"].filter((key) => Object.prototype.hasOwnProperty.call(rule, key));
      if (kinds.length !== 1) {
        return invalidInput(
          `Mapping rule for '${target}' must use exactly one of from, const, or join.`,
          "Example: { \"title\": \"doc.name\", \"status\": { \"const\": \"draft\" }, \"tags\": { \"join\": [\"a\", \"b\"], \"separator\": \", \" } }"
        );
      }
      if (Object.prototype.hasOwnProperty.call(rule, "join") && !Array.isArray(rule.join)) {
        return invalidInput(`Mapping rule '${target}.join' must be an array of source paths.`, "Send join as an array of dot-paths.");
      }
      continue;
    }

    return invalidInput(
      `Mapping rule for '${target}' has an unsupported shape.`,
      "Use a dot-path string or a {from|const|join} object (wrap literals in {\"const\": value})."
    );
  }

  return null;
}

function validateInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return invalidInput("transform.map input must be an object.", "Send source and mapping.");
  }

  if (!input.source || typeof input.source !== "object" || Array.isArray(input.source)) {
    return invalidInput("transform.map requires a source object.", "Send { source: {...}, mapping: {...} }.");
  }

  return validateMappingShape(input.mapping);
}

function stringifyPart(part) {
  return typeof part === "object" ? JSON.stringify(part) : String(part);
}

const implementations = {
  "transform.map": {
    validateInput,
    async handle({ input }) {
      const result = {};
      const applied = [];
      const missing = [];

      for (const [targetPath, rule] of Object.entries(input.mapping)) {
        if (typeof rule === "string") {
          const value = getPathValue(input.source, rule);
          if (value === undefined) {
            missing.push(`${targetPath} <- ${rule}`);
            continue;
          }
          setPathValue(result, targetPath, value);
          applied.push(targetPath);
          continue;
        }

        if (Object.prototype.hasOwnProperty.call(rule, "const")) {
          setPathValue(result, targetPath, rule.const);
          applied.push(targetPath);
          continue;
        }

        if (Object.prototype.hasOwnProperty.call(rule, "from")) {
          const value = getPathValue(input.source, rule.from);
          if (value === undefined) {
            missing.push(`${targetPath} <- ${rule.from}`);
            continue;
          }
          setPathValue(result, targetPath, value);
          applied.push(targetPath);
          continue;
        }

        const parts = rule.join.map((path) => getPathValue(input.source, path));
        const present = parts.filter((part) => part !== undefined && part !== null);
        rule.join.forEach((path, index) => {
          if (parts[index] === undefined || parts[index] === null) {
            missing.push(`${targetPath} <- join member ${path}`);
          }
        });

        if (present.length === 0) {
          continue;
        }

        setPathValue(result, targetPath, present.map(stringifyPart).join(typeof rule.separator === "string" ? rule.separator : " "));
        applied.push(targetPath);
      }

      return {
        result,
        applied,
        missing,
        strategy: "deterministic_mapping_v1"
      };
    }
  }
};

module.exports = implementations;
