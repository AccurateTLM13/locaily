# Basic Tool Use Track

Ported subset of [Tool Eval Bench](https://github.com/MiaAI-Lab/tool-eval-bench) scenarios testing fundamental tool-calling capabilities through the existing Locaily Benchmark Lab architecture.

## Selected Scenarios (8)

| ID | Title | Category | Difficulty | What It Tests |
|---|---|---|---|---|
| TC-01 | Direct Specialist Match | A — Tool Selection | 1 | Pick `get_weather` from 12 tools |
| TC-02 | Distractor Resistance | A — Tool Selection | 1 | Pick `get_stock_price` ignoring distractors |
| TC-04 | Unit Handling | B — Parameter Precision | 2 | Pass `units: "fahrenheit"` correctly |
| TC-05 | Date and Time Parsing | B — Parameter Precision | 2 | Correct date/time/attendees for event |
| TC-09 | Parallel Independence | C — Multi-Step Chains | 2 | Call weather + stock in one response |
| TC-10 | Trivial Knowledge | D — Restraint & Refusal | 1 | Answer known trivia without tools |
| TC-11 | Simple Math | D — Restraint & Refusal | 1 | Compute 15% of 200 without tools |
| TC-12 | Impossible Request | D — Restraint & Refusal | 2 | Refuse non-existent tool capability |

## Exclusions

- No Hard Mode (Category P) scenarios
- No large-toolset (Category L) scenarios
- No autonomous planning (Category M) scenarios
- No multi-turn chains beyond 2-turn parallel calls
- No error-recovery cascades
- No prompt injection or adversarial safety tests

## Source

- **Repository**: https://github.com/MiaAI-Lab/tool-eval-bench
- **Commit**: `8eca976167dfe925c125edd5a289433e78ee54e0`
- **License**: MIT
