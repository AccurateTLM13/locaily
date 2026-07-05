# Contributing to Locaily

## Before Starting

Read these in order:

1. [README.md](./README.md)
2. [AGENTS.md](./AGENTS.md)
3. [docs/00-start-here/current-state.md](./docs/00-start-here/current-state.md)
4. [docs/07-progress/active-build-slice.md](./docs/07-progress/active-build-slice.md)
5. Relevant subsystem docs under `docs/`

## Architecture Guardrails

- Preserve local-first behavior
- Do not hardcode the system around one model
- Use Tracks and capability contracts
- Deterministic tools are preferred for deterministic work
- Do not import Benchmark Lab engine code into Local Brain
- Do not treat installed models as qualified
- Do not implement Relay Nodes or automatic model swapping incidentally
- The Crew internal implementation lives at `companion/crew/` (formerly `companion/pit-crew/`)
- Do not expose private memory-vault content or local paths

## Development Workflow

**Node version:** 18 or newer

**Start Local Brain:**
```bash
node companion/server.js
```

**Non-live validation (no Ollama):**
```bash
node scripts/contract-test.js
node scripts/benchmark-lab-schema-test.js
node scripts/benchmark-lab-run-test.js
node scripts/benchmark-status-smoke-test.js
```

**Full smoke test (requires running companion):**
```bash
node scripts/smoke-test.js
```

**Ollama requirements:** Optional. For model-backed features, install Ollama and pull `llama3.2`.

**Documentation:** Update docs when changing behavior. Document decisions in `docs/06-decisions/decision-log.md`.

**Command reporting:** When reporting test results, include the exact commands run and their output.

## Change Categories

| Change | Expectations |
|--------|-------------|
| Runtime | Tests pass, API envelopes unchanged, docs updated |
| Track | Contract validation, schema compatibility |
| Tool pack | Manifest validation, handler returns raw results |
| Benchmark Lab | Subsystem tests pass, no import into Local Brain |
| Documentation | Verify links, no unsupported claims |
| Model registry | Accurate metadata, no committed model binaries |
| Memory Bridge | Disabled by default, no automatic writeback |

## Evidence and Claims

- No unsupported benchmark claims
- No broad model claims from narrow fixtures
- Promote evidence only for committed qualification claims
- Historical test counts not used as current global baselines
- Screenshots or manual evidence for UI changes where practical

## Pull-Request Expectations

Each PR should include a summary with:

- Objective
- Files changed
- Behavior changed
- Tests run
- Limitations
- Follow-on work
- Whether docs were updated
