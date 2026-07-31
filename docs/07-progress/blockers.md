# Blockers

Active impediments. Remove items when resolved; log resolution in [progress-log.md](./progress-log.md).

**Updated:** 2026-07-31 (DEV-LOOP-01 completion)

## Open

| Blocker | Impact | Mitigation |
|---|---|---|
| External publication of local CTK-01/DEV-LOOP-01 branches is not approved | Public `main` cannot yet verify either implementation | Review the local branches and explicitly approve push/PR/merge |
| PX6 requires external testers and a second physical device | External-validation milestone cannot complete in the coding runner | Supply tester results and authenticated two-device pilot hardware |
| Extension ↔ Local Brain HTTP bridge not implemented | L4 validation blocked | Spec: [../03-workflows/lighthouse-handoff-extension-integration.md](../03-workflows/lighthouse-handoff-extension-integration.md) |
| No persistent job status API (`GET /jobs/{id}/status`) | Clients cannot poll long track runs | In-memory jobs exist today; persistence is future work |

## Resolved

| Blocker | Resolution |
|---|---|
| CTK-01 delivery gates require a clean committed feature branch | Resolved by isolating CTK-01 on `codex/ctk-01-completion`; unrelated shell/server and CTK-02 files remain in the original worktree |
| `dev:prepare` assumed `.git` was a directory | Resolved by using `git rev-parse --git-path` so linked worktrees can prepare commits |
| `dev:validate` could not record required manual-check acknowledgements | Resolved with explicit check IDs, actor, and timestamp arguments validated against the selected profile |
| Validation profile commands forced every command through Node and re-ran strict status against an unrecognized transient state | Resolved with direct Node/npm dispatch, correct optional-check labeling, and `validating` milestone recognition |
| Step input mapping hardcoded for Lighthouse | Resolved by M2 (DealSniper track) and declarative `input_map` — see [../02-track-system/step-input-mapping.md](../02-track-system/step-input-mapping.md) |
| Crew embedded only in lighthouse tool | Extracted to `companion/crew/` — see gap analysis |
| No `/tracks/run` endpoint | Implemented — proof track on mock provider |
| Benchmark Lab acceptance | Milestone 1 complete and operator-ready |

## Not Blockers (Explicitly Deferred)

- DAG runner / graph planner
- Relay Node protocol and connectors
- Automatic track classifier
- Desktop Companion UI
- Broader model qualification coverage (follow-on work, not required by active slice)
