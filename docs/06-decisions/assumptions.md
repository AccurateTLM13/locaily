# Assumptions

Working assumptions for Locaily. **Not all validated.** When an assumption becomes evidenced, move it to the decision log or architecture docs.

## Confirmed Assumptions (Repo Evidence)

| Assumption | Evidence |
|---|---|
| A local HTTP companion can coordinate tools and models | `companion/server.js`, smoke tests |
| Ollama is a viable first local provider | `companion/runtime/ollama.js` |
| Tool packs can load from manifests | `tool-packs/standard-text-pack/` |
| Legacy clients still need `/analyze` | compatibility tests, README |
| Lighthouse can run without model (deterministic path) | `lighthouse-handoff.js` `buildDemoResult` |
| Multi-step orchestration can run for one workflow | `orchestrator.js` |

## Experimental Assumptions (Not Proven)

| Assumption | Risk if wrong |
|---|---|
| Small models + orchestration match large model quality on selected tracks | May need larger models or cloud fallback for some workflows |
| Normal builders will adopt terminal-first setup | May block adoption until Desktop packaging |
| Nearby devices will expose capabilities without full models | May require heavier edge agents |
| Track metaphor helps users and agents reason about routing | May be marketing-only; classifier may stay technical |
| Tauri is best Desktop shell | Electron may be easier for some Windows integrations |
| Older hardware profiles are sufficient for Pit Crew workflows | May fail performance targets |

## Product Assumptions

- Users want local-first AI for privacy and cost—not only offline novelty
- Chrome extension workflows are a practical first client shape for Lighthouse
- Developers will contribute tool packs if manifests stay simple

## Non-Assumptions (Explicitly Not Taken)

- Bigger model is always the right fix
- Locaily must compete with frontier chatbots
- Every node must run inference
- Benchmark wins exist without measurement

## Review Cadence

Revisit experimental assumptions when:

- Lighthouse validation template is filled with data
- Hardware test matrix gets first populated column
- Tester feedback plan yields setup friction reports
