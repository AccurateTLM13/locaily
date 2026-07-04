# Benchmark Lab Operator Guide

This guide covers the local workflow for running Benchmark Lab and deciding what, if anything, should become trusted evidence.

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
npm.cmd run report:generate -- --report <report-id> --title "Benchmark Report" --evidence <evidence-id>
```

Reports are generated from promoted evidence only:

```txt
benchmark-lab/reports/published/<report-id>.source.json
benchmark-lab/reports/published/<report-id>.md
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

To create role-specific evidence for routing:

```powershell
npm.cmd run qualification:generate -- --model <model-id> --evidence <evidence-id> --role fast_worker --status candidate --role-status conditional --note "Reviewed locally"
```

Use `qualified` only when the evidence genuinely supports it. Conditional is the safer default for early local evidence.

## Verify Checksums

```powershell
npm.cmd run checksum:verify -- --checksum benchmark-lab/evidence/checksums/<record>.json
```

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
- temporary smoke-test evidence
