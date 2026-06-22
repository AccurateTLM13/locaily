# Internal JSON Schemas

Canonical JSON Schema files for Local Brain internal state. These document the **target operating format**; runtime enforcement status is listed per schema below.

**Integration summary:** [../04-validation/json-first-runtime-integration.md](../04-validation/json-first-runtime-integration.md)

**Location:** `companion/schemas/internal/`

## Schema Index

| Schema | File | Runtime validation | Description |
|---|---|---|---|
| Workflow plan | [workflow-plan.schema.json](../../companion/schemas/internal/workflow-plan.schema.json) | **Runtime-enforced at build** — `validateBuiltRunPlan()` in `run-plan-builder.js` after `buildRunPlan()` | Run plan from `POST /workflows/plan` and `/workflows/run` |
| Task track | [task-track.schema.json](../../companion/schemas/internal/task-track.schema.json) | **Runtime-enforced at load** — `validateLoadedTrackFile()` in `companion/pit-crew/decomposer.js` when track files are loaded | Track definition files under `companion/pit-crew/tracks/` |
| Tool pack manifest | [tool-pack-manifest.schema.json](../../companion/schemas/internal/tool-pack-manifest.schema.json) | **Runtime-enforced at load** — `validateLoadedToolPackManifest()` in `loadToolPack()`; `$defs.manifestTool` loaded from [tool-pack-manifest-tool.schema.json](../../companion/schemas/internal/tool-pack-manifest-tool.schema.json) | Pack root manifest |
| Tool pack manifest tool | [tool-pack-manifest-tool.schema.json](../../companion/schemas/internal/tool-pack-manifest-tool.schema.json) | **Runtime-enforced at load** — validated via root manifest `$ref` to `#/$defs/manifestTool` | Pre-registration tool declaration |
| Internal registry entry | [internal-tool-registry-entry.schema.json](../../companion/schemas/internal/internal-tool-registry-entry.schema.json) | **Runtime-enforced at registration** — `validateInternalToolRegistryEntry()` in `registerTool()` validates `toInternalToolRegistryMetadata()` snapshot (excludes `handle`, `validateInput`) | camelCase in-process registry object |
| Public tool metadata | [public-tool-metadata.schema.json](../../companion/schemas/internal/public-tool-metadata.schema.json) | **Contract tests only** — `toPublicToolMetadata()` / `GET /tools` | snake_case public API item |
| Model registry entry | [model-registry-entry.schema.json](../../companion/schemas/internal/model-registry-entry.schema.json) | **Spec only** — `model-profiles.js` uses a different shape | Model scorecard / skill sheet row for routing |
| NearbyNode capability | [nearby-node-capability.schema.json](../../companion/schemas/internal/nearby-node-capability.schema.json) | **Spec only** — NearbyNode not implemented | Capability advertisement from a nearby device |
| Workflow verification | [workflow-verification-result.schema.json](../../companion/schemas/internal/workflow-verification-result.schema.json) | **Runtime-enforced at step gate** — `validateWorkflowVerificationOutput()` in `validateStepOutput()` when `planStep.step_id === track.verification_step` (or registry `validation_expectations.verification_step`) | Verification gate result |
| Engine schema validation | [engine-schema-validation-result.schema.json](../../companion/schemas/internal/engine-schema-validation-result.schema.json) | **Internal primitive** — `validateResult()` return `{ ok, errors }`; not runtime-enforced at API boundary | JSON Schema check outcome |
| Priority fix review | [priority-fix-review-result.schema.json](../../companion/schemas/internal/priority-fix-review-result.schema.json) | **Contract tests only** — `lighthouse.validate_priority_fixes` content review (not a verification gate) | Audit-truth enrichment output |
| Orchestration step gate | [orchestration-step-gate-result.schema.json](../../companion/schemas/internal/orchestration-step-gate-result.schema.json) | **Contract tests only** — `validateStepOutput()` in run-plan validator | Step completion gate |
| Validation result (deprecated) | [validation-result.schema.json](../../companion/schemas/internal/validation-result.schema.json) | **Deprecated alias** — identical to workflow verification; do not use for new work | Legacy reference only |
| Run log / audit record | [run-log-audit-record.schema.json](../../companion/schemas/internal/run-log-audit-record.schema.json) | **Runtime-enforced at write** — `validateAuditRecord()` in `appendAuditRecord()` before JSONL append; applies to **newly written records only** | Summary-only audit JSONL event |
| Final output manifest | [final-output-manifest.schema.json](../../companion/schemas/internal/final-output-manifest.schema.json) | **Spec only** — runtime emits flat handoff + `markdown`, not manifest wrapper | Target export contract; not current API shape |

**See also:** [validation-result-contract-audit.md](../04-validation/validation-result-contract-audit.md) · [json-first-schema-audit.md](../04-validation/json-first-schema-audit.md) · [tool-metadata-contract-audit.md](../04-validation/tool-metadata-contract-audit.md)

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
