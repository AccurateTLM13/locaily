# Memory Bridge — Local Wiki Vault Setup

**Local-only note.** Configure this on your machine. Do not commit private vault content or absolute paths into the Locaily repo.

## Vault layout (Second Brain / Obsidian-style)

Your private vault should expose only wiki synthesis paths to the bridge:

```txt
index.md
log.md
SCHEMA.md
wiki/projects/     (optional)
wiki/topics/
wiki/concepts/
wiki/entities/
raw/               ← blocked
.memory-bridge/writeback-inbox/  ← proposals only; blocked from read
```

## `companion/config.json` snippet

Copy [companion/config.memory-validation.example.json](../../companion/config.memory-validation.example.json) values into your **local** `companion/config.json` (do not commit your real path):

```json
"memoryBridge": {
  "enabled": true,
  "vaultPath": "C:/path/to/your/second-brain",
  "mode": "local_markdown_vault",
  "readPolicy": "allowlist",
  "writebackMode": "proposal_only",
  "rawAccess": false,
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

Environment override (optional): `LOCAL_MEMORY_VAULT_PATH` sets `vaultPath` when memory is enabled.

## Privacy checklist before enabling

- [ ] `raw/` is in `blockedPaths`
- [ ] Personal folders (`private/`, `personal/`) are blocked
- [ ] `.git/` is blocked
- [ ] Writeback remains `proposal_only` for first validation
- [ ] You reviewed `templates/memory-vault-wiki/.memory-bridge/allowlist.example.json` for reference

## Restart server after config change

```powershell
node companion/server.js
```

Verify:

```powershell
curl http://127.0.0.1:31313/memory/status
```

Expect `enabled: true`, `readable: true`, `vaultPathConfigured: true`, and **no full vault path** in the response.

## Revert after validation

Set `memoryBridge.enabled` back to `false` and `vaultPath` to `null` before committing Locaily changes.

## Related

- [memory-bridge-lighthouse-v0.md](./memory-bridge-lighthouse-v0.md)
- [../01-architecture/memory-bridge.md](../01-architecture/memory-bridge.md)
- [../../templates/memory-vault-wiki/README.md](../../templates/memory-vault-wiki/README.md)
