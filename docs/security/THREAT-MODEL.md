# Threat Model

## What Locaily Is Protecting Against

### Malicious or Compromised Models

A local model (or remote model via provider routing) produces output that attempts to:
- Read files outside the active project workspace
- Write or delete files without authorization
- Execute arbitrary shell commands
- Exfiltrate data over the network
- Modify Locaily configuration or security policy
- Disable audit logging

### Prompt Injection

External content (web pages, user-provided documents, Lighthouse reports) contains embedded instructions that attempt to:
- Override the original task intent
- Trick the model into issuing unauthorized tool calls
- Bypass approval gates
- Access credential stores

### Unsafe Tool Requests

A registered tool or track step requests execution of:
- Arbitrary shell commands
- Network calls to untrusted endpoints
- Filesystem operations outside the workspace
- Credential reads or writes
- Actions on NearbyNode devices without explicit scope

### Unauthorized Filesystem Access

Model or tool output attempts to:
- Read files outside the active project workspace
- Write to system directories
- Access other projects' data directories
- Modify Locaily runtime configuration

### Credential Access

Any attempt to:
- Read Locally stored credentials, API keys, or tokens
- Pass credentials to external services without approval
- Log credential values in audit records

### Network Exfiltration

Any attempt to:
- Send project data, logs, or credentials to external endpoints
- Open outbound connections to untrusted hosts
- Use local network access to reach other devices without policy evaluation

### NearbyNode Impersonation

Any attempt to:
- Register a fake NearbyNode device
- Advertise capabilities that a node does not actually have
- Invoke NearbyNode actions without going through the execution gate
- Access a node beyond its declared capability scope

### Agent Attempts to Disable Logging or Policy Enforcement

Any attempt to:
- Modify audit logging configuration during execution
- Change active security policy at runtime
- Suppress or filter audit records
- Bypass the policy evaluator

### Accidental Destructive Actions

Unintended but harmful operations:
- Deleting user files or project data
- Overwriting configuration
- Executing destructive shell commands
- Publishing content prematurely

### Third-Party Provider Compromise

A remote model provider or API key is compromised, and:
- Model output is manipulated to include unauthorized tool calls
- Provider-level logging captures sensitive inputs
- API responses contain injected instructions

## Protected Assets

| Asset | Why It Matters |
|---|---|
| User files | Irreplaceable project data, documents, configuration |
| Credentials | API keys, tokens, pairing secrets — access = full impersonation |
| Local models | Model binaries and configuration; tampering breaks all downstream trust |
| NearbyNodes | Trusted devices on the local network; compromise spreads laterally |
| Project data | Memory Bridge content, evidence records, track run records, qualification data |
| Logs | Audit trail, security evidence — tampering removes accountability |
| Configuration | Server config, policy definitions, tool pack manifests |
| Local network resources | Other devices, local services, browser extensions |

## Trust Assumptions

- The host machine is trusted (local-first model)
- Locaily runs as a single-user process on localhost
- The operator is the only human in the loop
- Locaily controls what executes — not the model
