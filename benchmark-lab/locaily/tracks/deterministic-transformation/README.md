# Deterministic Transformation Track

Transforms validated structured tool output into a declared output schema using deterministic registered code transformations. No LLM involvement in the transformation step.

## Contract

```json
{
  "trackId": "deterministic-transformation",
  "transformerId": "weather-tool-result-to-report",
  "transformerVersion": "1.0.0",
  "allowTypeCoercion": true,
  "allowMissingOptionalFields": true,
  "allowInferredValues": false
}
```

## Registered Transformers

| ID | Input | Output | Version |
|---|---|---|---|
| `weather-tool-result-to-report` | Raw weather data | Structured weather report | 1.0.0 |

## Flow

```
tool output → transformer registry → deterministic mapper → schema validator → final output
```

## Failure Modes

- Missing required field: fail with field name
- Type mismatch: fail with expected type
- Unknown transformer ID: fail closed
- Malformed input: fail with diagnostic

## Coercion Policy

Numeric strings may be coerced to numbers. All other types must match exactly.
