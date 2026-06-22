# Lighthouse Handoff

## What This Workflow Is

**Lighthouse Handoff** is Locaily's **first practical workflow and test bench**.

It is **not** the entire Locaily system. It validates:

- client → Local Brain integration
- structured Lighthouse / PageSpeed input (JSON)
- JSON pipeline stages through extraction, classification, prioritization, and validation
- deterministic output when no model is available
- multi-step orchestration when a runtime is available
- schema validation and fallbacks
- Markdown handoff **export** rendered from validated JSON state

## JSON-First Pipeline

Orchestration state is JSON end-to-end. The final Markdown report is an **export layer**, not the source of truth.

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
priority / task JSON     ← prioritize_fixes + validate_priority_fixes
    │
    ▼
validation JSON          ← verify_output (lighthouse.verify_handoff)
    │
    ▼
Markdown handoff export  ← write_handoff (compose-handoff)
```

See [../01-architecture/json-first-internal-format.md](../01-architecture/json-first-internal-format.md).

## Workflow Roles

| Role | Description |
|---|---|
| Chrome extension workflow | Captures or receives Lighthouse / PageSpeed data in the browser — client repo: [github.com/mnfrdrsh/lighthouse-handoff](https://github.com/mnfrdrsh/lighthouse-handoff) |
| PageSpeed / Lighthouse translator | Maps report JSON into normalized internal JSON |
| Deterministic handoff path | Runs without Ollama when runtime is missing; still produces structured JSON + Markdown export |
| Local AI enhancement path | Uses model roles across orchestrated JSON steps when runtime is ready |
| Markdown export | Final human/agent-readable report rendered from validated JSON at `write_handoff` |
| Validation test bench | Exercises Pit Crew-style step routing and scoreboard hooks |

## Tool Contract

- **Tool id:** `lighthouse-handoff`
- **Task:** `analyze-report`
- **Pack:** `showcase-tools`
- **Runtime required flag:** `false` (backward compatible; orchestration uses runtime when present)

### Required Input

```json
{
  "url": "https://example.com",
  "scores": {
    "performance": 72,
    "accessibility": 91,
    "bestPractices": 88,
    "seo": 85
  }
}
```

### Optional Input

- `opportunities` — Lighthouse opportunity objects
- `diagnostics` — Lighthouse diagnostic objects

Schemas: `companion/schemas/lighthouse-handoff.input.schema.json`, `companion/schemas/lighthouse-handoff.schema.json`

## Execution Modes

| Mode | When | Behavior |
|---|---|---|
| Deterministic demo | No usable Ollama/mock runtime | `buildDemoResult` — structured handoff without claiming full AI analysis |
| `baseline` | Runtime available | Single-pass `generateJson` |
| `orchestrated` (default when runtime available) | Runtime available | Multi-step track via `executeLighthouseHandoffTrack` |

Set via request `options.execution_mode`.

## Orchestrated Steps (When Runtime Available)

1. **extract_metrics** — `fast_worker`
2. **classify_issues** — `default_worker`
3. **prioritize_fixes** — `reasoning_worker`

See [../01-architecture/orchestration-flow.md](../01-architecture/orchestration-flow.md).

## Expected Output Shape

Schema-constrained **JSON** including developer-facing handoff fields (priority fixes, summaries, checklists—see output schema in repo). The `markdown` field, when present, is a **rendered export** from that JSON state — not the orchestration source of truth. Exact fields must match `lighthouse-handoff.schema.json`; do not invent additional guaranteed fields in docs.

## How To Exercise Locally

1. Start server: `node companion/server.js`
2. Call via legacy API:

```json
POST /analyze
{
  "tool": "lighthouse-handoff",
  "task": "analyze-report",
  "input": {
    "url": "https://example.com",
    "scores": { "performance": 50, "accessibility": 90, "bestPractices": 80, "seo": 70 },
    "opportunities": [],
    "diagnostics": []
  }
}
```

3. Run automated validation: `node scripts/smoke-test.js` (see [lighthouse-handoff-validation.md](./lighthouse-handoff-validation.md))

## Validation Status

| Tier | Scope | Status |
|---|---|---|
| L1 | Local Brain automated tests | **Passed** (current suite **51/51** on clean server; historical baselines: 28/28 → 48/48 → 51/51) |
| L2 | Live Ollama orchestration | Open |
| L3 | Extension standalone Markdown | Open (external repo) |
| L4 | Extension ↔ Local Brain HTTP | **Not implemented** |

Details: [lighthouse-handoff-validation.md](./lighthouse-handoff-validation.md)

Integration spec (when wiring extension): [lighthouse-handoff-extension-integration.md](./lighthouse-handoff-extension-integration.md)

## What Is Confirmed vs Experimental

**Confirmed (Local Brain — L1)**

- Tool registered and callable via `/analyze` and `/tasks/run`
- Deterministic path without Ollama
- Orchestrated and baseline paths on mock provider (smoke-tested)
- Input validation, unsafe input blocking, audit + scoreboard hooks
- Prompt template at `companion/prompts/lighthouse-handoff.md`

**Experimental / incomplete**

- Extension ↔ Local Brain HTTP bridge (extension works standalone today)
- Live Ollama orchestration sign-off on target hardware (L2)
- Validated Markdown quality vs human-written handoffs (L3)
- Benchmarks vs monolithic large-model pass

## Optional Memory Preflight (`compose-handoff`)

`compose-handoff` supports optional Memory Bridge context via `options.memory`. Memory is **off by default** at the platform level; when the vault is not configured or not readable, behavior is unchanged.

```json
POST /tasks/run
{
  "tool": "lighthouse-handoff",
  "task": "compose-handoff",
  "input": {
    "url": "https://example.com",
    "metrics": { "performance": 45, "accessibility": 96, "bestPractices": 100, "seo": 92 },
    "prioritizedFixes": { "priorityFixes": [] },
    "matchedFixes": { "fixes": [] }
  },
  "options": {
    "memory": {
      "enabled": "auto",
      "project": "Lighthouse Handoff",
      "task": "Generate coding-agent handoff from PageSpeed report",
      "maxFiles": 6,
      "writeback": false
    }
  }
}
```

When memory is used, the result includes `memory.used`, `memory.contextPackId`, `memory.filesUsed`, and `memory.warnings`. Markdown gains a **Project Context Used** section with constraints/guardrails only. **Lighthouse/PageSpeed metrics remain authoritative** for scores and diagnostics.

See [../01-architecture/memory-bridge.md](../01-architecture/memory-bridge.md).

## Related Code and Repos

**Local Brain (this repo)**

- `companion/tools/lighthouse-handoff.js`
- `companion/core/orchestrator.js`
- `companion/core/scoreboard.js`

**Chrome extension client**

- https://github.com/mnfrdrsh/lighthouse-handoff
- Standalone PSI → Markdown today; Local Brain bridge spec: [lighthouse-handoff-extension-integration.md](./lighthouse-handoff-extension-integration.md)

## Do Not

- Frame Lighthouse Handoff as the whole product
- Claim production-grade PageSpeed analysis without test evidence
- Skip schema validation when extending the workflow
