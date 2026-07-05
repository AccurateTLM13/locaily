# Project Index

Master index of Locaily documentation. Prefer [repo-map.md](./repo-map.md) for a quick tree view.

| Path | Purpose | Status |
|---|---|---|
| [README.md](./README.md) | Start here entry | current |
| [current-state.md](./current-state.md) | Blunt implementation snapshot | current |
| [current-vision.md](./current-vision.md) | Umbrella vision | current |
| [glossary.md](./glossary.md) | Terminology | current |
| [repo-map.md](./repo-map.md) | Docs + code tree | current |
| [project-index.md](./project-index.md) | This index | current |
| **Architecture** | | |
| [../01-architecture/locaily-overview.md](../01-architecture/locaily-overview.md) | System map | current |
| [../01-architecture/api-contract.md](../01-architecture/api-contract.md) | HTTP API | current |
| [../01-architecture/local-brain.md](../01-architecture/local-brain.md) | Companion server | current |
| [../01-architecture/local-brain-orchestration.md](../01-architecture/local-brain-orchestration.md) | Workflow run planning | current |
| [../01-architecture/orchestration-flow.md](../01-architecture/orchestration-flow.md) | Orchestration flow | current |
| [../01-architecture/crew.md](../01-architecture/crew.md) | The Crew strategy (formerly AI Pit Crew) | current |
| [../01-architecture/crew-gap-analysis.md](../01-architecture/crew-gap-analysis.md) | The Crew implementation gaps | current |
| [../01-architecture/memory-bridge.md](../01-architecture/memory-bridge.md) | Memory Bridge | current |
| [../01-architecture/nearby-node.md](../01-architecture/nearby-node.md) | Relay Nodes (formerly NearbyNode; not built) | experimental |
| **Track System** | | |
| [../02-track-system/README.md](../02-track-system/README.md) | Track system entry | current |
| [../02-track-system/core-tracks.md](../02-track-system/core-tracks.md) | Reusable track types | current |
| [../02-track-system/track-registry.md](../02-track-system/track-registry.md) | What a track is | current |
| [../02-track-system/workflow-registry.md](../02-track-system/workflow-registry.md) | Workflow → track map | current |
| [../02-track-system/step-input-mapping.md](../02-track-system/step-input-mapping.md) | Declarative step input mapping | current |
| [../02-track-system/track-graph-planning.md](../02-track-system/track-graph-planning.md) | Linear → DAG evolution | current |
| [../02-track-system/run-plan-format.md](../02-track-system/run-plan-format.md) | Run plan JSON shape | current |
| **Systems** | | |
| [../02-systems/benchmark-lab.md](../02-systems/benchmark-lab.md) | Benchmark Lab — operator-ready evaluation subsystem | current |
| [../../benchmark-lab/OPERATOR_GUIDE.md](../../benchmark-lab/OPERATOR_GUIDE.md) | Benchmark Lab command workflow | current |
| **Workflows** | | |
| [../03-workflows/lighthouse-handoff.md](../03-workflows/lighthouse-handoff.md) | First proof workflow | current |
| [../03-workflows/lighthouse-handoff-validation.md](../03-workflows/lighthouse-handoff-validation.md) | L1 validation | current |
| [../03-workflows/lighthouse-handoff-run-plan.md](../03-workflows/lighthouse-handoff-run-plan.md) | Lighthouse run plan | current |
| [../03-workflows/dealsniper.md](../03-workflows/dealsniper.md) | DealSniper workflow track | current |
| **Validation** | | |
| [../04-validation/README.md](../04-validation/README.md) | Validation index | current |
| [../04-validation/l2-live-ollama-memory-bridge.md](../04-validation/l2-live-ollama-memory-bridge.md) | L2 milestone | current |
| [../04-validation/memory-bridge-lighthouse-v0.md](../04-validation/memory-bridge-lighthouse-v0.md) | Memory Bridge validation | current |
| **Product** | | |
| [../05-product/roadmap.md](../05-product/roadmap.md) | Sequenced roadmap | current |
| [../05-product/setup-flow.md](../05-product/setup-flow.md) | Setup | current |
| **Progress** | | |
| [../07-progress/build-status.md](../07-progress/build-status.md) | Working / partial / not built | current |
| [../07-progress/current-sprint.md](../07-progress/current-sprint.md) | Active sprint | current |
| [../07-progress/next-agent-brief.md](../07-progress/next-agent-brief.md) | Agent handoff | current |
| [../07-progress/milestone-4-completion.md](../07-progress/milestone-4-completion.md) | M4 completion note | current |
| [../07-progress/milestone-5-checkpoint.md](../07-progress/milestone-5-checkpoint.md) | M5 Benchmark Lab checkpoint | current |
| **Agent Rules** | | |
| [../08-agents/agent-context.md](../08-agents/agent-context.md) | Agent rules summary | current |
| **Decisions** | | |
| [../06-decisions/decision-log.md](../06-decisions/decision-log.md) | Decision log | current |
| **Archive** | | |
| [../99-archive/research-notes/](../99-archive/research-notes/) | Model/hardware research | research |
| [../99-archive/README.md](../99-archive/README.md) | Archive index | archived |

## Component Map

| Component | Public Term | Implementation Path | Status |
|---|---|---|---|
| Local Brain | Local Brain | `companion/server.js`, `companion/core/` | Implemented |
| Track System | Tracks | `companion/crew/tracks/`, `companion/orchestration/` | Implemented (linear runner) |
| Crew Strategy | The Crew | `companion/crew/` (internal) | Partial |
| Model Evaluation | Model Lab | `benchmark-lab/` (powers it) | M1 complete |
| Evaluation Subsystem | Benchmark Lab | `benchmark-lab/` | M1 complete |
| Nearby Devices | Relay Nodes | (no implementation directory yet) | Planned |
| Memory Integration | Memory Bridge | `companion/memory/` | v0 |
| Validation Console | — | `companion/console/` | Early UI |
| Track Run Records | Canonical Track Run Records | (active build slice) | In progress |

## Root Repo Files

| Path | Purpose |
|---|---|
| [../../AGENTS.md](../../AGENTS.md) | Coding agent instructions |
| [../../AGENT.md](../../AGENT.md) | Human dev guide |
| [../../README.md](../../README.md) | Repo overview |
