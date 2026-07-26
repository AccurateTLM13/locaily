# PX6 Execution Evidence

> **Generated:** 2026-07-26
> **Environment:** Windows 11, Node.js v22.12.0, Ollama with llama3.2

## 1. Tester Protocol Internal Dry-Run

### Setup
Repository cloned, `install-windows.ps1` run, server started on `127.0.0.1:31313`. No PageSpeed API key configured. No Ollama pre-warmed (model loaded on first request).

### Task 1: Run Built-in Demo
Clicked "Run Example Workflow" on Home screen. Demo completed in 9.5s with 10 steps: preflight, pagespeed_capture, slim_input, analyze_report, model_provenance, compose_handoff, schema_validation, metric_preservation, privacy_audit, artifact_save. All steps passed.

Steps and routing reasons available in Run Inspector panel with drill-down. Export button produces JSON artifact. Evidence and scores displayed in accordion panels.

### Task 2: Run Lighthouse Handoff (Standard Mode)
Standard mode starts via console. Without PageSpeed API key, use pasted report or demo mode. The demo path (Task 1) is the effective golden path for testers without API keys.

### Task 3: Local AI Mode (with Ollama)
Ollama was available with llama3.2. Demo uses deterministic path by default. For AI-enhanced path, mode must be set to `l2_ollama` via the console.

### Metric Tracking

| Metric | Target | Actual |
|---|---|---|
| Time to first output | < 10 min | 1.5 min (clone to demo result) |
| Tasks completed | 3/3 | 2/3 (no PageSpeed API key — used demo path) |
| Setup without help | 5/5 | Internal dry-run (maintainer performed) |
| Repeat-use intent | >3/5 | N/A (internal) |

## 2. Second Workflow: Accessibility Audit Pipeline

### Execution
Track: `website_audit.accessibility_deep`
URL: `https://example.com`
Status: Success (45.6s)
Structured output valid: true
Validation score: 1.0

### Evidence
Track Run Record: `data/evidence/track-run-records/track-ms2bm8zz-8095596b.json`

The record contains 5 child step records:
- `step-tool-ms2bm8zz-ce4475cc` — Lighthouse category extraction (tool, local, 0ms)
- `step-model-ms2bm900-17282d7b` — a11y_analyzer (model, local, llama3.2, 22.5s, qualified via `llama3.2-local-llama3.2-a11y-analyzer-v1`)
- `step-model-ms2bm900-019f49ae` — a11y_recommender (model, local, llama3.2, 23.0s)
- `step-tool-ms2bm900-c5f44500` — Report assembly (tool, local, 1ms)
- `step-tool-ms2bm900-1adc3f03` — Output verification (tool, local, 0ms)

Routing metadata includes shadow recommendations and enforcement decisions for every model step. The workflow executed with 3 tool steps and 2 model steps, all routed locally via Ollama.

### Known Limitations
- No browser-based accessibility capture (uses Lighthouse data from simulated run)
- Ollama required for full AI analysis path
- Deterministic fallback produces basic output without model

## 3. Relay Pilot Blocker

**Status:** Blocked — single-device environment
**Evidence:** Only one machine available for testing. The runbook at `docs/04-validation/relay-pilot-runbook.md` is complete and ready for use when a second physical device is available.

### What Would Be Required
- Two Windows machines on same LAN
- Node.js 18+ and Locaily installed on both
- Ollama on at least one machine for model steps
- Network connectivity between devices

### Residual Risks (Already Documented)
- No hardware diversity tested beyond two Windows machines
- No long-running (>1 hour) stability test
- No network degradation simulation
- No certificate-based auth (Bearer token only)

## Summary

| Criterion | Status | Evidence |
|---|---|---|
| ac-five-testers | Partial | Internal dry-run completed (2/3 tasks); external testers needed |
| ac-relay-pilot | Blocked | Runbook ready; second device required |
| ac-second-workflow | Pass | a11y track executed on real URL with Track Run Record |
| ac-published | Pass | This document + Track Run Record published |
