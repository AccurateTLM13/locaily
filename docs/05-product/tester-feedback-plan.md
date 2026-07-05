# Tester Feedback Plan

How to collect useful feedback without overclaiming readiness.

## Current Tester Profile

**Developer / early open-source testers** comfortable with:

- Node.js terminal
- Ollama install and model pull
- Reading JSON API responses

Not yet targeting non-technical installers until packaging stage advances.

## Feedback Groups

Separate feedback by role:

### Lighthouse Handoff users (developers)

- Would you use the generated handoff for real client work?
- Is deterministic vs model-enhanced behavior clear in the output?
- Are Track failures understandable?
- Is setup manageable?

### Local Brain operators

- Is the server output clear enough?
- Are provider/model status checks useful?
- Is the error nextStep guidance actionable?

### Local-model evaluators

- Do qualification labels increase trust or create confusion?
- Is the declared-vs-proven capability distinction clear?
- Are Benchmark Lab qualification records useful?

### Memory Bridge testers

- Are memory permissions clear?
- Is the proposal-only writeback model understandable?
- Does Context Pack output match expectations?

### Future Relay Node testers

- Do not recruit for Relay Node testing — the protocol does not exist yet.

## Pre-Invite Checklist

Use [publish-readiness-checklist.md](./publish-readiness-checklist.md) before inviting outsiders.

Minimum bar today:

- [x] Smoke test passes
- [x] README setup instructions
- [ ] Example client for Lighthouse workflow
- [ ] Clear limitations section in onboarding doc

## What To Ask Testers

### Setup

- Could you start the server without asking for help?
- Was Ollama/model setup clear?
- Did `/health` match what you expected?

### Lighthouse Handoff

- Did deterministic mode produce usable handoff notes?
- If Ollama was running, did orchestrated mode complete?
- Were failures understandable?

### General

- Did anything imply cloud AI or full production PageSpeed analysis incorrectly?
- Would you trust this for real client handoffs? Why or why not?

## What Not To Ask Yet

- "Is this better than GPT-4?" (no benchmark program yet)
- Relay Node pairing (not built)
- Desktop app polish (not built)

## Feedback Capture

Suggested format:

```txt
Date:
Profile: (OS, RAM, GPU, Ollama version)
Workflow:
Expected:
Actual:
Logs/screenshots:
Severity: blocker | major | minor | idea
```

Store in issue tracker or `tester-feedback/` folder if created later—do not commit private user data.

## Success Signals

- Repeatable setup on Windows and macOS
- Smoke test pass rate across tester machines
- Actionable bug reports with repro steps
- Clear separation of "deterministic path" vs "AI-enhanced path"

## Owner

Human maintainer + `evaluation-agent` for structured test logs.
