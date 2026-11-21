const path = require("node:path");
const { validateResult } = require("../core/result-validator");
const { loadTrack } = require("../crew/decomposer");
const { listWorkflows } = require("./workflow-registry");
const { validateWorkflowInput } = require("./run-plan-builder");

const taskIntakeResultSchema = require("../schemas/task-intake-result.schema.json");

const REFUSAL_THRESHOLD = 0.25;
const HIGH_CONFIDENCE_THRESHOLD = 0.50;
const AMBIGUITY_MARGIN = 0.15;

const STOPWORDS = new Set([
  "the", "and", "for", "with", "this", "that", "from", "into", "your",
  "workflow", "track", "local", "using", "across", "about", "please", "want"
]);

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9_.\s-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeWords(normalizedText) {
  if (!normalizedText) return [];
  return normalizedText
    .split(/[\s]+/)
    .map((w) => w.replace(/^[._-]+|[._-]+$/g, ""))
    .filter(Boolean);
}

function containsTerm(normalizedText, tokensSet, term) {
  const normTerm = normalizeText(term);
  if (!normTerm) return false;
  if (normTerm.includes(" ")) {
    return normalizedText.includes(normTerm);
  }
  if (tokensSet.has(normTerm)) {
    return true;
  }
  // Check hyphen/underscore separated tokens too
  if (normTerm.includes("_") || normTerm.includes("-")) {
    return normalizedText.includes(normTerm);
  }
  return false;
}

function buildWorkflowCatalog(workflowPackRegistry = null) {
  if (!workflowPackRegistry) {
    return listWorkflows();
  }
  const builtins = listWorkflows().filter((wf) => !wf.pack_id);
  const packWorkflows = workflowPackRegistry.listPackWorkflows();
  return [...builtins, ...packWorkflows];
}

function deriveFallbackHints(workflow) {
  const idParts = String(workflow.workflow_id || "").toLowerCase().split("_").filter((w) => w.length >= 3);
  const nameWords = tokenizeWords(normalizeText(workflow.name || ""))
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
  const inputFields = Array.isArray(workflow.input_requirements)
    ? workflow.input_requirements.map((r) => r.field).filter(Boolean)
    : [];

  return {
    keywords: [...new Set([...idParts, ...nameWords])],
    phrases: [String(workflow.name || "").toLowerCase(), String(workflow.workflow_id || "").replace(/_/g, " ")].filter(Boolean),
    input_hints: inputFields,
    negative_keywords: []
  };
}

/**
 * Stage 1: Score every registered workflow using deterministic intent & input hints.
 */
function scoreDeterministicHints(request, input, catalog) {
  const normalizedRequest = normalizeText(request);
  const tokens = tokenizeWords(normalizedRequest);
  const tokensSet = new Set(tokens);
  const inputObj = (input && typeof input === "object" && !Array.isArray(input)) ? input : {};

  const scored = catalog.map((workflow) => {
    const hints = workflow.intake || deriveFallbackHints(workflow);
    const matchedHints = [];
    let score = 0;

    // 1. Direct workflow_id or full workflow name mention
    const wfIdPhrase = normalizeText(String(workflow.workflow_id || "").replace(/_/g, " "));
    const wfNameNorm = normalizeText(workflow.name || "");
    if (
      (workflow.workflow_id && containsTerm(normalizedRequest, tokensSet, workflow.workflow_id)) ||
      (wfIdPhrase && wfIdPhrase.includes(" ") && normalizedRequest.includes(wfIdPhrase)) ||
      (wfNameNorm && wfNameNorm.length >= 4 && normalizedRequest.includes(wfNameNorm))
    ) {
      score += 0.55;
      matchedHints.push(`direct:${workflow.workflow_id}`);
    }

    // 2. Multi-word phrases
    let phraseScore = 0;
    for (const phrase of hints.phrases || []) {
      const normPhrase = normalizeText(phrase);
      if (normPhrase && normalizedRequest.includes(normPhrase)) {
        phraseScore += 0.35;
        matchedHints.push(`phrase:${phrase}`);
      }
    }
    score += Math.min(0.70, phraseScore);

    // 3. Keywords
    let keywordScore = 0;
    for (const keyword of hints.keywords || []) {
      if (containsTerm(normalizedRequest, tokensSet, keyword)) {
        keywordScore += 0.20;
        matchedHints.push(`keyword:${keyword}`);
      }
    }
    score += Math.min(0.60, keywordScore);

    // 4. Structured input field hints
    let inputScore = 0;
    for (const field of hints.input_hints || []) {
      const val = inputObj[field];
      if (val !== undefined && val !== null && val !== "") {
        inputScore += 0.25;
        matchedHints.push(`input:${field}`);
      }
    }
    score += Math.min(0.50, inputScore);

    // 5. Negative keyword penalties
    for (const neg of hints.negative_keywords || []) {
      if (containsTerm(normalizedRequest, tokensSet, neg)) {
        score -= 0.25;
        matchedHints.push(`penalty:${neg}`);
      }
    }

    const clamped = Math.max(0, Math.min(1, Number(score.toFixed(4))));
    const reason = matchedHints.length > 0
      ? `Matched hints: ${matchedHints.join(", ")}`
      : "No deterministic intent hints matched.";

    return {
      workflow,
      workflow_id: workflow.workflow_id,
      name: workflow.name,
      pack_id: workflow.pack_id || null,
      score: clamped,
      matched_hints: matchedHints,
      reason
    };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.matched_hints.length !== a.matched_hints.length) {
      return b.matched_hints.length - a.matched_hints.length;
    }
    return a.workflow_id.localeCompare(b.workflow_id);
  });

  return scored;
}

function selectClassifierCapability(qualificationResolver) {
  if (!qualificationResolver || typeof qualificationResolver.resolveForCapability !== "function") {
    return null;
  }

  const allCaps = typeof qualificationResolver.resolveAllCapabilities === "function"
    ? qualificationResolver.resolveAllCapabilities()
    : [];

  const classifyCaps = allCaps.filter((c) => c.trackId === "core.classify");
  const qualified = classifyCaps
    .filter((c) => c.state === "qualified")
    .sort((a, b) => (b.score || 0) - (a.score || 0));

  if (qualified.length > 0) {
    return {
      qualified: true,
      state: "qualified",
      model: qualified[0].runtimeModelName || qualified[0].modelId,
      modelId: qualified[0].modelId,
      role: qualified[0].role
    };
  }

  const fallback = classifyCaps[0];
  return {
    qualified: false,
    state: fallback ? fallback.state : "untested",
    model: fallback ? (fallback.runtimeModelName || fallback.modelId) : null,
    modelId: fallback ? fallback.modelId : null,
    role: fallback ? fallback.role : "default_worker"
  };
}

/**
 * Stage 2: Optional qualification-gated small classifier with strict anti-invention guard.
 */
async function runOptionalClassifier({
  request,
  input,
  catalog,
  options,
  runtime,
  qualificationResolver
}) {
  if (options.useModelClassifier !== true || !runtime || typeof runtime.generateJson !== "function") {
    return {
      used: false,
      mode: "deterministic_only",
      model: null,
      qualification_state: null,
      raw_category: null,
      confidence: 0,
      invented_rejected: false,
      note: "Small classifier not enabled; routed via deterministic hints."
    };
  }

  const requireQualified = options.requireQualifiedClassifier !== false;
  const cap = selectClassifierCapability(qualificationResolver);

  if (qualificationResolver) {
    if (requireQualified && (!cap || !cap.qualified)) {
      return {
        used: false,
        mode: "skipped_unqualified",
        model: cap ? cap.modelId : null,
        qualification_state: cap ? cap.state : "untested",
        raw_category: null,
        confidence: 0,
        invented_rejected: false,
        note: `Skipped model classifier: core.classify qualification state is '${cap ? cap.state : "untested"}'.`
      };
    }
  } else if (options.requireQualifiedClassifier === true) {
    return {
      used: false,
      mode: "skipped_unqualified",
      model: null,
      qualification_state: "untested",
      raw_category: null,
      confidence: 0,
      invented_rejected: false,
      note: "Skipped model classifier: strict qualification required and no qualification resolver supplied."
    };
  }

  const allowedWorkflowIds = catalog.map((w) => w.workflow_id);
  const categories = [...allowedWorkflowIds, "unsupported"];
  const modelToUse = (typeof options.classifierModel === "string" && options.classifierModel.trim())
    ? options.classifierModel.trim()
    : (cap && cap.model) || runtime.model || "mock-local-model";

  const prompt = [
    "Classify the user request into exactly one existing Locaily workflow_id or 'unsupported'.",
    "NEVER invent a workflow_id or track name not listed below.",
    "",
    "Allowed workflows:",
    ...catalog.map((w) => `- ${w.workflow_id}: ${w.name} — ${w.description}`),
    "- unsupported: Request does not fit any listed workflow.",
    "",
    `User request: ${request}`,
    `Supplied input keys: ${JSON.stringify(Object.keys(input || {}))}`,
    "",
    "Output JSON with { category, confidence, reason }."
  ].join("\n");

  const schema = {
    type: "object",
    required: ["category", "confidence", "reason"],
    properties: {
      category: { type: "string" },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      reason: { type: "string" }
    }
  };

  try {
    const raw = await runtime.generateJson(prompt, schema, {
      model: modelToUse,
      temperature: 0.1
    });

    const rawCategory = raw && typeof raw.category === "string" ? raw.category.trim() : null;
    const confidence = raw && typeof raw.confidence === "number"
      ? Math.max(0, Math.min(1, raw.confidence))
      : 0.5;

    const allowedSet = new Set(categories);
    if (!rawCategory || !allowedSet.has(rawCategory)) {
      return {
        used: true,
        mode: "qualification_gated_classifier",
        model: modelToUse,
        qualification_state: cap ? cap.state : "advisory",
        raw_category: rawCategory,
        confidence: 0,
        invented_rejected: true,
        note: `Rejected hallucinated workflow ID '${rawCategory}'; fell back strictly to deterministic hints.`
      };
    }

    return {
      used: true,
      mode: "qualification_gated_classifier",
      model: modelToUse,
      qualification_state: cap ? cap.state : "advisory",
      raw_category: rawCategory,
      confidence,
      invented_rejected: false,
      note: raw && raw.reason ? String(raw.reason) : `Classifier selected '${rawCategory}'.`
    };
  } catch (err) {
    return {
      used: false,
      mode: "classifier_error_fallback",
      model: modelToUse,
      qualification_state: cap ? cap.state : "advisory",
      raw_category: null,
      confidence: 0,
      invented_rejected: false,
      note: `Classifier error (${err.message}); fell back to deterministic hints.`
    };
  }
}

function inspectInputContract(workflow, input) {
  const inputObj = (input && typeof input === "object" && !Array.isArray(input)) ? input : {};
  const missingInputs = [];
  const missingNames = [];
  const invalidNames = [];

  if (Array.isArray(workflow.input_requirements)) {
    for (const req of workflow.input_requirements) {
      const value = inputObj[req.field];
      const isEmptyString = typeof value === "string" && value.trim().length === 0;
      if (req.required === true && (value === undefined || value === null || isEmptyString)) {
        missingNames.push(req.field);
        missingInputs.push({
          field: req.field,
          type: req.type || "string",
          help: req.help || `Provide required '${req.field}'.`
        });
        continue;
      }
      if (value === undefined || value === null) continue;

      const matches = req.type === "integer"
        ? Number.isInteger(value)
        : req.type === "array"
          ? Array.isArray(value)
          : req.type === "object"
            ? (typeof value === "object" && !Array.isArray(value))
            : typeof value === req.type;

      if (!matches) {
        invalidNames.push(`${req.field} (expected ${req.type})`);
      }
    }
  } else {
    const legacyCheck = validateWorkflowInput(workflow, inputObj);
    if (!legacyCheck.ok) {
      missingNames.push("input");
      missingInputs.push({
        field: "input",
        type: "object",
        help: legacyCheck.nextStep || legacyCheck.message
      });
    }
  }

  return {
    missing_inputs: missingInputs,
    contract_check: {
      checked: true,
      ready_to_run: missingNames.length === 0 && invalidNames.length === 0,
      missing_required_inputs: missingNames,
      invalid_inputs: invalidNames
    }
  };
}

function inspectCapabilities(workflow, { toolRegistry = null, qualificationResolver = null, workflowPackRegistry = null } = {}) {
  const rawTracks = Array.isArray(workflow.composition) && workflow.composition.length > 0
    ? workflow.composition.map((c) => c.track_id)
    : (workflow.track_id ? [workflow.track_id] : []);
  const trackIds = [...new Set(rawTracks)];

  const missingTracks = [];
  const missingTools = [];
  const trackQualifications = [];
  const allCaps = qualificationResolver && typeof qualificationResolver.resolveAllCapabilities === "function"
    ? qualificationResolver.resolveAllCapabilities()
    : [];

  let anyModelTrack = false;
  let qualifiedModelTracks = 0;
  let staleModelTracks = 0;

  for (const trackId of trackIds) {
    let track = null;
    try {
      track = workflowPackRegistry
        ? (workflowPackRegistry.getPackTrack(trackId) || loadTrack(trackId))
        : loadTrack(trackId);
    } catch {
      track = null;
    }

    if (!track) {
      missingTracks.push(trackId);
      continue;
    }

    for (const step of track.steps || []) {
      if (step.executor?.type === "tool" && toolRegistry && typeof toolRegistry.has === "function") {
        if (!toolRegistry.has(step.executor.tool)) {
          missingTools.push(step.executor.tool);
        }
      }
    }

    const modelSteps = (track.steps || []).filter((s) => s.executor?.type === "model");
    if (modelSteps.length === 0) {
      trackQualifications.push({
        track_id: trackId,
        requires_model: false,
        role: null,
        state: "tool_only"
      });
      continue;
    }

    anyModelTrack = true;
    for (const ms of modelSteps) {
      const role = ms.executor.role || "default_worker";
      const matches = allCaps.filter((c) => c.trackId === trackId && c.role === role);
      const qualified = matches.find((c) => c.state === "qualified");
      const stale = matches.find((c) => c.state === "stale");
      const state = qualified ? "qualified" : (stale ? "stale" : (matches[0] ? matches[0].state : "untested"));

      if (state === "qualified") qualifiedModelTracks += 1;
      if (state === "stale") staleModelTracks += 1;

      trackQualifications.push({
        track_id: trackId,
        requires_model: true,
        role,
        state
      });
    }
  }

  let qualificationStatus = "none";
  if (trackIds.length > 0 && missingTracks.length === 0) {
    if (!anyModelTrack) {
      qualificationStatus = "tool_only";
    } else {
      const modelEntries = trackQualifications.filter((t) => t.requires_model);
      if (qualifiedModelTracks === modelEntries.length) {
        qualificationStatus = "qualified";
      } else if (qualifiedModelTracks > 0) {
        qualificationStatus = "partial";
      } else if (staleModelTracks > 0) {
        qualificationStatus = "stale";
      } else {
        qualificationStatus = "untested";
      }
    }
  }

  return {
    selected_tracks: trackIds,
    capability_check: {
      tracks_resolved: missingTracks.length === 0 && trackIds.length > 0,
      missing_tracks: [...new Set(missingTracks)],
      tools_resolved: missingTools.length === 0,
      missing_tools: [...new Set(missingTools)],
      qualification_status: qualificationStatus,
      track_qualifications: trackQualifications
    }
  };
}

/**
 * Evaluate a free-form request + optional input across built-in and Workflow Pack catalogs.
 */
async function evaluateTaskIntake({
  request = "",
  input = {},
  options = {},
  runtime = null,
  toolRegistry = null,
  qualificationResolver = null,
  workflowPackRegistry = null
} = {}) {
  const requestText = typeof request === "string" ? request.trim() : "";
  const catalog = buildWorkflowCatalog(workflowPackRegistry);
  const candidates = scoreDeterministicHints(requestText, input, catalog);

  const classifierResult = await runOptionalClassifier({
    request: requestText,
    input,
    catalog,
    options: options || {},
    runtime,
    qualificationResolver
  });

  const topDeterministicScore = candidates.length > 0 ? candidates[0].score : 0;
  let classifierDampenedUnsupported = false;

  if (classifierResult.used && !classifierResult.invented_rejected && classifierResult.raw_category) {
    if (classifierResult.raw_category === "unsupported") {
      if (classifierResult.confidence >= 0.7 && topDeterministicScore < HIGH_CONFIDENCE_THRESHOLD) {
        classifierDampenedUnsupported = true;
        for (const c of candidates) {
          c.score = Number((c.score * 0.45).toFixed(4));
        }
      }
    } else if (classifierResult.confidence >= 0.5) {
      const target = candidates.find((c) => c.workflow_id === classifierResult.raw_category);
      if (target) {
        target.score = Math.min(1, Number((target.score + 0.25 * classifierResult.confidence).toFixed(4)));
        target.matched_hints.push(`classifier:${classifierResult.raw_category}`);
        target.reason = `Matched hints: ${target.matched_hints.join(", ")}`;
        candidates.sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return a.workflow_id.localeCompare(b.workflow_id);
        });
      }
    }
  }

  const top = candidates[0] || null;
  const second = candidates[1] || null;
  const topScore = top ? top.score : 0;
  const secondScore = second ? second.score : 0;

  const publicCandidates = candidates.slice(0, 5).map((c) => ({
    workflow_id: c.workflow_id,
    name: c.name,
    pack_id: c.pack_id,
    score: c.score,
    matched_hints: c.matched_hints,
    reason: c.reason
  }));

  const classifierMeta = {
    used: classifierResult.used,
    mode: classifierResult.mode,
    model: classifierResult.model,
    qualification_state: classifierResult.qualification_state,
    raw_category: classifierResult.raw_category,
    invented_rejected: classifierResult.invented_rejected,
    note: classifierResult.note
  };

  const shouldRefuse = !top
    || topScore < REFUSAL_THRESHOLD
    || (!requestText && topScore < REFUSAL_THRESHOLD)
    || (classifierDampenedUnsupported && topDeterministicScore < 0.40);

  let result;

  if (shouldRefuse) {
    const knownIds = catalog.map((w) => w.workflow_id).join(", ");
    result = {
      schema: "locaily.task_intake_result.v1",
      decision: "refused",
      request: requestText,
      confidence: topScore,
      explanation: `Refused request: no registered workflow matched above refusal threshold (${REFUSAL_THRESHOLD}). Known workflows: ${knownIds}.`,
      confirmation_required: false,
      selected_workflow: null,
      selected_tracks: [],
      candidates: publicCandidates,
      uncertainty_reasons: [
        topScore > 0
          ? `Top candidate '${top.workflow_id}' scored ${topScore}, below refusal threshold ${REFUSAL_THRESHOLD}.`
          : "No registered workflow intent hints matched the request."
      ],
      missing_inputs: [],
      contract_check: {
        checked: false,
        ready_to_run: false,
        missing_required_inputs: [],
        invalid_inputs: []
      },
      capability_check: {
        tracks_resolved: false,
        missing_tracks: [],
        tools_resolved: false,
        missing_tools: [],
        qualification_status: "none",
        track_qualifications: []
      },
      classifier: classifierMeta
    };
  } else {
    const workflow = top.workflow;
    const contractInspect = inspectInputContract(workflow, input);
    const capInspect = inspectCapabilities(workflow, {
      toolRegistry,
      qualificationResolver,
      workflowPackRegistry
    });

    const uncertaintyReasons = [];
    if (second && secondScore >= REFUSAL_THRESHOLD && (topScore - secondScore) < AMBIGUITY_MARGIN) {
      uncertaintyReasons.push(
        `Close runner-up '${second.workflow_id}' (score ${secondScore}) is within ${AMBIGUITY_MARGIN} of '${top.workflow_id}' (score ${topScore}).`
      );
    }
    if (topScore < HIGH_CONFIDENCE_THRESHOLD) {
      uncertaintyReasons.push(
        `Moderate confidence (${topScore}) is below automatic selection threshold (${HIGH_CONFIDENCE_THRESHOLD}).`
      );
    }
    if (options && options.requireConfirmation === true) {
      uncertaintyReasons.push("Operator confirmation was explicitly requested.");
    }
    if (!capInspect.capability_check.tracks_resolved || !capInspect.capability_check.tools_resolved) {
      uncertaintyReasons.push("One or more required tracks or tools could not be resolved.");
    }
    if (options && options.execute === true && !contractInspect.contract_check.ready_to_run) {
      uncertaintyReasons.push(
        `Missing required workflow inputs before execution: ${contractInspect.contract_check.missing_required_inputs.join(", ")}.`
      );
    }

    const decision = uncertaintyReasons.length > 0 ? "confirm_required" : "selected";
    const confirmationRequired = decision === "confirm_required";

    const explanation = decision === "selected"
      ? `Selected '${workflow.workflow_id}'${workflow.pack_id ? ` (from pack '${workflow.pack_id}')` : ""} with confidence ${topScore}. ${top.reason}.`
      : `Confirmation required for '${workflow.workflow_id}' (confidence ${topScore}): ${uncertaintyReasons.join(" ")}`;

    result = {
      schema: "locaily.task_intake_result.v1",
      decision,
      request: requestText,
      confidence: topScore,
      explanation,
      confirmation_required: confirmationRequired,
      selected_workflow: {
        workflow_id: workflow.workflow_id,
        name: workflow.name,
        pack_id: workflow.pack_id || null,
        status: workflow.status,
        input_type: workflow.input_type,
        output_type: workflow.output_type
      },
      selected_tracks: capInspect.selected_tracks,
      candidates: publicCandidates,
      uncertainty_reasons: uncertaintyReasons,
      missing_inputs: contractInspect.missing_inputs,
      contract_check: contractInspect.contract_check,
      capability_check: capInspect.capability_check,
      classifier: classifierMeta
    };
  }

  const schemaCheck = validateResult(result, taskIntakeResultSchema, "intake");
  if (!schemaCheck.ok) {
    const err = new Error(`Task intake output violated task-intake-result.schema.json: ${schemaCheck.errors.join("; ")}`);
    err.code = "TASK_INTAKE_SCHEMA_INVALID";
    throw err;
  }

  return result;
}

/**
 * Evaluate a human-labeled intake benchmark dataset against evaluateTaskIntake().
 */
async function evaluateLabeledDataset(dataset, evalOptions = {}) {
  const cases = Array.isArray(dataset) ? dataset : (dataset?.cases || []);
  const results = [];
  let correct = 0;
  let unsupportedTotal = 0;
  let unsupportedRefused = 0;
  let refusedTotal = 0;
  let inventedCount = 0;

  const catalogIds = new Set(buildWorkflowCatalog(evalOptions.workflowPackRegistry).map((w) => w.workflow_id));

  for (const testCase of cases) {
    const output = await evaluateTaskIntake({
      request: testCase.request,
      input: testCase.input || {},
      options: testCase.options || {},
      ...evalOptions
    });

    if (output.selected_workflow && !catalogIds.has(output.selected_workflow.workflow_id)) {
      inventedCount += 1;
    }

    const expectedDecisions = Array.isArray(testCase.expected_decisions)
      ? testCase.expected_decisions
      : [testCase.expected_decision];
    const decisionOk = expectedDecisions.includes(output.decision);

    const expectedWorkflow = testCase.expected_workflow ?? null;
    const workflowOk = expectedWorkflow === null
      ? (output.decision === "refused" ? output.selected_workflow === null : true)
      : (output.selected_workflow && output.selected_workflow.workflow_id === expectedWorkflow);

    const casePassed = decisionOk && workflowOk;
    if (casePassed) correct += 1;

    if (expectedDecisions.includes("refused")) {
      unsupportedTotal += 1;
      if (output.decision === "refused") unsupportedRefused += 1;
    }
    if (output.decision === "refused") {
      refusedTotal += 1;
    }

    results.push({
      id: testCase.id,
      passed: casePassed,
      expected_decision: expectedDecisions,
      actual_decision: output.decision,
      expected_workflow: expectedWorkflow,
      actual_workflow: output.selected_workflow ? output.selected_workflow.workflow_id : null,
      confidence: output.confidence
    });
  }

  const total = cases.length;
  return {
    total,
    correct,
    accuracy: total > 0 ? Number((correct / total).toFixed(4)) : 0,
    refusalRecall: unsupportedTotal > 0 ? Number((unsupportedRefused / unsupportedTotal).toFixed(4)) : 1,
    refusalPrecision: refusedTotal > 0 ? Number((unsupportedRefused / refusedTotal).toFixed(4)) : 1,
    inventedCount,
    results
  };
}

module.exports = {
  REFUSAL_THRESHOLD,
  HIGH_CONFIDENCE_THRESHOLD,
  AMBIGUITY_MARGIN,
  scoreDeterministicHints,
  evaluateTaskIntake,
  evaluateLabeledDataset
};
