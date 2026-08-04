# Model Cards

Model cards are separated by evidence maturity so researched candidates cannot be mistaken for Locaily-tested models.

## Layout

```txt
model-cards/
├─ candidates/   Manually researched intake cards; committed, unverified by default
├─ drafts/       Temporary generated artifacts; Git-ignored
└─ published/    Generated human-readable cards backed by promoted evidence and qualification records
```

## Candidate Cards

Candidate cards capture:

- Source-repository metadata
- The reason Locaily is considering the model
- Explicitly labeled role and hardware-fit hypotheses
- Tasks the model must not be trusted with before testing
- A first controlled validation plan
- Promotion requirements

A candidate card may use `verificationStatus: unverified` or `verificationStatus: tested`.

`tested` means at least one controlled local run exists. It does not mean the model is qualified, recommended, or suitable outside the tested contract.

See [`candidates/README.md`](./candidates/README.md) for the intake registry and status rules.

## Published Cards

Published cards are generated from approved evidence and qualification records through Benchmark Lab. Their claims must remain scoped to the exact model artifact, runtime, prompt or contract version, hardware profile, and Track that produced the evidence.

Do not manually promote source-repository benchmark claims into published cards or qualification fields.
