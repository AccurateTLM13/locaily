# Intent Classification V1

This is the first Benchmark Lab vertical slice. It uses a deterministic mock runtime to prove suite loading, case validation, output validation, raw result persistence, and draft summary generation.

It does not qualify a model and does not promote evidence.

`suite-improved.json` uses the same cases and contract with alternate deterministic mock responses so the comparison engine can report controlled deltas between two draft summaries.

`suite-ollama.example.json` is an opt-in local runtime example. It requires Ollama and the configured model to be available; automated tests do not depend on it. It uses `cases-live.json`, which avoids mock-runtime failure simulation cases that are useful for harness testing but noisy for live model evaluation.
