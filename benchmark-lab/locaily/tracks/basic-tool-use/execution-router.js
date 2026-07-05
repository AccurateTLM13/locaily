const EXECUTION_POLICIES = {
  NATIVE: "NATIVE",
  DIRECT_RESPONSE: "DIRECT_RESPONSE",
  REFUSAL_REQUIRED: "REFUSAL_REQUIRED",
  STRUCTURED_RESPONSE: "STRUCTURED_RESPONSE",
  DATE_RESOLUTION_REQUIRED: "DATE_RESOLUTION_REQUIRED",
  TOOL_THEN_STRUCTURED_RESPONSE: "TOOL_THEN_STRUCTURED_RESPONSE",
  TOOL_THEN_DETERMINISTIC_TRANSFORM: "TOOL_THEN_DETERMINISTIC_TRANSFORM"
};

const EXECUTION_MODES = {
  NATIVE: "native",
  POLICY_ROUTED: "policy-routed",
  RUNTIME_CONSTRAINED: "runtime-constrained",
  HYBRID_DETERMINISTIC: "hybrid-deterministic"
};

const POLICY_BY_SCENARIO = {
  "tc-05": EXECUTION_POLICIES.DATE_RESOLUTION_REQUIRED,
  "tc-10": EXECUTION_POLICIES.DIRECT_RESPONSE,
  "tc-11": EXECUTION_POLICIES.DIRECT_RESPONSE,
  "tc-12": EXECUTION_POLICIES.REFUSAL_REQUIRED,
  "tc-64": EXECUTION_POLICIES.STRUCTURED_RESPONSE,
  "tc-65": EXECUTION_POLICIES.TOOL_THEN_STRUCTURED_RESPONSE,
  "loc-tc-65-hybrid": EXECUTION_POLICIES.TOOL_THEN_DETERMINISTIC_TRANSFORM
};

const VALID_POLICIES = new Set(Object.values(EXECUTION_POLICIES));
const VALID_MODES = new Set(Object.values(EXECUTION_MODES));

function resolvePolicy(scenarioId) {
  return POLICY_BY_SCENARIO[scenarioId] || EXECUTION_POLICIES.NATIVE;
}

function buildExecutionPlan(scenarioId, executionMode, scenario, allToolDefinitions) {
  if (!VALID_MODES.has(executionMode)) {
    throw new Error("Invalid execution mode: " + executionMode);
  }

  const policy = resolvePolicy(scenarioId);

  if (executionMode === EXECUTION_MODES.NATIVE) {
    return {
      executionMode: EXECUTION_MODES.NATIVE,
      policy: EXECUTION_POLICIES.NATIVE,
      exposedTools: allToolDefinitions,
      policyInstructed: false,
      runtimeConstrained: false,
      responseSchema: null,
      responseMode: "text",
      stages: null,
      policyMessage: null,
      failClosed: false
    };
  }

  const plan = {
    executionMode,
    policy,
    exposedTools: allToolDefinitions,
    policyInstructed: true,
    runtimeConstrained: false,
    responseSchema: null,
    responseMode: "text",
    stages: null,
    policyMessage: buildPolicyMessage(policy),
    failClosed: false
  };

  if (policy === EXECUTION_POLICIES.STRUCTURED_RESPONSE && scenario.outputSchema) {
    plan.responseSchema = scenario.outputSchema;
    plan.responseMode = "json_schema";
  }

  if (executionMode === EXECUTION_MODES.HYBRID_DETERMINISTIC) {
    plan.policyInstructed = true;
    plan.runtimeConstrained = false;
    plan.responseMode = "tool_then_deterministic";
    plan.transformerId = policy === EXECUTION_POLICIES.TOOL_THEN_DETERMINISTIC_TRANSFORM ? "weather-tool-result-to-report" : null;
    if (policy === EXECUTION_POLICIES.TOOL_THEN_DETERMINISTIC_TRANSFORM || policy === EXECUTION_POLICIES.TOOL_THEN_STRUCTURED_RESPONSE) {
      const weatherTool = allToolDefinitions.find((t) => t.function?.name === "get_weather");
      plan.exposedTools = weatherTool ? [weatherTool] : [];
      plan.transformerId = plan.transformerId || null;
    }
  }

  if (executionMode === EXECUTION_MODES.RUNTIME_CONSTRAINED) {
    plan.runtimeConstrained = true;
    plan.policyMessage = buildConstrainedMessage(policy);

    if (policy === EXECUTION_POLICIES.DIRECT_RESPONSE) {
      plan.exposedTools = [];
      plan.responseMode = "text";
    } else if (policy === EXECUTION_POLICIES.REFUSAL_REQUIRED) {
      plan.exposedTools = [];
      plan.responseMode = "refusal";
    } else if (policy === EXECUTION_POLICIES.STRUCTURED_RESPONSE) {
      plan.exposedTools = [];
      plan.responseMode = "json_schema";
    } else if (policy === EXECUTION_POLICIES.DATE_RESOLUTION_REQUIRED) {
      const dateTool = allToolDefinitions.find((t) => t.function?.name === "resolve_relative_date");
      const calTool = allToolDefinitions.find((t) => t.function?.name === "create_calendar_event");
      plan.exposedTools = dateTool ? [dateTool] : [];
      plan.stages = [
        { turn: 0, tools: dateTool ? [dateTool] : [] },
        { turn: 1, tools: [dateTool, calTool].filter(Boolean) }
      ];
      plan.responseMode = "text";
    } else if (policy === EXECUTION_POLICIES.TOOL_THEN_STRUCTURED_RESPONSE) {
      const weatherTool = allToolDefinitions.find((t) => t.function?.name === "get_weather");
      plan.exposedTools = weatherTool ? [weatherTool] : [];
      plan.responseSchema = scenario.outputSchema || null;
      plan.responseMode = "json_schema";
      plan.stages = [
        { turn: 0, tools: weatherTool ? [weatherTool] : [] },
        { turn: 1, tools: [] }
      ];
    }
  }

  return plan;
}

function buildPolicyMessage(policy) {
  switch (policy) {
    case EXECUTION_POLICIES.DIRECT_RESPONSE:
      return "[Execution Policy: DIRECT_RESPONSE] Answer this question directly from your knowledge. Do not call any tool unless you cannot determine the answer without one.";
    case EXECUTION_POLICIES.REFUSAL_REQUIRED:
      return "[Execution Policy: REFUSAL_REQUIRED] The requested action is not available. You must refuse clearly using only your own words. Do not call any tool. Do not attempt to perform the action through alternative tools.";
    case EXECUTION_POLICIES.DATE_RESOLUTION_REQUIRED:
      return "[Execution Policy: DATE_RESOLUTION_REQUIRED] Determine the correct date by calling resolve_relative_date first. Then call create_calendar_event with the resolved date.";
    case EXECUTION_POLICIES.STRUCTURED_RESPONSE:
      return "[Execution Policy: STRUCTURED_RESPONSE] Return ONLY valid JSON matching the requested schema. Do not include any text, Markdown fences, or explanation outside the JSON object.";
    case EXECUTION_POLICIES.TOOL_THEN_STRUCTURED_RESPONSE:
      return "[Execution Policy: TOOL_THEN_STRUCTURED_RESPONSE] First call the required tool to get data. Then return ONLY valid JSON matching the requested schema. Do not include extra text.";
    case EXECUTION_POLICIES.TOOL_THEN_DETERMINISTIC_TRANSFORM:
      return "[Execution Policy: TOOL_THEN_DETERMINISTIC_TRANSFORM] Call the required tool to get data. The final formatting will be handled by the system. Just call the tool with the correct arguments.";
    default:
      return null;
  }
}

function buildConstrainedMessage(policy) {
  switch (policy) {
    case EXECUTION_POLICIES.DIRECT_RESPONSE:
      return "No tools are available for this task. Answer directly from your knowledge.";
    case EXECUTION_POLICIES.REFUSAL_REQUIRED:
      return "This request cannot be completed. No tools are available for this action. Please explain that you cannot fulfill this request.";
    case EXECUTION_POLICIES.DATE_RESOLUTION_REQUIRED:
      return "Use the resolve_relative_date tool to determine the date. After you receive the resolved date, you will gain access to the calendar tool.";
    case EXECUTION_POLICIES.STRUCTURED_RESPONSE:
      return "Return ONLY valid JSON matching the required schema. No tools are available.";
    case EXECUTION_POLICIES.TOOL_THEN_STRUCTURED_RESPONSE:
      return "First call get_weather to retrieve data. After receiving the result, format your final response as valid JSON matching the required schema.";
    case EXECUTION_POLICIES.TOOL_THEN_DETERMINISTIC_TRANSFORM:
      return "Call get_weather to retrieve data. The system will handle formatting.";
    default:
      return null;
  }
}

module.exports = {
  EXECUTION_POLICIES,
  EXECUTION_MODES,
  resolvePolicy,
  buildExecutionPlan,
  buildPolicyMessage,
  buildConstrainedMessage,
  POLICY_BY_SCENARIO
};
