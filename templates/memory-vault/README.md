# Memory Vault Starter Template

Bring your own memory vault. Locaily's Memory Bridge reads a **local folder** you configure — it does not require GitHub, Obsidian, or this repo's copy of your notes.

## Quick Start

1. Copy this folder to a private location:

   ```powershell
   Copy-Item -Recurse templates\memory-vault $env:USERPROFILE\Documents\my-memory-vault
   ```

2. Edit [companion/config.json](../../companion/config.json):

   ```json
   "memoryBridge": {
     "enabled": true,
     "vaultPath": "C:/Users/You/Documents/my-memory-vault"
   }
   ```

3. Restart the companion server and check status:

   ```txt
   GET http://127.0.0.1:31313/memory/status
   ```

## Layout (Flat — Default)

This template uses a **flat** layout suitable for new vaults:

```txt
index.md              # navigation hub
log.md                # episodic history
SCHEMA.md             # operating rules
projects/             # one page per project
topics/               # cross-cutting topics
.memory-bridge/       # bridge config + writeback inbox
```

## Second Brain / Wiki Layout

If you already have a Second Brain-style vault with `wiki/` folders, keep your layout and update `allowedPaths` in config:

```json
"allowedPaths": [
  "index.md",
  "log.md",
  "wiki/projects/",
  "wiki/topics/",
  "wiki/concepts/",
  "wiki/entities/"
]
```

See [.memory-bridge/allowlist.example.json](./.memory-bridge/allowlist.example.json) for flat and wiki examples.

## Privacy

- This template is a public starter structure. Copy it outside the repository before adding real notes.
- Local Brain reads this vault from the configured path — it does not ship the vault with the repository.
- Vault content is never automatically synced, committed, or uploaded.
- Keep personal notes in paths blocked by default (`raw/`, `private/`, `personal/`).
- Context Packs return summaries and excerpts (truncated), not full file dumps.
- Writeback is proposal-only — no automatic vault mutation occurs.
- Locaily never copies your vault into the public repo.
- Context packs return summaries and excerpts — inspect `filesUsed` on every response.
- No embeddings, broad semantic search, or autonomous memory management exist in v0.
- Recommended: back up or version-control your vault independently.
- Do not commit your vault path or actual vault content to the Locaily repository.

## Related

- [docs/01-architecture/memory-bridge.md](../../docs/01-architecture/memory-bridge.md)
- [SCHEMA.md](./SCHEMA.md)
