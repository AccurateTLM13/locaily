# Capability Trigger Kernel (CTK-01)

## Purpose

CTK-01 is the minimum runtime contract connecting a contextual event to one installed capability on one configured local node boundary.

It preserves these logical owners even though the reference slice runs in one process:

- **Local Brain role:** installed capability state, node policy, durable evidence, and reproducible run records for the current reference installation.
- **Worker role:** local handler availability and deterministic execution; CTK-01's single node implicitly combines Brain and Worker behavior.
- **NearbyNode:** reserved for the future trusted relationship between distinct Locaily nodes, not the name of the CTK-01 worker boundary.
- **AI Pit Crew:** the ordered rule, script, tool, model, or human tracks declared by a capability.
- **Contextual trigger:** a typed observation that carries facts and provenance but grants no authority.
- **Capability-building agent:** a design-time producer of candidate manifests, handlers, schemas, and tests; it cannot promote runtime behavior.

## Existing Components Reused

| Existing Locaily component | CTK-01 use |
|---|---|
| `companion/core/result-validator.js` | Contract validation; extended for the JSON Schema keywords used by CTK contracts |
| `companion/core/dag-graph.js` | Deterministic dependency validation and topological track ordering |
| `companion/core/ids.js` | Unique run identity |
| `companion/core/audit-log.js` pattern | Append-only JSONL evidence convention |
| `companion/tools/registry.js` contract | Optional adapter for explicitly registered deterministic tool handlers |
| `companion/evidence/track-run-record-*` | Provenance design reference; CTK uses a separate event-oriented record because the canonical Track Run Record lacks source-event, manifest, and plan snapshots |
| `companion/relay/*` | Boundary reference only; CTK-01 does not invoke relay HTTP or distributed placement |

The existing `companion/core/capability-registry.js` remains the model-qualification capability view. CTK uses `companion/capability-kernel/capability-registry.js` for installed runtime packages because the two registries answer different questions: “is this model qualified?” versus “is this versioned workflow installed and eligible?”

## Runtime Flow

```txt
event
  -> contract validation
  -> source trust check
  -> event-id deduplication
  -> exact trigger and condition match
  -> capability status / version / policy / approval checks
  -> deterministic dependency plan
  -> declared local handler execution
  -> per-track and final output validation
  -> output artifact + append-only run record
```

Allowed success transitions:

```txt
received -> normalized -> matched -> planned -> running -> validating -> completed
```

Terminal alternatives are `ignored`, `rejected`, `approval_required`, and `failed`. Every transition is checked against an explicit state table.

## Authority and Safety

- Only a valid installed manifest can authorize a handler.
- Event payload text is handler input data, never executable instruction.
- A configured `node_id` and `adapter_id` pair authenticates the reference source.
- The reference node policy sets `network: false` and `cloud_fallback: false`.
- Rule and script handlers are functions registered by the local process; manifests cannot name arbitrary filesystem code.
- Tool handlers can only use the existing tool registry and an explicitly declared `tool-id#task` identifier.
- Model and human handler ports are unavailable in CTK-01. There is no implicit provider or cloud fallback.
- All snapshots are redacted by key before persistence. Hashes still distinguish the original immutable input/configuration.

## Reproducibility and Evidence

The execution plan hash excludes `run_id`, so the same event, manifest, node configuration, and policy produce the same plan hash. Each run record includes:

- source event snapshot and hash;
- source trust result;
- node and policy snapshot;
- capability ID, version, manifest hash, and redacted manifest snapshot;
- complete execution plan and plan hash;
- legal state transitions;
- handler attempts, retry decisions, timings, and output hashes;
- schema validation results;
- terminal output or error;
- durable output reference when completed.

Event deduplication is reconstructed from append-only run evidence. Only an event that reached `running` blocks a second execution, so an approval-required event can later be resubmitted with approval.

## Why Lighthouse Handoff and DBVT SEO Audit Are Not Hardcoded

The kernel matches declarative event types and conditions, validates named schemas, orders declared tracks, and dispatches registered handlers. The reference `status-handoff` rule is a fixture registration, not a branch in the kernel.

A later Lighthouse Handoff or DBVT SEO Audit package can add:

1. its own manifest and trigger conditions;
2. explicit input/output schemas in the CTK contract registry;
3. tool handler IDs backed by the existing tool-pack registry;
4. policy and approval requirements;
5. capability-specific tests.

The kernel does not need workflow-name conditionals.

## Known Limitations

- One in-process local node only.
- Exact event-type and equality-condition matching only.
- JSONL append serialization is process-local; multi-process writers are not supported.
- Output-file creation and JSONL append are separate durable operations, not a cross-file transaction.
- No capability signing, trust enrollment ceremony, marketplace, or runtime promotion.
- No model execution, cloud fallback, distributed scheduling, or UI endpoint.
- Schema IDs are explicitly registered in code for CTK-01.

## Resolved Follow-on Direction

CTK-02 formalizes Locaily node identity, Brain/Worker/Hybrid roles, portable Capability Capsules, placement evaluation, and node-local bindings. DBVT SEO Audit is deferred to CTK-03, where it can be split into reusable `seo-audit-core` and private `dbvt-seo-profile` assets. Lighthouse Handoff follows as an independently packaged capability in CTK-05.

CTK-01 still does not settle the long-term default cloud policy beyond its local-only hard gate or the future NearbyNode discovery, pairing, and cryptographic trust design. See [node-roles-and-capability-capsules.md](./node-roles-and-capability-capsules.md).

The supplied source filenames were not present at their stated path. Reconnaissance used the repository equivalents in `docs/99-archive/raw-conversation-captures/` and `docs/03-workflows/`, plus the complete architecture package under `development/needs-implementing/locaily-architecture-package/`.
