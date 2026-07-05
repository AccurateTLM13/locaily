# Track Benchmarks

Track-specific benchmark suites for Locaily workflows and tracks.

## Structure

Each Track benchmark should define:

- **Track ID** — Stable identifier matching the Track definition (e.g., `intent-classification`, `basic-tool-use`)
- **Contract/version** — Specific worker contract version tested
- **Suite config** — JSON suite file referencing cases, adapter, runtime config
- **Fixtures** — Test inputs and expected outputs
- **Expected schema** — Output schema the model must produce
- **Validator set** — Functions that evaluate responses (exact match, schema match, etc.)
- **Required model capabilities** — Capabilities the model must support (from capability probe)
- **Thresholds** — Minimum pass rates, maximum error rates
- **Manifest/runtime constraints** — Required model manifest fields
- **Qualification output expectations** — What qualification record status and role entries should be produced
- **Revalidation triggers** — Changes that invalidate current evidence (contract version bump, model update, suite change)

## Implemented Track Suites

### intent-classification

First Benchmark Lab vertical slice. Includes mock deterministic suite (`suite.json`), improved mock suite (`suite-improved.json`), and opt-in Ollama example (`suite-ollama.example.json`).

### basic-tool-use

Ported subset of Tool Eval Bench with 8 scenarios (TC-01, TC-02, TC-04, TC-05, TC-09, TC-10, TC-11, TC-12), execution-router with native/policy-routed/runtime-constrained modes, and 13 tool definitions.

## Qualification Scope

A model qualifies for a specific Track contract, not for Locaily as a whole.

Do not claim additional suites exist beyond these two implemented Track suites.
