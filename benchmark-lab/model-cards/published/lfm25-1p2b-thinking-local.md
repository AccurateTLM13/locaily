# LFM2.5 1.2B Thinking Local

## Identity

- Model ID: lfm25-1p2b-thinking-local
- Provider: Liquid AI
- Runtime: ollama
- Runtime model name: hf.co/LiquidAI/LFM2.5-1.2B-Thinking-GGUF:latest
- Status: available

## Evidence

| Evidence ID | Track | Contract | Source Run | Pass Rate |
|---|---|---|---|---:|
| lfm25-1p2b-thinking-guardrail-writer-v1 | website_audit.lighthouse_handoff | guardrail-writer-v1 | guarded-enforcement-pilot-20260711 | 100% |
| lfm25-1p2b-thinking-developer-task-writer-v1 | website_audit.lighthouse_handoff | developer-task-writer-v1 | assembly-pilot-20260711 | 100% |
| lfm25-1p2b-thinking-lighthouse-priority-v1 | website_audit.lighthouse_handoff | lighthouse-priority-helper-v1 | run-lh-priority-20260706T210944Z | 91.7% |

## Track Status

| Track | Status | Evidence |
|---|---|---|
| website_audit.lighthouse_handoff | qualified | lfm25-1p2b-thinking-lighthouse-priority-v1 |
| website_audit.lighthouse_handoff | qualified | lfm25-1p2b-thinking-developer-task-writer-v1 |
| website_audit.lighthouse_handoff | qualified | lfm25-1p2b-thinking-guardrail-writer-v1 |

## Limitations

- Qualified for guardrail_writer role (website_audit.lighthouse_handoff). Adjacent to enforced priority_helper and developer_task_writer; not globally enforced.
- Score computed from 3 real-URL validation scenarios with schema completeness checks.

