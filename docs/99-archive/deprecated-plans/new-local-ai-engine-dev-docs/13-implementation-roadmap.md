# 13 — Implementation Roadmap for Agentic Coding Agent

## Guiding Rule

Build the core contracts first. Do not start with flashy clients.

## Phase 0 — Repo Setup

Create project structure:

```txt
local-ai-engine/
├── docs/
├── apps/
│   ├── engine-server/
│   └── desktop-companion/
├── packages/
│   ├── core/
│   ├── sdk/
│   ├── providers/
│   └── standard-tools/
├── tool-packs/
│   └── standard-text-pack/
└── examples/
```

## Phase 1 — Core Runtime

Build:

```txt
GET /health
GET /tools
POST /tasks/run
GET /audit
```

Use mock provider first.

Acceptance:

- server starts
- health works
- tools list works
- text.clean mock tool runs
- audit event is written

## Phase 2 — Core Contracts

Implement:

```txt
Context Packet
Result Envelope
Tool Manifest
Permission Manifest
Audit Event
Fallback Policy
```

Acceptance:

- invalid tool request fails cleanly
- invalid input fails cleanly
- all tool responses use envelope
- audit logs include run_id

## Phase 3 — Standard Text Pack

Implement:

```txt
text.clean
text.summarize
text.extract_json
text.classify
text.detect_injection
text.validate_schema
```

Acceptance:

- each tool has schema
- each tool has examples
- schema validation works
- fallback works on bad JSON

## Phase 4 — Provider Adapter

Start with OpenAI-compatible local provider.

Targets:

```txt
Ollama
LM Studio
mock
```

Acceptance:

- provider status endpoint works
- model call works
- provider can be swapped by config

## Phase 5 — Model Role Manager

Implement:

```txt
fast_worker
default_worker
reasoning_worker
voice_worker placeholder
```

Acceptance:

- tools ask for role, not raw model
- role maps to model
- active model is logged
- model escalation path exists

## Phase 6 — Auto Model Switching

Implement:

```txt
smart_load
single_loaded
specialist_unload
```

Acceptance:

- specialist can load on demand
- fallback can escalate
- audit log records model switch
- profile can limit max model size

## Phase 7 — Permission Manager

Implement:

```txt
permission manifest
approval state
blocking undeclared permissions
audit permissions used
```

Acceptance:

- tool cannot use undeclared permission
- missing permission returns error
- permission is logged

## Phase 8 — Desktop Companion MVP

Build UI:

```txt
Dashboard
Tools
Models
Logs
Settings
```

Acceptance:

- see engine status
- list tools
- see active model role
- view audit log
- change profile

## Phase 9 — First Client Bridge

Build demo web client or Chrome bridge.

Acceptance:

- client can call /tasks/run
- client shows result
- companion shows audit event

## Phase 10 — Showcase Packs Later

After core works:

```txt
content-os-pack
mumble-voice-pack
pagespeed-showcase-pack
deal-sniper-showcase-pack
```

## Do Not Build Yet

Avoid these until the core is stable:

```txt
visual workflow builder
full chatbot
community marketplace
heavy model downloads
voice real-time UX
website widget
file automation
network tools
```
