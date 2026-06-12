# Capability Registry

## What It Is

The **capability registry** is how Local Brain discovers what can run: tools, packs, permissions, schemas, and runtime requirements.

**Implemented today** as the **tool registry** (`companion/tools/registry.js`) plus `GET /tools`.

## What It Owns

- Loading tool pack manifests from `tool-packs/`
- Registering showcase tools (`deal-sniper`, `lighthouse-handoff`)
- Exposing tool metadata to clients
- Mapping tool ids to handler functions
- Declaring permissions, model roles, and `runtime_required` flags

## What It Does Not Own

- Executing model inference (providers)
- Multi-step orchestration inside a tool (orchestrator / tool handler)
- NearbyNode capability advertisements (future)

## Tool Pack Shape (Implemented)

```txt
tool-packs/
└── standard-text-pack/
    ├── tool.json          # manifest
    ├── README.md
    ├── schemas/
    ├── implementations/
    └── examples/
```

Manifest-backed loading is implemented (Phase L in older plans).

## Tool Metadata Example

Clients receive entries like:

```json
{
  "id": "text.clean",
  "name": "Text Clean",
  "pack": "standard-text-pack",
  "tasks": ["run"],
  "permissions": ["model.run"],
  "model_role": "default_worker",
  "runtime_required": true
}
```

## Current Tool Groups

**Showcase tools**

- `deal-sniper` — model-backed listing analysis
- `lighthouse-handoff` — Lighthouse handoff workflow (deterministic fallback; orchestrated when runtime available)

**Standard Text Pack**

- `text.clean`, `text.summarize`, `text.extract_json`, `text.classify`, `text.detect_injection`, `text.validate_schema`

`text.validate_schema` and Lighthouse Handoff deterministic paths do not require Ollama.

## Inputs

- Pack manifests on disk
- Static showcase tool definitions in `companion/tools/`

## Outputs

- Tool list for `/tools`
- Resolved handler for `/tasks/run` and `/analyze`

## Communicates With

- **Tool handlers** and pack implementations
- **Permission manager** before execution
- **Clients** via `/tools`

## Still Undecided

- Community pack signing and checksum policy
- Sandboxed pack execution vs in-process Node modules
- Version compatibility matrix between engine and packs
- Unified registry row for NearbyNode capabilities

## Detailed Spec (Archived)

See `docs/99-archive/deprecated-plans/new-local-ai-engine-dev-docs/06-tool-pack-system.md` and `10-standard-text-pack-spec.md`.
