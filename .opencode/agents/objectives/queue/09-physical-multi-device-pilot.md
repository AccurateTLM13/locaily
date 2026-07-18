# Active Objective — M9: Physical Multi-Device Pilot

Validate Locaily on real nearby hardware rather than multiple server processes on one machine. Run a controlled pilot using at least two physical devices with different capabilities, execute representative workflows under local-only and distributed policies, interrupt nodes deliberately, and collect evidence showing whether distribution provides practical value.

## Completion Conditions

- At least two physical devices are paired as trusted Locaily nodes, with one acting as the Local Brain.
- Each device has a documented hardware profile, operating system, runtime, available models/tools, and advertised capabilities.
- At least one workflow executes model steps on more than one physical device.
- At least one workflow combines a non-model capability such as storage, browser capture, OCR, search, or transcription with model execution.
- The pilot includes local-only, local-first, and distributed runs using the same representative inputs.
- Metrics include total completion time, time to first result, model load time, retry/fallback count, RAM/VRAM use where available, and operator-perceived delay.
- Planned and actual execution placement are captured in evidence for every pilot run.
- Node loss, timeout, stale heartbeat, invalid output, and Local Brain restart are deliberately tested.
- Local fallback preserves workflow completion where the track allows it.
- Human review scores compare output usefulness and correctness across local-only and distributed runs.
- A pilot report states where distribution helped, hurt, or made no meaningful difference.
- No claim of hardware efficiency or quality improvement is made without supporting measurements.
- Repeatable setup and teardown instructions are documented.
- Existing automated test suites continue to pass.
- Documentation is updated: `current-state.md`, `next-agent-brief.md`, `build-status.md`, `latest-build-result.json`, hardware profiles, pilot report, and decision log.

## Out of Scope (this objective)

- Large device fleets.
- Internet-routed nodes.
- Formal energy-lab certification.
- Phone support unless a suitable existing connector is already ready.
- Automatic hardware purchasing recommendations.
- General claims that distributed execution is always faster or better.

## Stop / Hand-Back

Hand back to a human if:

- Suitable physical devices or required local access are unavailable.
- A pilot step risks exposing private data outside the trusted network.
- Required runtimes or model licenses conflict with the project’s approved use.
- Hardware instability prevents producing repeatable evidence.
- The results show that the selected workflow is a poor test of multi-device value and a different pilot workflow must be chosen.
