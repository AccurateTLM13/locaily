# 11 — Audit Log Spec

## Purpose

The Audit Log exists for trust, debugging, and transparency.

Small models will occasionally produce bad output. The audit log helps identify where and why.

## Audit Event Shape

```json
{
  "event_id": "evt_123",
  "run_id": "run_123",
  "trace_id": "trace_abc",
  "timestamp": "2026-06-08T18:34:00.000Z",
  "source": {
    "app_id": "desktop-companion",
    "surface": "manual-input"
  },
  "tool": "text.clean",
  "provider": "ollama",
  "model": "qwen3-1.7b-q4",
  "model_role": "fast_worker",
  "permissions_used": ["model.run"],
  "input_summary": {
    "type": "text",
    "chars": 812,
    "risk_level": "low"
  },
  "output_summary": {
    "ok": true,
    "result_type": "markdown",
    "confidence": 0.88,
    "warnings": []
  },
  "fallbacks_used": [],
  "duration_ms": 612,
  "status": "success"
}
```

## What To Log

Log:

```txt
tool called
source app
model role
provider
permissions used
input size/type
output status
warnings
fallbacks
duration
errors
```

Do not log full sensitive content by default.

## Redaction

Audit logs should support:

```txt
full
summary_only
redacted
disabled
```

Default should be `summary_only`.

## Failure Event Example

```json
{
  "event_id": "evt_999",
  "run_id": "run_999",
  "tool": "text.extract_json",
  "status": "failed",
  "error_code": "SCHEMA_VALIDATION_FAILED",
  "fallbacks_used": [
    "retry_same_model_once",
    "escalate_model_role"
  ],
  "duration_ms": 2080
}
```

## Acceptance Criteria

Audit logging is done when:

- every task creates at least one event
- failures are logged
- fallbacks are logged
- permissions used are logged
- model switches are logged
- log can be queried by run_id
