# Locaily Validation Evidence Index

> **Last updated:** 2026-07-26

This index catalogs all published validation evidence for Locaily milestones.

## PX Series — Product Experience

| Milestone | Evidence | Status |
|---|---|---|
| px1 Canonical Product Status | [tester-protocol.md](./tester-protocol.md) | Ready |
| px2 LAN Security Hard Gate | [test-lan-security-gate.cjs](../../scripts/test-lan-security-gate.cjs) (20/20) | Passing |
| px3 Golden Path Run Inspector | [test-golden-path.cjs](../../scripts/test-golden-path.cjs) (19/19) | Passing |
| px4 Unified Shell | [test-unified-shell.cjs](../../scripts/test-unified-shell.cjs) (17/17) | Passing |
| px5 Tester Package | [accept-clean-machine.ps1](../../scripts/accept-clean-machine.ps1) (13/13) | Passing |
| px6 External Validation | [px6-execution-evidence.md](./px6-execution-evidence.md), [relay-pilot-runbook.md](./relay-pilot-runbook.md), [second-workflow-evidence.md](./second-workflow-evidence.md) | Evidence execution (dry-run, a11y workflow completed); relay pilot blocked (single device) |
| px7 Organic Discovery | README, intent pages, tutorials | Published |
| px8 Audit Second Pass | [test-unified-shell.cjs](../../scripts/test-unified-shell.cjs) (17/17), [test-golden-path.cjs](../../scripts/test-golden-path.cjs) (19/19) | Passing |
| px9 Remaining Milestones | [px6-execution-evidence.md](./px6-execution-evidence.md) | Active |

## M Series — Milestone Evidence

| Milestone | Test Suite | Result |
|---|---|---|
| M4 Relay Nodes | `test-relay-unit.cjs` | 53/53 |
| M5 Multi-Device | `test-multi-device-e2e.cjs` | 26/26 |
| M6 Trusted Relay | `test-relay-auth-e2e.cjs` | 16/16 |
| M7 Durable Jobs | `test-jobs-api.js`, `test-jobs-mutation.js` | 149 total |
| M8 Operator Control | `test-operator-console.js` | 34/34 |

## DM Series — Development Memory

| Milestone | Test Suite | Result |
|---|---|---|
| DM2 Events | `test-development-memory-events.js` | 13/13 |
| DM3 Capture | `test-development-memory-capture.js` | — |
| DM4 Sessions | `test-development-memory-sessions.js` | — |
| DM5 Candidates | `test-development-memory-candidates.js` | — |
| DM6 Review | `test-development-memory-candidate-review.js` | — |
| DM7 Maintainer | `test-development-memory-maintainer.js` | — |
| DM8 Retrieval | `test-development-memory-retrieval.js` | 5/5 |
| DM9 Capture Processor | `test-development-memory-capture-processor.js` | 5/5 |
| DM10 Multi-Project | `test-development-memory-multi-project.js` | 6/6 |

## How to Add Evidence

1. Create a test script under `scripts/`
2. Run it and record the result
3. Add a link to this index
4. Link from the relevant milestone or feature doc
