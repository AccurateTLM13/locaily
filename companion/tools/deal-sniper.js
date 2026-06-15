const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { validateResult } = require("../core/result-validator");

const promptTemplate = readFileSync(join(__dirname, "..", "prompts", "deal-sniper.md"), "utf8");
const outputSchema = require("../schemas/deal-sniper.schema.json");

const dealSniperTool = {
  id: "deal-sniper",
  name: "DealSniper AI",
  pack: "showcase-tools",
  description: "Analyze marketplace listings for deal quality, risk, negotiation tips, and next actions.",
  tasks: ["analyze-listing", "prepare-listing", "validate-analysis"],
  permissions: ["model.run"],
  modelRole: "default_worker",
  requiresRuntime: true,
  inputSchema: "companion/schemas/deal-sniper.input.schema.json",
  outputSchema: "companion/schemas/deal-sniper.schema.json",
  input: {
    required: ["title", "price"],
    optional: ["description", "location", "sellerInfo", "source"]
  },
  output: outputSchema,
  validateInput,
  async handle({ task, input, runtime, options }) {
    if (task === "prepare-listing") {
      return prepareListing(input);
    }

    if (task === "validate-analysis") {
      return validateAnalysis(input);
    }

    if (task !== "analyze-listing") {
      throwToolError("UNKNOWN_TASK", `Task '${task}' is not supported by DealSniper.`);
    }

    const validationError = validateListingInput(input);

    if (validationError) {
      throwToolError(validationError.code, validationError.message, validationError.nextStep);
    }

    const prompt = buildPrompt(input);
    const modelResult = await runtime.generateJson(prompt, outputSchema, {
      temperature: 0.2,
      ...options
    });

    return normalizeResult(modelResult);
  }
};

function validateInput(input) {
  if (
    input
    && typeof input === "object"
    && !Array.isArray(input)
    && Object.prototype.hasOwnProperty.call(input, "analysis")
    && !Object.prototype.hasOwnProperty.call(input, "title")
  ) {
    return null;
  }

  return validateListingInput(input);
}

function validateListingInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      code: "INVALID_INPUT",
      message: "DealSniper input must be an object.",
      nextStep: "Send listing fields such as title, price, description, location, sellerInfo, and source."
    };
  }

  if (!isNonEmptyString(input.title)) {
    return {
      code: "INVALID_INPUT",
      message: "DealSniper input requires a non-empty title.",
      nextStep: "Include the marketplace listing title."
    };
  }

  if (!isFinitePrice(input.price)) {
    return {
      code: "INVALID_INPUT",
      message: "DealSniper input requires a numeric price.",
      nextStep: "Include price as a number or numeric string."
    };
  }

  return null;
}

function prepareListing(input) {
  const validationError = validateListingInput(input);

  if (validationError) {
    throwToolError(validationError.code, validationError.message, validationError.nextStep);
  }

  return normalizeListingInput(input);
}

function validateAnalysis(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throwToolError(
      "INVALID_INPUT",
      "DealSniper validate-analysis input must be an object.",
      "Send analysis from the prior analyze_listing step."
    );
  }

  if (!input.analysis || typeof input.analysis !== "object" || Array.isArray(input.analysis)) {
    throwToolError(
      "INVALID_INPUT",
      "DealSniper validate-analysis input requires an analysis object.",
      "Map analysis from $artifacts.analyze_listing in the track input_map."
    );
  }

  const validation = validateResult(input.analysis, outputSchema);

  return {
    valid: validation.ok,
    errors: validation.errors || []
  };
}

function normalizeListingInput(input) {
  return {
    title: String(input.title).trim(),
    price: Number(input.price),
    description: optionalString(input.description),
    location: optionalString(input.location),
    sellerInfo: optionalString(input.sellerInfo),
    source: optionalString(input.source)
  };
}

function buildPrompt(input) {
  const normalizedInput = normalizeListingInput(input);

  return [
    promptTemplate.trim(),
    "",
    "Listing input:",
    JSON.stringify(normalizedInput, null, 2)
  ].join("\n");
}

function normalizeResult(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throwToolError("MODEL_RESPONSE_INVALID", "DealSniper model output must be an object.");
  }

  return {
    dealScore: clampInteger(result.dealScore, 0, 100),
    riskLevel: normalizeRiskLevel(result.riskLevel),
    summary: requiredString(result.summary, "No summary returned."),
    redFlags: normalizeStringArray(result.redFlags),
    positiveSignals: normalizeStringArray(result.positiveSignals),
    negotiationTip: requiredString(result.negotiationTip, "Ask a few practical questions before making an offer."),
    nextAction: requiredString(result.nextAction, "Review the listing details before contacting the seller.")
  };
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isFinitePrice(value) {
  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  if (typeof value === "string" && value.trim()) {
    return Number.isFinite(Number(value));
  }

  return false;
}

function optionalString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function requiredString(value, fallback) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  return fallback;
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item) => typeof item === "string" && item.trim())
    .map((item) => item.trim());
}

function normalizeRiskLevel(value) {
  const risk = typeof value === "string" ? value.toLowerCase().trim() : "";

  if (["low", "medium", "high"].includes(risk)) {
    return risk;
  }

  return "medium";
}

function clampInteger(value, min, max) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return min;
  }

  return Math.max(min, Math.min(max, Math.round(number)));
}

function throwToolError(code, message, nextStep) {
  const error = new Error(message);
  error.code = code;
  error.nextStep = nextStep;
  throw error;
}

module.exports = {
  dealSniperTool
};
