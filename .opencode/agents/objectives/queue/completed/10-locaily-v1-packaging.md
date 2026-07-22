# Active Objective — M10: Locaily v1 Packaging

Package the validated Locaily runtime into a coherent private-alpha or public-v1 release candidate. A new user should be able to understand the system, install the Local Brain, add a trusted node, run a supported workflow, supervise it, and recover from common failures without reconstructing the project from internal notes. The release must state its proven boundaries honestly.

## Completion Conditions

- A supported installation path exists for the Local Brain on the primary target operating system.
- A guided setup flow verifies runtime prerequisites, storage paths, model availability, ports, and security defaults.
- A documented process exists to pair and verify a Relay Node.
- At least two complete example workflows ship with required tools, schemas, prompts, and qualification references.
- Default configuration keeps the Local Brain private to localhost or the explicitly configured trusted LAN.
- First-run diagnostics clearly report unavailable models, missing tools, invalid credentials, blocked ports, and unhealthy nodes.
- Versioned configuration and data migrations exist for release-owned persistent state.
- Backup and restore instructions exist for operator configuration, durable jobs, and evidence indexes.
- The operator can complete the core path: install → pair node → enqueue workflow → review execution → handle a gate → inspect evidence.
- Security limitations, supported hardware boundaries, and non-goals are documented prominently.
- README, architecture overview, operator guide, contributor guide, troubleshooting guide, and release notes agree with the implementation.
- A clean-environment acceptance script verifies installation and the core product loop.
- Release artifacts do not include private pilot data, local credentials, or machine-specific paths.
- Existing automated tests and the clean-environment acceptance test pass.
- Documentation is updated: `current-state.md`, `next-agent-brief.md`, `build-status.md`, `latest-build-result.json`, roadmap, release notes, and decision log.

## Out of Scope (this objective)

- Guaranteed support for every operating system or hardware profile.
- Public cloud control plane.
- App-store packaging.
- Automatic model downloading without license acknowledgement.
- Marketplace for third-party tracks or nodes.
- Claims that Locaily replaces frontier cloud models.

## Stop / Hand-Back

Hand back to a human if:

- The release target must be chosen between private alpha, public technical preview, and stable v1.
- Licensing is unresolved for any bundled model, runtime, tool, or example data.
- The installer requires elevated privileges or system changes beyond the approved setup boundary.
- Security review identifies a release-blocking issue.
- Documentation and observed behavior disagree on a core supported capability.
