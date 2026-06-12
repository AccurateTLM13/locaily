# Open Questions

Separated from [assumptions.md](./assumptions.md). Items here are **not decided** or lack implementation.

## Product

1. ~~Is **Locaily** the final public product name?~~ **Confirmed:** Locaily
2. Desktop Companion: Tauri vs Electron for first prototype?
3. Should audit logs move to SQLite or stay JSONL?
4. Should tool packs stay local-folder-only for v1?
5. MCP support in v1 or after native pack format is proven?
6. First polished client: demo web app vs Chrome extension bridge?

## NearbyNode

1. Discovery: mDNS, manual pairing, QR, other?
2. Auth model between Local Brain and nodes?
3. Minimum capability manifest format?

## Security

1. How strict should prompt injection detection be in v1?
2. Delay website widget clients until origin/auth is mature?
3. Disable network permissions for community tools by default?
4. Audit redaction policy for sensitive fields?

## Models and Providers

1. Second provider after Ollama: LM Studio, llama.cpp, other?
2. Max model size for "balanced" hardware profile?
3. Should engine manage model downloads or delegate to provider?
4. When to escalate model roles vs fail?

## Tool Packs

1. In-process vs sandboxed pack execution?
2. Version compatibility declaration format?
3. Community pack signing/checksums required?

## Pit Crew / Tracks

1. Automatic track classifier design?
2. Model suitability profile schema?
3. Which three proof tracks after Lighthouse (marketplace, code review, …)?

## Validation

1. What evidence bar promotes Lighthouse from experimental to confirmed for real client handoffs?
2. Hardware test matrix population—who runs and where are results stored?

## Archive Source

Many questions originated in `docs/99-archive/deprecated-plans/new-local-ai-engine-dev-docs/16-open-questions.md`. Review that file for additional historical context.
