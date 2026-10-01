const SCENARIO_REGISTRY = [];

function defineScenario(def) {
  SCENARIO_REGISTRY.push(def);
  return def;
}

defineScenario({
  id: "summarize-001",
  title: "Release notes summary",
  category: "generic-summarize",
  role: "default_worker",
  difficulty: "easy",
  evaluate(output, caseData) {
    const errors = [];
    if (!output || typeof output !== "object") return { pass: false, errors: ["No valid output object"] };
    if (!output.summary || typeof output.summary !== "string" || output.summary.length < 20) {
      errors.push("Summary must be a string with at least 20 characters.");
    }
    if (!Array.isArray(output.key_points) || output.key_points.length === 0 || output.key_points.length > 5) {
      errors.push("Key points must be an array of 1 to 5 items.");
    }
    return { pass: errors.length === 0, errors };
  }
});

defineScenario({
  id: "summarize-002",
  title: "Architecture RFC summary",
  category: "generic-summarize",
  role: "default_worker",
  difficulty: "medium",
  evaluate(output, caseData) {
    const errors = [];
    if (!output || typeof output !== "object") return { pass: false, errors: ["No valid output object"] };
    if (!output.summary || typeof output.summary !== "string" || output.summary.length < 20) {
      errors.push("Summary must be a string with at least 20 characters.");
    }
    if (!Array.isArray(output.key_points) || output.key_points.length === 0 || output.key_points.length > 5) {
      errors.push("Key points must be an array of 1 to 5 items.");
    }
    const combined = `${output.summary} ${output.key_points.join(" ")}`.toLowerCase();
    if (!combined.includes("relay") && !combined.includes("node")) {
      errors.push("Summary must capture core subject: relay / node.");
    }
    return { pass: errors.length === 0, errors };
  }
});

defineScenario({
  id: "summarize-003",
  title: "Benchmark comparison evaluation summary",
  category: "generic-summarize",
  role: "default_worker",
  difficulty: "adversarial",
  evaluate(output, caseData) {
    const errors = [];
    if (!output || typeof output !== "object") return { pass: false, errors: ["No valid output object"] };
    if (!output.summary || typeof output.summary !== "string" || output.summary.length < 20) {
      errors.push("Summary must be a string with at least 20 characters.");
    }
    if (!Array.isArray(output.key_points) || output.key_points.length === 0 || output.key_points.length > 5) {
      errors.push("Key points must be an array of 1 to 5 items.");
    }
    const combined = `${output.summary} ${output.key_points.join(" ")}`.toLowerCase();
    if (!combined.includes("model a") && !combined.includes("model b")) {
      errors.push("Summary must compare Model A and Model B.");
    }
    return { pass: errors.length === 0, errors };
  }
});

module.exports = {
  SCENARIO_REGISTRY,
  scenarios: SCENARIO_REGISTRY
};
