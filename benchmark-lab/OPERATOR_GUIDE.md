# Benchmark Lab Operator Guide

This guide covers the local workflow for running Benchmark Lab and deciding what, if anything, should become trusted evidence.

## Benchmark Lab Status

Benchmark Lab Milestone 1 is complete and operator-ready. Qualification breadth remains incremental across models, Tracks, hardware profiles, prompts, runtimes, and regression packs.

## Operator Start

### Prerequisites

- Node.js 18+
- Git repository root
- No Ollama required for non-live verification (mock adapter provides deterministic results)
- Ollama running on `127.0.0.1:11434` for live model validation

### Non-Live Verification Path

Run without a model runtime:

```powershell
npm.cmd run benchmark:test
npm.cmd run benchmark:status-smoke
node scripts/contract-test.js
```

These commands use the mock adapter and do not require Ollama.

### Live Ollama Path

1. Start Ollama and pull a model (e.g., `ollama pull llama3.2`).
2. Verify the model manifest exists at `benchmark-lab/models/manifests/<model-id>.json`.
3. Run the opt-in Ollama suite.
4. Review the draft result.
5. Promote only after manual inspection.

### Which Commands Create Local-Only Artifacts

- `benchmark:run` — writes raw run results + draft summary (Git-ignored)
- `benchmark:review` — reads local draft, writes review record (local-only)
- `benchmark:compare` — writes comparison output (local-only unless promoted)
- `benchmark:matrix` — writes draft matrix reports (Git-ignored)
- `benchmark:probe` — writes capability probe records to `evidence/probes/` (Git-ignored cache)

### Which Commands Create Reviewable Committed Artifacts

- `benchmark:promote` — writes evidence summaries, approved evidence, and checksums (committed)
- `report:generate` — writes published report source + Markdown (committed)
- `model-card:generate` — writes model card source + Markdown (committed)
- `qualification:generate` — writes qualification record + checksum (committed)

### Where Human Approval Is Required

- After `benchmark:run` — inspect the draft summary before promoting
- Before `benchmark:promote` — decide whether the evidence is trustworthy
- Before `qualification:generate` with `--status qualified` — ensure evidence genuinely supports it
- Before committing — verify no local-only artifacts are staged

## Artifact Lifecycle

| Stage | Command | Output | Git status | Human review required |
|---|---|---|---|---|
| Run | `benchmark:run` | `results/raw/<run-id>/run.json`, `reports/drafts/<run-id>/summary.json` | Ignored | Yes — inspect draft before promote |
| Review | `benchmark:review` | Review record (read from draft) | Ignored | Yes — review output for quality |
| Compare | `benchmark:compare` | Comparison output | Ignored | Before using comparison to justify a promotion |
| Matrix | `benchmark:matrix` | `reports/drafts/matrices/<matrix-id>.json`, `reports/drafts/matrices/<matrix-id>.md` | Ignored | Each model result should be reviewed individually |
| Probe | `benchmark:probe` | `evidence/probes/<model-id>/` (capability cache) | Ignored | Review capabilities before running suite |
| Diagnose | `benchmark:diagnose` | Diagnostic output | Ignored | Before using results to justify a fix |
| Hybrid | `benchmark:hybrid` | Mock+live comparison output | Ignored | Before cross-mode evidence promotion |
| Tool eval | `tool-eval:run` | Raw tool-eval output | Ignored | Review verdicts per scenario |
| Promote | `benchmark:promote` | `evidence/summaries/<evidence-id>.json`, `evidence/approved/<evidence-id>.json`, `evidence/checksums/*.json` | Committed | Yes — operator must approve |
| Report | `report:generate` | `reports/published/<report-id>.source.json`, `reports/published/<report-id>.md`, checksums | Committed | Review before committing |
| Model card | `model-card:generate` | `model-cards/published/<model-id>.source.json`, `model-cards/published/<model-id>.md`, checksums | Committed | Review before committing |
| Qualification | `qualification:generate` | `qualifications/models/<record>.json`, checksum | Committed | Yes — status must be intentional |
| Checksum verify | `checksum:verify` | Verification result (stdout) | N/A | Verify checksums match before trusting evidence |

## Trust Boundary

Benchmark Lab commands are split deliberately:

```txt
run -> review -> compare -> promote -> report/model-card/qualification -> checksum verify
```

Only `promote`, `qualification:generate`, `model-card:generate`, and `report:generate` create reviewable artifacts. Raw results and draft reports stay local and ignored by Git.

Do not commit large model files, raw benchmark outputs, provider caches, runtime logs, or private local paths.

## Non-Live Mock Loop

Run the deterministic fixture suite:

```powershell
npm.cmd run benchmark:run
```

This writes:

```txt
benchmark-lab/results/raw/<run-id>/run.json
benchmark-lab/reports/drafts/<run-id>/summary.json
```

Both paths are ignored by Git.

Review a run:

```powershell
npm.cmd run benchmark:review -- --run <run-id>
```

Compare two draft runs:

```powershell
npm.cmd run benchmark:compare -- --left <run-id> --right <run-id> --output <comparison-id>
```

## Live Ollama Loop

You own live evidence approval because it depends on your local runtime and models.

1. Start Ollama.
2. Pull or confirm the configured model.
3. Review the model manifest:

```txt
benchmark-lab/models/manifests/llama3.2-local.json
```

4. Run the opt-in suite:

```powershell
npm.cmd run benchmark:run -- --suite benchmark-lab/locaily/tracks/intent-classification/suite-ollama.example.json
```

To test a different installed Ollama model, keep the suite fixed and override only the manifest:

```powershell
npm.cmd run benchmark:run -- --suite benchmark-lab/locaily/tracks/intent-classification/suite-ollama.example.json --model-manifest <model-id>
```

Installed local manifests:

| Model manifest | Ollama runtime model |
|---|---|
| `llama3.2-local` | `llama3.2` |
| `lfm25-local` | `lfm2.5:latest` |
| `vibethinker-3b-q4km-local` | `hf.co/mradermacher/VibeThinker-3B-GGUF:Q4_K_M` |
| `lfm25-8b-a1b-local` | `hf.co/LiquidAI/LFM2.5-8B-A1B-GGUF:latest` |
| `lfm25-350m-local` | `hf.co/LiquidAI/LFM2.5-350M-GGUF:latest` |
| `lfm25-1p2b-thinking-local` | `hf.co/LiquidAI/LFM2.5-1.2B-Thinking-GGUF:latest` |
| `lfm25-1p2b-instruct-local` | `hf.co/LiquidAI/LFM2.5-1.2B-Instruct-GGUF:latest` |

5. Review the draft result:

```powershell
npm.cmd run benchmark:review -- --run <run-id>
```

Do not promote the result unless you have inspected the draft summary and decided it is appropriate evidence.

## Capability Probing

Before running a live suite, probe a model's capabilities:

```powershell
npm.cmd run benchmark:probe -- --model llama3.2-local
```

Probe results are cached under `benchmark-lab/evidence/probes/<model-id>/`. Use `--force` to re-probe:

```powershell
npm.cmd run benchmark:probe -- --model llama3.2-local --force
```

To check suite compatibility:

```powershell
npm.cmd run benchmark:probe -- --model llama3.2-local --suite benchmark-lab/locaily/tracks/basic-tool-use/suite.json
```

## Live Ollama Matrix

Run the current suite across every available Ollama model manifest:

```powershell
npm.cmd run benchmark:matrix -- --suite benchmark-lab/locaily/tracks/intent-classification/suite-ollama.example.json
```

Run a smaller matrix:

```powershell
npm.cmd run benchmark:matrix -- --suite benchmark-lab/locaily/tracks/intent-classification/suite-ollama.example.json --model-manifest llama3.2-local --model-manifest lfm25-local
```

Matrix output is draft-only:

```txt
benchmark-lab/reports/drafts/matrices/<matrix-id>.json
benchmark-lab/reports/drafts/matrices/<matrix-id>.md
```

Each model still gets its own raw run and draft summary. Review and promote individual run ids, not the matrix itself.

## Execution Modes (Basic Tool Use Track)

The execution router (`benchmark-lab/locaily/tracks/basic-tool-use/execution-router.js`) supports three modes:

| Mode | Description | When selected |
|---|---|---|
| `native` | Full tool exposure, no policy constraints | Default for scenarios without specific policy requirements |
| `policy-routed` | Scenario-specific policies injected via system prompt | Selected by POLICY_BY_SCENARIO mapping (TC-05, TC-10, TC-11, TC-12, TC-64, TC-65) |
| `runtime-constrained` | Restricted tool exposure and response modes based on policy | Explicitly requested for capability-boundary testing; stages define per-turn tool access |

Policies include: `NATIVE`, `DIRECT_RESPONSE`, `REFUSAL_REQUIRED`, `STRUCTURED_RESPONSE`, `DATE_RESOLUTION_REQUIRED`, and `TOOL_THEN_STRUCTURED_RESPONSE`.

In `runtime-constrained` mode:
- Unsupported capabilities restrict tool exposure
- `DIRECT_RESPONSE` and `REFUSAL_REQUIRED` remove all tools
- `STRUCTURED_RESPONSE` constrains response to `json_schema` format
- `DATE_RESOLUTION_REQUIRED` stages tool access across turns
- `TOOL_THEN_STRUCTURED_RESPONSE` limits to weather tool then structured output

Evidence records the execution mode used and the resolved policy for each scenario.

## Hybrid Deterministic Workflow

Run a hybrid workflow where the model selects a tool and deterministic code transforms the structured result:

```powershell
npm.cmd run benchmark:hybrid -- --model llama3.2-local --case loc-hybrid-weather-001 --trials 3
```

The `--case` value is case-insensitive. Both `LOC-HYBRID-WEATHER-001` and `loc-hybrid-weather-001` resolve to the same scenario.

### Forcing a fresh probe

```powershell
npm.cmd run benchmark:hybrid -- --model llama3.2-local --force-probe true
```

### Bypassing capability probing

```powershell
npm.cmd run benchmark:hybrid -- --model llama3.2-local --no-probe true
```

Use `--no-probe` only for diagnosis. Evidence produced without capability verification is labeled unverified.

### Interpreting hybrid outcomes

| Outcome | Meaning |
|---|---|
| PASS | Tool selection correct, transformation success, schema valid, source faithful |
| PARTIAL | Tool selected but transformation or schema had recoverable issues |
| FAIL | Wrong tool, missing fields, hallucinated tool, or transformation failure |
| SKIPPED_INCOMPATIBLE | Model failed capability probe — no scenario trials launched |
| BLOCKED_RUNTIME_STABILITY | Model causes runtime failures (e.g., Ollama crash) |

The workflow separates model-stage and transformer-stage evidence. A PASS requires both.

### Capability probing

Probe gating runs automatically before hybrid execution. The probe verifies:

* text and chat completion
* native tool-call support (standard JSON `tool_calls` format)
* guided JSON support (Ollama `format` parameter)

Incompatible models are skipped with explicit evidence. Use `--no-probe true` to bypass.

## Promote Evidence

Promotion is explicit:

```powershell
npm.cmd run benchmark:promote -- --run <run-id> --evidence <evidence-id> --approved-by <name> --note "Reviewed locally"
```

This writes compact evidence and checksum records:

```txt
benchmark-lab/evidence/summaries/<evidence-id>.json
benchmark-lab/evidence/approved/<evidence-id>.json
benchmark-lab/evidence/checksums/*.json
```

## Generate Report

```powershell
npm.cmd run report:generate -- --report <report-id> --evidence <evidence-id>
```

Reports are generated from promoted evidence only:

```txt
benchmark-lab/reports/published/<report-id>.source.json
benchmark-lab/reports/published/<report-id>.md
```

Optional title:

```powershell
npm.cmd run report:generate -- --report <report-id> --title "Benchmark Report" --evidence <evidence-id>
```

## Generate Model Card

```powershell
npm.cmd run model-card:generate -- --model <model-id> --evidence <evidence-id>
```

Model cards generated from promoted evidence are published by default:

```txt
benchmark-lab/model-cards/published/
```

Review before committing. Draft model cards remain ignored under `benchmark-lab/model-cards/drafts/`.

## Generate Qualification Record

Default qualification generation is conservative:

```powershell
npm.cmd run qualification:generate -- --model <model-id> --evidence <evidence-id>
```

Default record status is `screening`. To create role-specific evidence for routing:

```powershell
npm.cmd run qualification:generate -- --model <model-id> --evidence <evidence-id> --role fast_worker --status candidate --role-status conditional --note "Reviewed locally"
```

Use `qualified` only when the evidence genuinely supports it. Conditional is the safer default for early local evidence.

## Verify Checksums

```powershell
npm.cmd run checksum:verify -- --checksum benchmark-lab/evidence/checksums/<record>.json
```

## Qualification Policy Guidance

The Local Brain model router supports these qualification policies (set via `options.qualification_policy`):

| Policy | Behavior |
|---|---|
| `advisory` | Default. Qualification data is logged but does not block execution. |
| `reject_rejected` | Blocks models with `rejected` or `revalidation_required` status. |
| `require_qualified` | Blocks models unless qualification status is `qualified`. |
| `require_qualified_or_conditional` | Blocks models unless status is `qualified` or `conditional`. |

The operator guide creates evidence and qualification records; it does not itself change runtime defaults. Runtime policy changes require modifying the caller's `options.qualification_policy` value.

## Evidence Interpretation Rules

- A passing suite supports only the tested contract (Track + prompt version + hardware context).
- Evidence should name the model, runtime, suite, prompt/contract version, and hardware context.
- Narrow fixtures must not be turned into general model claims.
- Model-card prose must remain traceable to promoted evidence.
- Checksum integrity does not prove benchmark quality; it proves artifact immutability since hashing.

## Companion Status

With the companion running:

```txt
GET /benchmark/status
GET /health
```

`/benchmark/status` is read-only. It reports qualification and checksum counts; it does not run benchmarks or promote evidence.

## Non-Live Verification

Run before committing Benchmark Lab framework changes:

```powershell
npm.cmd run benchmark:test
npm.cmd run benchmark:status-smoke
node scripts/contract-test.js
```

Optional full server smoke, with the companion already running:

```powershell
node scripts/smoke-test.js
```

## Commit Checklist

Commit:

- schemas and fixtures
- engine code
- Locaily suites/test packs
- approved evidence you have reviewed
- checksums for approved evidence
- qualification records you intentionally generated
- published reports you reviewed

Do not commit:

- `benchmark-lab/results/raw/`
- `benchmark-lab/reports/drafts/`
- `benchmark-lab/model-cards/drafts/`
- `benchmark-lab/cache/`
- `benchmark-lab/models/files/`
- `benchmark-lab/runtime-logs/`
- `benchmark-lab/evidence/probes/`
- temporary smoke-test evidence
