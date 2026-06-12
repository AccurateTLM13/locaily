# Local Brain

## What It Is

The **Local Brain** is Locaily's coordinator: the localhost service that accepts structured requests, enforces boundaries, routes work, and returns predictable JSON envelopes.

In this repository it is implemented as the **companion server** plus **core modules** under `companion/`.

## What It Owns

- Binding to localhost (default `127.0.0.1:31313`)
- HTTP routing and JSON parsing
- Health, discovery, and status reporting
- Input gate: size limits, normalization, basic risk handling
- Context packets: run metadata, source app, permissions, fallback policy
- Tool registry resolution and handler dispatch
- Provider router and model role resolution
- Result validation and schema retries
- Summary-only audit logging (`data/` JSONL)
- Success and error response envelopes

## What It Does Not Own

- Chrome extension UI or PageSpeed capture logic
- Lighthouse report parsing inside the browser (client responsibility)
- Ollama installation or model downloads (user / provider responsibility)
- Desktop Companion UI (planned separately)
- NearbyNode device agents (not implemented)

## Key Modules

| Module | Path | Role |
|---|---|---|
| Server | `companion/server.js` | HTTP entrypoint |
| Input gate | `companion/core/input-gate.js` | First defensive layer |
| Context | `companion/core/context.js` | Context packet builder |
| Permissions | `companion/core/permissions.js` | Tool permission checks |
| Model roles | `companion/core/model-roles.js` | Role → model mapping |
| Result validator | `companion/core/result-validator.js` | Schema validation / retry |
| Audit log | `companion/core/audit-log.js` | Run summaries |
| Orchestrator | `companion/core/orchestrator.js` | Multi-step workflow execution |
| Provider router | `companion/providers/router.js` | Ollama / mock routing |
| Tool registry | `companion/tools/registry.js` | Manifest-backed tool loading |

## Inputs

Typical `/tasks/run` body:

```json
{
  "tool": "text.clean",
  "input": {},
  "context": { "source": "example-client" },
  "options": {}
}
```

Legacy `/analyze` uses `tool`, `task`, `input`, `options`.

## Outputs

Wrapped platform envelopes with `ok`, `tool`, `provider`, `model`, `result` or `error`, and `meta` (request id, duration, timestamp).

Tool handlers return **raw result objects only**; the server wraps them.

## Communicates With

- **Clients** via HTTP on localhost
- **Providers** (Ollama, mock) for model-backed tools
- **Tool packs** via registry manifests and handler modules
- **Future NearbyNode** connectors (not wired yet)

## Still Undecided

- Persistent `POST /providers/set` and `POST /models/roles/set` across restarts
- Permission review UI and pending-approval endpoint
- Stronger CORS / origin policy for extensions
- Whether Desktop Companion starts/stops the server process
- SQLite or other storage for audit beyond JSONL files

## Historical Specs

Detailed engine-core specs from earlier planning live in:

`docs/99-archive/deprecated-plans/new-local-ai-engine-dev-docs/`

Use code and [api-contract.md](./api-contract.md) as truth when they disagree with archived specs.
