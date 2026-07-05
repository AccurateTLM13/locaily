# Benchmark Lab

**Status:** Milestone 1 complete — operator-ready  
**Subsystem:** `benchmark-lab/`  
**Canonical runtime-facing output:** qualification records  

Benchmark Lab is Locaily's local evaluation subsystem. It produces validated evidence, model cards, and compact qualification records consumed by runtime routing and orchestration. It is not a public leaderboard and not a replacement for the Local Brain runtime.

## Model Lab and Benchmark Lab Relationship

- **Model Lab** is the public Locaily architecture layer for evaluating and qualifying models.
- **Benchmark Lab** is the implemented repository subsystem that powers it.
- Local Brain may consume compact qualification records but must not import `benchmark-lab/engine/` modules.

## Architectural Position

```txt
Benchmark Lab
   |
validated benchmark evidence
   |
model cards and qualification records
   |
Locaily routing decisions
```

The runtime consumes compact qualification records. Benchmark Lab produces and validates that data. Runtime components must not import `benchmark-lab/engine/` modules or parse raw benchmark results.

## Milestone 1 Status

Benchmark Lab Milestone 1 is complete and operator-ready. Qualification breadth remains incremental across models, Tracks, hardware profiles, prompts, runtimes, and regression packs.

Completion of the engine and operator workflow does not imply broad coverage.

## CLI Commands

| Command | npm script | Purpose |
|---|---|---|
| `run` | `npm run benchmark:run` | Run a suite, write raw results + draft summary |
| `review` | `npm run benchmark:review` | Review a draft run summary without promoting |
| `compare` | `npm run benchmark:compare` | Compare two draft summaries |
| `promote` | `npm run benchmark:promote` | Explicitly promote a draft run to approved evidence |
| `matrix` | `npm run benchmark:matrix` | Run a suite across multiple model manifests |
| `probe` | `npm run benchmark:probe` | Probe model capabilities before running a suite |
| `diagnose` | `npm run benchmark:diagnose` | Run TC-65 diagnostic variants across models and modes |
| `hybrid` | `npm run benchmark:hybrid` | Hybrid mock+Ollama cross-mode comparison |
| `report:generate` | `npm run report:generate` | Generate published report from promoted evidence |
| `model-card:generate` | `npm run model-card:generate` | Generate model card from promoted evidence |
| `qualification:generate` | `npm run qualification:generate` | Generate qualification record from promoted evidence |
| `checksum:verify` | `npm run checksum:verify` | Verify a checksum record |
| `benchmark:test` | `npm run benchmark:test` | Schema validation + mock run test |
| `benchmark:status-smoke` | `npm run benchmark:status-smoke` | Spawn companion, verify `/benchmark/status` |
| `tool-eval:run` | `npm run tool-eval:run` | Run Tool Eval Bench tool-use scenarios |
| `tool-eval:test` | `npm run tool-eval:test` | Run tool-eval integration tests |

All CLI scripts are in `benchmark-lab/engine/cli/`. The CLI arg parser is in `args.js`.

## Adapters

- **Mock adapter** (`benchmark-lab/engine/adapters/mock-runtime.js`) — deterministic fixture responses for CI and contract tests.
- **Ollama adapter** (`benchmark-lab/engine/adapters/ollama-runtime.js`) — connects to `127.0.0.1:11434`, supports `/api/chat` for tool-calling and standard generation.
- **ToolEvalRuntime adapter** (`benchmark-lab/engine/adapters/tool-eval-runtime.js`) — multi-turn Ollama `/api/chat` for tool-use evaluation.

## Execution Modes

The execution router (`benchmark-lab/locaily/tracks/basic-tool-use/execution-router.js`) supports three modes:

| Mode | Description | When selected |
|---|---|---|
| `native` | Full tool exposure, no policy constraints | Default for scenarios without specific policy requirements |
| `policy-routed` | Scenario-specific policies injected via system prompt | Selected by POLICY_BY_SCENARIO mapping |
| `runtime-constrained` | Restricted tool exposure and response modes based on policy | Explicitly requested for capability-boundary testing |

Policies include: `NATIVE`, `DIRECT_RESPONSE`, `REFUSAL_REQUIRED`, `STRUCTURED_RESPONSE`, `DATE_RESOLUTION_REQUIRED`, and `TOOL_THEN_STRUCTURED_RESPONSE`.

Capability probes affect execution by recording which capabilities a model supports, allowing suites to check requirements before running.

## Capability Probing

`benchmark-lab/engine/probes/model-capability-probe.js` probes a model's capabilities before running a suite. Results are cached under `benchmark-lab/evidence/probes/`. The probe records:

- `textCompletion` — basic text generation
- `chatCompletion` — chat-formatted generation
- `nativeToolCalls` — native Ollama tool-calling support
- `toolArguments` — proper tool argument formatting
- `guidedJson` — structured JSON output via format parameter

Capability results: `SUPPORTED`, `UNSUPPORTED`, `INCOMPATIBLE_FORMAT`, `TIMEOUT`.

Suite configs can declare `requiredModelCapabilities` and `optionalModelCapabilities` to gate execution via `checkSuiteRequirements()`.

## Qualification-Record Loader

`companion/core/model-qualification-loader.js` loads qualification JSON from `benchmark-lab/qualifications/`, validates schema versions, and returns model-role and track suitability metadata. It does not import Benchmark Lab engine code.

## Schemas and Validation

14 schema files in `benchmark-lab/schemas/`:

- `qualification-record.schema.json`
- `promoted-evidence.schema.json`
- `approved-evidence-summary.schema.json`
- `model-manifest.schema.json`
- `model-card-source-data.schema.json`
- `hardware-profile.schema.json`
- `benchmark-suite.schema.json`
- `benchmark-run-summary.schema.json`
- `benchmark-case.schema.json`
- `benchmark-review.schema.json`
- `benchmark-comparison.schema.json`
- `benchmark-matrix.schema.json`
- `benchmark-report-source.schema.json`
- `model-capability-probe.schema.json`

All 14 schemas pass validation tests. The benchmark schema test suite (`scripts/benchmark-lab-schema-test.js`) validates every schema with valid and invalid fixtures including execution-mode variants.

## Evidence and Validation

### Evidence Promotion Workflow

```
run -> review -> compare -> promote -> checksum verify
```

1. Run a suite → raw results + draft summary (Git-ignored under `results/raw/`, `reports/drafts/`)
2. Review the draft (`benchmark:review`)
3. Compare against other runs (`benchmark:compare`)
4. Promote explicitly (`benchmark:promote` with `--run`, `--evidence`, `--approved-by`)
5. Promotion writes compact evidence to `evidence/summaries/` and `evidence/approved/`, plus checksum records to `evidence/checksums/`

### Artifact Lifecycle

| Stage | Command | Output | Git status | Human review required |
|---|---|---|---|---|
| Run | `benchmark:run` | `results/raw/<run-id>/run.json`, `reports/drafts/<run-id>/summary.json` | Ignored | Yes |
| Review | `benchmark:review` | Review record | Ignored | Yes |
| Compare | `benchmark:compare` | Comparison output | Ignored | Before using to justify promotion |
| Matrix | `benchmark:matrix` | `reports/drafts/matrices/<matrix-id>.json`, `.md` | Ignored | Per-model review |
| Promote | `benchmark:promote` | `evidence/summaries/`, `evidence/approved/`, `evidence/checksums/` | Committed | Yes |
| Report | `report:generate` | `reports/published/` + checksums | Committed | Review before committing |
| Model card | `model-card:generate` | `model-cards/published/` + checksums | Committed | Review before committing |
| Qualification | `qualification:generate` | `qualifications/models/` + checksum | Committed | Yes — status must be intentional |
| Checksum verify | `checksum:verify` | Verification result (stdout) | N/A | Verify before trusting |

### Checksum Verification

Two modes: `canonical_text_v1` (CRLF→LF normalization for text files) and `byte_exact` (binary files). Backward-compatible fallback verifies legacy byte-exact records against canonical normalization.

### Qualification Generation

```powershell
npm run qualification:generate -- --model <model-id> --evidence <evidence-id>
```

Default status is `screening`. Use `--status`, `--role`, `--role-status` for more specific records. Use `qualified` only when evidence genuinely supports it.

### Operator Guide and Validation Checklist

- `benchmark-lab/OPERATOR_GUIDE.md` — exact commands, trust boundaries, live Ollama validation steps, commit policy.
- `benchmark-lab/VALIDATION_CHECKLIST.md` — required checks before committing framework changes.

### Current Qualified Models and Tracks

Qualification records exist for `llama3.2-local` on intent-classification and basic-tool-use tracks. These are narrow, evidence-based records — not broad model-capability claims. See `benchmark-lab/qualifications/models/`, `benchmark-lab/qualifications/tracks/`, and `benchmark-lab/qualifications/hardware/`.

## Repository Layout

```txt
benchmark-lab/
|-- README.md
|-- OPERATOR_GUIDE.md
|-- VALIDATION_CHECKLIST.md
|-- engine/
|   |-- adapters/          (mock-runtime, ollama-runtime, tool-eval-runtime)
|   |-- cli/               (run, review, compare, promote, matrix, probe, diagnose, report, model-card, qualification, checksum-verify, tool-eval-run, mode-comparison-run)
|   |-- runners/           (suite-runner, tool-eval-runner, mode-comparison-runner, tc65-diagnostic-runner)
|   |-- probes/            (model-capability-probe)
|   |-- scorers/
|   |-- reporters/
|   |-- checksums.js
|   |-- review-run.js
|   |-- compare-runs.js
|   |-- qualification.js
|   |-- model-card.js
|-- locaily/
|   |-- tracks/
|       |-- basic-tool-use/   (suite, scenarios, execution-router, compare-runs, tool-definitions)
|       |-- intent-classification/ (suite, suite-improved, suite-ollama.example, cases, cases-live)
|-- schemas/              (14 schema files)
|-- validators/
|-- evidence/
|   |-- approved/
|   |-- checksums/
|   |-- summaries/
|   |-- probes/           (git-ignored cache)
|-- qualifications/
|   |-- models/
|   |-- tracks/
|   |-- hardware/
|-- model-cards/
|   |-- published/
|   |-- drafts/
|-- reports/
|   |-- published/
|   |-- drafts/
|-- results/raw/         (git-ignored)
|-- cache/               (git-ignored)
|-- runtime-logs/        (git-ignored)
```

## Security and Privacy

- Bind to localhost only.
- Do not commit large model binaries, provider caches, or raw benchmark outputs.
- Do not commit local paths, usernames, or private device identifiers.
- Evidence promotion is explicit — no automatic qualification.
- Do not claim benchmark results without committed or attached evidence.

## Status Visibility

`GET /benchmark/status` is read-only and side-effect free. It reports qualification record counts, checksum counts, status distribution, and the latest generated qualification timestamp. `GET /health` includes a compact Benchmark Lab summary.

## Git Storage Policy

**Commit:** engine code, schemas, validators, manifests, checksums, compact JSON summaries, approved evidence, curated failure examples, generated model cards, qualification records, published reports.

**Exclude:** raw benchmark outputs, temporary results, downloaded model binaries, provider caches, runtime logs, local configs and secrets, temporary report exports, generated capability probe cache.

## Qualification States

| State | Meaning |
|---|---|
| `untested` | No controlled benchmark evidence exists |
| `screening` | Limited test completed |
| `candidate` | Results justify a qualification run |
| `qualified` | Meets the track's defined criteria |
| `conditional` | Useful only under documented constraints |
| `rejected` | Does not meet the track's requirements |
| `revalidation_required` | A relevant dependency changed |

A model must not remain qualified automatically after its contract, model file, or relevant dependencies change.

## Runtime Qualification Policies

The runtime's `evaluateQualificationPolicy` supports four policies (set via `options.qualification_policy`):

| Policy | Behavior |
|---|---|
| `advisory` | Default. Qualification is logged but does not block execution. |
| `reject_rejected` | Blocks models with `rejected` or `revalidation_required` status. |
| `require_qualified` | Blocks models unless status is `qualified`. |
| `require_qualified_or_conditional` | Blocks unless status is `qualified` or `conditional`. |

Routing treats records as evidence-backed hints; default policy is advisory.

## Revalidation Triggers

Qualification records require revalidation when:

- The contract version changes (e.g., `intent-classifier-worker-v1` → `v2`)
- The model file or digest changes
- The suite config or cases are modified
- The prompt template or version is updated
- The hardware profile changes enough to affect results

## Evidence Interpretation

- A passing suite supports only the tested contract (Track + prompt version + hardware context).
- Evidence must name the model, runtime, suite, prompt/contract version, and hardware context.
- Narrow fixtures must not be turned into general model claims.
- Model-card prose must remain traceable to promoted evidence.
- Checksum integrity does not prove benchmark quality; it proves artifact immutability since hashing.

## Extraction Criteria

Evidence and qualification records should be extracted (promoted) only when:

- The run used a controlled, repeatable suite
- Results were reviewed by an operator
- The evidence claim is scoped to the tested contract
- Checksums were generated and verified
- No sensitive data is included
- The qualification status reflects the actual evidence strength

## Current Follow-On Areas

The following areas are recognized as valuable extensions but are not yet scoped or scheduled as an approved milestone:

- Additional Track suites beyond intent-classification and basic-tool-use
- Additional model evidence across more Ollama models
- Hardware profiling and qualification records for multiple hardware profiles
- Deeper prompt-regression coverage
- Richer failure analysis and error categorization
- Broader capability probes (structured output, error recovery)
- Continued operator UX improvements (aggregate commands, simplified chaining)

These are follow-on candidates, not an approved milestone. Do not begin implementation without an explicitly supplied objective.

## Related Docs

- [benchmark-lab/OPERATOR_GUIDE.md](../../benchmark-lab/OPERATOR_GUIDE.md)
- [benchmark-lab/VALIDATION_CHECKLIST.md](../../benchmark-lab/VALIDATION_CHECKLIST.md)
- [benchmark-lab/README.md](../../benchmark-lab/README.md)
- [../00-start-here/current-state.md](../00-start-here/current-state.md)
- [../07-progress/build-status.md](../07-progress/build-status.md)
