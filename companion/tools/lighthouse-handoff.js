const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { executeLighthouseHandoffTrack } = require("../core/orchestrator");
const { recordScoreboardEntry } = require("../core/scoreboard");
const { formatHandoffMarkdown } = require("../crew/markdown");
const {
  resolveMemoryBridgeAdapter,
  runMemoryPreflight,
  buildProjectContextSection
} = require("../memory/preflight");
const {
  resolveExecutiveSummary: resolveDeterministicExecutiveSummary,
  validateAndEnrichPriorityFixes
} = require("../../tool-packs/lighthouse-parser-pack/audit-truth");

const promptTemplate = readFileSync(join(__dirname, "..", "prompts", "lighthouse-handoff.md"), "utf8");
const outputSchema = require("../schemas/lighthouse-handoff.schema.json");

const lighthouseHandoffTool = {
  id: "lighthouse-handoff",
  name: "Lighthouse Handoff",
  pack: "showcase-tools",
  description: "Convert Lighthouse/PageSpeed-style report data into developer handoff notes.",
  tasks: ["analyze-report", "compose-handoff"],
  permissions: ["model.run"],
  modelRole: "default_worker",
  requiresRuntime: false,
  inputSchema: "companion/schemas/lighthouse-handoff.input.schema.json",
  outputSchema: "companion/schemas/lighthouse-handoff.schema.json",
  input: {
    required: ["url", "scores"],
    optional: ["opportunities", "diagnostics"]
  },
  output: outputSchema,
  prompt: promptTemplate,
  validateInput: validateToolInput,
  async handle({ task, input, runtime, options }) {
    if (task === "compose-handoff") {
      const validationError = validateComposeInput(input);

      if (validationError) {
        throwToolError(validationError.code, validationError.message, validationError.nextStep);
      }

      const memoryPreflight = runMemoryPreflight({
        memoryOptions: options && options.memory,
        adapter: resolveMemoryBridgeAdapter(options || {}),
        project: options && options.memory && options.memory.project
          ? options.memory.project
          : "Lighthouse Handoff",
        task: options && options.memory && options.memory.task
          ? options.memory.task
          : "Generate coding-agent handoff from PageSpeed report",
        maxFiles: options && options.memory && options.memory.maxFiles
          ? options.memory.maxFiles
          : 6
      });

      return buildComposedHandoff(input, memoryPreflight);
    }

    if (task !== "analyze-report") {
      throwToolError("UNKNOWN_TASK", `Task '${task}' is not supported by Lighthouse Handoff.`);
    }

    const validationError = validateAnalyzeInput(input);

    if (validationError) {
      throwToolError(validationError.code, validationError.message, validationError.nextStep);
    }

    const executionMode = (options && options.execution_mode) || "orchestrated";
    const useRuntime = await shouldUseRuntime(runtime, options);

    if (!useRuntime) {
      return buildDemoResult(input);
    }

    const start = Date.now();

    if (executionMode === "baseline") {
      const prompt = `Convert this Lighthouse/PageSpeed report data into developer handoff notes.
Input URL: ${input.url}
Scores: ${JSON.stringify(input.scores)}
Opportunities: ${JSON.stringify(input.opportunities || [])}
Diagnostics: ${JSON.stringify(input.diagnostics || [])}

Make sure to return JSON only conforming to the schema.`;

      try {
        const result = await runtime.generateJson(prompt, outputSchema, {
          ...options,
          temperature: 0.2
        });

        recordScoreboardEntry({
          track: "lighthouse_handoff",
          mode: "baseline",
          durationMs: Date.now() - start,
          schemaValid: true,
          steps: [
            {
              name: "monolithic_baseline",
              model: options.model || runtime.model,
              role: options.model_role || "default_worker",
              durationMs: Date.now() - start
            }
          ]
        });

        return result;
      } catch (err) {
        recordScoreboardEntry({
          track: "lighthouse_handoff",
          mode: "baseline",
          durationMs: Date.now() - start,
          schemaValid: false,
          steps: []
        });
        throw err;
      }
    }

    try {
      const orchestrationResult = await executeLighthouseHandoffTrack({
        input,
        runtime,
        options,
        toolRegistry: options.toolRegistry
      });

      recordScoreboardEntry({
        track: "lighthouse_handoff",
        mode: "orchestrated",
        durationMs: orchestrationResult.durationMs,
        schemaValid: orchestrationResult.schemaValid !== false,
        steps: orchestrationResult.steps
      });

      return {
        ...orchestrationResult.result,
        meta: {
          ...(orchestrationResult.result.meta || {}),
          orchestration_steps: orchestrationResult.steps
        }
      };
    } catch (err) {
      recordScoreboardEntry({
        track: "lighthouse_handoff",
        mode: "orchestrated",
        durationMs: Date.now() - start,
        schemaValid: false,
        steps: []
      });
      throw err;
    }
  }
};

async function shouldUseRuntime(runtime, options) {
  if (options && (options.use_runtime === false || options.useRuntime === false)) {
    return false;
  }

  if (!runtime) {
    return false;
  }

  if (runtime.provider === "mock") {
    return true;
  }

  if (runtime.provider !== "ollama") {
    return false;
  }

  try {
    const available = await runtime.isAvailable();

    if (!available) {
      return false;
    }

    const modelName = options.model || runtime.model;
    return runtime.hasModel(modelName);
  } catch (err) {
    return false;
  }
}

function validateComposeInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      code: "INVALID_INPUT",
      message: "Compose handoff input must be an object.",
      nextStep: "Send url, metrics, and prioritized fix artifacts."
    };
  }

  if (!isNonEmptyString(input.url)) {
    return {
      code: "INVALID_INPUT",
      message: "Compose handoff input requires url.",
      nextStep: "Include the tested page URL."
    };
  }

  return null;
}

function dedupeChecklistSteps(steps) {
  const seen = new Set();
  const unique = [];

  for (const step of steps) {
    if (typeof step !== "string") {
      continue;
    }

    const normalized = step.trim();

    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    unique.push(normalized);
  }

  return unique;
}

const GENERIC_EXECUTIVE_SUMMARY_PATTERNS = [
  /^based on the severity/i,
  /^based on the analysis/i,
  /^this report identifies/i,
  /^the issues should be prioritized/i
];

const MIN_EXECUTIVE_SUMMARY_LENGTH = 80;

function isGenericOrThinExecutiveSummary(text) {
  const value = String(text || "").trim();

  if (!value) {
    return true;
  }

  if (value.length < MIN_EXECUTIVE_SUMMARY_LENGTH) {
    return true;
  }

  return GENERIC_EXECUTIVE_SUMMARY_PATTERNS.some((pattern) => pattern.test(value));
}

function inferPriorityTheme(priorityFixes, fallbackCategory) {
  const firstFix = Array.isArray(priorityFixes) ? priorityFixes[0] : null;

  if (!firstFix || !firstFix.title) {
    return `${formatScoreName(fallbackCategory)} improvements`;
  }

  const title = String(firstFix.title).toLowerCase();

  if (/network|payload|javascript|image|render|main-thread|speed|load|latency/.test(title)) {
    return "performance and loading";
  }

  if (/accessib|contrast|alt |aria|heading/.test(title)) {
    return "accessibility";
  }

  if (/seo|meta|index|canonical|crawl/.test(title)) {
    return "SEO";
  }

  if (/console|https|security|deprecated|best practice/.test(title)) {
    return "best practices";
  }

  return firstFix.title;
}

function buildExecutiveSummaryFallback({ url, weakest, priorityFixes }) {
  const category = formatScoreName(weakest.name);
  const score = weakest.value;
  const fixes = (priorityFixes || []).map((fix) => fix.title).filter(Boolean).slice(0, 3);
  const theme = inferPriorityTheme(priorityFixes, weakest.name);

  if (fixes.length === 0) {
    return `For ${url}, the weakest Lighthouse area is ${category} at ${score}. The highest-priority work is ${theme}. Start with the fixes most likely to improve user-perceived loading speed while preserving layout, tracking, and existing behavior.`;
  }

  if (fixes.length === 1) {
    return `For ${url}, the weakest Lighthouse area is ${category} at ${score}. The highest-priority work is ${theme}, starting with ${fixes[0]}. Start with the fixes most likely to improve user-perceived loading speed while preserving layout, tracking, and existing behavior.`;
  }

  const fixList = fixes.length === 2
    ? `${fixes[0]} and ${fixes[1]}`
    : `${fixes[0]}, ${fixes[1]}, and ${fixes[2]}`;

  return `For ${url}, the weakest Lighthouse area is ${category} at ${score}. The highest-priority work is ${theme}, led by ${fixList}. Start with the fixes most likely to improve user-perceived loading speed while preserving layout, tracking, and existing behavior.`;
}

function resolveExecutiveSummary(input, weakest, priorityFixes, metrics) {
  const thinking = input.prioritizedFixes?.thinking;
  const baseSummary = !isGenericOrThinExecutiveSummary(thinking)
    ? thinking
    : buildExecutiveSummaryFallback({
      url: input.url,
      weakest,
      priorityFixes
    });

  return ensureExecutiveSummaryLead({
    summary: baseSummary,
    url: input.url,
    weakest,
    metrics
  });
}

const WRONG_CATEGORY_LABELS = {
  performance: [/\baccessibility\b/gi, /\bseo\b/gi, /\bbest practices?\b/gi],
  accessibility: [/\bperformance\b/gi, /\bseo\b/gi, /\bbest practices?\b/gi],
  seo: [/\bperformance\b/gi, /\baccessibility\b/gi, /\bbest practices?\b/gi],
  bestPractices: [/\bperformance\b/gi, /\baccessibility\b/gi, /\bseo\b/gi]
};

function inferFixCategoryFromTitle(title) {
  const value = String(title || "").toLowerCase();

  if (/render|network|payload|javascript|image|main-thread|latency|speed|load|size|kib|execution|document request/.test(value)) {
    return "performance";
  }

  if (/accessib|contrast|alt |aria|heading|interactive/.test(value)) {
    return "accessibility";
  }

  if (/seo|meta|index|canonical|crawl/.test(value)) {
    return "seo";
  }

  if (/console|https|security|deprecated|best practice/.test(value)) {
    return "bestPractices";
  }

  return null;
}

function sanitizePriorityFixReason(fix) {
  if (!fix || typeof fix !== "object") {
    return fix;
  }

  const category = inferFixCategoryFromTitle(fix.title);
  const reason = typeof fix.reason === "string" ? fix.reason : "";

  if (!category || !reason) {
    return fix;
  }

  const replacements = WRONG_CATEGORY_LABELS[category] || [];
  let sanitizedReason = reason;
  let changed = false;

  for (const pattern of replacements) {
    if (pattern.test(sanitizedReason)) {
      changed = true;
      sanitizedReason = sanitizedReason.replace(pattern, formatScoreName(category));
    }
  }

  if (!changed) {
    return fix;
  }

  return {
    ...fix,
    reason: sanitizedReason.replace(/\s+/g, " ").trim()
  };
}

function sanitizePriorityFixes(priorityFixes) {
  return (priorityFixes || []).map(sanitizePriorityFixReason);
}

function buildOtherScoresPhrase(metrics, weakestName) {
  const parts = [];

  for (const [name, value] of Object.entries(metrics || {})) {
    if (name === weakestName || typeof value !== "number") {
      continue;
    }

    parts.push(`${formatScoreName(name)} at ${value}`);
  }

  return parts.join(", ");
}

function executiveSummaryHasLead(summary, url, weakest) {
  const value = String(summary || "").trim().toLowerCase();
  const category = formatScoreName(weakest.name).toLowerCase();

  return value.includes(String(url).toLowerCase())
    && value.includes(category)
    && value.includes(String(weakest.value));
}

function ensureExecutiveSummaryLead({ summary, url, weakest, metrics }) {
  const trimmed = String(summary || "").trim();

  if (executiveSummaryHasLead(trimmed, url, weakest)) {
    return trimmed;
  }

  const category = formatScoreName(weakest.name);
  const otherScores = buildOtherScoresPhrase(metrics, weakest.name);
  const lead = otherScores
    ? `For ${url}, the weakest Lighthouse category is ${category} at ${weakest.value}, while ${otherScores}.`
    : `For ${url}, the weakest Lighthouse category is ${category} at ${weakest.value}.`;

  if (!trimmed) {
    return lead;
  }

  return `${lead} ${trimmed}`.trim();
}

function buildComposedHandoff(input, memoryPreflight = null) {
  const metrics = input.metrics || {};
  const modelPriorityFixes = Array.isArray(input.prioritizedFixes?.priorityFixes)
    ? input.prioritizedFixes.priorityFixes
    : [];
  const needsReview = Array.isArray(input.prioritizedFixes?.needsReview)
    ? input.prioritizedFixes.needsReview
    : [];
  const matchedFixes = Array.isArray(input.matchedFixes?.fixes) ? input.matchedFixes.fixes : [];
  const opportunities = Array.isArray(input.opportunities) ? input.opportunities : [];
  const rankedOpportunities = Array.isArray(input.rankedOpportunities) ? input.rankedOpportunities : [];
  const weakest = findWeakestScore({
    performance: metrics.performance,
    accessibility: metrics.accessibility,
    bestPractices: metrics.bestPractices,
    seo: metrics.seo
  });

  const validated = validateAndEnrichPriorityFixes({
    priorityFixes: modelPriorityFixes,
    opportunities,
    maxFixes: 3
  });

  const resolvedPriorityFixes = sanitizePriorityFixes(
    validated.priorityFixes.length > 0
      ? validated.priorityFixes
      : buildPriorityFixes(weakest, { opportunities }).map((fix) => ({
        ...fix,
        unsupported_priority_fix: false
      }))
  );

  const resolvedNeedsReview = needsReview.length > 0
    ? needsReview
    : validated.needsReview;

  const checklist = dedupeChecklistSteps(matchedFixes.flatMap((fix) => fix.steps || [])).slice(0, 5);

  if (checklist.length === 0) {
    checklist.push(
      "Review the lowest Lighthouse score first.",
      "Confirm opportunities and diagnostics against the live page.",
      "Retest after fixes and compare the score changes."
    );
  }

  const handoff = {
    clientSummary: `Handoff for ${input.url}: lowest score is ${formatScoreName(weakest.name)} at ${weakest.value}.`,
    developerSummary: resolveDeterministicExecutiveSummary({
      url: input.url,
      metrics: {
        performance: metrics.performance,
        accessibility: metrics.accessibility,
        bestPractices: metrics.bestPractices,
        seo: metrics.seo
      },
      weakest,
      rankedOpportunities: rankedOpportunities.length > 0
        ? rankedOpportunities
        : resolvedPriorityFixes,
      modelThinking: input.prioritizedFixes?.thinking
    }),
    priorityFixes: resolvedPriorityFixes,
    developerTaskPacket: normalizeDeveloperTaskPacket(input.developerTaskPacket),
    guardrailPacket: normalizeGuardrailPacket(input.guardrailPacket),
    testingChecklistPacket: normalizeTestingChecklistPacket(input.testingChecklistPacket),
    needsReview: resolvedNeedsReview,
    handoffChecklist: checklist,
    estimatedImpact: estimateImpact(weakest.value)
  };

  const memoryUsed = Boolean(memoryPreflight && memoryPreflight.used && memoryPreflight.pack);
  const projectContextSection = memoryUsed
    ? buildProjectContextSection(memoryPreflight.pack)
    : null;

  handoff.markdown = formatHandoffMarkdown({
    ...handoff,
    url: input.url,
    projectContextSection,
    memoryUsed,
    needsReview: handoff.needsReview
  });

  handoff.memory = {
    used: memoryUsed,
    contextPackId: memoryUsed ? memoryPreflight.pack.contextPackId : null,
    filesUsed: memoryUsed ? memoryPreflight.pack.filesUsed : [],
    warnings: memoryPreflight ? memoryPreflight.warnings : []
  };

  return handoff;
}

function normalizeGuardrailPacket(packet) {
  if (!packet || typeof packet !== "object" || Array.isArray(packet)) {
    return null;
  }
  return {
    implementationGuardrails: Array.isArray(packet.implementationGuardrails) ? packet.implementationGuardrails : [],
    doNotBreakConstraints: Array.isArray(packet.doNotBreakConstraints) ? packet.doNotBreakConstraints : [],
    humanReviewTriggers: Array.isArray(packet.humanReviewTriggers) ? packet.humanReviewTriggers : [],
    riskNotes: Array.isArray(packet.riskNotes) ? packet.riskNotes : [],
    verificationBoundaries: Array.isArray(packet.verificationBoundaries) ? packet.verificationBoundaries : []
  };
}

function normalizeTestingChecklistPacket(packet) {
  if (!packet || typeof packet !== "object" || Array.isArray(packet)) {
    return null;
  }
  return {
    pageSpeedRerunSteps: Array.isArray(packet.pageSpeedRerunSteps) ? packet.pageSpeedRerunSteps : [],
    beforeAfterComparisons: Array.isArray(packet.beforeAfterComparisons) ? packet.beforeAfterComparisons : [],
    regressionChecks: Array.isArray(packet.regressionChecks) ? packet.regressionChecks : [],
    manualQaNotes: Array.isArray(packet.manualQaNotes) ? packet.manualQaNotes : [],
    codingAgentVerification: Array.isArray(packet.codingAgentVerification) ? packet.codingAgentVerification : [],
    stopAndAskTriggers: Array.isArray(packet.stopAndAskTriggers) ? packet.stopAndAskTriggers : []
  };
}

function normalizeDeveloperTaskPacket(packet) {
  if (!packet || typeof packet !== "object" || Array.isArray(packet)) {
    return {
      developerTasks: [],
      acceptanceCriteria: [],
      guardrails: [],
      testingChecklist: []
    };
  }

  return {
    developerTasks: Array.isArray(packet.developerTasks) ? packet.developerTasks : [],
    acceptanceCriteria: Array.isArray(packet.acceptanceCriteria) ? packet.acceptanceCriteria : [],
    guardrails: Array.isArray(packet.guardrails) ? packet.guardrails : [],
    testingChecklist: Array.isArray(packet.testingChecklist) ? packet.testingChecklist : []
  };
}

function validateToolInput(input) {
  if (input && typeof input === "object" && (input.metrics || input.prioritizedFixes || input.matchedFixes)) {
    return validateComposeInput(input);
  }

  return validateAnalyzeInput(input);
}

function validateAnalyzeInput(input) {
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
  lighthouseHandoffTool,
  normalizeTestingChecklistPacket
};
