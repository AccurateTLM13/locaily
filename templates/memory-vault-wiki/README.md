# Wiki-Style Memory Vault (Second Brain Compatible)

> **Experimental.** This template provides a wiki-style layout for testing Second Brain / Obsidian-style vault configuration. It is optional — the flat starter template at `templates/memory-vault/` is the recommended starting point.

Generic **wiki/** layout for testing and documenting Second Brain / Obsidian-style vault configuration. Contains no private content.

## Layout

```txt
index.md
log.md
SCHEMA.md
wiki/projects/
wiki/topics/
wiki/concepts/
wiki/entities/
raw/                    ← blocked (not included in template)
.memory-bridge/
```

## Locaily config

```json
"memoryBridge": {
  "enabled": true,
  "vaultPath": "C:/path/to/templates/memory-vault-wiki",
  "allowedPaths": [
    "index.md",
    "log.md",
    "SCHEMA.md",
    "wiki/projects/",
    "wiki/topics/",
    "wiki/concepts/",
    "wiki/entities/"
  ],
  "blockedPaths": [
    "raw/",
    "private/",
    "personal/",
    ".git/",
    ".memory-bridge/writeback-inbox/"
  ]
}
```

Copy this folder to a private location before adding real notes.

## Privacy Warning

- This template is a public starter structure. Copy it outside the repository before adding real notes.
- Local Brain reads this vault from the configured path — it does not ship the vault with the repository.
- Vault content is never automatically synced, committed, or uploaded.
- Context Packs return summaries and excerpts (truncated), not full file dumps.
- Writeback is proposal-only — no automatic vault mutation occurs.
- Keep personal or sensitive content in blocked paths (`raw/`, `private/`, `personal/`).
- Recommended: back up or version-control your vault independently.
- Do not commit your vault path or actual vault content to the Locaily repository.

## Related

- [../memory-vault/README.md](../memory-vault/README.md) — flat starter template
- [../../docs/01-architecture/memory-bridge.md](../../docs/01-architecture/memory-bridge.md)
