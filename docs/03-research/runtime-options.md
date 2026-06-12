# Runtime Options

Provider backends Local Brain can route to for model-backed tools.

## Implemented

| Provider | Path | Status |
|---|---|---|
| `ollama` | `companion/runtime/ollama.js` | Confirmed |
| `mock` | provider router | Confirmed (tests/dev) |

Configuration via `companion/config.json` and `/providers/set` (in-memory today).

## Under Consideration

From archived architecture specs—not implemented unless code exists:

| Provider | Notes |
|---|---|
| LM Studio | OpenAI-compatible local server |
| llama.cpp server | Lightweight CPU inference |
| Liquid / LEAP | Mentioned in early provider list |
| OpenAI-compatible endpoint | Generic local gateway |
| whisper.cpp / voice worker | Future voice track |
| Optional cloud fallback | Explicitly non-default; privacy sensitive |

## Selection Principles

1. Local-first by default
2. Adapter pattern—no provider calls scattered in tools
3. Tools request **model roles**, not provider-specific APIs
4. Mock provider for CI and offline schema tests

## Open Questions

- Which second local provider to implement after Ollama
- Whether engine should manage model downloads or delegate to provider tools
- Persistent active provider across server restarts

## Related

- [model-candidates.md](./model-candidates.md)
- [../01-architecture/local-brain.md](../01-architecture/local-brain.md)
