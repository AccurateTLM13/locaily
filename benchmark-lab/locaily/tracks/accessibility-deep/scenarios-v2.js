const { scenarios } = require("./scenarios");

const hardScenario = {
  id: "a11y-004",
  title: "Complex account-settings accessibility failures",
  category: "accessibility",
  role: "a11y_analyzer",
  difficulty: "adversarial",
  expectedFindings: ["aria-allowed-attr", "button-name", "keyboard-access", "focus-traps", "target-size"],
  evaluate(output) {
    const errors = [];
    if (!output || typeof output !== "object") return { pass: false, errors: ["No valid output object"] };
    if (!output.summary) errors.push("Missing summary");
    if (!Array.isArray(output.findings) || output.findings.length < this.expectedFindings.length) {
      errors.push("Missing or incomplete findings");
    } else {
      const foundIds = output.findings.map((finding) => finding.auditId);
      for (const expected of this.expectedFindings) {
        if (!foundIds.includes(expected)) errors.push(`Missing expected finding: ${expected}`);
      }
      for (const finding of output.findings) {
        if (!["critical", "high", "medium", "low"].includes(finding.severity)) {
          errors.push(`Invalid severity: ${finding.severity}`);
        }
        if (!finding.finding || finding.finding.length < 5) {
          errors.push(`Finding too short for ${finding.auditId}`);
        }
      }
    }
    return { pass: errors.length === 0, errors };
  }
};

module.exports = {
  scenarios: [...scenarios, hardScenario]
};
