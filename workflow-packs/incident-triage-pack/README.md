# Incident Triage Pack (`incident-triage-pack`)

Reference self-contained Locaily **Workflow Pack** demonstrating how a domain workflow bundles its own tracks, deterministic tools, schemas, prompt template, fixtures, permissions, qualification requirements, and Automatic Task Intake hints without modifying Local Brain core files.

## Included Workflow

- `incident_triage`: `incident_triage.parse` → `core.classify` (shared, `on_failure: skip`) → `core.summarize` (shared) → `incident_triage.brief`

## Validate & Test

```bash
npm run pack:validate -- workflow-packs/incident-triage-pack
npm run pack:test -- workflow-packs/incident-triage-pack
```
