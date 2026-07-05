# Validation Strategy

Locaily validates across multiple layers — contract, runtime, model qualification, product usefulness, and integration — not the whole product in one vague claim.

## Principles

1. **Evidence over narrative** — record pass/fail with fixture, provider, and date
2. **Layered validation** — contract → runtime → qualification → product → integration
3. **No benchmark marketing** — do not claim model wins without logged runs or Benchmark Lab evidence
4. **Per-workflow docs** — each workflow links its validation record
5. **No automatic learning loop** — Canonical Track Run Records are at specification stage

## Validation Layers

| Layer | Scope | Typical evidence | Automated? |
|-------|-------|-----------------|------------|
| **Contract** | API schemas, envelopes, required fields, route behavior, deterministic contracts | `scripts/contract-test.js`, `scripts/tool-registry-schema-test.js`, `scripts/audit-record-schema-test.js` | Yes — no runtime required |
| **Runtime** | Local Brain execution, tools, Tracks, workflows, fallbacks, audit summaries, provider handling | `scripts/smoke-test.js`, `scripts/orchestration-unit-test.js` | Yes — requires companion |
| **Model qualification** | Benchmark Lab evaluation for specific roles/Track contracts | `benchmark-lab/evidence/approved/`, `benchmark-lab/qualifications/models/` | Benchmark Lab CLI (mock or live) |
| **Product** | Workflow usefulness to a human or coding agent | Manual review, L3/L4 evidence | No |
| **Integration** | Complete paths: client → Local Brain → Track/workflow → model/tool → validation → result | L4 extension bridge evidence | Not implemented for extension |

## Validation Targets

| Target | Layer | Status |
|--------|-------|--------|
| API contract envelopes | Contract | Runtime-enforced |
| Track contracts (schema + load) | Contract | Runtime-enforced |
| Workflow definitions (plan schema) | Contract | Runtime-enforced |
| Input mapping | Runtime | Runtime-enforced |
| The Crew role resolution | Runtime | Implemented |
| Tool execution | Runtime | Implemented |
| Model execution (via provider router) | Runtime | Implemented |
| Fallback behavior (deterministic path) | Runtime | Implemented |
| Audit redaction | Runtime | Runtime-enforced |
| Memory Bridge boundaries | Runtime | Runtime-enforced |
| Qualification policy handling | Runtime | Implemented (model-qualification-loader) |
| Benchmark Lab runtime separation | Contract | Enforced (no `benchmark-lab/engine/` import in companion) |
| Canonical Track Run Records | — | Specification stage — not implemented |

## Test Type Distinctions

| Type | What it proves | What it does not prove |
|------|---------------|----------------------|
| **Deterministic automated test** | Contract compliance, schema validity | Model quality, human usefulness |
| **Mock provider test** | Orchestration flow, fallback paths | Live model behavior |
| **Live local-model test** | Model runs on target hardware | Model is optimal for the role |
| **Human review** | Workflow output is useful | Repeatability at scale |
| **Promoted Benchmark Lab evidence** | Model passed specific qualification gates | Model is qualified for untested roles/workflows |

## Good vs Bad Claims

**Good:**

```txt
website_audit.lighthouse_handoff and marketplace.dealsniper pass smoke on mock provider (contract validation suite on clean server).
L2 Ollama Memory Bridge passed on lemonteed fixture (2026-06-13).
LiquidAI LFM2.5-1.2B qualified as fast_worker for prioritize_fixes (Benchmark Lab evidence).
```

**Bad:**

```txt
LocAIly works.
All models qualified.
Small models beat GPT-4 on all tasks.
55/55 tests pass = production ready.
```

## Where To Log Evidence

- Workflow-specific: [../03-workflows/*-validation.md](../03-workflows/)
- Cross-cutting milestones: this folder
- Model qualification: `benchmark-lab/evidence/approved/`
- Session notes: [../07-progress/progress-log.md](../07-progress/progress-log.md)
- Index: [evidence-log.md](./evidence-log.md)

## Related

- [README.md](./README.md)
- [../03-workflows/validation-template.md](../03-workflows/validation-template.md)
- [../../benchmark-lab/README.md](../../benchmark-lab/README.md)
