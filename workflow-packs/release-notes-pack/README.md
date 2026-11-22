# Release Notes & Changelog Pack

Official read-only Workflow Pack implementing `release_notes`.

## What It Does

1. **`release_notes.parse`** (`release-log-parser.parse`) deterministically parses conventional commit types, scopes, PR references, breaking changes, and recommended semver bump.
2. **`core.classify`** classifies the release type (`major_release`, `minor_feature_release`, `patch_bugfix_release`, `security_release`, `maintenance_release`).
3. **`core.summarize`** summarizes release highlights concisely.
4. **`release_notes.brief`** (`release-log-parser.assemble_brief`) builds a schema-validated changelog and upgrade notes brief.

## Safety Boundary

Strictly read-only (`model.run` only; zero filesystem writes, shell execution, or network calls).

## Quick Verification

```bash
npm run pack:validate -- workflow-packs/release-notes-pack
npm run pack:test -- workflow-packs/release-notes-pack
```
