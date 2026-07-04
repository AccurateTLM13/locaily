# Benchmark Lab

**Status:** Initial architecture and scaffold  
**Subsystem:** `benchmark-lab/`  
**Canonical runtime-facing output:** qualification records  
**Related draft:** `docs/02-track-system/benchmark-lab.md`

Benchmark Lab is Locaily's local evaluation subsystem. It supports model selection, track qualification, worker-contract testing, hardware profiling, prompt regression testing, model-card generation, and orchestration/routing decisions.

It is not a public leaderboard and it is not a replacement for the Local Brain runtime. It produces evidence that the runtime can consume.

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

The runtime consumes qualified model data. Benchmark Lab produces and validates that data.

Keep Benchmark Lab in the main Locaily repository for now because its first useful outputs depend on Locaily's existing schemas, contracts, model registry, and track definitions. A separate repository would add release and contract drift before the subsystem is stable.

## Non-Goals

- Do not commit large model binaries, provider caches, or raw benchmark outputs.
- Do not claim benchmark results without committed or attached evidence.
- Do not make the companion runtime import benchmark runner code.
- Do not promote models automatically from quick-screen runs.
- Do not treat one aggregate score as a substitute for track-specific qualification.

## Repository Layout

```txt
benchmark-lab/
|-- README.md
|-- lab.config.example.json
|-- configs/
|   `-- suites/
|-- engine/
|   |-- adapters/
|   |-- cli/
|   |-- reporters/
|   |-- runners/
|   `-- scorers/
|-- locaily/
|   |-- fixtures/
|   |-- prompts/
|   |-- test-packs/
|   |-- tracks/
|   `-- worker-contracts/
|-- contracts/
|-- schemas/
|-- validators/
|-- evidence/
|   |-- approved/
|   |-- checksums/
|   |-- failures/
|   `-- summaries/
|-- qualifications/
|   |-- hardware/
|   |-- models/
|   `-- tracks/
|-- model-cards/
|-- models/
|   |-- files/
|   `-- manifests/
|-- reports/
|   |-- published/
|   `-- templates/
|-- results/
|   |-- raw/
|   `-- tmp/
|-- cache/
`-- runtime-logs/
```

## Artifact Types

`engine/` contains reusable benchmark machinery: runners, adapters, scorers, reporters, and CLI entrypoints.

`locaily/` contains Locaily-specific benchmark assets: track suites, prompt-regression packs, worker contracts, fixtures, and test packs.

`contracts/`, `schemas/`, and `validators/` define benchmark-facing validation surfaces. Canonical runtime API contracts remain in `docs/01-architecture/`; benchmark contracts should reference or mirror those contracts intentionally.

`results/raw/` contains local run output and must remain ignored.

`evidence/` contains compact, reviewed evidence promoted from raw runs.

`qualifications/` contains compact JSON records consumed by model routing and orchestration.

`model-cards/` contains human-readable generated summaries backed by approved evidence.

## Data Flow

```txt
suite config
   |
benchmark runner
   |
raw local results
   |
validators and scorers
   |
approved summaries and evidence
   |
qualification records
   |
runtime model routing hints
```

Raw outputs are useful for inspection, but the companion runtime should never parse raw benchmark result folders. Runtime integration should use only stable qualification records and approved summaries.

## Runtime Integration

The runtime/orchestration layer should consume Benchmark Lab output through a small loader, for example:

```txt
companion/core/model-qualification-loader.js
```

That loader should:

- Load qualification JSON from `benchmark-lab/qualifications/`.
- Validate schema versions.
- Return model-role and track suitability metadata.
- Fail gracefully when qualification data is missing.
- Avoid importing `benchmark-lab/engine/`.
- Avoid parsing raw benchmark logs or temporary reports.

Routing should treat qualification records as evidence-backed hints. It should still preserve configured model roles, provider availability checks, and existing fallback behavior.

## Qualification Policy

Runtime routing defaults to advisory use of qualification records. Model steps include matching qualification evidence in metadata when available, but the default policy does not block execution.

Callers may opt into stricter behavior through `options.qualification_policy`:

- `advisory`: attach qualification metadata when available; never block.
- `reject_rejected`: block models with `rejected` or `revalidation_required` qualification status.
- `require_qualified`: require a matching `qualified` role/track record.
- `require_qualified_or_conditional`: require a matching `qualified` or `conditional` role/track record.

This keeps current local-first workflows usable while allowing validation-sensitive runs to require Benchmark Lab evidence.

## Status Visibility

The companion exposes a read-only status endpoint:

```txt
GET /benchmark/status
```

It reports qualification record counts, invalid qualification records, checksum counts, status distribution, role distribution, and the latest generated qualification timestamp. `GET /health` includes a compact Benchmark Lab summary and points to this endpoint.

The status endpoint reads generated records only. It does not run benchmarks, promote evidence, generate qualifications, or import Benchmark Lab engine code.

## Qualification Record

The first schema is:

```txt
benchmark-lab/schemas/qualification-record.schema.json
```

A qualification record represents a specific evidence-backed status for a model, track, worker contract, or hardware profile.

Qualification states:

```txt
untested
screening
candidate
qualified
conditional
rejected
revalidation_required
```

A model must not remain qualified automatically after a relevant dependency changes, including model digest, runtime provider, prompt contract, schema, test pack, validator logic, or hardware profile.

## Git Storage Policy

Commit:

- Benchmark Lab source code and docs.
- Example configs and suite configs.
- Schemas, contracts, validators, manifests, and checksums.
- Compact JSON summaries.
- Approved evidence.
- Curated failure examples.
- Generated model cards.
- Qualification records.
- Published Markdown reports.

Exclude:

- Raw benchmark outputs.
- Temporary results.
- Downloaded model binaries.
- Provider caches.
- Runtime logs.
- Local configs and secrets.
- Temporary report exports.

## Evidence Promotion

Evidence promotion should be explicit:

1. Run a benchmark suite.
2. Store raw output locally under ignored `results/raw/`.
3. Validate cases with deterministic validators.
4. Generate a compact summary.
5. Review failures and privacy concerns.
6. Promote selected summaries or examples into `evidence/`.
7. Generate or update qualification records.
8. Generate model cards from approved evidence.

Quick-screen runs can inform development but should not create `qualified` records.

## Checksums

Promoted evidence, approved evidence summaries, qualification records, and draft model-card artifacts should have checksum records under:

```txt
benchmark-lab/evidence/checksums/
```

Checksum records use `schemaVersion: benchmark.checksum.v1` and store SHA-256 hashes plus the artifact path. Use:

```txt
npm run checksum:verify -- --checksum benchmark-lab/evidence/checksums/<record>.json
```

Checksum records are part of the reviewable evidence chain. They do not prove benchmark quality by themselves; they prove that a reviewed artifact has not changed since the checksum was generated.

## Hardware Profiles

Hardware profiles should be specific enough to explain performance and memory behavior without leaking private machine details. Prefer stable profile IDs and broad specs over absolute local paths, usernames, or private device names.

## Prompt Regression

Prompt-regression packs should pin:

- Prompt or worker-contract version.
- Prompt hash.
- Target track.
- Expected output schema.
- Validator set.
- Test-pack version.
- Inference settings.

Prompt changes that affect benchmark behavior require a new contract version or a revalidation record.

## Track Qualification

Track qualification should validate the model against the actual Locaily track contract. A model can be qualified for one track or role and rejected for another.

Track-level records should describe:

- Track ID.
- Contract ID and version.
- Required validators.
- Thresholds.
- Evidence IDs.
- Known conditions.
- Revalidation triggers.

## Model Cards

Model cards are generated human-readable summaries. They must be backed by approved evidence and qualification records.

Model cards may describe:

- Identity and runtime.
- Tested hardware profile.
- Qualified tracks and roles.
- Observed strengths.
- Known failure modes.
- Conditions and guardrails.
- Evidence freshness.

They must not invent claims absent from evidence.

## Future Extraction Criteria

Do not split Benchmark Lab out of the repository yet.

Move generic engine code into a separate `locaily-benchmark-lab/` repository only when at least one concrete condition is true:

- The benchmark engine becomes useful independently of Locaily.
- Other projects need to consume it.
- Its release cycle materially diverges from Locaily.
- Benchmark artifacts make the main repository too large.
- External contributors primarily work on evaluation tooling.
- It becomes a standalone CLI, package, or product.

If extraction happens, keep Locaily-specific tracks, contracts, test packs, curated evidence, and generated qualification records in the main Locaily repository.

## Immediate Implementation Steps

1. Keep the initial scaffold in `benchmark-lab/`.
2. Validate the first qualification-record schema with local tests.
3. Add a minimal mock-runtime benchmark path before using live Ollama.
4. Add one Locaily-specific suite targeting a narrow worker contract.
5. Produce one compact summary and one draft qualification record.
6. Add a runtime loader only after a real qualification record exists.
