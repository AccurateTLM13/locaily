const { readFileSync, readdirSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { computeDependencyGraph } = require("../core/dag-graph");
const { validateResult } = require("../core/result-validator");

const TRACKS_DIR = resolve(__dirname, "..", "crew", "tracks");
const TOOL_PACKS_DIR = resolve(__dirname, "..", "..", "tool-packs");

const fs = require("node:fs");
const path = require("node:path");
const OUTPUT_SCHEMA_PATH = "companion/schemas/track-planner-output.schema.json";

const outputSchema = {
  type: "object",
  required: ["plan"],
  properties: {
    plan: {
      type: "object",
      required: ["trackId", "steps"],
      properties: {
        trackId: { type: "string" },
        reasoning: { type: "string" },
        steps: {
          type: "array",
          items: {
            type: "object",
            required: ["stepId", "description"],
            properties: {
              stepId: { type: "string" },
              description: { type: "string" },
              dependsOn: { type: "array", items: { type: "string" } }
            }
          }
        }
      }
    }
  }
};

const trackPlannerTool = {
  id: "track-planner",
  name: "Track Planner",
  pack: "core",
  description: "Analyze a free-form user request and produce a structured track execution plan by selecting and composing tracks.",
  tasks: ["plan"],
  permissions: ["model.run"],
  modelRole: "reasoning_worker",
  requiresRuntime: true,
  inputSchema: null,
  _inputSchema: {
    type: "object",
    required: ["request"],
    properties: {
      request: { type: "string", description: "Free-form user request describing what they want to accomplish" },
      context: { type: "string", description: "Optional additional context about the codebase or constraints" }
    }
  },
  outputSchema: OUTPUT_SCHEMA_PATH,
  output: outputSchema,
  validateInput,
  async handle({ task, input, runtime, options }) {
    if (task !== "plan") {
      throw Object.assign(new Error(`Unknown task '${task}'`), { code: "UNKNOWN_TASK" });
    }

    const availableTracks = listAvailableTracks();
    const prompt = buildPlannerPrompt(input.request, availableTracks, input.context);

    const resolvedModel = resolvePlannerModel(options);
    const qualification = typeof options.getModelQualificationEvidence === "function"
      ? options.getModelQualificationEvidence({
          model: resolvedModel,
          role: "reasoning_worker",
          trackId: null,
          contractId: null
        })
      : null;
    const policy = options.qualification_policy || options.qualificationPolicy || "advisory";

    if (policy === "require_qualified" || policy === "require_qualified_or_conditional") {
      const qualified = qualification && (qualification.status === "qualified" || qualification.status === "conditional");
      if (!qualified) {
        return {
          ok: false,
          error: {
            code: "PLANNER_ROLE_NOT_QUALIFIED",
            message: `Track planner role 'reasoning_worker' requires qualified Benchmark Lab evidence (policy '${policy}').`,
            nextStep: "Qualify a model for reasoning_worker via Benchmark Lab, or run with advisory qualification policy."
          }
        };
      }
    }

    const result = await runtime.generateJson(prompt, outputSchema, { temperature: 0.2, model: resolvedModel, ...options });
    if (!result.ok) {
      return { ok: false, error: { code: "PLANNER_FAILED", message: result.error?.message || "Track planner failed" } };
    }

    const plan = result.output?.plan;
    if (!plan || !plan.trackId || !Array.isArray(plan.steps)) {
      return { ok: false, error: { code: "INVALID_PLAN", message: "Planner output missing required plan fields" } };
    }

    const trackFiles = availableTracks.filter(t => t.trackId === plan.trackId);
    if (trackFiles.length === 0) {
      return {
        ok: false,
        error: { code: "TRACK_NOT_FOUND", message: `Track '${plan.trackId}' not found` },
        suggestTracks: availableTracks.map(t => t.trackId)
      };
    }

    const planResult = {
      trackId: plan.trackId,
      reasoning: plan.reasoning || "",
      steps: plan.steps,
      trackInfo: trackFiles[0]
    };

    const dagGraph = computeDependencyGraph({ steps: plan.steps.map(s => ({
      id: s.stepId,
      input_map: {},
      depends_on: s.dependsOn,
      executor: { type: "model", role: "unknown" }
    }))});

    if (dagGraph.cycles.length > 0) {
      return {
        ok: true,
        result: planResult,
        warning: `Cycle detected in planned dependencies: ${dagGraph.cycles.map(c => c.join(" -> ")).join(", ")}`
      };
    }

    return { ok: true, result: planResult };
  }
};

function listAvailableTracks() {
  try {
    const files = readdirSync(TRACKS_DIR).filter(f => f.endsWith(".track.json"));
    return files.map(f => {
      try {
        const content = JSON.parse(readFileSync(join(TRACKS_DIR, f), "utf8"));
        return {
          trackId: content.track_id,
          name: content.name,
          description: content.description,
          stepCount: (content.steps || []).length,
          outputSchema: content.output_schema
        };
      } catch {
        return null;
      }
    }).filter(Boolean);
  } catch {
    return [];
  }
}

function buildPlannerPrompt(request, availableTracks, context) {
  const trackListing = availableTracks.map(t =>
    `- ${t.trackId}: ${t.name} — ${t.description} (${t.stepCount} steps)`
  ).join("\n");

  return [
    "You are a track planner for the Locaily local AI coordination stack.",
    "Given a user request, select the most appropriate track(s) and produce a structured execution plan.",
    "",
    "Available tracks:",
    trackListing,
    "",
    "Rules:",
    "- Select the track whose description best matches the user's request.",
    "- If no track fits, suggest an alternative or explain why.",
    "- Do not invent track IDs that are not in the available list.",
    "- For complex multi-step requests, decompose into step-level plan within the selected track.",
    "- Each step must have a unique stepId and description.",
    "- Set dependsOn to reference stepIds this step depends on (empty array for no dependencies).",
    "",
    `User request: ${request}`,
    context ? `Additional context: ${context}` : "",
    "",
    "Output JSON only matching the schema."
  ].filter(Boolean).join("\n");
}

function validateInput(input) {
  if (!input || typeof input !== "object") {
    return { ok: false, code: "INVALID_INPUT", message: "Input must be an object." };
  }
  if (!input.request || typeof input.request !== "string" || input.request.length < 3) {
    return { ok: false, code: "MISSING_REQUEST", message: "A 'request' field with at least 3 characters is required." };
  }
  return { ok: true };
}

function resolvePlannerModel(options) {
  if (typeof options.resolveModelForRole === "function") {
    const resolved = options.resolveModelForRole("reasoning_worker");
    if (resolved && resolved.ok && resolved.model) {
      return resolved.model;
    }
  }
  if (typeof options.model === "string" && options.model.trim()) {
    return options.model.trim();
  }
  return "mock-local-model";
}

module.exports = trackPlannerTool;
