# Backup and Restore

How to back up, restore, and migrate the Locaily Local Brain runtime data.

---

## What Lives in `data/`

The Local Brain stores all runtime state under the `data/` directory at the repository root. This directory is created automatically the first time the server starts — you do not need to create it manually.

The `data/` directory contains the following files and subdirectories:

| Path | Contents |
|---|---|
| `data/audit.jsonl` | General audit log (append-only JSONL) |
| `data/permissions.json` | Tool permission approvals and denials |
| `data/evidence/track-run-records/` | Canonical track run records (one JSON file per run) |
| `data/evidence/human-reviews/` | Human review records for track runs |
| `data/jobs/` | Durable job store (one JSON file per job) |
| `data/scoreboard.jsonl` | Scoreboard entries (append-only JSONL) |
| `data/policy/enforcement-policy.json` | Enforcement policy state |
| `data/enforcement-policy-audit.jsonl` | Enforcement policy audit log (append-only JSONL) |
| `data/console/local-setup.json` | Console setup (PageSpeed API key, memory vault path) |
| `data/memory/development-events/` | Layer A development events (legacy `locaily` project layout) |
| `data/memory/development-sessions/` | Development session manifests (legacy layout) |
| `data/memory/development-candidates/` | Knowledge candidates and review records (legacy layout) |
| `data/memory/development-maintainer/` | Maintainer run plans, apply records, rollbacks (legacy layout) |
| `data/memory/development-capture/` | Capture processor state and policy (legacy layout) |
| `data/memory/projects/registry.json` | Registered development-memory projects and active project slug |
| `data/memory/projects/{slug}/` | Per-project namespaced stores (`development-events`, `development-sessions`, etc.) |

When backing up development memory for multiple registered projects, include the entire `data/memory/` tree so both the legacy Locaily paths and any namespaced project directories are captured.

---

## Backup

### What to back up

Back up the **entire `data/` directory** at the repository root. This captures all evidence records, job state, enforcement policy, audit logs, and console configuration.

Optionally, also back up `companion/config.json` if you have customized runtime settings (model selection, provider endpoints, tool toggles). The config file is not inside `data/` — it lives alongside the companion source.

### When to back up

- **Before upgrading** to a new version of Locaily.
- **After significant evidence runs** — for example, after completing a batch of track runs or benchmark qualifications that you want to preserve.
- **Before moving** the installation to a different machine.

### PowerShell backup command

```powershell
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = "$env:USERPROFILE\locaily-backup-$timestamp"

# Back up the data directory
Copy-Item -Path ".\data" -Destination "$backupDir\data" -Recurse

# (Optional) Back up the runtime config
if (Test-Path ".\companion\config.json") {
  New-Item -ItemType Directory -Path "$backupDir\companion" -Force | Out-Null
  Copy-Item -Path ".\companion\config.json" -Destination "$backupDir\companion\config.json"
}

Write-Host "Backup saved to $backupDir"
```

---

## Restore

### Restoring on a new machine

1. **Install Locaily** on the target machine following the [Operator Guide](operator-guide.md) (run `.\scripts\install-windows.ps1`). This creates Node.js dependencies and a default `companion/config.json`.

2. **Stop the server** if it is already running.

3. **Copy the backed-up `data/` directory** into the repository root, replacing any `data/` directory that was auto-created during install:

   ```powershell
   # Remove the auto-created data directory (if present)
   if (Test-Path ".\data") { Remove-Item -Path ".\data" -Recurse -Force }

   # Copy the backup into place
   Copy-Item -Path "$backupDir\data" -Destination ".\data" -Recurse
   ```

4. **(Optional) Restore the config** if you backed it up:

   ```powershell
   Copy-Item -Path "$backupDir\companion\config.json" -Destination ".\companion\config.json" -Force
   ```

5. **Confirm the directory structure** — you should see:

   ```
   data/
   ├── audit.jsonl
   ├── permissions.json
   ├── scoreboard.jsonl
   ├── enforcement-policy-audit.jsonl
   ├── console/
   │   └── local-setup.json
   ├── evidence/
   │   ├── track-run-records/
   │   └── human-reviews/
   ├── jobs/
   └── policy/
       └── enforcement-policy.json
   ```

6. **Start the server**:

   ```powershell
   node companion/server.js
   ```

7. **Verify the restore** — call the health and benchmark status endpoints:

   ```powershell
   curl http://127.0.0.1:31313/health
   curl http://127.0.0.1:31313/benchmark/status
   ```

   A successful restore shows `"ok": true` in the health response and your previous qualification records in the benchmark status response.

---

## State Migration

### v0.1.0 (current release)

This is the first packaged release of Locaily. There is no prior release to migrate from. If you are installing v0.1.0 fresh, no migration is needed — the `data/` directory will be created automatically on first start.

### Schema version fields for future migration

Two schema files carry version fields that enable future migration detection:

- **`companion/evidence/schemas/track-run-record.schema.json`** — the `schemaVersion` field uses the constant `"locaily.track_run_record.v1"`. Every track run record stored in `data/evidence/track-run-records/` includes this field.
- **`companion/schemas/internal/enforcement-policy.schema.json`** — the `schemaVersion` field uses the enum `["enforcement-policy.v1"]`. The enforcement policy document stored at `data/policy/enforcement-policy.json` includes this field.

The enforcement policy store also checks the `schemaVersion` on load and rejects documents with an unrecognized version (entering a safe fallback mode with enforcement locked).

### Future migration process (placeholder)

When a future release changes the shape of a schema, the migration process will be:

1. **Detect** — read the `schemaVersion` field from each stored record or policy document.
2. **Transform** — apply a version-specific migration function to convert records from the old schema to the new schema (for example, adding new required fields, renaming fields, or restructuring nested objects).
3. **Bump** — update the `schemaVersion` field to the new version constant and write the transformed record back to disk.
4. **Verify** — validate the migrated record against the new schema before persisting.

Migration scripts will be provided in `scripts/` when needed. Always back up `data/` before running a migration.

---

## Further Reading

- [Operator Guide](operator-guide.md) — installation, startup, and daily operation
- [API Reference](api-reference.md) — endpoint documentation
