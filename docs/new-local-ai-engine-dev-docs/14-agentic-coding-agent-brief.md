# 14 — Agentic Coding Agent Brief

## Mission

Build the first working version of **Local AI Engine Core**.

This is a local-first AI tool/plugin runtime optimized for small local models.

The project should let clients call:

```txt
POST /tasks/run
```

and execute installed tools through a permissioned, auditable, model-role-aware engine.

## Non-Negotiables

1. Do not build a chatbot first.
2. Do not build a visual workflow builder.
3. Do not hardcode one model provider.
4. Do not make showcase apps part of core.
5. Do not skip result envelopes.
6. Do not skip audit logging.
7. Do not let tools bypass permission checks.
8. Do not let tool authors hardcode raw model names when a model role works.
9. Do not introduce heavy models by default.

## First Deliverable

A working local server with:

```txt
GET /health
GET /tools
POST /tasks/run
GET /audit
```

And one tool:

```txt
text.clean
```

Using a mock provider.

## Second Deliverable

Add:

```txt
Context Packet
Result Envelope
Audit Event
Tool Manifest
Permission Manifest
Fallback Policy
```

## Third Deliverable

Build:

```txt
standard-text-pack
```

with:

```txt
text.clean
text.summarize
text.extract_json
text.classify
text.detect_injection
text.validate_schema
```

## Suggested Tech

Use TypeScript unless repository constraints say otherwise.

Recommended:

```txt
Node.js
Fastify
Zod for schemas
pino for logging
SQLite for local audit log
```

Desktop Companion can come later with Tauri or Electron.

## Initial Project Structure

```txt
apps/engine-server
packages/core
packages/providers
packages/standard-tools
packages/sdk
tool-packs/standard-text-pack
docs
examples
```

## Implementation Style

Favor boring, explicit code.

Every important object should have a type/schema:

```txt
ContextPacket
ToolManifest
ToolDefinition
ResultEnvelope
PermissionRequest
AuditEvent
FallbackPolicy
ModelRole
ProviderAdapter
```

## First Test Flow

Input:

```json
{
  "tool": "text.clean",
  "input": {
    "text": "okay so what I was thinking is this local AI thing is not really a chatbot..."
  },
  "context": {
    "source": "demo"
  }
}
```

Expected:

```json
{
  "ok": true,
  "tool": "text.clean",
  "result": {
    "clean_text": "..."
  }
}
```

Audit log should contain:

```txt
run_id
source
tool
provider
model_role
duration
status
```

## Definition of Done for MVP

MVP is done when:

- engine starts locally
- health endpoint works
- tools can be discovered
- a tool can run through `/tasks/run`
- result uses envelope
- audit log is written
- permission check exists
- mock provider works
- provider interface is ready for Ollama/LM Studio
