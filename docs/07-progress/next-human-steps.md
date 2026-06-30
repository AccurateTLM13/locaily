# Next Human Steps

**Updated:** 2026-06-30

Work that requires your machine, credentials, browser, or judgment before Locaily can move to the next validation tier.

## Already handled autonomously (2026-06-30)

- Extended `scripts/lighthouse-handoff-parity-test.js` to cover:
  - legacy console core sequence (tool handlers)
  - in-process workflow orchestration
  - `POST /tracks/run` over HTTP (mock provider)
  - `POST /workflows/run` over HTTP (mock provider)
- Orchestrated paths now assert identical priority-fix titles and checklists for the fixed `slim-mobile.fixture.json`.

Run:

```bash
node scripts/lighthouse-handoff-parity-test.js
```

## Your turn — pick one lane

### Lane A — Live model validation (Benchmark Lab M5 depth)

**Why:** Mock evidence exists; live qualification does not yet cover Lighthouse worker contracts.

**You provide:**

1. Ollama running locally (`127.0.0.1:11434`)
2. A pulled model matching a manifest under `benchmark-lab/models/manifests/` (e.g. `llama3.2`)
3. Run the opt-in suite:

```bash
npm run benchmark:run -- --suite benchmark-lab/locaily/tracks/intent-classification/suite-ollama.example.json
```

4. Review output, promote evidence if acceptable, generate qualification record

**Unlocks:** Real model qualification records for routing policy (`require_qualified`, etc.).

---

### Lane B — Chrome extension ↔ Local Brain bridge (L4 validation)

**Why:** End-to-end Lighthouse Handoff from the browser is spec'd but not wired.

**You provide:**

1. Clone/build the extension repo: https://github.com/mnfrdrsh/lighthouse-handoff
2. Local Brain running: `node companion/server.js`
3. Browser testing with CORS or MV3 background proxy (see `docs/03-workflows/lighthouse-handoff-extension-integration.md`)
4. Optional: Google PageSpeed Insights API key for live audits in the extension

**Unlocks:** L4 validation tier; real user workflow from PSI → Local Brain → Markdown handoff.

---

### Lane C — Memory Bridge with your private vault

**Why:** Template vault tests pass; real wiki-style vault validation is user-local.

**You provide:**

1. A private vault path (Obsidian/wiki-style layout)
2. Enable memory in config and run Lighthouse compose-handoff with memory preflight
3. Confirm context packs stay redacted in audit logs

**Unlocks:** Confidence that Memory Bridge works on your actual notes, not just the starter template.

---

### Lane D — Remove legacy step-input fallbacks (after you confirm parity is enough)

**Why:** Parity now covers legacy tools, workflow orchestration, and both HTTP orchestration endpoints for Lighthouse.

**You provide:**

1. Review parity test output and intentional-difference list
2. Approve removing `buildLegacyToolStepInput()` / `buildLegacyModelStepInput()` from `companion/pit-crew/step-input.js`
3. Re-run full test suite on your machine

**Unlocks:** Cleaner track runner; no deprecated step-id branches.

---

## Suggested order

1. **Lane D** — quick review; low setup if parity test passes locally
2. **Lane A** — if you already run Ollama day-to-day
3. **Lane B** — if extension UX is the priority
4. **Lane C** — if memory/context packs are the priority

## Full verification after your lane

```bash
node scripts/lighthouse-handoff-parity-test.js
node scripts/contract-test.js
node scripts/benchmark-lab-schema-test.js
node scripts/benchmark-lab-run-test.js
node scripts/orchestration-unit-test.js
node companion/server.js   # separate terminal
node scripts/smoke-test.js
```
