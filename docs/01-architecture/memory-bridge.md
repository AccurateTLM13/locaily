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
- Wiring memory into every workflow (one proof workflow comes after v0 smoke tests)

## v1 Scope (Milestone 4)

v0 was compose-handoff + proposal-only writeback. v1 adds two opt-in capabilities required by the Relay Node milestone and general workflow maturity:

**In scope (v1):**

- **Structured search** — `POST /memory/search` runs an allowlisted, case-insensitive ranked search across vault Markdown and returns scored hits with line snippets. No full file dumps; no `raw/` access.
- **Writeback apply** — `POST /memory/writeback/apply` writes a reviewed proposal to an allowlisted vault path. Gated behind `memoryBridge.allowApply` (or `writebackMode: "apply"`) and the `memory.writeback.apply` permission. Vault-local config cannot enable apply when the companion disallows it.
- **Relay node memory consent** — relay nodes are execution targets only; they may read/apply the *operator-configured* vault on the node that owns it. No vault state is pushed across the relay protocol.

**Still out of scope for v1:**

- Embeddings / vector search (keyword ranking only)
- GitHub or cloud sync
- Automatic edits outside the allowlist / blocked paths
- Distributed memory consensus across relay nodes

| Operation | v1 behavior |
|-----------|-------------|
| Search | Allowlisted `.md` only; returns `{ query, count, hits[] }` with `score` and `matches[].snippet` |
| Apply | Writes rendered proposal Markdown to `targetPath` (allowlisted, inside vault, `.md`); opt-in only |

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

- [../04-validation/memory-bridge-lighthouse-v0.md](../04-validation/memory-bridge-lighthouse-v0.md)

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
| POST | `/memory/search` | Structured, allowlisted ranked search (v1) |
| POST | `/memory/writeback/apply` | Apply reviewed proposal to allowlisted path (v1, opt-in) |
| POST | `/memory/events` | Append validated development event (DM2, `memory.events.write`) |
| GET | `/memory/events` | Query development events (DM2, `memory.read`) |
| GET | `/memory/events/:eventId` | Fetch one development event (DM2, `memory.read`) |

Contract detail: [api-contract.md](./api-contract.md), [context-packs.md](./context-packs.md), [memory-writeback.md](./memory-writeback.md).

## Development Memory Loop (planned extension)

DM1 defines contracts for capturing development activity into reviewed vault memory. See:

- [development-memory-loop.md](./development-memory-loop.md)
- [development-memory-events.md](./development-memory-events.md)
- [../02-planning/development-memory-roadmap.md](../02-planning/development-memory-roadmap.md)

DM1 adds schemas and docs only; no capture automation yet.

## Related

- [context-packs.md](./context-packs.md)
- [memory-writeback.md](./memory-writeback.md)
- [development-memory-loop.md](./development-memory-loop.md)
- [../06-decisions/second-brain-as-memory-layer.md](../06-decisions/second-brain-as-memory-layer.md)
- [../../templates/memory-vault/README.md](../../templates/memory-vault/README.md)
