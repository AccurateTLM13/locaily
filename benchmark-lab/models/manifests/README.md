# Model Manifests

Commit compact model manifests and identity metadata. Do not commit model binaries or provider caches.

## Purpose

Each manifest describes a model available for benchmark runs. Manifests declare identity metadata, not proven qualification.

## Fields

- **modelId** — Stable manifest identifier (e.g., `llama3.2-local`)
- **runtimeModelName** — The model name passed to the Ollama API
- **provider** — Runtime provider (e.g., `ollama`)
- **source** — Model source or registry
- **capabilities** — Declared capabilities (metadata only; not a substitute for capability probing or benchmark qualification)
- **installed/available** — Whether the model is expected to be present on the local runtime
- **digest** — Optional model digest for version pinning

## Important Distinctions

- **Model identity** is what the manifest records.
- **Qualification** is what Benchmark Lab evidence and records establish.
- A manifest's `capabilities` field is declared metadata, not proven qualification.
- The `mock-intent-classifier` manifest is a harness fixture only. It must not be treated as a real runtime model.

## Revalidation Triggers

When the runtime model changes (new digest, version bump, provider change), existing qualification records tied to the old identity are candidates for revalidation. The manifest `digest` field, where populated, helps detect such changes.

## Safety

- No model binaries are committed.
- No provider caches are committed.
- To add a local Ollama manifest safely: copy an existing manifest, change `modelId` and `runtimeModelName` to match the installed model, and commit only the JSON metadata file.
