# 07 — Failure and Fallback Routing

## Purpose

Small local models will sometimes fail.

The system should expect failure and handle it cleanly.

## Common Failure Types

```txt
SCHEMA_VALIDATION_FAILED
LOW_CONFIDENCE
MODEL_TIMEOUT
MODEL_UNAVAILABLE
PERMISSION_DENIED
INPUT_TOO_LARGE
UNSAFE_INPUT_DETECTED
TOOL_NOT_FOUND
PROVIDER_ERROR
PARTIAL_RESULT
```

## Fallback Policy

Each task can define fallback behavior.

```json
{
  "fallback": {
    "on_schema_fail": "retry_same_model_once",
    "on_low_confidence": "escalate_model_role",
    "on_timeout": "return_partial",
    "on_permission_denied": "stop_with_error",
    "on_model_unavailable": "use_default_worker",
    "max_retries": 2
  }
}
```

## Default Fallback Flow

```txt
1. Run smallest capable model
2. Validate output
3. If schema fails, retry once with stricter prompt
4. If still invalid, escalate one model role
5. Validate again
6. If still invalid, return error envelope
7. Log every fallback step
```

## Escalation Ladder

```txt
fast_worker → default_worker → reasoning_worker → fail/manual review
```

Do not escalate to heavy model unless user enabled developer profile.

## Retry Prompt Pattern

When retrying after schema failure:

```txt
Your previous response did not match the required schema.

Return only valid JSON matching this schema:
<SCHEMA>
...
</SCHEMA>

Do not include markdown fences.
Do not include explanation.
```

## Low Confidence Behavior

If confidence is low:

```txt
confidence < 0.65 → mark needs_review
confidence < 0.50 → escalate if allowed
confidence < 0.35 → fail with useful error
```

## Partial Results

Partial result is acceptable when:

- summarizing long text
- extraction finds some fields but not all
- tool returns safe incomplete output

Partial result is not acceptable when:

- writing files
- taking actions
- overwriting clipboard without confirmation
- producing final structured JSON for automation

## Error Envelope Example

```json
{
  "ok": false,
  "run_id": "run_999",
  "tool": "text.extract_json",
  "code": "SCHEMA_VALIDATION_FAILED",
  "message": "The model failed to return valid JSON after retry and escalation.",
  "next_step": "Use manual review or simplify the input.",
  "fallbacks_used": [
    "retry_same_model_once",
    "escalate_model_role"
  ],
  "meta": {
    "attempts": 3,
    "final_model_role": "reasoning_worker"
  }
}
```

## Acceptance Criteria

Fallback routing is done when:

- schema failure triggers retry
- low confidence can escalate
- permission denial stops execution
- timeout returns useful error
- all fallbacks are logged
- clients receive clear errors
