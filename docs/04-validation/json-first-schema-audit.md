# JSON-First Schema Enforcement Audit

**Date:** 2026-06-20  
**Scope:** `companion/schemas/internal/`, orchestration, `decomposer`, validators/verify tools, audit logging, Lighthouse Handoff pipeline.

## Executive Summary

Seven internal schemas are **runtime-enforced** at documented production boundaries. Four remain **spec-only or contract-test-only** (`public-tool-metadata`, `model-registry-entry`, `nearby-node-capability`, `final-output-manifest`). Validation contract helper schemas document additional shapes without separate runtime gates.

**Integration branch:** [json-first-runtime-integration.md](./json-first-runtime-integration.md) — full enforcement matrix and test commands.

JSON objects are produced throughout the stack. Enforcement uses **`validateResult()`** (with `$ref` / `minItems` / `oneOf` support), **imperative checks**, and **workflow-specific schemas** (`companion/schemas/`, `companion/pit-crew/schemas/`, `tool-packs/*/schemas/`).

**Safest next implementation step:** validate `toPublicToolMetadata()` output before optional runtime in `listPublic()`, or contract-test intermediate step artifacts on `/workflows/run`.

---

## Cross-Cutting Findings

| Finding | Detail |
|---|---|
| Internal schemas referenced in code | **`workflow-plan.schema.json`** in `run-plan-builder.js`; **`task-track.schema.json`** in `companion/pit-crew/decomposer.js`; **`tool-pack-manifest*.schema.json`** and **`internal-tool-registry-entry.schema.json`** in `registry.js`; **`run-log-audit-record.schema.json`** in `audit-log.js`; **`workflow-verification-result.schema.json`** in `run-plan-validator.js`; spec-only schemas not yet wired |
| Shared validator | `companion/core/result-validator.js` — supports `$ref`, `minItems`, `oneOf`, `const`, `additionalProperties: false` |
| `/tracks/run` vs `/workflows/run` | Workflow path adds per-step validation in `run-plan-validator.js`; direct track path does not validate intermediate tool outputs |
| Lighthouse pipeline | JSON artifacts are real; `final-output-manifest` wrapper is **not** emitted; result is a flat handoff object + `markdown` + `meta.verification` |

---

## Per-Schema Audit

### 1. Workflow Plan (`workflow-plan.schema.json`)

| | |
|---|---|
| **Runtime status** | **Runtime-enforced at build** — validated in `buildRunPlan()` via `validateBuiltRunPlan()` |
| **Producer** | `companion/orchestration/run-plan-builder.js` → `buildRunPlan()` |
| **Consumers** | `run-plan-executor.js` → `executeRunPlan()`; `run-logger.js` → `buildOrchestrationLogEvent()`; `server.js` → `POST /workflows/plan`, `POST /workflows/run` |
| **Validation coverage** | `validateResult(plan, workflowPlanSchema)` immediately after plan construction. Schema loaded from `companion/schemas/internal/workflow-plan.schema.json`. Failures throw `WORKFLOW_PLAN_INVALID` with `error.validation.errors`. `$ref` / `minItems` supported in `result-validator.js` for this schema. |
| **Partial vs complete** | **Enforced at build boundary only** — executed plans (mutated step `output`, `worker_used`, etc.) are not re-validated against this schema after `executeRunPlan()` |
| **Schema fields unused at runtime** | None required by schema are missing from builder output. |
| **Runtime fields not in schema** | `registry.validation_expectations` (nested under `registry`) |
| **Missing enforcement** | Post-execution plan re-validation; contract test on HTTP error envelope for `WORKFLOW_PLAN_INVALID` |
| **Recommended next step** | ~~After `buildRunPlan()`~~ **Done (2026-06-20).** Next: validate task tracks in `decomposer.loadTrackFile()` |

---

### 2. Task Track (`task-track.schema.json`)

| | |
|---|---|
| **Runtime status** | **Runtime-enforced at load** — validated in `loadTrackFile()` via `validateLoadedTrackFile()` |
| **Producer** | Hand-authored `companion/pit-crew/tracks/*.track.json` |
| **Consumers** | `decomposer.js` → `loadTrack()`; `pit-crew/orchestrator.js`; `run-plan-builder.js`; `track-registry.js` |
| **Validation coverage** | `validateResult(track, taskTrackSchema, "track")` after JSON parse. Executor shapes enforced via schema `oneOf` (tool vs model). JSON parse failures still use `TRACK_CONFIG_INVALID`. |
| **Partial vs complete** | **Enforced at load only** — does not verify `output_schema` path exists on disk; optional metadata fields (`version`, `name`, etc.) validated when present |
| **Schema fields unused at runtime** | None required by schema are missing from current track files |
| **Runtime behavior not in schema** | `output_schema` file existence not checked; `priority_helper` role allowed as any string |
| **Missing enforcement** | Output schema path existence check; invalid `input_map` still fails at step execution |
| **Recommended next step** | ~~Validate in `loadTrackFile()`~~ **Done (2026-06-20).** Next: contract test audit JSONL or tool registry alignment |

---

### 3. Tool metadata (split schemas)

Manifest and internal registry schemas are **runtime-enforced** at load/registration. Public metadata remains contract-test-only. See [tool-metadata-contract-audit.md](./tool-metadata-contract-audit.md).

| Schema | Runtime status |
|---|---|
| `tool-pack-manifest.schema.json` | **Runtime-enforced at load** — `validateLoadedToolPackManifest()` |
| `tool-pack-manifest-tool.schema.json` | **Runtime-enforced at load** — via `#/$defs/manifestTool` |
| `internal-tool-registry-entry.schema.json` | **Runtime-enforced at registration** — `validateInternalToolRegistryEntry()` in `registerTool()` via `toInternalToolRegistryMetadata()` |
| `public-tool-metadata.schema.json` | Contract tests only |

**Parse vs schema errors:** JSON syntax → `TOOL_PACK_MANIFEST_PARSE_INVALID`; schema shape → `TOOL_PACK_MANIFEST_INVALID`. Internal registry → `INTERNAL_TOOL_REGISTRY_ENTRY_INVALID`.

**Recommended next enforcement boundary:** `toPublicToolMetadata()` output validation. Audit JSONL and workflow verification step-gate enforcement are **done (2026-06-20)**.

---

### 4. Model Registry Entry (`model-registry-entry.schema.json`)

| | |
|---|---|
| **Runtime status** | **Spec only** |
| **Producer** | None for this schema |
| **Consumers** | None |
| **Closest runtime data** | `companion/core/model-profiles.js` (`ROLE_SUITABILITY`, `DEFAULT_PROFILES`); `GET /models/roles` in-memory role map |
| **Validation coverage** | **None** for scorecard/registry row shape |
| **Partial vs complete** | **Spec only** — documented target for Model Garage Phase 2 |
| **Missing enforcement** | Entire schema |
| **Recommended next step** | Defer until file-backed registry milestone; when implementing, map `model-profiles.js` fields to schema explicitly |

---

### 5. NearbyNode Capability (`nearby-node-capability.schema.json`)

| | |
|---|---|
| **Runtime status** | **Spec only** |
| **Producer** | None |
| **Consumers** | None |
| **Validation coverage** | **None** |
| **Missing enforcement** | Entire schema — NearbyNode not implemented |
| **Recommended next step** | Keep spec-only; validate first reference connector against schema when NearbyNode milestone starts |

---

### 6. Validation contracts (split schemas)

Locaily uses **multiple validation-related contracts**, not one generic schema. Full inventory: [validation-result-contract-audit.md](./validation-result-contract-audit.md).

| Schema | Runtime status | Shape | Primary producers |
|---|---|---|---|
| `workflow-verification-result.schema.json` | **Runtime-enforced at step gate** — `validateWorkflowVerificationOutput()` in `validateStepOutput()` before reading `valid` | `{ valid, errors }` | Designated verification steps only (`track.verification_step` / registry) |
| `engine-schema-validation-result.schema.json` | Internal primitive (not API-enforced) | `{ ok, errors }` | `validateResult()` in `result-validator.js` |
| `priority-fix-review-result.schema.json` | Contract tests only | `{ thinking?, priorityFixes, needsReview }` | `lighthouse.validate_priority_fixes` — **not** a verification gate despite step name |
| `orchestration-step-gate-result.schema.json` | Contract tests only | `{ ok, code?, message?, errors }` | `validateStepOutput()` in `run-plan-validator.js` |
| `validation-result.schema.json` | **Deprecated alias** | Same as workflow verification | Legacy docs/refs only |

**Naming trap:** `validate_priority_fixes` performs content review / audit-truth enrichment. It does **not** return `{ valid, errors }`.

**Recommended next enforcement boundary:** Contract-test `toPublicToolMetadata()` output, or intermediate step artifacts on `/workflows/run`. Workflow verification schema enforcement at the step gate is **done (2026-06-20)**.

Contract tests: `scripts/validation-result-contract-test.js`

---

### 7. Run Log / Audit Record (`run-log-audit-record.schema.json`)

| | |
|---|---|
| **Runtime status** | **Runtime-enforced at write** — validated in `appendAuditRecord()` via `validateAuditRecord()` after `normalizeAuditEvent()` |
| **Producer** | `companion/core/audit-log.js` → `buildAuditEvent()`; `companion/memory/audit-redaction.js` → `buildMemoryAuditEvent()`; `orchestration/run-logger.js` → `buildOrchestrationLogEvent()` |
| **Consumers** | `GET /audit` via `auditLog.list()`; JSONL file under `data/` |
| **Validation coverage** | All producers pass through `auditLog.record()` → `appendAuditRecord()`. Schema loaded from `companion/schemas/internal/run-log-audit-record.schema.json`. Failures throw `AUDIT_RECORD_INVALID`; filesystem failures throw `AUDIT_RECORD_WRITE_FAILED`. **New writes only** — existing JSONL lines are not retroactively validated on read. |
| **Partial vs complete** | **Enforced at durable write boundary only** — read path remains backward-compatible with legacy lines |
| **Shape variance** | Generic tool runs: summarized `input_summary` / `output_summary` with type/chars/keys. Orchestration: preserved `task_id`, `workflow_id`, `plan_id`, `step_statuses[]` (via `workflow-orchestrator` normalization bypass). Memory Bridge: redacted request/response metadata. |
| **Dropped fields** | `buildAuditEvent()` passes `status_code` but `normalizeAuditEvent()` does not persist it (non-durable) |
| **Missing enforcement** | Post-read validation; contract test on HTTP error envelope for `AUDIT_RECORD_INVALID` in production paths |
| **Recommended next step** | ~~Validate normalized events in `record()`~~ **Done (2026-06-20).** Next: optional public tool metadata validation at `listPublic()` |

---

### 8. Final Output Manifest (`final-output-manifest.schema.json`)

| | |
|---|---|
| **Runtime status** | **Spec / target wrapper — not produced** |
| **Producer** | None as a discrete manifest object |
| **Actual Lighthouse output** | `assembleLighthouseTrackResult()` spreads handoff fields at top level + `markdown` + `meta: { track_id, verification }` |
| **Workflow API output** | `POST /workflows/run` returns flat `result` (handoff fields + `markdown`) plus `plan` in envelope `meta` — not `{ structured_result, exports }` wrapper |
| **Consumers** | Clients read flat result; extension integration spec merges `result` fields into Markdown |
| **Validation coverage** | Handoff **content** validated via `companion/schemas/lighthouse-handoff.schema.json` on handoff object (without `markdown`/`meta` in that check). Manifest schema **not** used. |
| **Partial vs complete** | **Spec only** as a manifest type; **partial** if interpreted as "Lighthouse JSON fields exist" |
| **Schema fields unused at runtime** | `workflow_id`, `track_id`, `structured_result`, `exports`, `artifacts` wrapper — entire manifest envelope |
| **Missing enforcement** | No code emits manifest shape; schema describes target export contract, not current API |
| **Recommended next step** | Either (a) treat as future wrapper and keep spec-only, or (b) add thin `buildOutputManifest(plan, result)` in orchestration that wraps without breaking flat `result` for backward compatibility |

---

## Lighthouse Handoff Pipeline — Stage-by-Stage

| Stage | Step | JSON produced | Validated how | Maps to internal schema |
|---|---|---|---|---|
| Normalize | `extract_metrics` | `{ url, performance, … }` | Input only (`validateInput`) | Tool pack output schema exists; **not** checked in `tool-router` |
| Extract issues | `classify_issues` | `{ issues, rankedOpportunities, source }` | Input only | Same |
| Prioritize | `prioritize_fixes` | `{ thinking, priorityFixes }` | Model JSON schema (`prioritize-fixes.schema.json`) on `/workflows/run` only | Not `validation-result` |
| Validate priorities | `validate_priority_fixes` | `{ thinking, priorityFixes, needsReview }` | Input only | **Priority fix review** — not workflow verification |
| Match | `match_fixes` | `{ fixes }` | Input only | Tool pack schema |
| Compose | `write_handoff` | Handoff object (+ `markdown` added by orchestrator) | `lighthouse-handoff` input validation in tool | Flat result, not `final-output-manifest` |
| Verify | `verify_output` | `{ valid, errors }` | Schema gate + boolean gate in `run-plan-validator` | **Runtime-enforced** via `workflow-verification-result` at step gate |
| Final assembly | `assembleLighthouseTrackResult` | Flat result + `markdown` + `meta.verification` | `lighthouse-handoff.schema.json` on handoff body | **Not** `final-output-manifest` |

**Markdown export:** `formatHandoffMarkdown()` in `companion/pit-crew/markdown.js` — called from orchestrator after `write_handoff`, consistent with export-layer docs.

---

## Safest Next Implementation Step

JSON-first runtime enforcement for documented boundaries is **integrated** — see [json-first-runtime-integration.md](./json-first-runtime-integration.md).

| Priority | Action | Risk | Why |
|---|---|---|---|
| ~~**1**~~ | ~~`validateResult(plan, workflowPlanSchema)` after `buildRunPlan()`~~ | — | **Done (2026-06-20)** |
| ~~**1**~~ | ~~`validateResult(track, taskTrackSchema)` in `decomposer.loadTrackFile()`~~ | — | **Done (2026-06-20)** — `validateLoadedTrackFile()` |
| ~~**1 (recommended)**~~ | Validate `tool-packs/*/tool.json` at load in `loadToolPack()` | — | **Done (2026-06-20)** |
| ~~**1 (recommended)**~~ | Internal registry metadata snapshot at registration | — | **Done (2026-06-20)** — `validateInternalToolRegistryEntry()` in `registerTool()` |
| ~~**1 (recommended)**~~ | Validate audit JSONL lines at durable write | — | **Done (2026-06-20)** — `appendAuditRecord()` + `validateAuditRecord()` |
| ~~**1 (recommended)**~~ | Contract-test workflow verification outputs (`{ valid, errors }`) | — | **Done (2026-06-20)** — runtime in `validateStepOutput()` |
| **1 (recommended)** | Validate `toPublicToolMetadata()` output | Low | Protects `/tools` contract before optional runtime |
| **2** | Contract test intermediate step artifacts on `/workflows/run` | Low | Read-only validation in tests |
| ~~**2**~~ | ~~Align `tool-registry-entry` schema with `toPublicToolMetadata()`~~ | — | **Done (2026-06-20)** — split into four stage schemas |
| **Defer** | `final-output-manifest` wrapper, `model-registry-entry`, `nearby-node-capability` | — | No producer code yet |

Use existing `validateResult()` — no new dependencies. Do **not** start by wrapping API responses in `final-output-manifest`; that would break client contracts.

---

## Related

- [../01-architecture/json-first-internal-format.md](../01-architecture/json-first-internal-format.md)
- [../01-architecture/internal-json-schemas.md](../01-architecture/internal-json-schemas.md)
- [../03-workflows/lighthouse-handoff.md](../03-workflows/lighthouse-handoff.md)
