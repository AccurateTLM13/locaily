# Tool Metadata Contract Audit

**Date:** 2026-06-20  
**Scope:** Tool pack manifests, internal registry entries, tool-router consumption, `GET /tools` public metadata.

## Decision

**One merged schema cannot safely represent all stages.** The prior `tool-registry-entry.schema.json` mixed manifest fields, camelCase internal registry fields, and snake_case public `/tools` fields. It has been **replaced** by four stage-specific schemas.

| Stage | Schema | Runtime enforced |
|---|---|---|
| Tool pack manifest (root) | [tool-pack-manifest.schema.json](../../companion/schemas/internal/tool-pack-manifest.schema.json) | **Yes** — `validateLoadedToolPackManifest()` in `loadToolPack()` |
| Tool pack manifest (tool entry) | [tool-pack-manifest-tool.schema.json](../../companion/schemas/internal/tool-pack-manifest-tool.schema.json) | **Yes** — via root manifest `#/$defs/manifestTool` (loaded from this file at module init) |
| Internal registry entry | [internal-tool-registry-entry.schema.json](../../companion/schemas/internal/internal-tool-registry-entry.schema.json) | **Yes** — `validateInternalToolRegistryEntry()` in `registerTool()` |
| Public `/tools` metadata | [public-tool-metadata.schema.json](../../companion/schemas/internal/public-tool-metadata.schema.json) | **No** — contract tests only |

Contract tests: `scripts/tool-registry-schema-test.js`

## Contract Comparison

| Field / concern | Manifest root | Manifest tool | Internal registry | Public `/tools` | Tool router |
|---|---|---|---|---|---|
| **Naming** | snake_case | snake_case | **camelCase** | **snake_case** | uses internal object |
| Pack id | `id` | — | `pack` | `pack` | `tool.pack` |
| Pack trust | `trust` | — | `trust` (optional on showcase) | **`pack_trust`** (default `"official"`) | not used |
| Pack version | `version` | — | **`packVersion`** | **`pack_version`** (default `"0.1.0"`) | not used |
| Tool id | — | `id` | `id` | `id` | `tool.id` |
| Tool name | — | `name` (optional) | `name` (required) | `name` | `tool.name` |
| Model role | — | `model_role` | **`modelRole`** | **`model_role`** | not used directly |
| Runtime required | — | derived at load | **`requiresRuntime`** | **`runtime_required`** | not used |
| Input schema path | — | `input_schema` (relative to pack) | **`inputSchema`** (repo-relative) | **`input_schema`** | not used |
| Output schema path | — | `output_schema` (required) | **`outputSchema`** | **`output_schema`** | not used |
| Parsed output schema | — | — | **`output`** (full JSON Schema object) | **`output`** (summary: `required`, `type`) | `tool.output` for validation |
| Input summary | — | — | `input` `{ required, optional }` | `input` (same shape) | `tool.validateInput()` |
| Tasks | — | optional → default `["run"]` | `tasks` (required) | `tasks` | `tool.tasks` |
| Permissions | optional pack default | optional per tool | `permissions` | `permissions` | not checked in router |
| Handler | — | — | **`handle`** (function) | *excluded* | `tool.handle()` |
| Input validator | — | impl module | **`validateInput`** (function) | *excluded* | `tool.validateInput()` |
| Prompt template | — | — | **`prompt`** (showcase only) | *excluded* | via handler |
| Trust enum | `official`, `verified`, `community`, `experimental`, `local_private` | — | same when present | **`pack_trust`** uses same enum + default | — |

## Field Drift Resolved

| Drift (old merged schema) | Resolution |
|---|---|
| `trust` vs `pack_trust` | Split schemas; public uses `pack_trust` only |
| `model_role` vs `modelRole` | Documented per stage; internal camelCase, public snake_case |
| `runtime_required` vs `requiresRuntime` | Documented per stage |
| `input_schema` vs `inputSchema` | Documented per stage |
| Missing `pack_version` | Added to public schema; internal uses `packVersion` |
| Missing `input` / `output` summaries | Added to public schema; internal keeps full `output` object |
| Wrong trust enum (`local` vs `local_private`) | Manifest + public enums match `TRUST_LEVELS` in registry |
| Internal-only functions | Excluded from JSON schemas; runtime still requires `handle` in tests |

## Stage Details

### 1. Tool pack manifest (`tool-packs/*/tool.json`)

**Producer:** Pack authors on disk  
**Consumer:** `loadToolPack()` in `companion/tools/registry.js`  
**Imperative validation today (after schema):** output/input schema file load, handler resolution, `validateTool()` registration checks

Representative manifest tool entry:

```json
{
  "id": "lighthouse.parse",
  "description": "Deterministically extract Lighthouse metrics from report input.",
  "model_role": null,
  "permissions": [],
  "input_schema": "schemas/lighthouse.parse.input.schema.json",
  "output_schema": "schemas/lighthouse.parse.output.schema.json"
}
```

### 2. Internal registry entry

**Producer:** `loadToolPack()` and showcase tools in `deal-sniper.js`, `lighthouse-handoff.js`  
**Consumer:** `toolRegistry.get()` → `tool-router.js` → `executeToolStep()`  
**Imperative validation today:** `validateTool()` (id, name, tasks, handle) before schema; schema validates serializable metadata only

**Runtime schema validation:** `registerTool()` calls `validateInternalToolRegistryEntry()` which validates `toInternalToolRegistryMetadata(tool)` against `internal-tool-registry-entry.schema.json`. Runtime-only fields (`handle`, `validateInput`, loaded modules, closures) are excluded from the snapshot. Failures throw `INTERNAL_TOOL_REGISTRY_ENTRY_INVALID` with `toolId`, `packId`, and `validation.errors`. Invalid entries are not inserted into the registry map.

Tool router reads: `tool.id`, `tool.tasks`, `tool.validateInput`, `tool.handle` — not public metadata fields.

Showcase tools may omit `trust` / `packVersion`; pack-loaded tools include both from manifest.

### 3. Public `/tools` metadata

**Producer:** `toPublicToolMetadata()` in `registry.js`  
**Consumer:** `GET /tools` via `buildToolsResponse()` in `server.js`  
**API shape unchanged** — snake_case fields with defaults:

- `pack_trust`: `tool.trust || "official"`
- `pack_version`: `tool.packVersion || "0.1.0"`
- `runtime_required`: `tool.requiresRuntime !== false`
- `output`: summarized via `summarizeOutput()` — not full JSON Schema

## Safest Enforcement Boundary (Recommendation)

| Priority | Boundary | Why |
|---|---|---|
| ~~**1**~~ | **`tool-packs/*/tool.json` at load** | **Done (2026-06-20)** — `validateLoadedToolPackManifest()` in `loadToolPack()` |
| ~~**1**~~ | **Internal metadata snapshot at registration** | **Done (2026-06-20)** — `validateInternalToolRegistryEntry()` in `registerTool()` |
| **1 (recommended next)** | **`toPublicToolMetadata()` output** | Protects `/tools` contract before optional runtime in `listPublic()` |
| **3** | Audit JSONL contract tests | Read-only validation |
| **Defer** | Tool router | Already fails imperatively on missing tools/tasks/handlers |

Do **not** validate public metadata with the internal schema or vice versa.

## Tests

`scripts/tool-registry-schema-test.js` proves:

- All on-disk pack manifests pass runtime validation via `loadToolPack()` / `validateLoadedToolPackManifest()`
- Missing root fields and invalid tool entries throw `TOOL_PACK_MANIFEST_INVALID`
- Invalid JSON syntax throws `TOOL_PACK_MANIFEST_PARSE_INVALID` (distinct from schema failures)
- All registered internal metadata snapshots pass `internal-tool-registry-entry.schema.json` (contract tests + runtime in `registerTool()`)
- Invalid internal metadata throws `INTERNAL_TOOL_REGISTRY_ENTRY_INVALID`; invalid entries are not retained in the registry
- Runtime functions (`handle`, `validateInput`) remain on valid live entries; handler invocation unchanged
- All `listPublic()` rows pass `public-tool-metadata.schema.json`
- `text.clean` and other valid pack tools remain registered unchanged

Also run: `node scripts/orchestration-unit-test.js`, `node scripts/smoke-test.js`

## Related

- [json-first-schema-audit.md](./json-first-schema-audit.md)
- [../01-architecture/internal-json-schemas.md](../01-architecture/internal-json-schemas.md)
- [../01-architecture/capability-registry.md](../01-architecture/capability-registry.md)
