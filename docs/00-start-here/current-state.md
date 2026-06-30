# Current State

Blunt snapshot of what Locaily is **right now**. When docs disagree with this file, check running code first, then update this file.

**Updated:** 2026-06-26

## What Works

- **Local Brain server** - `companion/server.js` on `127.0.0.1:31313`
- **`POST /tasks/run`** - canonical single-tool entry (plus legacy `/analyze`)
- **`POST /tracks/run`** and **`GET /tracks`** - Pit Crew track runner
- **Tool registry** - manifest-backed packs under `tool-packs/`
- **Lighthouse Handoff track** - `website_audit.lighthouse_handoff` in `companion/pit-crew/tracks/`
- **DealSniper workflow track** - `marketplace.dealsniper` in `companion/pit-crew/tracks/`
- **Declarative step `input_map`** - tool and model steps via `companion/pit-crew/step-input.js`
- **Workflow orchestration** - `POST /workflows/plan`, `POST /workflows/run`, `GET /orchestration/*` (`companion/orchestration/`)
- **Model roles** - role slots in track steps and routing options
- **Provider routing** - Ollama + mock via `companion/providers/router.js`
- **Audit / scoreboard hooks** - `GET /audit`, `GET /scoreboard`, per-run recording
- **Memory Bridge v0** - `/memory/status`, `/memory/context-pack`, `/memory/writeback/propose` (disabled by default)
- **Operator Log editorial tracks** - experimental discovery and human-selected draft proposal paths
- **Benchmark Lab scaffold** - `benchmark-lab/`, `GET /benchmark/status`, schemas, mock run loop, evidence summaries, model cards, and qualification records
- **Smoke and contract tests** - `scripts/smoke-test.js`, `scripts/contract-test.js` (**56/56** smoke on clean server with memory disabled)

## What Is Partial

- **Track runner** - linear pipeline only; four workflow tracks in catalog
- **Operator Log editorial workflow** - source-audited discovery and draft validation implemented; model quality and editorial ledger remain experimental
- **Benchmark Lab live qualification depth** - schema/mock loop and first evidence path exist; broader live-model qualification coverage remains incremental
- **Model scorecards / skill sheets** - direction exists; compact qualification records are the current evidence-backed runtime surface
- **Memory Bridge** - v0 endpoints + optional Lighthouse `compose-handoff` preflight; no apply/search/embeddings
- **Console validation** - local validation UI exists; not a finished product surface
- **Fallback ladder** - partial (`retry_same_model_once`); no full escalation handler
- **Step input mapping** - declarative `input_map` on all track steps; legacy step-id fallbacks removed from `step-input.js`

## What Is Not Built Yet

- **Track planner** - no automatic decomposition from free-form requests
- **DAG execution** - steps run in file order only
- **NearbyNode protocol** - conceptual docs only
- **Automatic track classification** - no classifier selects workflow + track
- **Real Capability Registry** - tool packs exist; unified capability index does not
- **Worker registry** - models routed by role, not a full worker catalog
- **Automatic model swapping / Model Garage auto-switching** - proposed only
- **Extension to Local Brain HTTP bridge** - spec exists; not implemented end-to-end

## Current Proof Workflows

**Lighthouse Handoff** - `website_audit.lighthouse_handoff`

Exercises extraction, classification, prioritization, validation, markdown assembly, model routing, deterministic tool steps, and deterministic fallback when runtime is unavailable.

**DealSniper** - `marketplace.dealsniper`

Three-step track: prepare listing -> model analysis -> schema validation. Proves a second workflow on the same declarative track runner.

**Benchmark Lab** - `benchmark-lab/`

Exercises controlled local benchmark schemas, mock runtime runs, evidence promotion, report/model-card generation, checksum verification, and compact qualification records consumed by Local Brain.

See [../03-workflows/lighthouse-handoff.md](../03-workflows/lighthouse-handoff.md), [../03-workflows/dealsniper.md](../03-workflows/dealsniper.md), and [../02-systems/benchmark-lab.md](../02-systems/benchmark-lab.md).

## Current Architecture Stage

**Pipeline-stage track runner plus Benchmark Lab evidence scaffold**, not graph-stage planner.

Locaily dispatches **tracks** (units of work with contracts), not raw models. Workflows compose tracks. Models and tools plug into track steps. Benchmark Lab produces evidence and qualification records; Local Brain consumes compact records, not raw benchmark runs.

## Source of Truth Order

1. Running code
2. Root `README.md`
3. This file
4. [../07-progress/build-status.md](../07-progress/build-status.md)
5. [../01-architecture/](../01-architecture/)
6. [../02-track-system/](../02-track-system/)
7. [../03-workflows/](../03-workflows/)
8. Archived docs - historical context only

## Now / Next / Later

| Layer | Focus |
|---|---|
| **Now** | Land Benchmark Lab with strict evidence boundaries |
| **Next** | Benchmark Lab live qualification depth; extension bridge; Memory Bridge private vault validation |
| **Later** | Simple dependency graphs; broader model qualification coverage |
| **Research** | DAG planner generated by Local Brain |
| **Archive** | Old companion-only architecture, pre-track planning docs |
