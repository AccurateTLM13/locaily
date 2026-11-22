# Meeting Notes & Action Plan Pack

Official read-only Workflow Pack implementing `meeting_action_plan`.

## What It Does

1. **`meeting_notes.parse`** (`meeting-notes-parser.parse`) deterministically extracts attendees, decisions, blockers, open questions, and action items.
2. **`core.classify`** classifies the meeting style (`planning`, `standup`, `architecture_review`, `retrospective`, `stakeholder_sync`).
3. **`core.prioritize`** deterministically ranks extracted action items by urgency and impact.
4. **`core.summarize`** summarizes outcomes concisely.
5. **`meeting_notes.brief`** (`meeting-notes-parser.assemble_brief`) builds the structured action plan brief.
6. **`core.validate`** validates the assembled brief against the required JSON Schema verification gate.

## Safety Boundary

Strictly read-only (`model.run` only; zero filesystem writes, shell execution, or network calls).

## Quick Verification

```bash
npm run pack:validate -- workflow-packs/meeting-notes-pack
npm run pack:test -- workflow-packs/meeting-notes-pack
```
