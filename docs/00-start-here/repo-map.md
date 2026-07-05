# Repo Map

Quick map of the `docs/` tree and key code directories. For the full index see [project-index.md](./project-index.md).

```txt
docs/
├─ 00-start-here/     What Locaily is; current state; glossary; vision
├─ 01-architecture/   Major system organs (Local Brain, Tracks, The Crew, …)
├─ 02-track-system/   How work is broken down and dispatched (tracks, workflows, run plans)
├─ 02-systems/        Cross-cutting systems (Benchmark Lab, …)
├─ 03-workflows/      User-facing workflows (Lighthouse Handoff, DealSniper, …)
├─ 04-validation/     Evidence — validate tracks and workflows, not vibes
├─ 05-product/        UX, setup, packaging, roadmap
├─ 06-decisions/      Decision log and open questions
├─ 07-progress/       Build status, sprint, agent brief, progress log
├─ 08-agents/         Rules for coding, documentation, and evaluation agents
└─ 99-archive/        Superseded plans and research notes
```

## Code Map

```txt
companion/
├─ server.js           Local Brain HTTP API
├─ core/               Input gate, context, permissions, validator, audit, qualification loader
├─ crew/               Track and The Crew runner (public concept: The Crew)
│  ├─ orchestrator.js  Linear track executor
│  ├─ model-router.js  Model role dispatch
│  ├─ tool-router.js   Tool dispatch
│  ├─ step-input.js    Input map resolver
│  └─ tracks/          Track JSON declarations (lighthouse-handoff, dealsniper)
├─ orchestration/      Workflow registry, run plan builder/executor
├─ providers/          Provider router (Ollama + mock)
├─ runtime/            Ollama adapter
├─ tools/              Showcase tools + registry loader
├─ memory/             Memory Bridge v0
└─ console/            Local validation UI (early)

benchmark-lab/         Powers the public Model Lab layer
├─ engine/             CLI entrypoints, runners, adapters, scorers, reporters
├─ locaily/            Locaily-specific suites, fixtures, prompts
├─ schemas/            13 benchmark schemas with validation
├─ evidence/           Curated, checksummed approved evidence
├─ qualifications/     Runtime-facing qualification records
├─ model-cards/        Published model cards
├─ reports/            Published reports
├─ models/             Model manifests
├─ validators/         Contract and schema validators
└─ configs/            Lab configuration

tool-packs/            Manifest-backed capability packs
├─ standard-text-pack/
└─ lighthouse-parser-pack/

scripts/               smoke-test.js, contract-test.js, benchmark-lab-*.js
templates/memory-vault/ Public starter vault template
```

## Layer Mental Model

```txt
Locaily
├─ Local Brain        coordinator and runtime (companion/server.js)
├─ Tracks             reusable execution contracts (companion/crew/tracks/)
├─ The Crew           specialized workers and capabilities (companion/crew/)
├─ Model Lab          evaluation and qualification layer
│  └─ Benchmark Lab   evidence and qualification subsystem (benchmark-lab/)
├─ Relay Nodes        nearby-device capability layer (planned; not implemented)
└─ Memory Bridge      optional context/writeback layer (v0)
```

## What To Read For…

| Goal | Start here |
|---|---|
| Resume after time away | [current-state.md](./current-state.md) → [../07-progress/next-agent-brief.md](../07-progress/next-agent-brief.md) |
| Add a workflow | [../02-track-system/workflow-registry.md](../02-track-system/workflow-registry.md) → [../03-workflows/workflow-template.md](../03-workflows/workflow-template.md) |
| Change API | [../01-architecture/api-contract.md](../01-architecture/api-contract.md) |
| Prove something works | [../04-validation/README.md](../04-validation/README.md) |
| Understand model qualification | [../02-systems/benchmark-lab.md](../02-systems/benchmark-lab.md) |
