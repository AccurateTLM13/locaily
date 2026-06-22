# Local Brain

## What It Is

The **Local Brain** is Locaily's coordinator: the localhost service that accepts structured requests, enforces boundaries, routes work, and returns predictable JSON envelopes.

**JSON = how Locaily thinks.** Workflow plans, routing decisions, task tracks, capability records, validation results, retries, and audit logs are represented as structured JSON internally. **Markdown = how Locaily explains** — reserved for human-facing exports, documentation, and coding-agent handoffs, rendered from JSON state rather than assembled as the orchestration source of truth.

See [json-first-internal-format.md](./json-first-internal-format.md).

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
- Summary-only audit logging (`data/` JSONL) with schema validation on **new** writes only
- Success and error response envelopes
- JSON-first orchestration state (run plans, step artifacts, validation records)
- Markdown export rendering for workflows that need human-readable handoffs (e.g. Lighthouse Handoff `write_handoff`)

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
| Audit log | `companion/core/audit-log.js` | Run summaries; durable writes validated via `appendAuditRecord()` |
| Orchestrator | `companion/core/orchestrator.js` | Multi-step workflow execution |
| Provider router | `companion/providers/router.js` | Ollama / mock routing |
| Tool registry | `companion/tools/registry.js` | Manifest-backed tool loading |
| Vault adapter | `companion/memory/vault-adapter.js` | Allowlisted Markdown vault reads |
| Context pack builder | `companion/memory/context-pack-builder.js` | Task-specific context packs |
| Writeback proposal | `companion/memory/writeback-proposal.js` | Inbox proposals only |
| Memory audit redaction | `companion/memory/audit-redaction.js` | Safe memory metadata in audit |
| Memory preflight | `companion/memory/preflight.js` | Optional workflow memory hook |

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
- **Optional Memory Bridge** vault (user-configured local Markdown; disabled by default)
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

## Audit logging

All durable audit records flow through a single write boundary:

```txt
Producers → auditLog.record() → normalizeAuditEvent() → validateAuditRecord() → appendAuditRecord() → JSONL file
```

**Producers today**

| Producer | Builder | Entry path |
|---|---|---|
| Task runs | `buildAuditEvent()` in `audit-log.js` | `server.js` → `auditLog.record()` |
| Memory Bridge HTTP | `buildMemoryAuditEvent()` in `audit-redaction.js` | `server.js` → `auditLog.record()` |
| Workflow orchestration | `buildOrchestrationLogEvent()` in `run-logger.js` | `recordOrchestrationRun()` → `auditLog.record()` |

**Write enforcement**

- Normalized serializable records are validated against [run-log-audit-record.schema.json](../../companion/schemas/internal/run-log-audit-record.schema.json) immediately before disk append.
- Invalid records throw `AUDIT_RECORD_INVALID` and are **not** written.
- Filesystem failures throw `AUDIT_RECORD_WRITE_FAILED` (distinct from schema failures).
- `status_code` and other non-durable request/response fields are excluded during normalization.

**Read compatibility**

- `GET /audit` reads existing JSONL lines without retroactive schema validation.
- Legacy lines that predate enforcement (including older orchestration records with generic summaries) remain readable.
- Malformed JSON lines are skipped silently, as before.

Contract tests: `scripts/audit-record-schema-test.js`
