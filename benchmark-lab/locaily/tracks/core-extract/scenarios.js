const SCENARIO_REGISTRY = [];

function defineScenario(def) {
  SCENARIO_REGISTRY.push(def);
  return def;
}

defineScenario({
  id: "extract-001",
  title: "User profile extraction",
  category: "generic-extract",
  role: "default_worker",
  difficulty: "easy",
  evaluate(output, caseData) {
    const errors = [];
    if (!output || typeof output !== "object") return { pass: false, errors: ["No valid output object"] };
    if (!output.data || typeof output.data !== "object") errors.push("Missing data object.");
    if (output.data.name !== "Sarah Connor") errors.push(`Expected name 'Sarah Connor', got '${output.data?.name}'.`);
    if (output.data.email !== "sarah@resistance.org") errors.push(`Expected email 'sarah@resistance.org', got '${output.data?.email}'.`);
    if (output.data.role !== "Lead Engineer") errors.push(`Expected role 'Lead Engineer', got '${output.data?.role}'.`);
    if (!Array.isArray(output.missing_fields)) errors.push("missing_fields must be an array.");
    if (typeof output.confidence !== "number" || output.confidence < 0 || output.confidence > 1) errors.push("Confidence must be a number between 0 and 1.");
    return { pass: errors.length === 0, errors };
  }
});

defineScenario({
  id: "extract-002",
  title: "Repository stats extraction",
  category: "generic-extract",
  role: "default_worker",
  difficulty: "medium",
  evaluate(output, caseData) {
    const errors = [];
    if (!output || typeof output !== "object") return { pass: false, errors: ["No valid output object"] };
    if (!output.data || typeof output.data !== "object") errors.push("Missing data object.");
    if (output.data.repo_name !== "locaily") errors.push(`Expected repo_name 'locaily', got '${output.data?.repo_name}'.`);
    if (output.data.stars !== 1240) errors.push(`Expected stars 1240, got '${output.data?.stars}'.`);
    if (output.data.open_issues !== 14) errors.push(`Expected open_issues 14, got '${output.data?.open_issues}'.`);
    if (output.data.license !== "MIT") errors.push(`Expected license 'MIT', got '${output.data?.license}'.`);
    if (!Array.isArray(output.missing_fields)) errors.push("missing_fields must be an array.");
    if (typeof output.confidence !== "number" || output.confidence < 0 || output.confidence > 1) errors.push("Confidence must be a number between 0 and 1.");
    return { pass: errors.length === 0, errors };
  }
});

defineScenario({
  id: "extract-003",
  title: "Server hardware profile extraction with missing field",
  category: "generic-extract",
  role: "default_worker",
  difficulty: "adversarial",
  evaluate(output, caseData) {
    const errors = [];
    if (!output || typeof output !== "object") return { pass: false, errors: ["No valid output object"] };
    if (!output.data || typeof output.data !== "object") errors.push("Missing data object.");
    if (output.data.hostname !== "worker-03") errors.push(`Expected hostname 'worker-03', got '${output.data?.hostname}'.`);
    if (output.data.cores !== 16) errors.push(`Expected cores 16, got '${output.data?.cores}'.`);
    if (output.data.ram_gb !== 64) errors.push(`Expected ram_gb 64, got '${output.data?.ram_gb}'.`);
    if (!Array.isArray(output.missing_fields)) errors.push("missing_fields must be an array.");
    if (typeof output.confidence !== "number" || output.confidence < 0 || output.confidence > 1) errors.push("Confidence must be a number between 0 and 1.");
    return { pass: errors.length === 0, errors };
  }
});

module.exports = {
  SCENARIO_REGISTRY,
  scenarios: SCENARIO_REGISTRY
};
