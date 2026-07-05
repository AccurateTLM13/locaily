# Benchmark Lab Validation Checklist

Use this before committing or opening a PR for Benchmark Lab framework changes or promoting evidence.

## Framework Changes

- [ ] Schema validation passes (`npm run benchmark:test`)
- [ ] Mock run loop deterministic
- [ ] Mode comparison test passes (`node scripts/benchmark-lab-mode-comparison-test.js`) — also run via `npm run test:benchmark`
- [ ] Status smoke test passes (`npm run benchmark:status-smoke`)
- [ ] Contract tests pass (`node scripts/contract-test.js`)
- [ ] CLI `--help` or dry-run produces expected output
- [ ] No raw benchmark outputs staged for commit
- [ ] No private local paths or device identifiers leaked
- [ ] No `benchmark-lab/engine/` imports from `companion/` code

## Live-Model Runs

- [ ] Model manifest reviewed and matches installed runtime model
- [ ] Runtime model identity verified (digest or version match)
- [ ] Suite fixed (suite and cases are not modified during run)
- [ ] Prompt/contract version recorded in evidence
- [ ] Draft output inspected (pass/fail/error distribution, case-level verdicts)
- [ ] Failures reviewed for legitimate model behavior vs fixture issues
- [ ] Evidence claim scoped narrowly to tested Track + contract
- [ ] Hardware context recorded where required

## Promotion

- [ ] Raw draft result reviewed before promoting
- [ ] Evidence ID is intentional and descriptive
- [ ] Approver name recorded
- [ ] Note supplied explaining the evidence context
- [ ] Promoted summary validated against draft
- [ ] Checksums generated and verified
- [ ] No sensitive data in promoted evidence
- [ ] Qualification status justified by evidence (use `qualified` only when genuinely supported)
- [ ] Model card/report claims traceable to promoted evidence

## Runtime Integration

- [ ] Qualification record schema valid against `qualification-record.schema.json`
- [ ] Local Brain loader reads only compact qualification artifacts
- [ ] `benchmark-lab/engine/` imports absent from `companion/` code
- [ ] Missing or invalid qualification records fail safely (no crash)
- [ ] `/benchmark/status` remains read-only and side-effect free
- [ ] Qualification policy behavior verified where relevant (`advisory`, `reject_rejected`, `require_qualified`, `require_qualified_or_conditional`)

## Required Non-Live Checks

```powershell
npm.cmd run benchmark:test
npm.cmd run benchmark:status-smoke
node scripts/contract-test.js
```

## Optional Full Smoke

Start the companion server, then run:

```powershell
node scripts/smoke-test.js
```
