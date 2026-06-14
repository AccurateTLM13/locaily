# Validation: L2 Live Ollama + Memory Bridge

## Claim Under Test

On target hardware, the validated chain works end-to-end:

```txt
Live PageSpeed capture
  → slim Lighthouse input (under input-gate size limit)
  → local Ollama analyze-report (orchestrated)
  → schema-valid handoff result
  → Memory Bridge compose-handoff (allowlist-based)
  → metric-preserving Markdown handoff
```

**Out of scope for this milestone:** full multi-model Pit Crew routing, extension ↔ Local Brain bridge, writeback apply, embeddings, benchmark claims, or automatic score improvement.

## Status

**Passed** manual validation (2026-06-13).

**Passed** console validation — **L2 Console + Memory Bridge — Post-Cleanup Validation Pass** (2026-06-14).

Prior controlled validation (mock AI path): [memory-bridge-lighthouse-v0.md](./memory-bridge-lighthouse-v0.md).

L1 contract baseline: [../02-workflows/lighthouse-handoff-validation.md](../02-workflows/lighthouse-handoff-validation.md).

## L2 Console + Memory Bridge — Post-Cleanup Validation Pass

**Validation ID:** `validation_20260614T034940Z_ba2b3a4126`

**Mode:** `l2_ollama_memory` — live PageSpeed → slim input → Ollama `analyze-report` → Memory Bridge `compose-handoff` → schema → metric preservation → privacy audit → artifacts saved.

| Area | Result |
|------|--------|
| Live PageSpeed capture | Pass |
| Local Ollama analyze-report | Pass — `ollama` / `llama3.2` |
| Compose handoff with Memory Bridge | Pass — `memory.used: true`, no warnings |
| Schema validation | Pass |
| Metric preservation | Pass — `performance at 74` |
| Privacy/audit | Pass — 50 events checked |
| Warnings | None |

**Cleanup wins confirmed (before/after):**

- Earlier console runs showed `File selection capped at maxFiles=6.`; post-cleanup run has `warnings: []`.
- Dedicated project page used: `wiki/projects/Lighthouse Handoff.md` (plus index, log, topic, concept, entity files).
- Executive Summary produced real developer prose (`fallbacks_used: []` on analyze path).

**Console artifact bundle** (local, gitignored under `data/validation/`):

```txt
validation_20260614T034940Z_ba2b3a4126
├── console-validation_*-pagespeed-raw.local.json
├── console-validation_*-lighthouse-slim.local.json
├── console-validation_*-analyze-report.local.json
├── console-validation_*-compose-handoff.local.json
├── console-validation_*-handoff.local.md
└── console-validation_*-summary.local.json
```

**Non-blocking model noise logged:** Executive Summary did not lead with weakest score in model prose alone (addressed by deterministic lead-sentence guardrail); render-blocking mislabeled as accessibility in one fix reason (addressed by category guardrail in compose).

## What Was Proven

| Step | Result |
|------|--------|
| Live PageSpeed JSON slimmed locally | Pass — avoids `INPUT_TOO_LARGE` (20k char gate) |
| `analyze-report` with live Ollama | Pass — `ok: true`, `meta.schema_valid: true` |
| Provider / model | `ollama` / `llama3.2` |
| `compose-handoff` with memory `auto` | Pass — `memory.used: true` |
| Allowlisted memory reads | Pass — `filesUsed`: `index.md`, `log.md` only |
| Metric preservation | Pass — `performance at 76` in `clientSummary` and handoff |
| Guardrails section | Pass — markdown includes `## Project Context Used` |
| Privacy | Pass — no vault paths in markdown, JSON result, or audit metadata (spot-checked) |

## Test Environment

| Item | Value |
|------|--------|
| Test date | 2026-06-13 |
| Site | `https://lemonteed.com/` |
| Capture | Live PageSpeed / Lighthouse mobile report (local artifact) |
| Slim scores | performance **76**, accessibility **100**, bestPractices **100**, seo **100** |
| Weakest category | performance at 76 |
| Server | `http://127.0.0.1:31313` |
| Provider | Ollama (`127.0.0.1:11434`) |
| Model | `llama3.2` |
| Analyze duration | ~7284 ms (`meta.duration_ms` on `analyze-report`) |
| Memory mode | Allowlist-based local Markdown vault (private; path not committed) |
| Writeback | Disabled (`writeback: false`) |

GPU offload may have been active per local Ollama logs during the run; this milestone does **not** certify a specific GPU model or sustained throughput — only that live Ollama orchestration completed successfully on the test machine.

## Local Evidence Artifacts

Stored under `data/validation/` (gitignored via `data/`). Filenames only — do not commit private vault paths or machine-specific config.

| Artifact | Contents |
|----------|----------|
| `live-pagespeed-example-mobile.local.json` | Full PageSpeed capture (not sent to API) |
| `live-lighthouse-slim.local.json` | Slim `url`, `scores`, `opportunities` sent to `analyze-report` |
| `live-l2-analyze-report.local.json` | L2 Ollama orchestrated `analyze-report` response |
| `live-l2-compose-memory.local.json` | Memory-enabled `compose-handoff` response |

Related PowerShell session logs were captured locally during the run.

## Validated Chain (Recorded)

1. **Capture** — Live PageSpeed mobile report for `https://lemonteed.com/`.
2. **Slim** — Extract scores and top opportunities into a small JSON payload.
3. **L2 analyze** — `POST /tasks/run` → `lighthouse-handoff` / `analyze-report`, `execution_mode: orchestrated`, memory off.
4. **Schema** — `meta.schema_valid: true`; priority fixes aligned with performance opportunities.
5. **Memory compose** — `POST /tasks/run` → `compose-handoff`, `memory.enabled: auto`, using analyze output artifacts.
6. **Output** — Markdown includes `Project Context Used`; `clientSummary` preserves **performance at 76**.

## Caveats (Honest Limits)

1. **L2 + Memory Bridge only** — Does not prove full multi-model Pit Crew routing across tracks or roles beyond this workflow path.
2. **Rich memory context (2026-06-14 update)** — Console post-cleanup run used six allowlisted files including `wiki/projects/Lighthouse Handoff.md`. Earlier 2026-06-13 script run used only `index.md` and `log.md` before the project page existed.
3. **Checklist duplication** — Live run showed duplicate checklist lines when matched-fix steps repeated; deduplication fix tracked in code (see regression test).
4. **Single site / single run** — One URL, one hardware session; not a golden-set or multi-site study.
5. **No extension bridge** — PageSpeed slimming was manual; L4 extension normalization is not implemented.

## What This Does Not Prove Yet

| Area | Status |
|------|--------|
| L3 — Extension standalone Markdown quality | Not measured in this repo |
| L4 — Extension ↔ Local Brain HTTP bridge | Not implemented |
| Rich project/topic memory extraction | **Partially validated** — dedicated project page + six files on console run (2026-06-14) |
| Multi-model role routing at scale | Not validated |
| Handoff quality vs human-written notes | No rubric or golden set |
| Production PageSpeed analysis accuracy | PSI parsing lives in extension; not certified here |
| Writeback apply / automatic wiki edits | Deferred (proposal-only in v0) |
| Memory Bridge on workflows other than Lighthouse Handoff | Deferred by design |

## Regression Coverage

Automated module-level regression (no live Ollama required):

```bash
node scripts/lighthouse-memory-compose-regression.js
```

Also exercised via smoke checks when the companion server is running:

```bash
node scripts/smoke-test.js
```

## Recommended Next Steps

1. Add or refresh a **Lighthouse Handoff** project memory page in the private vault (`wiki/projects/`) with `## Constraints` and `## Decisions`.
2. Re-run compose with standard task wording: `Generate coding-agent handoff from PageSpeed report`.
3. Add a committed slim fixture under `examples/lighthouse-handoff/` for repeat L2 runs.
4. Stay **Lighthouse-only** for Memory Bridge until a second validation pass shows richer `filesUsed` and fewer warnings.

## Reproduce (Manual)

See [memory-bridge-manual-test-path.md](./memory-bridge-manual-test-path.md) and [memory-bridge-local-setup.md](./memory-bridge-local-setup.md).

**Do not** POST the full PageSpeed JSON to `compose-handoff`. Slim first, then analyze, then compose.

## Related

- [memory-bridge-lighthouse-v0.md](./memory-bridge-lighthouse-v0.md)
- [../02-workflows/lighthouse-handoff-validation.md](../02-workflows/lighthouse-handoff-validation.md)
- [../02-workflows/lighthouse-handoff.md](../02-workflows/lighthouse-handoff.md)
- [../04-product/roadmap.md](../04-product/roadmap.md)
