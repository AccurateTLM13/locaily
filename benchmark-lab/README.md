# Benchmark Lab

Benchmark Lab is Locaily's local evaluation subsystem. It produces validated evidence, model cards, and qualification records that can inform model routing, track qualification, worker-contract testing, hardware profiling, and prompt regression testing.

The lab lives in this repository while its contracts and outputs are tightly coupled to Locaily tracks, model roles, schemas, and orchestration behavior.

## Boundaries

- `engine/` contains reusable benchmark execution code.
- `locaily/` contains Locaily-specific suites, fixtures, prompts, and worker contracts.
- `schemas/`, `contracts/`, and `validators/` define benchmark-facing validation surfaces.
- `evidence/` contains curated, reviewable evidence.
- `qualifications/` contains compact records consumed by runtime and orchestration code.
- `results/raw/`, `cache/`, `models/files/`, `runtime-logs/`, and `evidence/probes/` are local-only and ignored by Git.

The companion runtime should consume qualification records and approved summaries. It should not import Benchmark Lab runner code or parse raw benchmark outputs.

## Status

Benchmark Lab Milestone 1 is complete and operator-ready.

Qualification breadth remains incremental across models, Tracks, hardware profiles, prompts, runtimes, and regression packs.

### What Is Implemented

- Engine and CLI (run, review, compare, promote, matrix, report, model-card, qualification, checksum-verify, probe, diagnose)
- Mock and Ollama execution adapters
- ToolEvalRuntime adapter for multi-turn tool-use evaluation
- Evidence trust boundary: raw outputs are local-only, promotion is explicit
- Qualification records available for runtime consumption via compact schema-validated artifacts
- Read-only `/benchmark/status` endpoint on the Local Brain
- Local Brain consumes compact qualification data without importing Benchmark Lab engine internals

### What Remains Incremental

- Broader model qualification coverage across additional Ollama models
- Additional Benchmark Lab tracks beyond intent-classification and basic-tool-use
- Hardware profiling and qualification records for multiple hardware profiles
- Deeper live qualification evidence for prompt regression, output variance, and cross-track generalization
- Structured output (Category O) and error recovery (Category E) evaluation scenarios
- Automatic qualification-based model swapping (not yet implemented; runtime does not automatically swap models based on qualification data)

## Implemented Command Surface

| Command | npm script | Purpose |
|---|---|---|
| `run` | `npm run benchmark:run` | Run a suite, write raw results + draft summary |
| `review` | `npm run benchmark:review` | Review a draft run summary without promoting |
| `compare` | `npm run benchmark:compare` | Compare two draft summaries |
| `promote` | `npm run benchmark:promote` | Explicitly promote a draft run to approved evidence |
| `matrix` | `npm run benchmark:matrix` | Run a suite across multiple model manifests |
| `report:generate` | `npm run report:generate` | Generate published report from promoted evidence |
| `model-card:generate` | `npm run model-card:generate` | Generate model card from promoted evidence |
| `qualification:generate` | `npm run qualification:generate` | Generate qualification record from promoted evidence |
| `checksum:verify` | `npm run checksum:verify` | Verify a checksum record |
| `probe` | `npm run benchmark:probe` | Probe model capabilities before running a suite |
| `diagnose` | `npm run benchmark:diagnose` | Run TC-65 diagnostic variants across models and modes |
| `benchmark:test` | `npm run benchmark:test` | Schema validation test + mock run loop |
| `benchmark:hybrid` | `npm run benchmark:hybrid` | Hybrid mock+Ollama run for cross-mode comparison |
| `tool-eval:run` | `npm run tool-eval:run` | Run Tool Eval Bench tool-use scenarios (Ollama required) |
| `tool-eval:test` | `npm run tool-eval:test` | Run tool-eval integration tests |
| `benchmark:status-smoke` | `npm run benchmark:status-smoke` | Spawn companion, verify `/benchmark/status` |

All CLI scripts are in `benchmark-lab/engine/cli/`. The CLI arg parser is in `args.js`.

## Trust Flow

```txt
run
  ↓
review
  ↓
compare when needed
  ↓
promote
  ↓
report / model card / qualification
  ↓
checksum verification
  ↓
runtime consumption of compact qualification data
```

- Raw outputs are local-only and Git-ignored.
- Promotion is explicit and requires human approval.
- Published artifacts (evidence, reports, model cards, qualification records) must come from approved, reviewed evidence.
- Qualification records are evidence-backed hints or policy inputs for the runtime router.
- The runtime does not consume raw run folders; it reads only compact qualification JSON.

### Additional Tooling

- `benchmark:probe` probes model capabilities before running a suite (cached under `evidence/probes/`).
- `benchmark:diagnose` runs TC-65 diagnostic variants across models and execution modes.
- `benchmark:hybrid` runs a mock and live comparison for cross-mode validation.
- `tool-eval:run` runs Tool Eval Bench scenarios against an Ollama model (requires live runtime).

## Current Limitations

- Narrow current Track coverage (intent-classification, basic-tool-use with 8 Tool Eval Bench scenarios).
- Limited live model evidence (only locally installed Ollama models).
- Hardware qualification breadth is incomplete.
- Prompt-regression depth is incomplete (no automated regression pack pipeline).
- No automatic universal model ranking.
- No automatic model swapping implied.
- A model qualified for one Track must not be claimed as generally superior.

## Operator Workflow

See [OPERATOR_GUIDE.md](./OPERATOR_GUIDE.md) for exact commands, trust boundaries, live Ollama validation steps, evidence promotion, checksum verification, and commit policy.
