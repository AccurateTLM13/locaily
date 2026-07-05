// weather-tool-result-to-report.js
// Transforms structured weather tool output into a weather_report schema.
// Deterministic — no LLM involved. No values invented. No inferred fields.
// Version 1.0.0

const INPUT_SCHEMA = {
  type: "object",
  required: ["location", "temperature_celsius", "condition"],
  properties: {
    location: { type: "string" },
    temperature_celsius: { type: "number" },
    condition: { type: "string" },
    humidity: { type: "number" },
    wind_speed_kmh: { type: "number" }
  }
};

const OUTPUT_SCHEMA = {
  type: "object",
  required: ["location", "temperature_celsius", "condition", "recommendation"],
  additionalProperties: false,
  properties: {
    location: { type: "string" },
    temperature_celsius: { type: "number" },
    condition: { type: "string" },
    recommendation: { type: "string" }
  }
};

const ALLOWED_SOURCE_FIELDS = new Set(["location", "temperature_celsius", "condition"]);

function transform(input, diagnostics) {
  if (!input || typeof input !== "object") {
    diagnostics.inputValid = false;
    diagnostics.missingFields.push("input_object");
    return { error: "Input must be an object" };
  }

  const payload = input.payload || input;
  const missing = [];
  for (const f of ["location", "temperature_celsius", "condition"]) {
    if (payload[f] === undefined || payload[f] === null) missing.push(f);
  }
  if (missing.length > 0) {
    diagnostics.missingFields = missing;
    return { error: "Missing required fields: " + missing.join(", ") };
  }

  if (typeof payload.location !== "string") {
    diagnostics.typeMismatches.push("location: expected string");
    return { error: "location must be a string" };
  }

  const temp = payload.temperature_celsius;
  if (typeof temp === "string") {
    const parsed = parseFloat(temp);
    if (isNaN(parsed)) {
      diagnostics.typeMismatches.push("temperature_celsius: unparseable string");
      return { error: "temperature_celsius is not a valid number" };
    }
    diagnostics.inferredFields.push("temperature_celsius: coerced from string to number");
    diagnostics.temperatureCelsius = parsed;
  } else if (typeof temp !== "number") {
    diagnostics.typeMismatches.push("temperature_celsius: expected number");
    return { error: "temperature_celsius must be a number or numeric string" };
  }

  const temperatureValue = typeof temp === "string" ? parseFloat(temp) : temp;

  if (typeof payload.condition !== "string") {
    diagnostics.typeMismatches.push("condition: expected string");
    return { error: "condition must be a string" };
  }

  // Determine recommendation deterministically
  const recommendation = temperatureValue < 20 ? "Bring a light jacket." : "Enjoy the weather.";

  // Track ignored fields
  for (const key of Object.keys(payload)) {
    if (!ALLOWED_SOURCE_FIELDS.has(key)) {
      diagnostics.ignoredSourceFields.push(key);
    }
  }

  return {
    location: payload.location,
    temperature_celsius: temperatureValue,
    condition: payload.condition,
    recommendation
  };
}

module.exports = { transform, INPUT_SCHEMA, OUTPUT_SCHEMA };
