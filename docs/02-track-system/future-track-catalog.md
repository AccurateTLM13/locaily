# Future Track Catalog

**Status:** Draft specifications only. Every track in this catalog is **not implemented** unless explicitly noted elsewhere (e.g. partial patterns in Lighthouse validation steps).

Use [track-definition-schema.md](./track-definition-schema.md) when converting a draft here into `companion/pit-crew/tracks/*.track.json`.

---

## Evidence Track

| Field | Value |
|---|---|
| **Track name** | Evidence Track |
| **Track id** | `governance.evidence_check` |
| **Status** | Draft / not implemented |

### Purpose

Verify that claims, summaries, or handoff bullets are supported by cited sources or prior step artifacts. Reduces unsupported model prose in workflow outputs.

### When it should run

- After summarization, prioritization, or model assembly steps
- Before final Markdown assembly or client-facing handoff
- When Memory Bridge or external context was injected into a model step

### Input contract

```json
{
  "claims": [
    { "id": "c1", "text": "string", "source_refs": ["artifact.step_id.field"] }
  ],
  "sources": [
    { "id": "s1", "type": "artifact|memory|input", "content": "string or object" }
  ],
  "policy": {
    "min_support_level": "direct|inferred|none",
    "allow_unsupported": false
  }
}
```

### Output contract

```json
{
  "supported": [
    { "claim_id": "c1", "source_ids": ["s1"], "support_level": "direct" }
  ],
  "unsupported": [
    { "claim_id": "c2", "reason": "no_matching_source" }
  ],
  "valid": true,
  "errors": []
}
```

### Required capabilities

- Deterministic text overlap / citation matcher (preferred first version)
- Optional `fast_worker` model for paraphrase-tolerant matching
- Access to `$artifacts` from prior steps via `input_map`

### Preferred worker type

- **Primary:** Deterministic checker tool (new pack task, e.g. `governance.check_evidence`)
- **Optional:** `fast_worker` when semantic paraphrase matching is required

### Validation rules

- Every claim must reference at least one `source_refs` entry resolvable in input
- `valid: false` when `unsupported` is non-empty and `policy.allow_unsupported` is false
- Output schema must list all input claim ids exactly once in `supported` or `unsupported`

### Fallback behavior

- If model matcher unavailable: run deterministic substring / token overlap only
- If still inconclusive: mark claim `support_level: "none"` and fail validation (no silent pass)

### Failure cases

| Code | When |
|---|---|
| `INVALID_INPUT` | Missing claims or unresolvable source refs |
| `EVIDENCE_UNSUPPORTED` | Policy rejects unsupported claims |
| `PROVIDER_UNAVAILABLE` | Model path requested but runtime down (deterministic path should still run) |

### Example fixture

`docs/04-validation/fixtures/tracks/evidence/basic-supported-claim.json`

### Local Brain routing notes

Composes with Validation Track. Gives Local Brain a **governance gate** before returning structured results — similar to Lighthouse `verify_output` but claim-centric. Enables workflows to reject handoffs that invent facts not present in metrics, listings, or memory context.

---

## Diff Track

| Field | Value |
|---|---|
| **Track name** | Diff Track |
| **Track id** | `content.doc_diff` |
| **Status** | Draft / not implemented |

### Purpose

Compare two document or artifact versions and produce a structured change summary for downstream summarization, validation, or handoff steps.

### When it should run

- Repo review workflows (before/after commit or PR diff)
- Content OS draft revisions
- OCR cleanup when comparing raw vs cleaned text
- Any workflow with `baseline` and `candidate` artifacts

### Input contract

```json
{
  "baseline": { "label": "string", "content": "string or structured object" },
  "candidate": { "label": "string", "content": "string or structured object" },
  "options": {
    "granularity": "line|section|field",
    "ignore_whitespace": true
  }
}
```

### Output contract

```json
{
  "summary": "string",
  "changes": [
    { "type": "added|removed|modified", "path": "string", "detail": "string" }
  ],
  "stats": { "added": 0, "removed": 0, "modified": 0 }
}
```

### Required capabilities

- Deterministic diff engine (text or JSON field diff)
- Optional `fast_worker` for natural-language change summary

### Preferred worker type

- **Primary:** Deterministic tool (e.g. `content.diff`)
- **Secondary:** `fast_worker` for `summary` field only

### Validation rules

- `baseline` and `candidate` must be present
- `changes` array required; empty allowed when inputs identical
- `stats` counts must match `changes` length by type

### Fallback behavior

- Structured JSON diff when both sides parse as objects
- Plain text line diff otherwise
- Skip model summary if provider unavailable; return structural diff only

### Failure cases

| Code | When |
|---|---|
| `INVALID_INPUT` | Missing baseline or candidate |
| `DIFF_TOO_LARGE` | Optional size guard (policy TBD) |

### Example fixture

`docs/04-validation/fixtures/tracks/diff/simple-doc-change.json`

### Local Brain routing notes

Feeds Summarization and Validation tracks with **bounded change artifacts** instead of re-sending full documents to model steps. Reduces token use and gives audit a stable `changes[]` artifact key.

---

## Confidence Track

| Field | Value |
|---|---|
| **Track name** | Confidence Track |
| **Track id** | `governance.confidence_score` |
| **Status** | Draft / not implemented |

### Purpose

Score how well outputs are supported by available sources, model certainty signals, and validation history. Produces a routing signal for escalation or acceptance.

### When it should run

- After model steps that produce ranked lists, summaries, or recommendations
- Before Escalation Track or final validation
- When source coverage is partial (Memory Bridge thin context, incomplete listing fields)

### Input contract

```json
{
  "output_artifact": {},
  "sources": [],
  "signals": {
    "schema_valid": true,
    "evidence_valid": true,
    "source_coverage_ratio": 0.0,
    "model_self_reported_confidence": null
  },
  "thresholds": {
    "accept": 0.75,
    "escalate": 0.45
  }
}
```

### Output contract

```json
{
  "score": 0.0,
  "band": "high|medium|low",
  "factors": [
    { "name": "source_coverage", "weight": 0.4, "value": 0.0 }
  ],
  "recommendation": "accept|review|escalate",
  "valid": true
}
```

### Required capabilities

- Deterministic scoring function (weighted factors)
- Optional `fast_worker` to explain low-confidence factors

### Preferred worker type

- **Primary:** Deterministic tool
- **Optional:** `fast_worker` for human-readable `factors` rationale

### Validation rules

- `score` in `[0, 1]`
- `recommendation` must align with thresholds unless overridden by `valid: false` upstream signals
- `band` derived deterministically from `score`

### Fallback behavior

- When model self-report missing: compute score from deterministic signals only
- When evidence step skipped: lower `source_coverage` weight; never default to `high` band

### Failure cases

| Code | When |
|---|---|
| `INVALID_INPUT` | Missing output_artifact |
| `CONFIDENCE_BELOW_ESCALATE` | Informational — consumed by Escalation Track |

### Example fixture

`docs/04-validation/fixtures/tracks/confidence/partial-source-coverage.json`

### Local Brain routing notes

Bridges **validation outcomes** to **routing decisions** without hardcoding escalation inside the orchestrator. Scoreboard can log `confidence.score` per run for Model Garage feedback loops.

---

## Escalation Track

| Field | Value |
|---|---|
| **Track name** | Escalation Track |
| **Track id** | `routing.escalation_ladder` |
| **Status** | Draft / not implemented |

### Purpose

Decide the next handler when a step fails validation, confidence is low, or the current worker role is insufficient. Implements the escalation ladder described in gap analysis — **not** present in runtime today.

### When it should run

- After failed schema or handoff verification
- When Confidence Track returns `recommendation: "escalate"`
- When model step returns retryable provider errors (after `retry_same_model_once` exhausted)

### Input contract

```json
{
  "failed_step": {
    "id": "string",
    "executor_type": "model|tool",
    "role": "fast_worker|null",
    "error_code": "string"
  },
  "attempt": 1,
  "ladder": [
    { "action": "retry_same_role", "max": 1 },
    { "action": "escalate_role", "from": "fast_worker", "to": "default_worker" },
    { "action": "escalate_role", "from": "default_worker", "to": "reasoning_worker" },
    { "action": "fallback_tool_only" }
  ],
  "confidence": { "recommendation": "escalate" }
}
```

### Output contract

```json
{
  "decision": "retry|escalate|fallback_tool_only|abort",
  "next_role": "default_worker|null",
  "next_executor": { "type": "model|tool", "tool": null, "task": null },
  "reason": "string",
  "attempt_next": 2
}
```

### Required capabilities

- Policy engine reading track/workflow escalation config
- Model router role resolution
- Tool-only fallback paths per workflow (e.g. Lighthouse deterministic demo)

### Preferred worker type

- **Primary:** Deterministic policy module (Future FallbackHandler)
- **Not** a model step — escalation must be auditable and reproducible

### Validation rules

- `decision` must be one of allowed enum values
- `attempt_next` > `attempt` when decision is `retry` or `escalate`
- `abort` when ladder exhausted

### Fallback behavior

- Final ladder step is always `fallback_tool_only` or `abort` — never infinite retry
- Workflow may declare `abort_allowed: false` to force deterministic fallback (Lighthouse pattern)

### Failure cases

| Code | When |
|---|---|
| `ESCALATION_EXHAUSTED` | No ladder steps remain |
| `INVALID_LADDER` | Malformed ladder config in track JSON |

### Example fixture

`docs/04-validation/fixtures/tracks/escalation/tiny-model-not-enough.json`

### Local Brain routing notes

Centralizes **worker escalation** outside model-router ad hoc retries. Local Brain can log escalation decisions to audit and scoreboard, enabling Model Garage to correlate role failures with model profiles.

---

## Context Selection Track

| Field | Value |
|---|---|
| **Track name** | Context Selection Track |
| **Track id** | `memory.context_selection` |
| **Status** | Draft / not implemented |

### Purpose

Select a bounded set of relevant documents or memory entries before model steps run. Complements Memory Bridge v0 (`POST /memory/context-pack`) with explicit ranking and inclusion rules.

### When it should run

- Before model steps in workflows using a memory vault
- When request input includes a query but not explicit file list
- Lighthouse Handoff with Memory Bridge preflight (future composed step — **does not change current LH behavior**)

### Input contract

```json
{
  "query": "string",
  "candidates": [
    { "id": "doc1", "path": "string", "snippet": "string", "score_hint": 0.0 }
  ],
  "limits": {
    "max_documents": 5,
    "max_tokens": 4000
  },
  "vault_ref": "optional vault id or path"
}
```

### Output contract

```json
{
  "selected": [
    { "id": "doc1", "path": "string", "reason": "keyword_match|rank_score" }
  ],
  "excluded_count": 0,
  "thin_context_warning": false,
  "valid": true
}
```

### Required capabilities

- Memory vault adapter read (existing Memory Bridge v0)
- Deterministic ranker (keyword / path match) for v1
- Future: embedding search (not in v0)

### Preferred worker type

- **Primary:** Deterministic selector tool wrapping memory adapter
- **Optional:** `fast_worker` for query expansion (later milestone)

### Validation rules

- `selected.length` <= `limits.max_documents`
- Warn (`thin_context_warning: true`) when zero docs selected but candidates non-empty
- Do not fail solely on thin context — workflows decide policy

### Fallback behavior

- No vault configured: return empty `selected`, `thin_context_warning: true`
- Ranker error: pass through explicit `candidates` if `input.force_ids` provided

### Failure cases

| Code | When |
|---|---|
| `MEMORY_VAULT_UNAVAILABLE` | Vault path invalid or disabled |
| `INVALID_INPUT` | Missing query and empty candidates |

### Example fixture

`docs/04-validation/fixtures/tracks/context-selection/select-relevant-docs.json`

### Local Brain routing notes

Keeps model context **bounded and auditable**. Local Brain can attach `context_selection.selected` to audit logs so clients know which memory files influenced a run — without loading the full vault into every model prompt.

---

## Model Profiling Track

| Field | Value |
|---|---|
| **Track name** | Model Profiling Track |
| **Track id** | `garage.model_profiling` |
| **Status** | Draft / not implemented |

### Purpose

Run a structured evaluation pass for a model + role against a track step fixture. Produces scorecard rows for Model Garage — **offline / harness use**, not per-user-request hot path.

### When it should run

- Model Garage evaluation harness (Milestone 4 target)
- After adding a new local model or changing role → model mapping
- CI nightly against mock + optional Ollama (when configured)

### Input contract

```json
{
  "model_ref": { "provider": "ollama|mock", "model": "string" },
  "role": "fast_worker|default_worker|reasoning_worker",
  "target_step": {
    "track_id": "website_audit.lighthouse_handoff",
    "step_id": "prioritize_fixes"
  },
  "fixture_ref": "docs/04-validation/fixtures/tracks/...",
  "repeat": 1
}
```

### Output contract

```json
{
  "scorecard": {
    "model": "string",
    "role": "string",
    "schema_valid_rate": 1.0,
    "latency_ms_p50": 0,
    "latency_ms_p95": 0,
    "task_rubric_score": null,
    "passed": true
  },
  "runs": [],
  "valid": true
}
```

### Required capabilities

- Track runner invocation with pinned model override
- Schema validator + optional rubric scorer
- Scoreboard / evidence log writer

### Preferred worker type

- **Primary:** Harness tool (deterministic orchestration)
- Evaluated **models** vary by `model_ref`; the profiling track itself is not model-backed

### Validation rules

- `passed: true` only when `schema_valid_rate === 1.0` and required rubric thresholds met
- Do not publish benchmark marketing from a single fixture run

### Fallback behavior

- Provider unavailable: record `passed: false`, `error: PROVIDER_UNAVAILABLE` — do not substitute a different model silently

### Failure cases

| Code | When |
|---|---|
| `FIXTURE_NOT_FOUND` | Invalid fixture_ref |
| `TRACK_STEP_NOT_FOUND` | Bad target_step reference |

### Example fixture

`docs/04-validation/fixtures/tracks/model-profiling/simple-model-scorecard.json`

### Local Brain routing notes

Feeds **role → model** resolution with evidence. Local Brain continues to dispatch by role at runtime; Model Profiling Track populates the garage that informs config, not automatic per-request model picking (classifier not built).

---

## Capability Discovery Track (Future Only)

| Field | Value |
|---|---|
| **Track name** | Capability Discovery Track |
| **Track id** | `capability.discovery` |
| **Status** | **Future / NearbyNode-adjacent — not implemented, not Milestone 2 scope** |

> **Explicit boundary:** This track depends on NearbyNode protocol, unified Capability Registry, and device pairing — none of which exist in the repo today. Do not wire this track into workflows or claim partial implementation.

### Purpose

Discover executable capabilities on Local Brain and connected nearby devices, normalize them into a capability index, and return routing hints for future multi-node workflows.

### When it should run (future)

- Local Brain startup or periodic refresh
- After a NearbyNode peer connects or disconnects
- Before Routing Track selects a handler that may execute on a remote device

### Input contract (draft)

```json
{
  "scope": "local|nearby|all",
  "capability_types": ["tool", "model", "file", "browser"],
  "refresh": false
}
```

### Output contract (draft)

```json
{
  "capabilities": [
    {
      "id": "string",
      "type": "tool|model|node",
      "origin": "local|nearby:device_id",
      "roles": [],
      "available": true
    }
  ],
  "indexed_at": "ISO-8601",
  "valid": true
}
```

### Required capabilities (future)

- NearbyNode connector protocol — **not built**
- Unified Capability Registry merging tool packs + node manifests — **partial (tools only today)**
- Local `/tools` and `/models/roles` endpoints as local slice

### Preferred worker type

- Deterministic registry aggregator; no model required for v1 discovery

### Validation rules

- Every listed capability must resolve to a live handler or be marked `available: false`
- No phantom capabilities in routing output

### Fallback behavior

- NearbyNode unavailable: return local capabilities only with `scope_effective: "local"`

### Failure cases

| Code | When |
|---|---|
| `NEARBY_NODE_UNAVAILABLE` | Peer discovery failed (non-fatal for local-only) |
| `REGISTRY_STALE` | Optional TTL exceeded |

### Example fixture

None in this catalog — add when NearbyNode milestone starts.

### Local Brain routing notes

Future enabler for **device = capability** routing across the LAN. Until built, Local Brain routes to registered tool packs and provider models only — see [track-registry.md](./track-registry.md).

---

## Cross-Track Composition Example (Draft)

Not implemented — illustrates how future tracks nest inside a workflow:

```txt
memory.context_selection
  → extract / classify (existing core tracks)
  → model step (role: fast_worker)
  → governance.confidence_score
  → governance.evidence_check
  → validate + assemble
  on failure → routing.escalation_ladder → retry step
```

## Related

- [future-tracks.md](./future-tracks.md) — index and fixtures map
- [track-catalog-expansion-plan.md](./track-catalog-expansion-plan.md) — rollout phases
- [core-tracks.md](./core-tracks.md) — Validation, Extraction, etc.
