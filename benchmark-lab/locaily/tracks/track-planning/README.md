# Track Planning V1

This suite evaluates the **track planner** role (`reasoning_worker`) — the model-backed tool that decomposes a free-form user request into a structured track execution plan (`POST /tracks/plan`).

It uses a deterministic mock runtime (`mock-track-planner`) to prove suite loading, case validation, output validation, raw result persistence, and draft summary generation **without requiring Ollama**.

It qualifies the `reasoning_worker` role on `llama3.2-local` for the `core.track_planning` contract. The mock responses are stand-ins for the structured decomposition a qualified local model must produce; live re-qualification against Ollama is recommended once a model is available.

Run:
`npm run benchmark:run -- --suite benchmark-lab/locaily/tracks/track-planning/suite.json`
