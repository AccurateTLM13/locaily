# Prompts

Versioned benchmark prompt material for Locaily worker-contract and prompt-regression tests.

## Structure

- **Prompt IDs** — Stable identifiers for each distinct prompt template
- **Prompt versions** — Semantic version tracked per prompt; bump when behavior changes
- **Hashes** — Used where prompt integrity verification is required
- **Relationship to Track contracts** — Each prompt belongs to a specific Track + contract version
- **Expected output schema** — Structured schema the model output must match for a passing case
- **Regression packs** — Grouped prompt variants used to detect regressions across model updates

## Prompt Storage

Prompts in this directory are directly stored as files referenced by suite configurations. They are not generated from templates at benchmark time.

## Revalidation Requirements

When a prompt is edited:
- The prompt version must be incremented
- The content hash must be regenerated
- Existing evidence tied to the old prompt version is invalidated
- New benchmark runs are required before any promotion or qualification update

Do not edit a benchmarked prompt without updating its version, hash, and evidence expectations.
