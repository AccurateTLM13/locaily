# Locaily Benchmarks

Locaily-specific benchmark assets live here. These assets may reference Locaily model roles, track definitions, prompt contracts, worker contracts, fixtures, and orchestration expectations.

## Purpose

This directory contains Locaily-specific contracts and evidence inputs layered on the reusable benchmark engine.

```txt
engine/ = reusable evaluation machinery
locaily/ = Locaily-specific contracts and evidence inputs
```

## Contents

- **Tracks** — Suite configs, fixtures, and contracts for Locaily Track benchmarks (intent-classification, basic-tool-use)
- **prompts** — Versioned benchmark prompt material for worker-contract and prompt-regression tests
- **fixtures** — Test fixtures referenced by suites
- **test packs** — Contract-specific case bundles
- **worker contracts** — Expected behavior contracts for model-backed workers
- **suites** — Runnable benchmark suite definitions

## Boundary Warning

Locaily-specific benchmark results must not be interpreted as general-purpose benchmark leadership. Evidence supports the tested Track contract only.

Generic benchmark engine code should not live in this directory.
