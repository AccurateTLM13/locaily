# License Notes

Research reminders for models, tools, and dependencies. **Not legal advice.**

## Repo Software

Check root `LICENSE` (if present) and per-folder notices before distribution.

## Model Weights

Each candidate model on Ollama or Hugging Face carries its own license (Apache, MIT, Llama Community License, etc.).

Before recommending a default model for testers:

- [ ] Read the model card license
- [ ] Note commercial use restrictions if any
- [ ] Document attribution requirements

## Tool Packs

Community tool packs may bundle prompts, schemas, and third-party API clients. Pack manifests should declare:

- pack license
- external service terms if network permissions are used

## Network Permissions

Engine design favors denying network permissions for community tools by default (see open questions in decisions folder). Confirm before enabling.

## Status

No consolidated license matrix committed in repo yet. Add rows here as models are officially adopted.

| Asset | License | Commercial use | Notes |
|---|---|---|---|
| | | | |
