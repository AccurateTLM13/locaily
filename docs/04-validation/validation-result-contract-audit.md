# Validation Result Contract Audit

**Date:** 2026-06-20  
**Scope:** Every runtime object described or used as a validation result across tools, tracks, orchestration, and the result validator.

## Executive Summary

Locaily does **not** have one reusable validation-result contract. It has **at least four distinct responsibilities** that were previously conflated under `validation-result.schema.json`:

| Contract | Schema file | Core shape |
|---|---|---|
| Workflow verification | [workflow-verification-result.schema.json](../../companion/schemas/internal/workflow-verification-result.schema.json) | `{ valid, errors }` |
| Engine JSON Schema check | [engine-schema-validation-result.schema.json](../../companion/schemas/internal/engine-schema-validation-result.schema.json) | `{ ok, errors }` |
| Priority fix content review | [priority-fix-review-result.schema.json](../../companion/schemas/internal/priority-fix-review-result.schema.json) | `{ thinking?, priorityFixes, needsReview }` |
| Orchestration step gate | [orchestration-step-gate-result.schema.json](../../companion/schemas/internal/orchestration-step-gate-result.schema.json) | `{ ok, code?, message?, errors }` |

The legacy [validation-result.schema.json](../../companion/schemas/internal/validation-result.schema.json) is **retained as a deprecated alias** pointing to workflow verification only. Do not use it for new work.

**Naming trap:** the track step `validate_priority_fixes` is a **content review / enrichment** step, not a `{ valid, errors }` verification gate.

---

## Inventory

### 1. Workflow verification result — `{ valid, errors }`

| | |
|---|---|
| **Responsibility** | Deterministic pass/fail check on a composed artifact |
| **Classification** | Workflow verification |
| **Blocks execution** | Yes — when `valid === false` on verification steps |
| **Stored in** | Workflow plan step `output`; final API `result.meta.verification`; track artifacts (`verify_output`, `validate_analysis`) |
| **Audit log** | No — not written as a dedicated audit record |
| **Temporary only** | No — survives in final client result via `meta.verification` |

**Producers**

| Producer | Location | Step / task |
|---|---|---|
| `lighthouse.verify_handoff` | `tool-packs/lighthouse-parser-pack/index.js` | Track step `verify_output` |
| `deal-sniper` / `validate-analysis` | `companion/tools/deal-sniper.js` | Track step `validate_analysis` |
| `text.validate_schema` | `tool-packs/standard-text-pack/index.js` | Direct `/tasks/run` (wraps engine validator) |

**Consumers**

| Consumer | Behavior |
|---|---|
| `run-plan-validator.js` | Imperative boolean gate on `verify_output` and `validate_analysis` |
| `pit-crew/orchestrator.js` | Copies artifact into `result.meta.verification` |
| `validateWorkflowResult()` | Fails workflow when `meta.verification.valid === false` |
| Clients / smoke tests | Read `result.meta.verification.valid` |

**Runtime shape**

```json
{
  "valid": true,
  "errors": []
}
```

Tool pack output schemas already match this shape (`lighthouse.verify_handoff.output.schema.json`, `text.validate_schema.output.schema.json`).

---

### 2. Engine schema validation result — `{ ok, errors }`

| | |
|---|---|
| **Responsibility** | Internal JSON Schema conformance check |
| **Classification** | Schema validation (engine primitive) |
| **Blocks execution** | Depends on caller — may throw, retry, or wrap |
| **Stored in** | Error objects (`error.validation`), `runToolWithValidation` return, not client API |
| **Audit log** | No |
| **Temporary only** | Yes — orchestration-internal unless surfaced in thrown errors |

**Producer:** `validateResult()` in `companion/core/result-validator.js`

**Consumers (non-exhaustive)**

| Consumer | Usage |
|---|---|
| `run-plan-validator.js` | Model step output against step `executor.schema` |
| `run-plan-builder.js` | Workflow plan against internal plan schema |
| `decomposer.js` | Track file against `task-track.schema.json` |
| `tools/registry.js` | Manifest and internal registry metadata |
| `audit-log.js` | Audit record schema at write boundary |
| `text.validate_schema` | Maps `{ ok, errors }` → `{ valid, errors }` for public tool output |
| `deal-sniper` validate-analysis | Maps `{ ok, errors }` → `{ valid, errors }` |
| `runToolWithValidation()` | Tool handler output retry gate |
| Memory bridge helpers | Context pack / writeback request validation |

**Runtime shape**

```json
{
  "ok": true,
  "errors": []
}
```

This is **not** interchangeable with `{ valid, errors }`. Field names differ by design.

---

### 3. Priority fix review result — `{ thinking?, priorityFixes, needsReview }`

| | |
|---|---|
| **Responsibility** | Audit-truth enrichment — match model fixes to fixture audits, flag unsupported items |
| **Classification** | Content review (not a verification gate) |
| **Blocks execution** | No — always returns enriched arrays; `needsReview` is advisory |
| **Stored in** | Track artifact `validate_priority_fixes`; workflow plan step `output`; downstream step inputs |
| **Audit log** | No |
| **Temporary only** | No — flows into `match_fixes` and handoff composition |

**Producer:** `lighthouse.validate_priority_fixes` → `validateAndEnrichPriorityFixes()` in `tool-packs/lighthouse-parser-pack/audit-truth.js`

**Consumers:** `match_fixes`, `write_handoff` via `step-input.js` / track `input_map`

**Runtime shape (representative)**

```json
{
  "thinking": "optional model text",
  "priorityFixes": [
    {
      "title": "Reduce unused JavaScript",
      "priority": "high",
      "reason": "...",
      "unsupported_priority_fix": false
    }
  ],
  "needsReview": [
    {
      "title": "Unsupported fix",
      "priority": "medium",
      "reason": "Model suggested fix could not be matched...",
      "unsupported_priority_fix": true
    }
  ]
}
```

Canonical tool-pack schema: `tool-packs/lighthouse-parser-pack/schemas/lighthouse.validate_priority_fixes.output.schema.json`

---

### 4. Orchestration step gate result — `{ ok, code?, message?, errors }`

| | |
|---|---|
| **Responsibility** | Orchestration-layer decision after a step completes |
| **Classification** | Execution status / orchestration gate |
| **Blocks execution** | Yes — `run-plan-executor.js` throws when `ok === false` |
| **Stored in** | Not persisted on success; failure attached to thrown error as `validationErrors` |
| **Audit log** | No |
| **Temporary only** | Yes |

**Producer:** `validateStepOutput()` in `companion/orchestration/run-plan-validator.js`

**Consumer:** `executeRunPlan()` in `run-plan-executor.js`

**Runtime shape**

```json
{
  "ok": false,
  "code": "STEP_VERIFICATION_FAILED",
  "message": "Verification step 'verify_output' reported invalid output.",
  "errors": ["handoff.clientSummary is required."]
}
```

Model-step branch uses the same envelope with `STEP_SCHEMA_INVALID`.

---

### 5. Workflow result validation — `{ ok, errors }` (orchestration summary)

| | |
|---|---|
| **Responsibility** | Final workflow/track result check against registry expectations |
| **Classification** | Schema validation + verification summary |
| **Blocks execution** | Affects `plan.status` and returned `schemaValid` |
| **Stored in** | `executeRunPlan()` return object only (`validation` field) |
| **Audit log** | No |

**Producer:** `validateWorkflowResult()` in `run-plan-validator.js`

Uses engine `validateResult()` internally plus `meta.verification.valid` check.

---

### 6. `meta.verification` (client-visible embedding)

| | |
|---|---|
| **Responsibility** | Surface final verification outcome on API results |
| **Classification** | Workflow verification (embedded) |
| **Shape** | Same as workflow verification result — `{ valid, errors }` |
| **Stored in** | Public `/tracks/run` and `/workflows/run` result objects |
| **Must not change** | This audit pass does not alter API output shapes |

**Assembly:** `assembleLighthouseTrackResult()` / `assembleGenericTrackResult()` in `pit-crew/orchestrator.js`

---

## Producer / Consumer Comparison

| Object | Producer | Primary consumers | Shape | Blocks? | Persisted where |
|---|---|---|---|---|---|
| `verify_output` artifact | `lighthouse.verify_handoff` | run-plan validator, orchestrator, clients via `meta.verification` | `{ valid, errors }` | Yes | plan step output, final result |
| `validate_analysis` artifact | `deal-sniper` validate-analysis | same as above | `{ valid, errors }` | Yes | plan step output, final result |
| `text.validate_schema` result | standard-text-pack | `/tasks/run` clients | `{ valid, errors }` | Returns to client (tool result) | API response only |
| `validate_priority_fixes` artifact | `lighthouse.validate_priority_fixes` | `match_fixes`, handoff steps | `{ thinking?, priorityFixes, needsReview }` | No | track artifacts, plan step output |
| `validateResult()` return | `result-validator.js` | orchestration, registry, tools, memory | `{ ok, errors }` | caller-dependent | internal / errors |
| `validateStepOutput()` return | `run-plan-validator.js` | `run-plan-executor.js` | `{ ok, code?, message?, errors }` | Yes | thrown error only |
| `validateWorkflowResult()` return | `run-plan-validator.js` | `run-plan-executor.js` | `{ ok, errors }` | Affects final status | executor return |
| `runToolWithValidation()` return | `result-validator.js` | model-backed tool path | `{ ok, result, validation, fallbacks_used }` | Yes on schema fail | internal |
| `meta.verification` | orchestrator assembly | clients, smoke tests | `{ valid, errors }` | Already applied earlier | public API result |

---

## Recommended Contract Model

Use **multiple schemas with distinct names**. Do not force all validation-shaped values into one file.

```txt
Engine layer          validateResult()           engine-schema-validation-result
                              │
                              ├─► text.validate_schema / validate-analysis maps to ──► workflow-verification-result
                              │
Workflow tools        verify_handoff / validate-analysis handlers
                              │
                              └─► meta.verification (client embed, unchanged shape)

Content review        validate_priority_fixes    priority-fix-review-result

Orchestration gate    validateStepOutput()       orchestration-step-gate-result
```

### Terminology guidance

| Term in docs/code | Means |
|---|---|
| **Verification** | `{ valid, errors }` pass/fail gate |
| **Schema validation** | `{ ok, errors }` JSON Schema check via `validateResult()` |
| **Content review** | Enrichment / audit-truth review (`validate_priority_fixes`) |
| **Step gate** | Orchestration decision envelope with `code` / `message` |

Rename concept references from generic "validation result" to the specific contract where precision matters. **Do not rename track step ids** (`validate_priority_fixes`) in this pass — that would break track JSON and client assumptions.

---

## Schema Changes (This Pass)

| Action | File |
|---|---|
| **Added** | `workflow-verification-result.schema.json` |
| **Added** | `engine-schema-validation-result.schema.json` |
| **Added** | `priority-fix-review-result.schema.json` |
| **Added** | `orchestration-step-gate-result.schema.json` |
| **Deprecated** | `validation-result.schema.json` — alias doc only; points to workflow verification |
| **Updated** | `final-output-manifest.schema.json` — `$ref` now targets workflow verification schema |

No runtime enforcement added in this pass.

---

## Safest Next Enforcement Boundary

**Recommended first step:** contract-test verification tool outputs and `meta.verification` embeddings against `workflow-verification-result.schema.json`.

| Priority | Boundary | Risk | Why |
|---|---|---|---|
| **1 (recommended)** | Contract test `{ valid, errors }` producers (`verify_handoff`, `validate-analysis`, `text.validate_schema`) | Low | Shapes already stable; matches existing tool-pack output schemas |
| **2** | Optional runtime in `validateStepOutput()` when `step_id` is `verify_output` or `validate_analysis` | Low | Adds schema check to existing imperative gate; should not change behavior if producers stay compliant |
| **3** | Contract test `validate_priority_fixes` against `priority-fix-review-result.schema.json` | Low | Documents content-review contract separately |
| **Defer** | Runtime-enforce `engine-schema-validation-result` at `validateResult()` return | Medium | Touches every caller; high blast radius for low immediate value |
| **Defer** | Rename track step `validate_priority_fixes` | High | Track JSON + docs + input_map breaking change |

Do **not** mark any validation schema runtime-enforced until production code loads and applies it.

---

## Tests

Contract snapshots: `scripts/validation-result-contract-test.js`

Also run after schema changes: `node scripts/smoke-test.js`, `node scripts/orchestration-unit-test.js`

---

## Related

- [json-first-schema-audit.md](./json-first-schema-audit.md)
- [../01-architecture/internal-json-schemas.md](../01-architecture/internal-json-schemas.md)
- [../02-track-system/fallback-and-validation.md](../02-track-system/fallback-and-validation.md)
- [../03-workflows/lighthouse-handoff-run-plan.md](../03-workflows/lighthouse-handoff-run-plan.md)
