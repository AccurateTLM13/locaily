# 10 — Standard Text Pack Spec

## Purpose

The Standard Text Pack is the first official tool pack.

It proves:

- tool loading
- model role routing
- schema validation
- fallback behavior
- audit logging
- permission checks

It should be built before showcase packs.

## Tools

### text.clean

Cleans messy text into a requested format.

Input:

```json
{
  "text": "raw text",
  "format": "markdown",
  "tone": "clear/direct",
  "preserve_user_words": true
}
```

Output:

```json
{
  "clean_text": "cleaned text",
  "changes_summary": ["removed filler", "organized sections"]
}
```

### text.summarize

Summarizes provided text.

Input:

```json
{
  "text": "long text",
  "style": "brief",
  "max_points": 5
}
```

Output:

```json
{
  "summary": "short summary",
  "key_points": []
}
```

### text.extract_json

Extracts structured data from unstructured text.

Input:

```json
{
  "text": "raw text",
  "schema": {
    "type": "object",
    "properties": {}
  }
}
```

Output:

```json
{
  "data": {},
  "missing_fields": [],
  "confidence": 0.8
}
```

### text.classify

Classifies text into known categories.

Input:

```json
{
  "text": "raw text",
  "categories": ["bug", "idea", "note", "task"]
}
```

Output:

```json
{
  "category": "idea",
  "confidence": 0.92,
  "reason": "The text proposes a new feature."
}
```

### text.detect_injection

Detects obvious prompt injection or unsafe instruction patterns.

Input:

```json
{
  "text": "raw text",
  "source": "browser"
}
```

Output:

```json
{
  "risk_level": "medium",
  "flags": ["ignore_previous_instructions"],
  "safe_to_process": true
}
```

### text.validate_schema

Validates an object against a schema.

This should be deterministic code, not model-backed.

Input:

```json
{
  "data": {},
  "schema": {}
}
```

Output:

```json
{
  "valid": true,
  "errors": []
}
```

## Permissions

```txt
model.run
```

For `text.validate_schema`, no model permission is needed.

## Acceptance Criteria

Standard Text Pack is complete when:

- all tools have manifests
- all tools have schemas
- all tools return standard result envelope
- schema validation works
- fallback works on failed JSON
- audit log records each run
