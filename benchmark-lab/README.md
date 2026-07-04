# Benchmark Lab

Benchmark Lab is Locaily's local evaluation subsystem. It produces validated evidence, model cards, and qualification records that can inform model routing, track qualification, worker-contract testing, hardware profiling, and prompt regression testing.

The lab lives in this repository while its contracts and outputs are tightly coupled to Locaily tracks, model roles, schemas, and orchestration behavior.

## Boundaries

- `engine/` contains reusable benchmark execution code.
- `locaily/` contains Locaily-specific suites, fixtures, prompts, and worker contracts.
- `schemas/`, `contracts/`, and `validators/` define benchmark-facing validation surfaces.
- `evidence/` contains curated, reviewable evidence.
- `qualifications/` contains compact records consumed by runtime and orchestration code.
- `results/raw/`, `cache/`, `models/files/`, and `runtime-logs/` are local-only and ignored by Git.

The companion runtime should consume qualification records and approved summaries. It should not import Benchmark Lab runner code or parse raw benchmark outputs.

## First Milestone

The first practical milestone is deliberately narrow:

1. Define qualification record schema.
2. Register one Locaily-specific benchmark suite.
3. Run one model role against one track contract using a mock or Ollama adapter.
4. Persist raw local results.
5. Promote a compact summary and qualification record after review.
6. Generate a draft model card from approved evidence.

## Operator Workflow

See [OPERATOR_GUIDE.md](./OPERATOR_GUIDE.md) for exact commands, trust boundaries, live Ollama validation steps, evidence promotion, checksum verification, and commit policy.
