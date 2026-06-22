# JSON-First Runtime Integration

**Branch:** `cursor/json-first-runtime-integration`  
**Date:** 2026-06-20  
**Purpose:** Single reviewable integration point for JSON-first documentation, internal schemas, runtime enforcement boundaries, contract tests, and audit updates.

## Branch Ancestry

All work landed on a **linear descendant chain** — no cherry-picks or merge conflicts were required.

```txt
main
 └── c8d87b3  docs: adopt JSON-first internal format for Local Brain
      └── 74fad6e  docs: audit JSON-first schema enforcement gaps
           └── 29a3063  feat: validate workflow plans against internal schema at build
                └── 8957410  docs: update audit after workflow plan enforcement
                     └── 7083ab5  feat: validate task track files against internal schema at load
                          └── 18458e3  docs: split tool metadata schemas and align with runtime contracts
                               └── cb4fa7a  feat: validate tool pack manifests at registry load
                                    └── a3a70d8  feat: validate internal tool registry metadata at registration
                                         └── 5893300  feat: validate audit records at durable JSONL write boundary
                                              └── eea0ff1  docs: audit and split validation-result contracts
                                                   └── ac54241  feat: enforce workflow verification schema at step gate
```

| Source branch | Tip commit | Relationship |
|---|---|---|
| `cursor/json-first-internal-format-2abf` | `a3a70d8` | Ancestor — contained through internal registry validation |
| `cursor/audit-record-validation-2abf` | `5893300` | Ancestor — audit write validation |
| `cursor/validation-result-contract-audit-2abf` | `eea0ff1` | Ancestor — validation contract split |
| `cursor/workflow-verification-step-gate-2abf` | `ac54241` | **Newest complete descendant** — integration branch created here |
| `cursor/json-first-runtime-integration` | (this branch) | Integration branch — same commits as workflow branch + doc consolidation |

**Conflicts resolved:** none (fast-forward from `ac54241`).

---

## Runtime Enforcement Matrix

| Schema / contract | Producer | Consumer | Enforcement boundary | Status | Error code(s) | Test coverage |
|---|---|---|---|---|---|---|
| [workflow-plan.schema.json](../../companion/schemas/internal/workflow-plan.schema.json) | `buildRunPlan()` | `executeRunPlan()`, `/workflows/plan`, `/workflows/run` | After plan construction | **Runtime-enforced** | `WORKFLOW_PLAN_INVALID` | `scripts/orchestration-unit-test.js` |
| [task-track.schema.json](../../companion/schemas/internal/task-track.schema.json) | Track JSON files | `loadTrack()`, pit-crew orchestrator, run-plan builder | Track file load (`validateLoadedTrackFile()` in `companion/pit-crew/decomposer.js`) | **Runtime-enforced** | `TASK_TRACK_INVALID` (parse: `TRACK_CONFIG_INVALID`) | `scripts/orchestration-unit-test.js` |
| [tool-pack-manifest.schema.json](../../companion/schemas/internal/tool-pack-manifest.schema.json) | `tool-packs/*/tool.json` | `loadToolPack()` | Manifest parse + before impl load | **Runtime-enforced** | `TOOL_PACK_MANIFEST_INVALID` (parse: `TOOL_PACK_MANIFEST_PARSE_INVALID`) | `scripts/tool-registry-schema-test.js` |
| [tool-pack-manifest-tool.schema.json](../../companion/schemas/internal/tool-pack-manifest-tool.schema.json) | Manifest tool entries | Via root manifest `$defs.manifestTool` | Same as manifest root | **Runtime-enforced** | (via manifest errors) | `scripts/tool-registry-schema-test.js` |
| [internal-tool-registry-entry.schema.json](../../companion/schemas/internal/internal-tool-registry-entry.schema.json) | `registerTool()` normalization | Tool router, `GET /tools` (via live registry) | Before registry map insertion | **Runtime-enforced** | `INTERNAL_TOOL_REGISTRY_ENTRY_INVALID` | `scripts/tool-registry-schema-test.js` |
| [run-log-audit-record.schema.json](../../companion/schemas/internal/run-log-audit-record.schema.json) | Audit event builders | `GET /audit`, JSONL readers | `appendAuditRecord()` before disk write (new records only) | **Runtime-enforced** | `AUDIT_RECORD_INVALID` (I/O: `AUDIT_RECORD_WRITE_FAILED`) | `scripts/audit-record-schema-test.js` |
| [workflow-verification-result.schema.json](../../companion/schemas/internal/workflow-verification-result.schema.json) | `lighthouse.verify_handoff`, `deal-sniper` validate-analysis | `validateStepOutput()`, `meta.verification` | Step gate when `planStep.step_id === track.verification_step` (or registry fallback) | **Runtime-enforced** | Malformed: `WORKFLOW_VERIFICATION_RESULT_INVALID`; failed check: `STEP_VERIFICATION_FAILED` | `scripts/validation-result-contract-test.js`, smoke Lighthouse/DealSniper paths |
| [public-tool-metadata.schema.json](../../companion/schemas/internal/public-tool-metadata.schema.json) | `toPublicToolMetadata()` | `GET /tools` | — | **Contract-test-only** | — | `scripts/tool-registry-schema-test.js` |
| [priority-fix-review-result.schema.json](../../companion/schemas/internal/priority-fix-review-result.schema.json) | `lighthouse.validate_priority_fixes` | Downstream track steps | — | **Contract-test-only** | — | `scripts/validation-result-contract-test.js` |
| [orchestration-step-gate-result.schema.json](../../companion/schemas/internal/orchestration-step-gate-result.schema.json) | `validateStepOutput()` return envelope | `run-plan-executor.js` | Documented shape only | **Contract-test-only** | Gate codes: `STEP_*`, `WORKFLOW_VERIFICATION_RESULT_INVALID` | `scripts/validation-result-contract-test.js` |
| [engine-schema-validation-result.schema.json](../../companion/schemas/internal/engine-schema-validation-result.schema.json) | `validateResult()` | Internal callers | Internal primitive — not API-enforced | **Internal primitive** | Caller-specific (`SCHEMA_VALIDATION_FAILED`, etc.) | `scripts/validation-result-contract-test.js`, `scripts/contract-test.js` |
| [validation-result.schema.json](../../companion/schemas/internal/validation-result.schema.json) | — | Legacy `$ref` in `final-output-manifest` | — | **Deprecated alias** | — | Alias checked in validation contract tests |
| [model-registry-entry.schema.json](../../companion/schemas/internal/model-registry-entry.schema.json) | — | — | — | **Spec-only** | — | — |
| [nearby-node-capability.schema.json](../../companion/schemas/internal/nearby-node-capability.schema.json) | — | — | — | **Spec-only** | — | — |
| [final-output-manifest.schema.json](../../companion/schemas/internal/final-output-manifest.schema.json) | — | — | — | **Spec-only** | — | — |

**Removed merged schema:** `tool-registry-entry.schema.json` — no active file or runtime reference. Replaced by four stage-specific schemas (see [tool-metadata-contract-audit.md](./tool-metadata-contract-audit.md)).

---

## Test Suite (integration branch)

Run together on this branch:

```bash
node scripts/orchestration-unit-test.js
node scripts/contract-test.js
node scripts/tool-registry-schema-test.js
node scripts/audit-record-schema-test.js
node scripts/validation-result-contract-test.js
node scripts/smoke-test.js
```

All six must pass on `cursor/json-first-runtime-integration` before merge.

---

## Remaining Gaps (not overstated)

| Gap | Status |
|---|---|
| `public-tool-metadata.schema.json` runtime at `listPublic()` | Contract-test-only — recommended next boundary |
| `priority-fix-review-result` runtime at tool handler | Contract-test-only |
| `engine-schema-validation-result` runtime at `validateResult()` return | Internal primitive — defer (high blast radius) |
| `final-output-manifest`, `model-registry-entry`, `nearby-node-capability` | Spec-only — no producer |
| Historical audit JSONL lines | Not retroactively validated on read |
| Direct `/tracks/run` intermediate tool output validation | Partial — workflow path validates more steps |
| Track step id `validate_priority_fixes` naming | Documented misnomer — content review, not verification gate |

---

## Documentation Map

| Topic | Path |
|---|---|
| JSON-first principle | [../01-architecture/json-first-internal-format.md](../01-architecture/json-first-internal-format.md) |
| Internal schema index | [../01-architecture/internal-json-schemas.md](../01-architecture/internal-json-schemas.md) |
| Schema enforcement audit | [json-first-schema-audit.md](./json-first-schema-audit.md) |
| Tool metadata stages | [tool-metadata-contract-audit.md](./tool-metadata-contract-audit.md) |
| Validation contract split | [validation-result-contract-audit.md](./validation-result-contract-audit.md) |
| Track validation behavior | [../02-track-system/fallback-and-validation.md](../02-track-system/fallback-and-validation.md) |

---

## Public API

No response shape changes were introduced by JSON-first runtime enforcement. `GET /tools`, `/tasks/run`, `/tracks/run`, `/workflows/run`, and `/audit` envelopes remain compatible with [../01-architecture/api-contract.md](../01-architecture/api-contract.md).

---

## Manual PR

If automated PR creation is unavailable:

https://github.com/AccurateTLM13/locailly/compare/main...cursor/json-first-runtime-integration
