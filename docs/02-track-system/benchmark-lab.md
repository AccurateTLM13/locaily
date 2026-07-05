# Track Qualification Through Model Lab

This document explains the relationship between Track contracts and Benchmark Lab / Model Lab.

The canonical Benchmark Lab system document is at [../02-systems/benchmark-lab.md](../02-systems/benchmark-lab.md).

## Relationship

- **Model Lab** is the public Locaily architecture layer for evaluating and qualifying models.
- **Benchmark Lab** is the implemented subsystem under `benchmark-lab/` that powers Model Lab.
- Benchmark Lab Milestone 1 is complete and operator-ready.

### Qualification Is Track-Specific

Benchmark Lab tests models against specific Track contracts:

```txt
Model + Track contract + prompt version + hardware context → evidence → qualification record
```

A model qualified for one Track is **not** globally qualified. Qualification records are narrow and evidence-based.

### Revalidation Triggers

Track-related changes that may invalidate existing qualification records:

- prompt or contract version bump
- schema or validator set change
- runtime or provider change
- model digest change
- hardware profile change
- suite config or test-pack modification

### Runtime Boundary

- Local Brain consumes compact qualification records through `companion/core/model-qualification-loader.js`.
- Track execution **must not** import `benchmark-lab/engine/` modules.
- Qualification policies are set via `options.qualification_policy` (`advisory` default).

### Canonical Track Run Records

Canonical Track Run Records (active build slice) are **not** automatically Benchmark Lab evidence. Run history must not be promoted into evidence without explicit review and a defined evidence path.

## Operator Workflow

See `benchmark-lab/OPERATOR_GUIDE.md` for the full CLI workflow: run → review → compare → promote → checksum verify.

## Related Docs

- [../02-systems/benchmark-lab.md](../02-systems/benchmark-lab.md) — canonical Benchmark Lab system document
- [../../benchmark-lab/OPERATOR_GUIDE.md](../../benchmark-lab/OPERATOR_GUIDE.md) — operator CLI workflow and trust boundaries
- [../../benchmark-lab/VALIDATION_CHECKLIST.md](../../benchmark-lab/VALIDATION_CHECKLIST.md) — pre-commit / pre-promotion checklist
