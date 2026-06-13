# Validation: Memory Bridge + Lighthouse Handoff v0

## Claim Under Test

Optional Memory Bridge context on `lighthouse-handoff` `compose-handoff` improves guardrails and project-specific constraints **without** overriding Lighthouse/PageSpeed metrics or leaking private vault content into audit logs.

**Out of scope:** embeddings, writeback apply, multi-vault, other workflows, automatic writeback.

## Status

**Passed** controlled validation (2026-06-13).

## Test Environment

| Item | Value |
|------|-------|
| Test date | 2026-06-13 |
| Server | `http://127.0.0.1:31313` — running |
| Smoke baseline | **47/47** (memory disabled; pre-validation) |
| Smoke during memory-enabled server | 44/47 — expected drift (3 checks assert disabled memory) |
| Vault mode | Wiki-style private Second Brain (local path, not committed) |
| Lighthouse report | Real capture via Lighthouse CLI 12.8.2 for `https://example.com/` (mobile) |
| Report scores | performance 100, accessibility 100, bestPractices 96, **seo 80** (weakest) |
| Writeback | Disabled for validation (`writeback: false`) |

Local capture artifacts live under `data/validation/` (gitignored). No private vault content committed to this repo.

## Vault Configuration (wiki-style)

**Allowed:** `index.md`, `log.md`, `SCHEMA.md`, `wiki/topics/`, `wiki/concepts/`, `wiki/entities/` (and `wiki/projects/` when present)

**Blocked:** `raw/`, `private/`, `personal/`, `.git/`, `.memory-bridge/writeback-inbox/`

**Vault probe:** readable, 22 topic files, 0 project files, `raw/` not listed.

Setup reference: [memory-bridge-local-setup.md](./memory-bridge-local-setup.md)

## Context Pack (real vault)

| Field | Result |
|-------|--------|
| `contextPackId` | `ctx_lighthouse-handoff-generate-coding-agent-handoff-from-pagespeed-report` |
| `filesUsed` | `index.md`, `log.md`, and matched `wiki/topics/` + `wiki/entities/` pages (4 files total) |
| Warnings | `No project page matched 'Lighthouse Handoff'.` (no `wiki/projects/` page yet) |

## Four Output Modes (same Lighthouse report)

| Mode | Memory | AI | Project context section | Weakest score in summary | Notes |
|------|--------|----|-------------------------|--------------------------|-------|
| Standard | off | off | No | seo at 80 | Deterministic compose only |
| Memory-only | on | off | **Yes** | seo at 80 | Guardrails/disclaimer added |
| AI-only | off | on (mock orchestrated) | No | seo at 80 | Pit crew analyze path |
| AI + Memory | on | on + compose | **Yes** | seo at 80 | AI summary + memory guardrails |

### Evaluation

| Question | Result |
|----------|--------|
| Did memory improve guardrails? | **Yes** — "Project Context Used" + metrics-authority disclaimer |
| Did memory improve project-specific constraints? | **Partial** — relevant handoff topic matched; no dedicated project page |
| Did memory add useful prior context? | **Yes** — handoff simulation topic + agent node entity |
| Did memory add noise? | **Low** — one matching warning (missing project page) |
| Did memory override Lighthouse metrics? | **No** — all modes report seo at 80, impact Medium |
| Private content leak in handoff output? | **No full file dumps** — compact context section only |
| Private content leak in audit? | **No** — redaction checks passed |

## Privacy Checks

| Check | Result |
|-------|--------|
| `raw/` blocked from reads | Pass |
| Audit: no excerpts stored | Pass |
| Audit: no writeback bodies | Pass |
| Audit: no `vaultPath` value | Pass |
| `GET /memory/status` hides full path | Pass |
| Writeback inbox proposal (optional manual test) | One proposal file created in private vault inbox; not auto-applied |

**Note:** `POST /memory/context-pack` returns truncated excerpts to the caller by design. Audit logs and Lighthouse handoff markdown do **not** store full excerpts.

## Metric Preservation Checks

- Weakest category: **seo at 80** from real Lighthouse capture.
- Standard, memory-only, and AI+memory compose outputs all state: `lowest score is seo at 80`.
- `estimatedImpact`: **Medium** unchanged across modes (derived from metrics, not memory).

## What Improved

- Optional memory adds a clear **Project Context Used** section without changing score narrative.
- Real wiki vault files were matched to task-relevant topic and entity pages.
- Audit redaction held under memory-enabled HTTP exercise (11 `memory-bridge` events inspected).

## What Did Not Improve

- No `wiki/projects/Lighthouse Handoff.md` in vault — project match fell back to topics/entities only.
- Context pack had empty `knownConstraints` / `keyDecisions` extraction from matched pages (heading structure gap).
- Memory-enabled server causes 3 smoke checks (disabled-memory assertions) to fail — run smoke with memory disabled for CI baseline.

## Recommended Next Step

1. **Stay Lighthouse-only** for one more cycle. Add `wiki/projects/Lighthouse Handoff.md` to the private vault with `## Constraints` and `## Decisions` before expanding to other workflows.
2. Re-run validation after project page exists to confirm fewer warnings and richer constraints.
3. Keep writeback proposal-only; review inbox manually before any future `/apply` work.
4. Do **not** expand to embeddings/NearbyNode until Lighthouse+memory validation repeats cleanly on your hardware with Ollama (optional L2).

## Expansion Recommendation

**Keep Memory Bridge Lighthouse-only for now.** Evidence supports optional guardrails without metric regression. Expand to a second workflow only after:

- A dedicated `wiki/projects/Lighthouse Handoff.md` exists in the private vault
- A second end-to-end validation run shows constraint extraction working
- Live Ollama orchestration validation (L2) is recorded separately

## Evidence Commands

```powershell
# Baseline smoke (memory disabled in companion/config.json)
node scripts/smoke-test.js

# Controlled validation (enable memory locally per memory-bridge-local-setup.md)
$env:MEMORY_VALIDATION_VAULT_PATH = "C:/path/to/your/second-brain"
node scripts/memory-bridge-lighthouse-validation.js
```

Manual path: [memory-bridge-manual-test-path.md](./memory-bridge-manual-test-path.md)

## Related

- [memory-bridge-local-setup.md](./memory-bridge-local-setup.md)
- [../01-architecture/memory-bridge.md](../01-architecture/memory-bridge.md)
- [../02-workflows/lighthouse-handoff.md](../02-workflows/lighthouse-handoff.md)
