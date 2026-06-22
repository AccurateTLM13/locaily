# Internal JSON Schemas

Canonical JSON Schema files for Local Brain internal state. These document the **target operating format**; not every schema is validated by runtime code yet.

**Location:** `companion/schemas/internal/`

## Schema Index

| Schema | File | Runtime validation | Description |
|---|---|---|---|
| Workflow plan | [workflow-plan.schema.json](../../companion/schemas/internal/workflow-plan.schema.json) | **Runtime-enforced at build** — `validateBuiltRunPlan()` in `run-plan-builder.js` after `buildRunPlan()` | Run plan from `POST /workflows/plan` and `/workflows/run` |
| Task track | [task-track.schema.json](../../companion/schemas/internal/task-track.schema.json) | **Runtime-enforced at load** — `validateLoadedTrackFile()` in `decomposer.js` when track files are loaded | Track definition files under `companion/pit-crew/tracks/` |
| Tool pack manifest | [tool-pack-manifest.schema.json](../../companion/schemas/internal/tool-pack-manifest.schema.json) | **Runtime-enforced at load** — `validateLoadedToolPackManifest()` in `loadToolPack()`; `$defs.manifestTool` loaded from [tool-pack-manifest-tool.schema.json](../../companion/schemas/internal/tool-pack-manifest-tool.schema.json) | Pack root manifest |
| Tool pack manifest tool | [tool-pack-manifest-tool.schema.json](../../companion/schemas/internal/tool-pack-manifest-tool.schema.json) | **Runtime-enforced at load** — validated via root manifest `$ref` to `#/$defs/manifestTool` | Pre-registration tool declaration |
| Internal registry entry | [internal-tool-registry-entry.schema.json](../../companion/schemas/internal/internal-tool-registry-entry.schema.json) | **Runtime-enforced at registration** — `validateInternalToolRegistryEntry()` in `registerTool()` validates `toInternalToolRegistryMetadata()` snapshot (excludes `handle`, `validateInput`) | camelCase in-process registry object |
| Public tool metadata | [public-tool-metadata.schema.json](../../companion/schemas/internal/public-tool-metadata.schema.json) | **Contract tests only** — `toPublicToolMetadata()` / `GET /tools` | snake_case public API item |
| Model registry entry | [model-registry-entry.schema.json](../../companion/schemas/internal/model-registry-entry.schema.json) | **Spec only** — `model-profiles.js` uses a different shape | Model scorecard / skill sheet row for routing |
| NearbyNode capability | [nearby-node-capability.schema.json](../../companion/schemas/internal/nearby-node-capability.schema.json) | **Spec only** — NearbyNode not implemented | Capability advertisement from a nearby device |
| Validation result | [validation-result.schema.json](../../companion/schemas/internal/validation-result.schema.json) | **Partial shape only** — `verify_output` returns `{ valid, errors }`; not validated against this file; `validate_priority_fixes` uses a different shape | Per-step or final structural validation outcome |
| Run log / audit record | [run-log-audit-record.schema.json](../../companion/schemas/internal/run-log-audit-record.schema.json) | **Normalized, not schema-validated** — `audit-log.js` writes JSONL | Summary-only audit JSONL event |
| Final output manifest | [final-output-manifest.schema.json](../../companion/schemas/internal/final-output-manifest.schema.json) | **Spec only** — runtime emits flat handoff + `markdown`, not manifest wrapper | Target export contract; not current API shape |

**Audit:** [../04-validation/json-first-schema-audit.md](../04-validation/json-first-schema-audit.md) · **Tool metadata contracts:** [../04-validation/tool-metadata-contract-audit.md](../04-validation/tool-metadata-contract-audit.md)

## Usage Rules

1. **Orchestration reads and writes JSON** — plans, artifacts, validation, audit.
2. **Markdown is generated last** — from validated JSON via export renderers.
3. **Do not invent runtime support** — if a schema is marked spec-only, treat it as architecture guidance until wired in code.
4. **Extend schemas additively** — prefer optional fields over breaking changes; document in [decision-log.md](../06-decisions/decision-log.md).

## Relationship to Other Schemas

| Area | Path | Role |
|---|---|---|
| Workflow output contracts | `companion/schemas/*.schema.json` | Client-facing result shapes (e.g. Lighthouse handoff) |
| Step intermediates | `companion/pit-crew/schemas/*.schema.json` | Per-step model JSON outputs |
| Tool pack I/O | `tool-packs/*/schemas/*.schema.json` | Tool input/output validation |
| API envelopes | [api-contract.md](./api-contract.md) | HTTP response wrapper |

## Related

- [json-first-internal-format.md](./json-first-internal-format.md)
- [../02-track-system/track-definition-schema.md](../02-track-system/track-definition-schema.md)
- [../02-track-system/run-plan-format.md](../02-track-system/run-plan-format.md)
