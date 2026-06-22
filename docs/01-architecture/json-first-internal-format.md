# JSON-First Internal Format

## Core Principle

```txt
JSON  = how Locaily thinks
Markdown = how Locaily explains
```

The **Local Brain** coordinates work using **structured JSON** as its internal operating format. **Markdown** is reserved for human-facing exports, documentation, README content, and coding-agent handoffs.

Markdown output support is **not removed**. It is reframed as an **export / rendering layer** built from JSON state — not the orchestration source of truth.

## What Runs on JSON Today

| Concern | Internal representation | Notes |
|---|---|---|
| HTTP API envelopes | JSON | Implemented — `ok`, `tool`, `result` / `error`, `meta` |
| Workflow run plans | JSON | **Runtime-enforced at build** — `validateBuiltRunPlan()` loads `workflow-plan.schema.json` after `buildRunPlan()` |
| Task track definitions | JSON | **Runtime-enforced at load** — `validateLoadedTrackFile()` loads `task-track.schema.json` in `decomposer.js` |
| Step artifacts | JSON | Produced per step; model steps use step schemas; tool outputs often unchecked on `/tracks/run` |
| Tool registry metadata | JSON | Manifest files **runtime-enforced at load**; internal registry metadata **runtime-enforced at registration**; public `/tools` schema remains contract-test-only — see [tool-metadata-contract-audit.md](../04-validation/tool-metadata-contract-audit.md) |
| Model role resolution | JSON | In-memory role map + `model-profiles.js` — **not** `model-registry-entry.schema.json` |
| Validation results | JSON | Multiple contracts — see [validation-result-contract-audit.md](../04-validation/validation-result-contract-audit.md). `{ valid, errors }` verification gates; `{ ok, errors }` engine checks; priority-fix review is a separate shape |
| Audit / run logs | JSONL | Normalized in `audit-log.js`; **runtime-enforced at write** for new records via `appendAuditRecord()` |
| Routing decisions | JSON (partial) | Role → model mapping logged; full decision record spec only |
| NearbyNode capability ads | JSON (spec) | Not implemented — schema defined for future connectors |
| Final output manifest | JSON (spec) | Lighthouse emits flat handoff + `markdown`; manifest wrapper **not** produced |

Do **not** claim full JSON-first coverage across every subsystem until code validates each schema. See [internal-json-schemas.md](./internal-json-schemas.md) for per-schema implementation status.

## What Stays Markdown

| Use | Role |
|---|---|
| Developer handoff reports | **Export** — rendered from structured handoff JSON |
| README / docs | Human documentation |
| Memory vault files | User-owned context (read via Memory Bridge; not orchestration state) |
| Coding-agent handoffs | Human/agent-readable export from JSON pipeline state |
| Prompt templates | Model instructions (`.md` files under `companion/prompts/`) |

Markdown must **not** be manually assembled as the primary orchestration artifact. When a workflow returns Markdown, it should be generated from validated JSON state.

## Internal JSON Surfaces

The Local Brain should represent these concerns as structured JSON:

- **Workflow plans** — ordered steps, worker types, status, timing
- **Routing decisions** — selected track, role, provider, model, fallback path
- **Task tracks** — step catalog, `input_map`, executor contracts
- **Capability records** — tool registry entries, model registry entries, NearbyNode advertisements
- **Validation results** — per-step and final checks with `valid` / `errors`
- **Retries** — retry count, reason, escalation hint (partial today)
- **Logs / audit records** — summary-only run events (no raw sensitive payloads)

Schemas: [internal-json-schemas.md](./internal-json-schemas.md)

## Export Layer

```txt
Validated JSON state
    │
    ▼
Export renderer (workflow-specific)
    │
    ├── Markdown handoff (Lighthouse Handoff)
    ├── clientSummary strings (embedded in JSON result)
    └── future: HTML, PDF, extension payloads
```

The export layer reads from JSON artifacts. It does not replace step validation, routing, or audit logging.

## Lighthouse Handoff Pipeline (Target Shape)

Current implementation is **partially aligned** — several stages already produce JSON; Markdown is assembled at `write_handoff`.

```txt
PageSpeed / Lighthouse data
    │
    ▼
normalized JSON          ← extract_metrics (lighthouse.parse)
    │
    ▼
issue extraction JSON    ← classify_issues (lighthouse.classify_audits)
    │
    ▼
priority / task JSON     ← prioritize_fixes + validate_priority_fixes (content review, not verification gate)
    │
    ▼
validation JSON          ← verify_output (lighthouse.verify_handoff)
    │
    ▼
Markdown handoff export  ← write_handoff (compose-handoff) renders from JSON
```

Final report remains **Markdown** for humans and coding agents. Intermediate and authoritative state remain **JSON**.

See [../03-workflows/lighthouse-handoff.md](../03-workflows/lighthouse-handoff.md).

## Preserved Locaily Thesis

This decision does not change the platform thesis:

- **Local Brain** coordinates work
- **AI Pit Crew** defines specialized task tracks
- **NearbyNode** advertises available capabilities (future)
- Small local models, tools, and rules handle narrow jobs
- Outputs are **validated** before final assembly

JSON-first internals make that thesis easier to test, audit, and extend. Markdown exports make results legible to humans and agents.

## Related Docs

- [local-brain.md](./local-brain.md)
- [local-brain-orchestration.md](./local-brain-orchestration.md)
- [orchestration-flow.md](./orchestration-flow.md)
- [internal-json-schemas.md](./internal-json-schemas.md)
- [capability-registry.md](./capability-registry.md)
- [nearby-node.md](./nearby-node.md)
- [../02-track-system/run-plan-format.md](../02-track-system/run-plan-format.md)
- [../02-track-system/track-definition-schema.md](../02-track-system/track-definition-schema.md)
