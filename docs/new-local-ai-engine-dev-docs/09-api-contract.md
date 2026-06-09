# 09 — Local API Contract

## Base URL

Default:

```txt
http://localhost:4317
```

## Endpoints

```txt
GET  /health
GET  /tools
POST /tasks/run
GET  /audit
GET  /providers/status
POST /providers/set
GET  /models/roles
POST /models/roles/set
```

## GET /health

### Response

```json
{
  "ok": true,
  "engine": "local-ai-engine-core",
  "version": "0.1.0",
  "status": "running",
  "uptime_ms": 120044,
  "active_provider": "ollama",
  "loaded_models": ["qwen3-1.7b-q4"]
}
```

## GET /tools

### Response

```json
{
  "ok": true,
  "tools": [
    {
      "id": "text.clean",
      "pack": "standard-text-pack",
      "description": "Clean messy text into structured markdown.",
      "permissions": ["model.run"],
      "model_role": "default_worker"
    }
  ]
}
```

## POST /tasks/run

### Request

```json
{
  "tool": "text.clean",
  "input": {
    "text": "messy text here",
    "format": "markdown"
  },
  "context": {
    "source": "desktop-companion"
  },
  "options": {
    "model_role": "default_worker",
    "max_tokens": 800
  }
}
```

### Success Response

```json
{
  "ok": true,
  "run_id": "run_123",
  "tool": "text.clean",
  "provider": "ollama",
  "model": "qwen3-1.7b-q4",
  "model_role": "default_worker",
  "result": {
    "clean_text": "## Summary\n..."
  },
  "confidence": 0.88,
  "warnings": [],
  "fallbacks_used": [],
  "meta": {
    "duration_ms": 612,
    "schema_valid": true
  }
}
```

## GET /audit

Optional query params:

```txt
?limit=50
?run_id=run_123
?tool=text.clean
?source=desktop-companion
```

## GET /providers/status

```json
{
  "ok": true,
  "providers": [
    {
      "id": "ollama",
      "status": "available",
      "endpoint": "http://localhost:11434",
      "models": ["qwen3-1.7b-q4"]
    },
    {
      "id": "lmstudio",
      "status": "unavailable",
      "endpoint": "http://localhost:1234"
    }
  ]
}
```

## Error Codes

```txt
TOOL_NOT_FOUND
PERMISSION_DENIED
PROVIDER_UNAVAILABLE
MODEL_UNAVAILABLE
SCHEMA_VALIDATION_FAILED
INPUT_TOO_LARGE
UNSAFE_INPUT_DETECTED
TIMEOUT
INTERNAL_ERROR
```

## API Design Rules

- Do not create custom endpoints for every workflow.
- Use `/tasks/run` for all tool execution.
- Tool-specific behavior belongs in tool packs.
- Every response must use the Result Envelope.
