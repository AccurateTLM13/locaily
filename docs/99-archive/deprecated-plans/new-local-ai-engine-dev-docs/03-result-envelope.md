# 03 — Result Envelope Contract

## Purpose

Every tool and model-backed task must return the same outer shape.

This keeps clients simple and makes fallback/audit/debugging possible.

## Standard Result Envelope

```json
{
  "ok": true,
  "run_id": "run_123",
  "trace_id": "trace_abc",
  "tool": "text.clean",
  "task": "Clean messy text into structured markdown",
  "provider": "ollama",
  "model": "qwen3-1.7b-q4",
  "model_role": "fast_worker",
  "result": {},
  "confidence": 0.86,
  "warnings": [],
  "fallbacks_used": [],
  "meta": {
    "duration_ms": 421,
    "tokens_in": 320,
    "tokens_out": 118,
    "schema_valid": true,
    "cached_model": true
  }
}
```

## Error Envelope

```json
{
  "ok": false,
  "run_id": "run_123",
  "trace_id": "trace_abc",
  "tool": "text.clean",
  "provider": "ollama",
  "model": "qwen3-1.7b-q4",
  "model_role": "fast_worker",
  "code": "SCHEMA_VALIDATION_FAILED",
  "message": "The model returned output that did not match the required schema.",
  "next_step": "Retry with stricter formatting or escalate to default_worker.",
  "warnings": [],
  "fallbacks_used": ["retry_same_model_once"],
  "meta": {
    "duration_ms": 812,
    "schema_valid": false
  }
}
```

## Required Envelope Fields

Success:

```txt
ok
run_id
tool
result
meta
```

Error:

```txt
ok
run_id
tool
code
message
next_step
meta
```

## Confidence

Confidence is not magic truth.

It should mean:

```txt
How confident the engine is that the returned result is usable for the requested task.
```

Confidence can be based on:

- schema validity
- validator checks
- model self-rating
- deterministic rule checks
- fallback usage
- required field completeness

## Warning Examples

```txt
LOW_CONFIDENCE
TRUNCATED_INPUT
MODEL_ESCALATED
PARTIAL_RESULT
UNTRUSTED_INPUT_DETECTED
PERMISSION_LIMITED_RESULT
```

## Output Rules

- Never return raw model output directly to clients unless the tool explicitly allows it.
- Always validate structured output.
- Markdown output should still be wrapped in the `result` field.
- Errors should be useful enough for an agentic coding agent to debug.

## Example: text.clean Result

```json
{
  "ok": true,
  "run_id": "run_456",
  "tool": "text.clean",
  "provider": "lmstudio",
  "model": "smollm3-3b-q4",
  "model_role": "default_worker",
  "result": {
    "clean_text": "## Summary\nThe Local AI Engine should..."
  },
  "confidence": 0.91,
  "warnings": [],
  "fallbacks_used": [],
  "meta": {
    "duration_ms": 620,
    "schema_valid": true
  }
}
```
