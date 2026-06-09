const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const promptTemplate = readFileSync(join(__dirname, "..", "prompts", "lighthouse-handoff.md"), "utf8");
const outputSchema = require("../schemas/lighthouse-handoff.schema.json");

const lighthouseHandoffTool = {
  id: "lighthouse-handoff",
  name: "Lighthouse Handoff",
  pack: "showcase-tools",
  description: "Convert Lighthouse/PageSpeed-style report data into deterministic MVP handoff notes.",
  tasks: ["analyze-report"],
  permissions: [],
  modelRole: null,
  requiresRuntime: false,
  inputSchema: "companion/schemas/lighthouse-handoff.input.schema.json",
  outputSchema: "companion/schemas/lighthouse-handoff.schema.json",
  input: {
    required: ["url", "scores"],
    optional: ["opportunities", "diagnostics"]
  },
  output: outputSchema,
  prompt: promptTemplate,
  validateInput,
  async handle({ task, input }) {
    if (task !== "analyze-report") {
      throwToolError("UNKNOWN_TASK", `Task '${task}' is not supported by Lighthouse Handoff.`);
    }

    const validationError = validateInput(input);

    if (validationError) {
      throwToolError(validationError.code, validationError.message, validationError.nextStep);
    }

    return buildDemoResult(input);
  }
};

function validateInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      code: "INVALID_INPUT",
      message: "Lighthouse Handoff input must be an object.",
      nextStep: "Send url, scores, and optional opportunities or diagnostics arrays."
    };
  }

  if (!isNonEmptyString(input.url)) {
    return {
      code: "INVALID_INPUT",
      message: "Lighthouse Handoff input requires a non-empty url.",
      nextStep: "Include the page URL that was tested."
    };
  }

  if (!input.scores || typeof input.scores !== "object" || Array.isArray(input.scores)) {
    return {
      code: "INVALID_INPUT",
      message: "Lighthouse Handoff input requires a scores object.",
      nextStep: "Include Lighthouse scores such as performance, accessibility, bestPractices, and seo."
    };
  }

  return null;
}

function buildDemoResult(input) {
  const scores = input.scores || {};
  const performance = normalizeScore(scores.performance);
  const accessibility = normalizeScore(scores.accessibility);
  const bestPractices = normalizeScore(scores.bestPractices);
  const seo = normalizeScore(scores.seo);
  const weakest = findWeakestScore({
    performance,
    accessibility,
    bestPractices,
    seo
  });
  const priorityFixes = buildPriorityFixes(weakest, input);

  return {
    clientSummary: `MVP demo handoff for ${input.url}: the report was received and the lowest visible score is ${formatScoreName(weakest.name)}.`,
    developerSummary: "This is a deterministic MVP stub. It validates Lighthouse-style input and produces a stable handoff shape before full AI-backed analysis is added.",
    priorityFixes,
    handoffChecklist: [
      "Review the lowest Lighthouse score first.",
      "Confirm opportunities and diagnostics against the live page.",
      "Retest after fixes and compare the score changes."
    ],
    estimatedImpact: estimateImpact(weakest.value)
  };
}

function buildPriorityFixes(weakest, input) {
  const firstOpportunity = Array.isArray(input.opportunities) && input.opportunities.length > 0
    ? input.opportunities[0]
    : null;
  const opportunityTitle = firstOpportunity && typeof firstOpportunity.title === "string"
    ? firstOpportunity.title
    : `Improve ${formatScoreName(weakest.name)}`;

  return [
    {
      title: opportunityTitle,
      priority: weakest.value < 70 ? "high" : "medium",
      reason: "This item is tied to the lowest available Lighthouse score in the submitted report."
    }
  ];
}

function findWeakestScore(scores) {
  return Object.entries(scores)
    .filter((entry) => typeof entry[1] === "number")
    .sort((a, b) => a[1] - b[1])
    .map(([name, value]) => ({ name, value }))[0] || {
      name: "performance",
      value: 0
    };
}

function normalizeScore(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function estimateImpact(score) {
  if (score < 50) {
    return "High";
  }

  if (score < 85) {
    return "Medium";
  }

  return "Low";
}

function formatScoreName(name) {
  if (name === "bestPractices") {
    return "best practices";
  }

  return String(name || "performance").replace(/([A-Z])/g, " $1").toLowerCase();
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function throwToolError(code, message, nextStep) {
  const error = new Error(message);
  error.code = code;
  error.nextStep = nextStep;
  throw error;
}

module.exports = {
  lighthouseHandoffTool
};
