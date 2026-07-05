const path = require("node:path");
const crypto = require("node:crypto");
const { registerTransformer, getTransformer, listTransformers, transform, getChecksum } = require("../benchmark-lab/engine/transforms/transform-registry");

const ROOT = path.resolve(__dirname, "..");

async function main() {
  let total = 0;

  // === 1. Register transformer ===
  const transformerPath = path.join(ROOT, "benchmark-lab", "engine", "transforms", "weather-tool-result-to-report.js");
  registerTransformer("weather-tool-result-to-report", transformerPath, "1.0.0");

  const entry = getTransformer("weather-tool-result-to-report");
  assert(entry.transformerId === "weather-tool-result-to-report", "Transformer ID");
  assert(entry.version === "1.0.0", "Transformer version");
  assert(entry.checksum.startsWith("sha256:"), "Transformer checksum");
  total += 3;
  console.log("ok transformer registration");

  // === 2. List transformers ===
  const list = listTransformers();
  assert(list.length >= 1, "At least one transformer");
  assert(list.some((t) => t.transformerId === "weather-tool-result-to-report"), "Weather transformer in list");
  total += 2;
  console.log("ok list transformers");

  // === 3. Unknown transformer ===
  let caught = false;
  try { getTransformer("nonexistent"); } catch { caught = true; }
  assert(caught, "Unknown transformer throws");
  total++;
  console.log("ok unknown transformer rejected");

  // === 4. Valid transformation (object input) ===
  const validInput = { location: "Tokyo", temperature_celsius: 18, condition: "Partly Cloudy" };
  const result = transform("weather-tool-result-to-report", validInput);
  assert(result.ok === true, "Valid transform succeeds");
  assert(result.output.location === "Tokyo", "Output location");
  assert(result.output.temperature_celsius === 18, "Output temperature");
  assert(result.output.condition === "Partly Cloudy", "Output condition");
  assert(result.output.recommendation === "Bring a light jacket.", "Output recommendation");
  assert(result.diagnostics.inputValid === true, "Input valid");
  assert(result.diagnostics.outputValid === true, "Output valid");
  assert(result.diagnostics.missingFields.length === 0, "No missing fields");
  total += 7;
  console.log("ok valid transformation");

  // === 5. Valid transformation (payload wrapper) ===
  const payloadInput = { payload: { location: "Tokyo", temperature_celsius: 25, condition: "Sunny" } };
  const payloadResult = transform("weather-tool-result-to-report", payloadInput);
  assert(payloadResult.ok === true, "Payload transform succeeds");
  assert(payloadResult.output.recommendation === "Enjoy the weather.", "Warm recommendation");
  total += 2;
  console.log("ok payload wrapper");

  // === 6. Missing required field ===
  const missingInput = { location: "Tokyo", condition: "Cloudy" };
  const missingResult = transform("weather-tool-result-to-report", missingInput);
  assert(missingResult.ok === false, "Missing field fails");
  assert(missingResult.diagnostics.missingFields.includes("temperature_celsius"), "Missing temperature");
  total += 2;
  console.log("ok missing field rejection");

  // === 7. Type coercion (numeric string) ===
  const stringTemp = { location: "Tokyo", temperature_celsius: "18", condition: "Rainy" };
  const stringResult = transform("weather-tool-result-to-report", stringTemp);
  assert(stringResult.ok === true, "String temperature accepted");
  assert(stringResult.output.temperature_celsius === 18, "Coerced to number");
  assert(stringResult.diagnostics.inferredFields.length >= 1, "Coercion recorded");
  total += 3;
  console.log("ok numeric string coercion");

  // === 8. Invalid temperature string ===
  const badTemp = { location: "Tokyo", temperature_celsius: "eighteen", condition: "Rainy" };
  const badResult = transform("weather-tool-result-to-report", badTemp);
  assert(badResult.ok === false, "Invalid string rejected");
  total++;
  console.log("ok invalid temperature string");

  // === 9. Missing location ===
  const noLocation = { temperature_celsius: 18, condition: "Cloudy" };
  const noLocResult = transform("weather-tool-result-to-report", noLocation);
  assert(noLocResult.ok === false, "Missing location fails");
  total++;
  console.log("ok missing location");

  // === 10. Extra metadata ignored ===
  const extraInput = { location: "Tokyo", temperature_celsius: 18, condition: "Cloudy", humidity: 80, wind_speed_kmh: 15, request_id: "abc123" };
  const extraResult = transform("weather-tool-result-to-report", extraInput);
  assert(extraResult.ok === true, "Extra metadata accepted");
  assert(extraResult.diagnostics.ignoredSourceFields.includes("humidity"), "Humidity ignored");
  assert(extraResult.diagnostics.ignoredSourceFields.includes("request_id"), "request_id ignored");
  assert(Object.keys(extraResult.output).length === 4, "Output has exactly 4 fields");
  total += 4;
  console.log("ok extra metadata ignored");

  // === 11. Source faithfulness ===
  assert(result.output.temperature_celsius === validInput.temperature_celsius, "Temperature faithful");
  assert(result.output.location === validInput.location, "Location faithful");
  assert(result.output.condition === validInput.condition, "Condition faithful");
  total += 3;
  console.log("ok source faithfulness");

  // === 12. Checksum recording ===
  const checksum = getChecksum("weather-tool-result-to-report");
  assert(checksum.startsWith("sha256:"), "Checksum format");
  total++;
  console.log("ok checksum recording");

  // === 13. Null input ===
  const nullResult = transform("weather-tool-result-to-report", null);
  assert(nullResult.ok === false, "Null input fails");
  total++;
  console.log("ok null input");

  console.log(`\n--- All ${total} transformation tests passed ---`);
}

function assert(condition, msg) {
  if (!condition) { console.error("FAIL:", msg); throw new Error(msg); }
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
