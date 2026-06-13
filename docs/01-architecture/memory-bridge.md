# Memory Bridge

## What It Is

The **Memory Bridge** connects Locaily (public runtime) to a user-owned **local Markdown memory vault** (for example a private Second Brain or Obsidian-style wiki). It does not merge repos, copy private notes into Locaily, or require GitHub or Obsidian.

```txt
User memory vault (private, local path)
        │
        ▼
Memory Bridge (Locaily companion/memory/*)
        │
        ├─ Read: allowlisted Markdown → Context Pack
        └─ Write: proposal file → .memory-bridge/writeback-inbox/
        │
        ▼
Local Brain workflows, tools, tracks
```

## Why It Exists

Locaily executes tasks well but has no durable project memory by default. A separate vault can hold decisions, constraints, lessons, and project state. The bridge answers:

> What part of my vault should this task use?

Without the bridge, the vault is static notes and Locaily is stateless execution. With it, tasks can start with relevant context and end with reviewable writeback proposals.

## System Learning (Not Model Learning)

Models do not gain new weights through this feature. The **system** improves when:

- memory pages and logs are updated after review
- context packs get richer over time
- routing, validation, and evaluations incorporate filed lessons

Do not describe Memory Bridge as making models "self-learning."

## v0 Scope

**In scope:**

- Local Markdown vault adapter
- Allowlist + blocked-path read policy (`blockedPaths` always wins over `allowedPaths`)
- Task-specific Context Packs (summaries, excerpts, heading extraction — not full file dumps by default)
- Proposal-only writeback to inbox
- `GET /memory/status`, `POST /memory/context-pack`, `POST /memory/writeback/propose`

**Out of scope for v0:**

- Embeddings / vector search
- GitHub or cloud sync
- Obsidian plugin requirement
- Automatic wiki edits
- `POST /memory/writeback/apply`
- Wiring memory into every workflow (one proof workflow comes after v0 smoke tests)

## Vault Layouts

Locaily ships a **flat** public starter template:

```txt
index.md
log.md
projects/
topics/
.memory-bridge/
```

Private Second Brain-style vaults often use a **wiki/** layout:

```txt
index.md
log.md
wiki/projects/
wiki/topics/
wiki/concepts/
wiki/entities/
raw/          ← blocked by default
```

Users point Locaily at their vault path and configure `allowedPaths` for their layout. See [templates/memory-vault/.memory-bridge/allowlist.example.json](../../templates/memory-vault/.memory-bridge/allowlist.example.json).

## Read vs Writeback

| Operation | v0 behavior |
|-----------|-------------|
| Read vault pages | Allowlisted `.md` only; `raw/` blocked even if misconfigured |
| Context Pack | Summaries + excerpts + `filesUsed`; no full source by default |
| Writeback | Proposal Markdown in `.memory-bridge/writeback-inbox/` only |
| Apply to wiki | Not implemented; human edits vault after review |

## Privacy Rules

1. Locaily never ships a user's private vault in the public repo.
2. Memory reads a **user-configured local path** only.
3. `GET /memory/status` does **not** expose the full vault path in normal responses.
4. Context Packs should stay small and inspectable (`filesUsed` lists what was read).
5. Audit logging should not store full pack content by default.
6. `blockedPaths` always override `allowedPaths`.
7. Memory audit events store only safe metadata (`contextPackId`, `project`, `task`, `filesUsed`, `warnings`) — never excerpts, proposal bodies, or vault paths.

## Audit Redaction

Memory endpoints and Lighthouse Handoff memory preflight write redacted audit events. Implementation: [companion/memory/audit-redaction.js](../../companion/memory/audit-redaction.js).

- [../05-validation/memory-bridge-lighthouse-v0.md](../05-validation/memory-bridge-lighthouse-v0.md)

## Configuration

Memory bridge settings live in [companion/config.json](../../companion/config.json) under `memoryBridge`. Optional vault-local overrides may exist at `.memory-bridge/config.json` inside the vault (allowlist tuning only).

Environment override: `LOCAL_MEMORY_VAULT_PATH` sets `vaultPath` when memory is enabled.

When `memoryBridge.enabled` is `false`, Locaily runs normally; memory endpoints return clear warnings.

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/memory/status` | Effective config summary, readability, counts, warnings |
| POST | `/memory/context-pack` | Build task-specific Context Pack |
| POST | `/memory/writeback/propose` | Write reviewable proposal to inbox |

Contract detail: [api-contract.md](./api-contract.md), [context-packs.md](./context-packs.md), [memory-writeback.md](./memory-writeback.md).

## Related

- [context-packs.md](./context-packs.md)
- [memory-writeback.md](./memory-writeback.md)
- [../06-decisions/second-brain-as-memory-layer.md](../06-decisions/second-brain-as-memory-layer.md)
- [../../templates/memory-vault/README.md](../../templates/memory-vault/README.md)
