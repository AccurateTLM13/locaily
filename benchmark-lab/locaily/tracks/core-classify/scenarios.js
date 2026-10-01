const SCENARIO_REGISTRY = [];

function defineScenario(def) {
  SCENARIO_REGISTRY.push(def);
  return def;
}

defineScenario({
  id: "classify-001",
  title: "Crash bug classification",
  category: "generic-classify",
  role: "default_worker",
  difficulty: "easy",
  allowedCategories: ["bug", "feature_request", "documentation", "question"],
  expectedCategory: "bug",
  evaluate(output, caseData) {
    const errors = [];
    if (!output || typeof output !== "object") return { pass: false, errors: ["No valid output object"] };
    if (!this.allowedCategories.includes(output.category)) errors.push(`Category '${output.category}' is not in allowed list.`);
    if (output.category !== this.expectedCategory) errors.push(`Expected category '${this.expectedCategory}', got '${output.category}'.`);
    if (typeof output.confidence !== "number" || output.confidence < 0 || output.confidence > 1) errors.push("Confidence must be a number between 0 and 1.");
    if (!output.reason || typeof output.reason !== "string" || output.reason.length < 5) errors.push("Reason must be non-empty string.");
    return { pass: errors.length === 0, errors };
  }
});

defineScenario({
  id: "classify-002",
  title: "Feature request classification",
  category: "generic-classify",
  role: "default_worker",
  difficulty: "medium",
  allowedCategories: ["bug", "feature_request", "documentation", "question"],
  expectedCategory: "feature_request",
  evaluate(output, caseData) {
    const errors = [];
    if (!output || typeof output !== "object") return { pass: false, errors: ["No valid output object"] };
    if (!this.allowedCategories.includes(output.category)) errors.push(`Category '${output.category}' is not in allowed list.`);
    if (output.category !== this.expectedCategory) errors.push(`Expected category '${this.expectedCategory}', got '${output.category}'.`);
    if (typeof output.confidence !== "number" || output.confidence < 0 || output.confidence > 1) errors.push("Confidence must be a number between 0 and 1.");
    if (!output.reason || typeof output.reason !== "string" || output.reason.length < 5) errors.push("Reason must be non-empty string.");
    return { pass: errors.length === 0, errors };
  }
});

defineScenario({
  id: "classify-003",
  title: "Ambiguous question vs doc classification",
  category: "generic-classify",
  role: "default_worker",
  difficulty: "adversarial",
  allowedCategories: ["bug", "feature_request", "documentation", "question"],
  expectedCategory: "question",
  evaluate(output, caseData) {
    const errors = [];
    if (!output || typeof output !== "object") return { pass: false, errors: ["No valid output object"] };
    if (!this.allowedCategories.includes(output.category)) errors.push(`Category '${output.category}' is not in allowed list.`);
    if (output.category !== this.expectedCategory) errors.push(`Expected category '${this.expectedCategory}', got '${output.category}'.`);
    if (typeof output.confidence !== "number" || output.confidence < 0 || output.confidence > 1) errors.push("Confidence must be a number between 0 and 1.");
    if (!output.reason || typeof output.reason !== "string" || output.reason.length < 5) errors.push("Reason must be non-empty string.");
    return { pass: errors.length === 0, errors };
  }
});

module.exports = {
  SCENARIO_REGISTRY,
  scenarios: SCENARIO_REGISTRY
};
