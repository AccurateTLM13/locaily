const { resolveRelativeDate } = require("./date-resolver");

const TC65_REASON_CODES = {
  TOOL_SELECTION_FAILED: "TOOL_SELECTION_FAILED",
  TOOL_ARGUMENTS_INVALID: "TOOL_ARGUMENTS_INVALID",
  TOOL_RESULT_IGNORED: "TOOL_RESULT_IGNORED",
  SOURCE_FIELD_MISSING: "SOURCE_FIELD_MISSING",
  SOURCE_VALUE_INVENTED: "SOURCE_VALUE_INVENTED",
  JSON_PARSE_FAILED: "JSON_PARSE_FAILED",
  SCHEMA_FIELD_MISSING: "SCHEMA_FIELD_MISSING",
  SCHEMA_TYPE_MISMATCH: "SCHEMA_TYPE_MISMATCH",
  SCHEMA_SHAPE_MISMATCH: "SCHEMA_SHAPE_MISMATCH",
  EXTRA_PROPERTY: "EXTRA_PROPERTY",
  GUIDED_OUTPUT_REJECTED: "GUIDED_OUTPUT_REJECTED",
  FINAL_RESPONSE_TIMEOUT: "FINAL_RESPONSE_TIMEOUT",
  MULTI_TURN_STATE_LOST: "MULTI_TURN_STATE_LOST"
};

const NOISY_WEATHER_PAYLOAD = {
  location: "Tokyo",
  temperature_celsius: 18,
  condition: "Partly Cloudy",
  humidity: 58,
  wind_speed_kmh: 8,
  uv_index: 3,
  visibility_km: 16,
  feels_like: 17,
  forecast_summary: "Mild with partial cloud cover throughout the day.",
  last_updated: "2026-03-20T14:00:00Z",
  data_source: "JMA Weather Service",
  station_id: "JMA-47662-TYO",
  request_id: "wx_req_3a4d8e2b"
};

const SCHEMAS = {
  canonical: {
    type: "object", required: ["location", "temperature_celsius", "condition", "recommendation"],
    additionalProperties: false,
    properties: {
      location: { type: "string" },
      temperature_celsius: { type: "number" },
      condition: { type: "string" },
      recommendation: { type: "string" }
    }
  },
  minimal: {
    type: "object", required: ["location", "temperature", "condition"],
    additionalProperties: false,
    properties: {
      location: { type: "string" },
      temperature: { type: "number" },
      condition: { type: "string" }
    }
  },
  typeRelaxed: {
    type: "object", required: ["location", "temperature_celsius", "condition", "recommendation"],
    additionalProperties: false,
    properties: {
      location: { type: "string" },
      temperature_celsius: { type: ["number", "string"] },
      condition: { type: "string" },
      recommendation: { type: "string" }
    }
  },
  visible: {
    type: "object", required: ["location", "temperature_celsius", "condition", "recommendation"],
    additionalProperties: false,
    properties: {
      location: { type: "string" },
      temperature_celsius: { type: "number" },
      condition: { type: "string" },
      recommendation: { type: "string" }
    }
  }
};

const VARIANT_CONFIGS = {
  "canonical": {
    userMessage: "Get the weather in Tokyo and format it as a weather_report JSON object with fields: location (string), temperature_celsius (number), condition (string), recommendation (string). Return ONLY the JSON object, no extra text.",
    schema: SCHEMAS.canonical,
    includeSchemaInPrompt: false
  },
  "visible-schema": {
    userMessage: 'Get the weather in Tokyo and return it as a JSON object matching this exact schema: {"type":"object","required":["location","temperature_celsius","condition","recommendation"],"properties":{"location":{"type":"string"},"temperature_celsius":{"type":"number"},"condition":{"type":"string"},"recommendation":{"type":"string"}}} Return ONLY the JSON object, no extra text.',
    schema: SCHEMAS.visible,
    includeSchemaInPrompt: true
  },
  "minimal-schema": {
    userMessage: "Get the weather in Tokyo and return it as a JSON object with fields: location (string), temperature (number), condition (string). Return ONLY the JSON object.",
    schema: SCHEMAS.minimal,
    includeSchemaInPrompt: false
  },
  "type-relaxed": {
    userMessage: "Get the weather in Tokyo and format it as a weather_report JSON object with fields: location (string), temperature_celsius (number or numeric string), condition (string), recommendation (string). Return ONLY the JSON object.",
    schema: SCHEMAS.typeRelaxed,
    includeSchemaInPrompt: false
  }
};

function classifyTC65Failure(state, rawResponse, parsedJSON, schemaUsed) {
  const codes = [];
  const toolCall = state.toolCalls.find((tc) => tc.name === "get_weather");

  if (!toolCall) {
    const otherTools = state.toolCalls.map((t) => t.name);
    if (otherTools.length > 0) codes.push("TOOL_SELECTION_FAILED");
    else codes.push("TOOL_SELECTION_FAILED");
    return codes;
  }

  if (!toolCall.arguments || !toolCall.arguments.location || !String(toolCall.arguments.location).toLowerCase().includes("tokyo")) {
    codes.push("TOOL_ARGUMENTS_INVALID");
  }

  if (!parsedJSON) {
    codes.push("JSON_PARSE_FAILED");
    if (rawResponse && !rawResponse.includes("tokyo") && !rawResponse.includes("Tokyo")) {
      codes.push("TOOL_RESULT_IGNORED");
    }
    return codes;
  }

  const required = schemaUsed?.required || ["location", "temperature_celsius", "condition", "recommendation"];
  const missing = required.filter((f) => parsedJSON[f] === undefined);
  if (missing.length > 0) codes.push("SCHEMA_FIELD_MISSING");

  for (const f of required) {
    if (parsedJSON[f] !== undefined) {
      const expectedType = schemaUsed?.properties?.[f]?.type;
      if (expectedType === "number" && typeof parsedJSON[f] !== "number") codes.push("SCHEMA_TYPE_MISMATCH");
      if (expectedType === "string" && typeof parsedJSON[f] !== "string") codes.push("SCHEMA_TYPE_MISMATCH");
    }
  }

  if (parsedJSON.temperature_celsius !== undefined && parsedJSON.temperature_celsius !== 18) {
    codes.push("SOURCE_VALUE_INVENTED");
  }
  if (parsedJSON.location !== undefined && !String(parsedJSON.location).toLowerCase().includes("tokyo")) {
    codes.push("SOURCE_FIELD_MISSING");
  }

  for (const key of Object.keys(parsedJSON)) {
    if (!required.includes(key)) { codes.push("EXTRA_PROPERTY"); break; }
  }

  if (codes.length === 0) codes.push("none");
  return codes;
}

function mockWeatherHandler(state, call) {
  if (call.name === "get_weather") {
    return { data: { ...NOISY_WEATHER_PAYLOAD } };
  }
  return { error: "No handler for tool: " + call.name };
}

function deterministicTransformer(rawData) {
  if (!rawData || !rawData.location) return null;
  return {
    location: rawData.location,
    temperature_celsius: rawData.temperature_celsius,
    condition: rawData.condition,
    recommendation: rawData.temperature_celsius < 20 ? "Bring a light jacket." : "Enjoy the weather."
  };
}

module.exports = {
  VARIANT_CONFIGS,
  SCHEMAS,
  TC65_REASON_CODES,
  NOISY_WEATHER_PAYLOAD,
  classifyTC65Failure,
  mockWeatherHandler,
  deterministicTransformer
};
