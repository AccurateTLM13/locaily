# Locaily Local Brain — Operator API Reference

> **Version:** 0.1.0 · **Base URL:** `http://127.0.0.1:31313` · **Last updated:** derived from `companion/server.js`

---

## Overview

The Local Brain is a local-first HTTP coordinator that runs on the operator's machine. It exposes a JSON API for tool execution, track orchestration, model management, memory bridge access, relay node coordination, durable job scheduling, and enforcement policy control.

### Base URL

```
http://127.0.0.1:31313
```

Override with environment variables:

| Variable | Effect |
|---|---|
| `LOCAL_AI_HOST` | Change bind address (default `127.0.0.1`) |
| `LOCAL_AI_PORT` | Change port (default `31313`) |
| `OLLAMA_BASE_URL` | Change Ollama endpoint (default `http://127.0.0.1:11434`) |
| `OLLAMA_MODEL` | Change default model (default `llama3.2`) |

### Security Model

- **Local-only by default.** The server binds to `127.0.0.1` and is not reachable from the network.
- **No authentication tokens** for standard API calls. The assumption is that only local processes connect.
- **Relay endpoints** (`/relay/register`, `/relay/heartbeat`, `/relay/unregister`, `/relay/step`) optionally require a pre-shared token via the `RELAY_TOKEN` environment variable.
- **Permission checks** are enforced server-side for memory writeback and tool execution.

### Common Response Envelope

All JSON responses follow a consistent envelope pattern:

```json
{
  "ok": true,
  "result": {},
  "error": null,
  "meta": {
    "requestId": "string",
    "durationMs": 0,
    "createdAt": "ISO-8601"
  }
}
```

On error:

```json
{
  "ok": false,
  "result": null,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description.",
    "nextStep": "Actionable guidance."
  },
  "meta": {}
}
```

Some endpoints (tracks, workflows, tasks) use an extended engine envelope with `run_id`, `trace_id`, `provider`, `model`, and `warnings` fields.

### Common Error Codes

| Code | Meaning |
|---|---|
| `BAD_JSON` | Request body could not be parsed as JSON |
| `MISSING_PARAMS` | Required parameters are missing |
| `NOT_FOUND` | No route matched the request |
| `TOOL_NOT_FOUND` | The specified tool is not registered |
| `TASK_NOT_FOUND` | The tool does not support the specified task |
| `PROVIDER_UNAVAILABLE` | The runtime provider (e.g. Ollama) is not reachable |
| `MODEL_UNAVAILABLE` | The selected model is not ready |
| `PERMISSION_DENIED` | The requested operation is not permitted |
| `INTERNAL_ERROR` | An unexpected server error occurred |

---

## 1. Core

### GET /health

Reports overall server health including runtime status, registered tools, memory bridge state, benchmark lab status, relay node counts, qualification summary, enforcement policy health, and job totals.

**Response:**

```json
{
  "ok": true,
  "engine": "local-ai-engine-core",
  "service": "local-ai-platform",
  "version": "0.1.0",
  "status": "running",
  "canonicalEndpoint": "/tasks/run",
  "compatibilityEndpoints": ["/analyze"],
  "runtime": { "provider": "ollama", "available": true, "baseUrl": "http://127.0.0.1:11434" },
  "model": { "name": "llama3.2", "ready": true },
  "model_profile": {},
  "tools": ["deal-sniper", "lighthouse-handoff", "track-planner"],
  "memory": { "enabled": false, "readable": false },
  "benchmark_lab": {},
  "relay": { "nodes": 0, "healthy": 0 },
  "qualifications": {},
  "enforcement_policy": {},
  "jobTotals": { "total": 0, "queued": 0, "claimed": 0, "running": 0, "completed": 0, "failed": 0, "cancelled": 0 }
}
```

```bash
curl http://127.0.0.1:31313/health
```

---

### GET /tools

Lists all registered tool packs with their public metadata (id, name, supported tasks, input expectations).

**Response:**

```json
{
  "ok": true,
  "tools": [
    {
      "id": "deal-sniper",
      "name": "DealSniper AI",
      "tasks": ["analyze_listing"]
    }
  ]
}
```

```bash
curl http://127.0.0.1:31313/tools
```

---

### POST /tasks/run

Canonical endpoint for executing a tool task. Preferred over `/analyze` for all new clients.

**Request:**

```json
{
  "tool": "tool-id",
  "task": "task-id",
  "input": {},
  "context": {},
  "options": {
    "model": "optional-model-override",
    "model_role": "default_worker",
    "use_runtime": true,
    "permissions": { "requested": [] }
  }
}
```

**Response (success):**

```json
{
  "ok": true,
  "run_id": "string",
  "trace_id": "string",
  "tool": "tool-id",
  "task": "task-id",
  "provider": "ollama",
  "model": "llama3.2",
  "model_role": "default_worker",
  "runtime_used": true,
  "result": {},
  "confidence": 1,
  "warnings": [],
  "fallbacks_used": [],
  "meta": {}
}
```

**Common errors:** `BAD_JSON`, `TOOL_NOT_FOUND`, `TASK_NOT_FOUND`, `PROVIDER_UNAVAILABLE`, `MODEL_UNAVAILABLE`, `PERMISSION_DENIED`, `SCHEMA_VALIDATION_FAILED`

```bash
curl -X POST http://127.0.0.1:31313/tasks/run \
  -H "Content-Type: application/json" \
  -d '{"tool":"deal-sniper","task":"analyze_listing","input":{"url":"https://example.com/listing"}}'
```

---

### POST /analyze

Legacy compatibility endpoint. Same behavior as `/tasks/run` but uses the older analyze envelope. New clients should use `/tasks/run`.

**Request:**

```json
{
  "tool": "tool-id",
  "task": "task-id",
  "input": {},
  "options": {}
}
```

**Response (success):**

```json
{
  "ok": true,
  "tool": "tool-id",
  "task": "task-id",
  "provider": "ollama",
  "model": "llama3.2",
  "result": {},
  "meta": {
    "requestId": "string",
    "durationMs": 0,
    "createdAt": "ISO-8601"
  }
}
```

**Common errors:** `BAD_JSON`, `INVALID_INPUT`, `UNKNOWN_TOOL`, `UNKNOWN_TASK`, `MODEL_NOT_READY`, `PROVIDER_UNAVAILABLE`

```bash
curl -X POST http://127.0.0.1:31313/analyze \
  -H "Content-Type: application/json" \
  -d '{"tool":"deal-sniper","task":"analyze_listing","input":{"url":"https://example.com"}}'
```

---

### GET /audit

Lists audit log events. Supports filtering by `limit`, `run_id`, `tool`, and `source` query parameters.

**Query parameters:**

| Parameter | Type | Description |
|---|---|---|
| `limit` | number | Maximum events to return |
| `run_id` | string | Filter by run ID |
| `tool` | string | Filter by tool ID |
| `source` | string | Filter by source |

**Response:**

```json
{
  "ok": true,
  "events": []
}
```

```bash
curl "http://127.0.0.1:31313/audit?limit=10&tool=deal-sniper"
```

---

### GET /scoreboard

Returns a summary of track run scoreboard entries including success rates and timing statistics.

**Response:**

```json
{
  "ok": true,
  "scoreboard": {}
}
```

```bash
curl http://127.0.0.1:31313/scoreboard
```

---

## 2. Tracks & Orchestration

### GET /tracks

Lists all available tracks registered in the crew track system.

**Response:**

```json
{
  "ok": true,
  "tracks": []
}
```

```bash
curl http://127.0.0.1:31313/tracks
```

---

### POST /tracks/run

Executes a track (multi-step orchestrated workflow). Creates a job, runs all steps through the crew orchestrator, and returns the aggregated result with per-step metadata.

**Request:**

```json
{
  "track_id": "website_audit.lighthouse_handoff",
  "input": {
    "url": "https://example.com",
    "scores": {}
  },
  "context": {},
  "options": {
    "model": "optional-model-override",
    "execution_mode": "orchestrated"
  }
}
```

**Response (success):**

```json
{
  "ok": true,
  "run_id": "string",
  "trace_id": "string",
  "tool": "track-orchestrator",
  "task": "website_audit.lighthouse_handoff",
  "provider": "ollama",
  "model": "llama3.2",
  "result": {},
  "meta": {
    "job_id": "string",
    "track_id": "string",
    "steps": [
      { "step_id": "string", "executor": "string", "tool": "string", "model": "string", "role": "string", "durationMs": 0 }
    ]
  },
  "evidence": {
    "trackRunRecordId": "string",
    "childRecordIds": [],
    "warning": null
  },
  "relay_placement": { "planned": null, "actual": [] }
}
```

**Common errors:** `BAD_JSON`, `INVALID_INPUT`, `TRACK_NOT_FOUND`, `PROVIDER_UNAVAILABLE`, `MODEL_UNAVAILABLE`

```bash
curl -X POST http://127.0.0.1:31313/tracks/run \
  -H "Content-Type: application/json" \
  -d '{"track_id":"website_audit.lighthouse_handoff","input":{"url":"https://example.com","scores":{}}}'
```

---

### POST /tracks/plan

Uses the track-planner tool to generate a structured execution plan from a natural-language request.

**Request:**

```json
{
  "request": "Analyze the performance of example.com and generate a handoff report",
  "context": "optional additional context"
}
```

**Response:**

```json
{
  "ok": true,
  "result": {},
  "error": null,
  "warning": null
}
```

**Common errors:** `BAD_JSON`, `MISSING_REQUEST`, `PLANNER_UNAVAILABLE`, `PLANNER_ERROR`

```bash
curl -X POST http://127.0.0.1:31313/tracks/plan \
  -H "Content-Type: application/json" \
  -d '{"request":"Audit example.com performance"}'
```

---

### GET /orchestration/tracks

Lists tracks from the orchestration track registry (canonical registry for workflow planning).

**Response:**

```json
{
  "ok": true,
  "tracks": []
}
```

```bash
curl http://127.0.0.1:31313/orchestration/tracks
```

---

### GET /orchestration/workflows

Lists all registered workflows. Each workflow composes one or more tracks into a multi-step execution plan.

**Response:**

```json
{
  "ok": true,
  "workflows": []
}
```

```bash
curl http://127.0.0.1:31313/orchestration/workflows
```

---

### POST /workflows/plan

Builds a run plan for a workflow without executing it. Returns the plan structure including steps, dependencies, and worker assignments.

**Request:**

```json
{
  "workflow_id": "workflow-id",
  "input": {},
  "options": {},
  "task_id": "optional-task-id"
}
```

**Response (success):**

```json
{
  "ok": true,
  "run_id": "string",
  "trace_id": "string",
  "tool": "workflow-orchestrator",
  "task": "workflow-id",
  "result": {
    "plan": {}
  },
  "meta": {}
}
```

**Common errors:** `BAD_JSON`, `INVALID_INPUT`, `WORKFLOW_NOT_FOUND`, `TRACK_NOT_FOUND`

```bash
curl -X POST http://127.0.0.1:31313/workflows/plan \
  -H "Content-Type: application/json" \
  -d '{"workflow_id":"my-workflow","input":{"url":"https://example.com"}}'
```

---

### POST /workflows/run

Executes a workflow end-to-end. Builds the run plan, executes each step, validates outputs, and returns the aggregated result.

**Request:**

```json
{
  "workflow_id": "workflow-id",
  "input": {},
  "context": {},
  "options": {
    "model": "optional-model-override",
    "execution_mode": "workflow_orchestrated"
  },
  "task_id": "optional-task-id"
}
```

**Response (success):**

```json
{
  "ok": true,
  "run_id": "string",
  "trace_id": "string",
  "tool": "workflow-orchestrator",
  "task": "workflow-id",
  "result": {
    "plan": {}
  },
  "meta": {
    "job_id": "string",
    "workflow_id": "string",
    "track_id": "string",
    "plan_id": "string",
    "steps": []
  },
  "evidence": {},
  "relay_placement": { "planned": null, "actual": [] }
}
```

**Common errors:** `BAD_JSON`, `INVALID_INPUT`, `WORKFLOW_NOT_FOUND`, `TRACK_NOT_FOUND`, `PROVIDER_UNAVAILABLE`, `MODEL_UNAVAILABLE`, `WORKFLOW_VALIDATION_FAILED`

```bash
curl -X POST http://127.0.0.1:31313/workflows/run \
  -H "Content-Type: application/json" \
  -d '{"workflow_id":"my-workflow","input":{"url":"https://example.com"}}'
```

---

## 3. Models & Providers

### GET /providers/status

Returns the active provider, active profile, status of all registered providers, and current model role assignments.

**Response:**

```json
{
  "ok": true,
  "active_provider": "ollama",
  "active_profile": {},
  "providers": [
    { "id": "ollama", "status": "available", "model_ready": true }
  ],
  "roles": {}
}
```

```bash
curl http://127.0.0.1:31313/providers/status
```

---

### POST /providers/set

Switches the active runtime provider.

**Request:**

```json
{
  "provider": "ollama"
}
```

Alternatively, use `id` instead of `provider`.

**Response:**

```json
{
  "ok": true,
  "active_provider": "ollama",
  "provider": {}
}
```

**Common errors:** `BAD_JSON`, `INVALID_INPUT`, unknown provider ID

```bash
curl -X POST http://127.0.0.1:31313/providers/set \
  -H "Content-Type: application/json" \
  -d '{"provider":"ollama"}'
```

---

### GET /models/roles

Lists all model role assignments for the active provider. Roles map logical worker types (e.g. `fast_worker`, `reasoning_worker`) to specific model names.

**Response:**

```json
{
  "ok": true,
  "active_provider": "ollama",
  "roles": {
    "fast_worker": "llama3.2",
    "default_worker": "llama3.2",
    "reasoning_worker": "llama3.2"
  }
}
```

```bash
curl http://127.0.0.1:31313/models/roles
```

---

### POST /models/roles/set

Assigns a specific model to a role. Optionally scoped to a provider.

**Request:**

```json
{
  "role": "fast_worker",
  "model": "llama3.2",
  "provider": "ollama"
}
```

Accepts `model_role` or `modelRole` as aliases for `role`.

**Response:**

```json
{
  "ok": true,
  "active_provider": "ollama",
  "role": "fast_worker",
  "model": "llama3.2",
  "provider": "ollama",
  "roles": {}
}
```

**Common errors:** `BAD_JSON`, `INVALID_INPUT`

```bash
curl -X POST http://127.0.0.1:31313/models/roles/set \
  -H "Content-Type: application/json" \
  -d '{"role":"fast_worker","model":"llama3.2"}'
```

---

### GET /models/profiles

Lists all available model profiles and the currently active profile. Profiles define pre-configured sets of role-to-model mappings and suitability policies.

**Response:**

```json
{
  "ok": true,
  "active_profile": "balanced",
  "profiles": []
}
```

```bash
curl http://127.0.0.1:31313/models/profiles
```

---

### POST /models/profiles/set

Activates a model profile and applies its role-to-model mappings.

**Request:**

```json
{
  "profile": "balanced"
}
```

Accepts `profile_id` or `id` as aliases for `profile`.

**Response:**

```json
{
  "ok": true,
  "active_profile": "balanced",
  "profile": {},
  "applied_roles": {},
  "roles": {}
}
```

**Common errors:** `BAD_JSON`, `INVALID_INPUT`, unknown profile ID

```bash
curl -X POST http://127.0.0.1:31313/models/profiles/set \
  -H "Content-Type: application/json" \
  -d '{"profile":"balanced"}'
```

---

## 4. Memory Bridge

### GET /memory/status

Reports Memory Bridge configuration and vault readability. Does not expose the full private `vaultPath` in normal responses.

**Response:**

```json
{
  "ok": true,
  "result": {
    "enabled": false,
    "mode": "local_markdown_vault",
    "vaultPathConfigured": false,
    "readable": false,
    "readPolicy": "allowlist",
    "writebackMode": "proposal_only",
    "rawAccess": false,
    "effectiveAllowedPaths": ["index.md", "log.md", "projects/", "topics/"],
    "effectiveBlockedPaths": ["raw/", "private/", "personal/", ".git/"],
    "projectCount": 0,
    "topicCount": 0,
    "warnings": ["Memory bridge is disabled."]
  },
  "warnings": ["Memory bridge is disabled."],
  "meta": {
    "requestId": "string",
    "durationMs": 0,
    "createdAt": "ISO-8601"
  }
}
```

```bash
curl http://127.0.0.1:31313/memory/status
```

---

### POST /memory/context-pack

Builds a context pack from the memory vault for a given project and task. Returns curated content from allowed vault paths.

**Request:**

```json
{
  "project": "project-name",
  "task": "task-description"
}
```

**Response (success):**

```json
{
  "ok": true,
  "result": {},
  "warnings": [],
  "meta": {}
}
```

**Common errors:** `BAD_JSON`, vault not configured, permission denied

```bash
curl -X POST http://127.0.0.1:31313/memory/context-pack \
  -H "Content-Type: application/json" \
  -d '{"project":"my-project","task":"review performance findings"}'
```

---

### POST /memory/writeback/propose

Creates a writeback proposal — a suggested change to the memory vault. Requires `memory.writeback.propose` permission. Proposals are reviewed before application.

**Request:**

```json
{
  "targetPath": "projects/my-project/findings.md",
  "content": "## New Finding\n...",
  "reason": "Adding performance analysis results"
}
```

**Response (success):**

```json
{
  "ok": true,
  "result": {},
  "warnings": [],
  "meta": {}
}
```

**Common errors:** `BAD_JSON`, `PERMISSION_DENIED`

```bash
curl -X POST http://127.0.0.1:31313/memory/writeback/propose \
  -H "Content-Type: application/json" \
  -d '{"targetPath":"projects/demo/notes.md","content":"Updated notes","reason":"Sync findings"}'
```

---

### POST /memory/search

Searches the memory vault for content matching a query string. Respects allowed/blocked path configuration.

**Request:**

```json
{
  "query": "search terms",
  "limit": 10,
  "paths": ["projects/"]
}
```

**Response (success):**

```json
{
  "ok": true,
  "result": {},
  "warnings": [],
  "meta": {}
}
```

**Common errors:** `BAD_JSON`, vault not configured

```bash
curl -X POST http://127.0.0.1:31313/memory/search \
  -H "Content-Type: application/json" \
  -d '{"query":"performance","limit":5}'
```

---

### POST /memory/writeback/apply

Applies a previously proposed writeback to the memory vault. Requires `memory.writeback.apply` permission. Renders the proposal as markdown and writes it to the target path.

**Request:**

```json
{
  "targetPath": "projects/my-project/findings.md",
  "content": "## Finding\n...",
  "reason": "Applying approved proposal"
}
```

**Response (success):**

```json
{
  "ok": true,
  "result": {},
  "warnings": [],
  "meta": {}
}
```

**Common errors:** `BAD_JSON`, `PERMISSION_DENIED`

```bash
curl -X POST http://127.0.0.1:31313/memory/writeback/apply \
  -H "Content-Type: application/json" \
  -d '{"targetPath":"projects/demo/notes.md","content":"Applied content","reason":"Approved"}'
```

---

## 5. Console

### GET /console/status

Returns a comprehensive status snapshot of the Local Brain for the operator console UI. Includes engine state, provider status, Ollama readiness, tool availability, PageSpeed configuration, memory bridge state, audit logging status, and setup information.

Supports an optional `model` query parameter to override the active model for the status check.

**Query parameters:**

| Parameter | Type | Description |
|---|---|---|
| `model` | string | Optional model name override for status check |

**Response:**

```json
{
  "ok": true,
  "generatedAt": "ISO-8601",
  "service": "local-ai-platform",
  "version": "0.1.0",
  "console": { "name": "LocAIly Workflow Validation", "localOnly": true },
  "engine": { "running": true, "canonicalEndpoint": "/tasks/run" },
  "provider": { "active": "ollama", "statuses": [] },
  "ollama": { "available": true, "modelReady": true, "model": "llama3.2" },
  "model": { "name": "llama3.2", "ready": true, "profile": {} },
  "tools": { "count": 3, "ids": [], "lighthouseReady": true },
  "pageSpeed": {},
  "setup": {},
  "memory": {},
  "auditLogging": { "ready": true, "recentEventCount": 0 },
  "warnings": []
}
```

```bash
curl http://127.0.0.1:31313/console/status
curl "http://127.0.0.1:31313/console/status?model=qwen2.5:7b"
```

---

### POST /console/run-validation

Starts a validation run through the console controller. Validates a URL using the configured tools and model.

**Request:**

```json
{
  "url": "https://example.com",
  "mode": "lighthouse_handoff_validation",
  "model": "optional-model-override"
}
```

**Response:**

```json
{
  "ok": true,
  "runId": "string"
}
```

**Common errors:** `BAD_JSON`, missing URL or mode

```bash
curl -X POST http://127.0.0.1:31313/console/run-validation \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","mode":"lighthouse_handoff_validation"}'
```

---

### POST /console/setup/pagespeed-key

Saves a Google PageSpeed Insights API key for console validation runs.

**Request:**

```json
{
  "apiKey": "your-pagespeed-api-key"
}
```

**Response:**

```json
{
  "ok": true,
  "saved": true
}
```

**Common errors:** `BAD_JSON`

```bash
curl -X POST http://127.0.0.1:31313/console/setup/pagespeed-key \
  -H "Content-Type: application/json" \
  -d '{"apiKey":"AIza..."}'
```

---

### POST /console/setup/memory-vault

Configures the memory vault path for console validation. This path is used by Memory Bridge during validation runs.

**Request:**

```json
{
  "vaultPath": "C:\\Users\\JP\\Desktop\\my-vault"
}
```

**Response:**

```json
{
  "ok": true,
  "saved": true
}
```

**Common errors:** `BAD_JSON`

```bash
curl -X POST http://127.0.0.1:31313/console/setup/memory-vault \
  -H "Content-Type: application/json" \
  -d '{"vaultPath":"/path/to/vault"}'
```

---

### GET /console/runs

Lists all console validation runs. Supports query parameter filtering.

**Query parameters:** Filter parameters passed through to the run store.

**Response:**

```json
{
  "ok": true,
  "runs": []
}
```

```bash
curl http://127.0.0.1:31313/console/runs
```

---

### GET /console/runs/:runId

Retrieves a specific console validation run by its ID.

**Path parameters:**

| Parameter | Description |
|---|---|
| `runId` | The validation run identifier |

**Response:**

```json
{
  "ok": true,
  "run": {}
}
```

**Common errors:** Run not found (404)

```bash
curl http://127.0.0.1:31313/console/runs/run-abc123
```

---

## 6. Benchmark & Qualifications

### GET /benchmark/status

Returns Benchmark Lab status including qualification records, checksums, and qualification summary. Read-only endpoint for monitoring qualification state.

**Response:**

```json
{
  "ok": true,
  "benchmark_lab": {
    "records": 0,
    "checksums": {},
    "latestGeneratedAt": null
  },
  "qualifications": {}
}
```

```bash
curl http://127.0.0.1:31313/benchmark/status
```

---

### GET /qualifications/status

Returns a summary of all qualification records grouped by status and role.

**Response:**

```json
{
  "ok": true,
  "qualifications": {
    "byStatus": {},
    "byRole": {}
  }
}
```

```bash
curl http://127.0.0.1:31313/qualifications/status
```

---

### GET /qualifications/capabilities

Lists all registered capabilities with their qualification status, scores, and model/role/track associations.

**Response:**

```json
{
  "ok": true,
  "capabilities": [
    {
      "modelId": "llama3.2",
      "role": "default_worker",
      "trackId": "website_audit.lighthouse_handoff",
      "status": "qualified",
      "score": 0.85
    }
  ]
}
```

```bash
curl http://127.0.0.1:31313/qualifications/capabilities
```

---

### GET /qualifications/capability

Returns the capability assessment for a specific model/role/track combination.

**Query parameters:**

| Parameter | Type | Description |
|---|---|---|
| `modelId` | string | Model identifier |
| `role` | string | Model role (e.g. `default_worker`) |
| `trackId` | string | Track identifier |
| `contractId` | string | Optional contract identifier |

**Response:**

```json
{
  "ok": true,
  "modelId": "llama3.2",
  "role": "default_worker",
  "trackId": "website_audit.lighthouse_handoff",
  "status": "qualified",
  "score": 0.85
}
```

```bash
curl "http://127.0.0.1:31313/qualifications/capability?modelId=llama3.2&role=default_worker&trackId=website_audit.lighthouse_handoff"
```

---

### POST /qualifications/dry-run

Performs a dry-run capability recommendation without executing anything. Useful for testing qualification policy decisions.

**Request:**

```json
{
  "modelId": "llama3.2",
  "role": "default_worker",
  "trackId": "website_audit.lighthouse_handoff",
  "contractId": "optional-contract-id",
  "policy": "optional-policy-override"
}
```

**Required fields:** `modelId`, `role`, `trackId`

**Response:**

```json
{
  "ok": true,
  "recommendation": {}
}
```

**Common errors:** `BAD_JSON`, `MISSING_PARAMS`

```bash
curl -X POST http://127.0.0.1:31313/qualifications/dry-run \
  -H "Content-Type: application/json" \
  -d '{"modelId":"llama3.2","role":"default_worker","trackId":"website_audit.lighthouse_handoff"}'
```

---

### GET /capabilities

Alias for `/qualifications/capabilities`. Lists all registered capabilities.

**Response:**

```json
{
  "ok": true,
  "capabilities": []
}
```

```bash
curl http://127.0.0.1:31313/capabilities
```

---

### GET /qualifications/dashboard

Returns a comprehensive dashboard view combining capabilities, qualification summary, enforcement policy summary, and track enforcement states.

**Response:**

```json
{
  "ok": true,
  "models": {
    "llama3.2": {
      "modelId": "llama3.2",
      "capabilities": [
        { "role": "default_worker", "trackId": "string", "status": "qualified", "score": 0.85, "enforcementState": "shadow" }
      ]
    }
  },
  "byStatus": {},
  "byRole": {},
  "totalModels": 1,
  "totalCapabilities": 5,
  "trackStates": {}
}
```

```bash
curl http://127.0.0.1:31313/qualifications/dashboard
```

---

## 7. Enforcement

### GET /enforcement/status

Returns the current enforcement policy summary, evidence review state, store health, and pilot track status.

**Response:**

```json
{
  "ok": true,
  "policy": {},
  "review": {},
  "storeHealth": {},
  "pilotTrack": null,
  "pilotReason": "No track has valid qualified capability and sufficient shadow coverage."
}
```

```bash
curl http://127.0.0.1:31313/enforcement/status
```

---

### GET /enforcement/policy

Returns the full canonical enforcement policy including schema version, revision, track states, overrides, and store health.

**Response:**

```json
{
  "ok": true,
  "policy": {
    "schemaVersion": "string",
    "revision": "string",
    "createdAt": "ISO-8601",
    "updatedAt": "ISO-8601",
    "updatedBy": "string",
    "tracks": {},
    "overrides": [],
    "metadata": {},
    "storeHealth": {
      "healthy": true,
      "safeFallback": false,
      "enforcementLocked": false,
      "revision": "string",
      "schemaVersion": "string"
    },
    "loadStatus": { "error": false }
  }
}
```

**Common errors:** `ENFORCEMENT_POLICY_INVALID` (503) — policy store not initialized

```bash
curl http://127.0.0.1:31313/enforcement/policy
```

---

### POST /enforcement/set

Sets the enforcement state for a track. State transitions must follow the progression: `shadow` → `eligible` → `enforced`. Setting to `enforced` requires prior approval and at least one qualified capability.

**Request:**

```json
{
  "trackId": "website_audit.lighthouse_handoff",
  "state": "eligible",
  "reason": "Sufficient shadow evidence collected",
  "updatedBy": "operator"
}
```

**Response:**

```json
{
  "ok": true,
  "trackId": "website_audit.lighthouse_handoff",
  "state": "eligible"
}
```

**Common errors:** `BAD_JSON`, `MISSING_PARAMS`, `TRACK_NOT_APPROVED`, `INVALID_STATE_TRANSITION`, `NO_QUALIFIED_CAPABILITY`, `TRACK_SUSPENDED`

```bash
curl -X POST http://127.0.0.1:31313/enforcement/set \
  -H "Content-Type: application/json" \
  -d '{"trackId":"website_audit.lighthouse_handoff","state":"eligible","reason":"Shadow evidence sufficient"}'
```

---

### POST /enforcement/approve

Approves a track for enforcement escalation. Must be called before a track can be set to `enforced` state.

**Request:**

```json
{
  "trackId": "website_audit.lighthouse_handoff",
  "reason": "Track has passed shadow validation",
  "updatedBy": "operator"
}
```

**Response:**

```json
{
  "ok": true,
  "trackId": "website_audit.lighthouse_handoff",
  "approved": true
}
```

**Common errors:** `BAD_JSON`, `MISSING_PARAMS`

```bash
curl -X POST http://127.0.0.1:31313/enforcement/approve \
  -H "Content-Type: application/json" \
  -d '{"trackId":"website_audit.lighthouse_handoff","reason":"Ready for enforcement"}'
```

---

### POST /enforcement/revoke

Revokes a track's enforcement approval, preventing further escalation to `enforced` state.

**Request:**

```json
{
  "trackId": "website_audit.lighthouse_handoff",
  "reason": "New evidence requires re-evaluation",
  "updatedBy": "operator"
}
```

**Response:**

```json
{
  "ok": true,
  "trackId": "website_audit.lighthouse_handoff",
  "approved": false
}
```

**Common errors:** `BAD_JSON`, `MISSING_PARAMS`

```bash
curl -X POST http://127.0.0.1:31313/enforcement/revoke \
  -H "Content-Type: application/json" \
  -d '{"trackId":"website_audit.lighthouse_handoff","reason":"Needs re-review"}'
```

---

### POST /enforcement/override

Creates a model override for a specific track/role combination. Forces a particular model to be used regardless of qualification recommendations.

**Request:**

```json
{
  "trackId": "website_audit.lighthouse_handoff",
  "role": "default_worker",
  "modelId": "llama3.2",
  "reason": "Temporary override for testing",
  "updatedBy": "operator"
}
```

**Response:**

```json
{
  "ok": true,
  "override": {}
}
```

**Common errors:** `BAD_JSON`, `MISSING_PARAMS`

```bash
curl -X POST http://127.0.0.1:31313/enforcement/override \
  -H "Content-Type: application/json" \
  -d '{"trackId":"website_audit.lighthouse_handoff","role":"default_worker","modelId":"llama3.2"}'
```

---

### POST /enforcement/override/clear

Clears an existing model override. Identify the override by `overrideId` or by the combination of `trackId`, `role`, and `modelId`.

**Request:**

```json
{
  "overrideId": "override-abc123",
  "reason": "No longer needed",
  "updatedBy": "operator"
}
```

Alternatively:

```json
{
  "trackId": "website_audit.lighthouse_handoff",
  "role": "default_worker",
  "modelId": "llama3.2",
  "reason": "Removing override",
  "updatedBy": "operator"
}
```

**Response:**

```json
{
  "ok": true,
  "cleared": true
}
```

**Common errors:** `BAD_JSON`, `MISSING_PARAMS`

```bash
curl -X POST http://127.0.0.1:31313/enforcement/override/clear \
  -H "Content-Type: application/json" \
  -d '{"overrideId":"override-abc123","reason":"Done testing"}'
```

---

### GET /enforcement/review

Returns enforcement evidence review data. When `trackId` is provided, returns track-specific review. Without it, returns the overall enforcement evidence summary and disagreements.

**Query parameters:**

| Parameter | Type | Description |
|---|---|---|
| `trackId` | string | Optional track ID for track-specific review |

**Response:**

```json
{
  "ok": true,
  "summary": {},
  "disagreements": []
}
```

```bash
curl http://127.0.0.1:31313/enforcement/review
curl "http://127.0.0.1:31313/enforcement/review?trackId=website_audit.lighthouse_handoff"
```

---

### GET /enforcement/quality-summary

Returns a quality summary built from all human review records. Aggregates review decisions and outcomes.

**Response:**

```json
{
  "ok": true,
  "summary": {}
}
```

```bash
curl http://127.0.0.1:31313/enforcement/quality-summary
```

---

### GET /enforcement/pilot

Returns the current pilot enforcement track and qualified capabilities list. Shows which track (if any) is actively in enforced state with evidence coverage.

**Response:**

```json
{
  "ok": true,
  "pilotTrack": null,
  "qualifiedCapabilities": 0,
  "qualifiedCapabilitiesList": [],
  "eligibleTracks": [],
  "review": {},
  "reason": "No pilot activated."
}
```

```bash
curl http://127.0.0.1:31313/enforcement/pilot
```

---

### GET /enforcement/decisions

Lists enforcement decisions. Optionally filtered by track ID.

**Query parameters:**

| Parameter | Type | Description |
|---|---|---|
| `trackId` | string | Optional track ID filter |

**Response:**

```json
{
  "ok": true,
  "decisions": [],
  "count": 0
}
```

```bash
curl http://127.0.0.1:31313/enforcement/decisions
curl "http://127.0.0.1:31313/enforcement/decisions?trackId=website_audit.lighthouse_handoff"
```

---

### GET /enforcement/eligibility

Evaluates whether a specific track/role combination is eligible for enforcement. Requires both `trackId` and `role` query parameters.

**Query parameters:**

| Parameter | Type | Description |
|---|---|---|
| `trackId` | string | Track identifier (required) |
| `role` | string | Model role (required) |

**Response:**

```json
{
  "ok": true,
  "eligible": false,
  "reason": "string"
}
```

**Common errors:** `MISSING_PARAMS` (400)

```bash
curl "http://127.0.0.1:31313/enforcement/eligibility?trackId=website_audit.lighthouse_handoff&role=default_worker"
```

---

### GET /runs/:runId/review

Retrieves a human review record for a specific track run.

**Path parameters:**

| Parameter | Description |
|---|---|
| `runId` | The track run identifier |

**Response:**

```json
{
  "ok": true,
  "review": {}
}
```

**Common errors:** `REVIEW_NOT_FOUND` (404)

```bash
curl http://127.0.0.1:31313/runs/run-abc123/review
```

---

### POST /runs/:runId/review

Creates or updates a human review record for a specific track run. The track run must exist.

**Path parameters:**

| Parameter | Description |
|---|---|
| `runId` | The track run identifier |

**Request:**

```json
{
  "reviewer": "operator",
  "verdict": "pass",
  "notes": "Output looks correct",
  "score": 0.9
}
```

**Response (created):**

```json
{
  "ok": true,
  "review": {},
  "created": true
}
```

**Response (updated):**

```json
{
  "ok": true,
  "review": {},
  "created": false
}
```

**Common errors:** `BAD_JSON`, `TRACK_RUN_NOT_FOUND` (404), `HUMAN_REVIEW_SCHEMA_INVALID` (400)

```bash
curl -X POST http://127.0.0.1:31313/runs/run-abc123/review \
  -H "Content-Type: application/json" \
  -d '{"reviewer":"operator","verdict":"pass","notes":"Looks good"}'
```

---

## 8. Relay

### GET /relay/protocol

Returns the relay protocol description including version, message types, and capabilities.

**Response:**

```json
{
  "ok": true,
  "protocol": {
    "version": "string",
    "messageTypes": [],
    "capabilities": []
  }
}
```

```bash
curl http://127.0.0.1:31313/relay/protocol
```

---

### GET /relay/nodes

Lists all registered relay nodes and their health statistics.

**Response:**

```json
{
  "ok": true,
  "nodes": [
    {
      "nodeId": "node-1",
      "baseUrl": "http://192.168.1.10:31313",
      "label": "Office Desktop",
      "capabilities": ["model_run"],
      "hardware": {},
      "healthy": true,
      "lastHeartbeat": "ISO-8601"
    }
  ],
  "stats": {
    "total": 1,
    "healthy": 1
  }
}
```

```bash
curl http://127.0.0.1:31313/relay/nodes
```

---

### POST /relay/register

Registers a new relay node. If `RELAY_TOKEN` is set, the request must include valid authentication.

**Request:**

```json
{
  "nodeId": "node-1",
  "baseUrl": "http://192.168.1.10:31313",
  "label": "Office Desktop",
  "capabilities": ["model_run"],
  "hardware": { "platform": "win32", "cpus": 8, "memoryGb": 16 },
  "protocolVersion": "1",
  "overwrite": false
}
```

**Response:**

```json
{
  "ok": true,
  "node": {}
}
```

**Common errors:** `BAD_JSON`, `RELAY_REGISTER_FAILED`, 401 if authentication fails

```bash
curl -X POST http://127.0.0.1:31313/relay/register \
  -H "Content-Type: application/json" \
  -d '{"nodeId":"node-1","baseUrl":"http://192.168.1.10:31313","label":"Office Desktop","capabilities":["model_run"]}'
```

---

### POST /relay/heartbeat

Sends a heartbeat from a registered relay node to indicate it is still alive. Optionally updates capabilities and hardware information.

**Request:**

```json
{
  "nodeId": "node-1",
  "capabilities": ["model_run"],
  "hardware": {}
}
```

**Response:**

```json
{
  "ok": true,
  "node": {}
}
```

**Common errors:** `BAD_JSON`, `RELAY_NODE_UNKNOWN` (404), 401 if authentication fails

```bash
curl -X POST http://127.0.0.1:31313/relay/heartbeat \
  -H "Content-Type: application/json" \
  -d '{"nodeId":"node-1"}'
```

---

### POST /relay/unregister

Removes a relay node from the registry.

**Request:**

```json
{
  "nodeId": "node-1"
}
```

**Response:**

```json
{
  "ok": true,
  "nodeId": "node-1",
  "removed": true
}
```

**Common errors:** `BAD_JSON`, 401 if authentication fails

```bash
curl -X POST http://127.0.0.1:31313/relay/unregister \
  -H "Content-Type: application/json" \
  -d '{"nodeId":"node-1"}'
```

---

### POST /relay/plan

Computes a relay placement plan for a track. Determines which steps should run locally vs. on relay nodes based on capabilities and the selected policy.

**Request:**

```json
{
  "track_id": "website_audit.lighthouse_handoff",
  "relay_policy": "distribute",
  "local_capable": true
}
```

**Response:**

```json
{
  "ok": true,
  "track_id": "website_audit.lighthouse_handoff",
  "policy": "distribute",
  "assignments": {},
  "summary": {},
  "nodes": [
    { "nodeId": "node-1", "healthy": true, "capabilities": [] }
  ]
}
```

**Common errors:** `BAD_JSON`, `TRACK_ID_REQUIRED`, `TRACK_NOT_FOUND` (404)

```bash
curl -X POST http://127.0.0.1:31313/relay/plan \
  -H "Content-Type: application/json" \
  -d '{"track_id":"website_audit.lighthouse_handoff","relay_policy":"distribute"}'
```

---

### POST /relay/step

Executes a single step through the relay protocol. The step is executed locally on this server (the relay connector dispatches to remote nodes when needed).

**Request:**

```json
{
  "step": {
    "executor": "model",
    "role": "default_worker",
    "prompt": "Analyze this data..."
  },
  "context": {
    "input": {},
    "artifacts": {}
  },
  "options": {},
  "meta": {}
}
```

**Response (success):**

```json
{
  "protocolVersion": "1",
  "ok": true,
  "output": {},
  "meta": {}
}
```

**Response (failure):**

```json
{
  "protocolVersion": "1",
  "ok": false,
  "output": null,
  "meta": {
    "error": {
      "code": "RELAY_STEP_FAILED",
      "message": "Step execution failed."
    }
  }
}
```

**Common errors:** `BAD_JSON`, `INVALID_STEP`, 401 if authentication fails

```bash
curl -X POST http://127.0.0.1:31313/relay/step \
  -H "Content-Type: application/json" \
  -d '{"step":{"executor":"model","role":"default_worker","prompt":"Summarize the input"},"context":{"input":{"text":"Hello"},"artifacts":{}}}'
```

---

## 9. Jobs

### POST /jobs

Creates a new durable job for background execution. Jobs persist across server restarts.

**Request:**

```json
{
  "executionType": "track",
  "trackId": "website_audit.lighthouse_handoff",
  "workflowId": null,
  "input": {},
  "context": {},
  "options": {},
  "maxAttempts": 3,
  "correlationId": "optional-correlation-id"
}
```

For workflow jobs, use `"executionType": "workflow"` and provide `workflowId` instead of `trackId`.

**Response:**

```json
{
  "ok": true,
  "job": {
    "jobId": "string",
    "status": "queued",
    "executionType": "track",
    "trackId": "string",
    "attempts": 0,
    "maxAttempts": 3
  }
}
```

**Common errors:** `BAD_JSON`, `INVALID_EXECUTION_TYPE`, `MISSING_TRACK_ID`, `MISSING_WORKFLOW_ID`

```bash
curl -X POST http://127.0.0.1:31313/jobs \
  -H "Content-Type: application/json" \
  -d '{"executionType":"track","trackId":"website_audit.lighthouse_handoff","input":{"url":"https://example.com"}}'
```

---

### GET /jobs

Lists all jobs with optional filtering by status, execution type, and track ID.

**Query parameters:**

| Parameter | Type | Description |
|---|---|---|
| `status` | string | Filter by status (queued, claimed, running, completed, failed, cancelled) |
| `executionType` | string | Filter by execution type (track, workflow) |
| `trackId` | string | Filter by track ID |

**Response:**

```json
{
  "ok": true,
  "jobs": []
}
```

```bash
curl http://127.0.0.1:31313/jobs
curl "http://127.0.0.1:31313/jobs?status=queued&executionType=track"
```

---

### GET /jobs/:id

Retrieves a specific job by its ID.

**Path parameters:**

| Parameter | Description |
|---|---|
| `id` | The job identifier |

**Response:**

```json
{
  "ok": true,
  "job": {}
}
```

**Common errors:** `JOB_NOT_FOUND` (404)

```bash
curl http://127.0.0.1:31313/jobs/job-abc123
```

---

### POST /jobs/:id/cancel

Cancels a queued or claimed job. Running jobs cannot be cancelled.

**Path parameters:**

| Parameter | Description |
|---|---|
| `id` | The job identifier |

**Response:**

```json
{
  "ok": true,
  "job": {}
}
```

**Common errors:** `JOB_NOT_FOUND` (404), cancellation rejected for non-queued/claimed jobs (400)

```bash
curl -X POST http://127.0.0.1:31313/jobs/job-abc123/cancel
```

---

### POST /jobs/:id/retry

Retries a failed job. Only failed jobs with remaining attempts can be retried.

**Path parameters:**

| Parameter | Description |
|---|---|
| `id` | The job identifier |

**Response:**

```json
{
  "ok": true,
  "job": {}
}
```

**Common errors:** `JOB_NOT_FOUND` (404), retry rejected for non-failed jobs or exhausted attempts (400)

```bash
curl -X POST http://127.0.0.1:31313/jobs/job-abc123/retry
```

---

### POST /jobs/:id/review

Submits a human review decision for a job. Used for human-in-the-loop gate steps.

**Path parameters:**

| Parameter | Description |
|---|---|
| `id` | The job identifier |

**Request:**

```json
{
  "action": "approve",
  "reviewedBy": "operator",
  "reason": "Output verified"
}
```

Valid actions: `request_review`, `approve`, `reject`, `request_correction`, `stop`

**Response:**

```json
{
  "ok": true,
  "job": {}
}
```

**Common errors:** `BAD_JSON`, `MISSING_ACTION`, `JOB_NOT_FOUND` (404)

```bash
curl -X POST http://127.0.0.1:31313/jobs/job-abc123/review \
  -H "Content-Type: application/json" \
  -d '{"action":"approve","reviewedBy":"operator","reason":"Looks correct"}'
```

---

## 10. Operator UI

### GET /operator

Serves the operator console static HTML page. This is a browser-based UI for monitoring and controlling the Local Brain.

**Response:** HTML document (`text/html`)

```bash
# Open in browser
start http://127.0.0.1:31313/operator
```

---

### GET /operator/styles.css

Serves the operator console stylesheet.

**Response:** CSS document (`text/css`)

---

### GET /operator/app.js

Serves the operator console client-side JavaScript.

**Response:** JavaScript document (`text/javascript`)

---

## Environment Variables Reference

| Variable | Default | Description |
|---|---|---|
| `LOCAL_AI_HOST` | `127.0.0.1` | Server bind address |
| `LOCAL_AI_PORT` | `31313` | Server port |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Ollama runtime endpoint |
| `OLLAMA_MODEL` | `llama3.2` | Default model name |
| `RELAY_TOKEN` | `null` | Pre-shared token for relay authentication |
| `RELAY_ALLOWLIST` | `*` | Comma-separated allowed relay node hosts |
| `RELAY_CAPABILITY_ALLOWLIST` | `*` | Comma-separated allowed relay capabilities |

---

## Quick Reference — All Endpoints

| Method | Path | Category |
|---|---|---|
| GET | `/health` | Core |
| GET | `/tools` | Core |
| POST | `/tasks/run` | Core |
| POST | `/analyze` | Core |
| GET | `/audit` | Core |
| GET | `/scoreboard` | Core |
| GET | `/tracks` | Tracks & Orchestration |
| POST | `/tracks/run` | Tracks & Orchestration |
| POST | `/tracks/plan` | Tracks & Orchestration |
| GET | `/orchestration/tracks` | Tracks & Orchestration |
| GET | `/orchestration/workflows` | Tracks & Orchestration |
| POST | `/workflows/plan` | Tracks & Orchestration |
| POST | `/workflows/run` | Tracks & Orchestration |
| GET | `/providers/status` | Models & Providers |
| POST | `/providers/set` | Models & Providers |
| GET | `/models/roles` | Models & Providers |
| POST | `/models/roles/set` | Models & Providers |
| GET | `/models/profiles` | Models & Providers |
| POST | `/models/profiles/set` | Models & Providers |
| GET | `/memory/status` | Memory Bridge |
| POST | `/memory/context-pack` | Memory Bridge |
| POST | `/memory/writeback/propose` | Memory Bridge |
| POST | `/memory/search` | Memory Bridge |
| POST | `/memory/writeback/apply` | Memory Bridge |
| GET | `/console/status` | Console |
| POST | `/console/run-validation` | Console |
| POST | `/console/setup/pagespeed-key` | Console |
| POST | `/console/setup/memory-vault` | Console |
| GET | `/console/runs` | Console |
| GET | `/console/runs/:runId` | Console |
| GET | `/benchmark/status` | Benchmark & Qualifications |
| GET | `/qualifications/status` | Benchmark & Qualifications |
| GET | `/qualifications/capabilities` | Benchmark & Qualifications |
| GET | `/qualifications/capability` | Benchmark & Qualifications |
| POST | `/qualifications/dry-run` | Benchmark & Qualifications |
| GET | `/capabilities` | Benchmark & Qualifications |
| GET | `/qualifications/dashboard` | Benchmark & Qualifications |
| GET | `/enforcement/status` | Enforcement |
| GET | `/enforcement/policy` | Enforcement |
| POST | `/enforcement/set` | Enforcement |
| POST | `/enforcement/approve` | Enforcement |
| POST | `/enforcement/revoke` | Enforcement |
| POST | `/enforcement/override` | Enforcement |
| POST | `/enforcement/override/clear` | Enforcement |
| GET | `/enforcement/review` | Enforcement |
| GET | `/enforcement/quality-summary` | Enforcement |
| GET | `/enforcement/pilot` | Enforcement |
| GET | `/enforcement/decisions` | Enforcement |
| GET | `/enforcement/eligibility` | Enforcement |
| GET | `/runs/:runId/review` | Enforcement |
| POST | `/runs/:runId/review` | Enforcement |
| GET | `/relay/protocol` | Relay |
| GET | `/relay/nodes` | Relay |
| POST | `/relay/register` | Relay |
| POST | `/relay/heartbeat` | Relay |
| POST | `/relay/unregister` | Relay |
| POST | `/relay/plan` | Relay |
| POST | `/relay/step` | Relay |
| POST | `/jobs` | Jobs |
| GET | `/jobs` | Jobs |
| GET | `/jobs/:id` | Jobs |
| POST | `/jobs/:id/cancel` | Jobs |
| POST | `/jobs/:id/retry` | Jobs |
| POST | `/jobs/:id/review` | Jobs |
| GET | `/operator` | Operator UI |
| GET | `/operator/styles.css` | Operator UI |
| GET | `/operator/app.js` | Operator UI |
