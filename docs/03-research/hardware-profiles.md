# Hardware Profiles

Target deployment profiles for Locaily research. **Not validated** against all workflows yet.

## Design Intent

Locaily should remain useful on modest hardware when workflows are decomposed and validators are strict.

## Reference Profiles

### Profile A — Developer Laptop (primary dev target)

- Modern quad-core+ CPU
- 16 GB RAM
- Optional consumer GPU
- Ollama with ~3B class models

### Profile B — Modest / Older Desktop

- Older quad-core CPU
- 8 GB RAM
- CPU-only inference
- Smallest role models (sub-2B) for narrow steps

### Profile C — Recycled Hardware (research goal)

- Older GPU or CPU-only
- 8 GB RAM or less
- Emphasis on deterministic tools + one small model at a time

### Profile D — Nearby Device (future)

- Phone or tablet as capability node
- May offload no inference; connector-only

## Constraints to Track

- Model load/unload time
- Concurrent step execution
- Thermal throttling on laptops
- Disk space for model weights

## Test Matrix

Use [hardware-test-matrix.md](./hardware-test-matrix.md) when running structured tests.

## Open Questions

- Minimum viable RAM for orchestrated Lighthouse track
- Whether model hot-cache should be a first-class feature
- Phone-as-NearbyNode feasibility
