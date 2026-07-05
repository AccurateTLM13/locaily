# Security Policy

## Supported Scope

Locaily is a local-first project. Security concerns include:

- Localhost server exposure
- Unsafe CORS configuration
- Unintended network binding
- Path traversal
- Arbitrary file access
- Memory Bridge privacy leaks
- Sensitive audit logging
- Prompt injection crossing tool boundaries
- Unsafe tool permissions
- Command execution
- Secrets in setup/config files
- Malicious Track or Tool Pack manifests
- Benchmark artifacts leaking private paths or prompts
- Relay Node trust design (once implemented)

## Local-First Does Not Mean Risk-Free

- Localhost services can still be attacked by malicious local software or browser content
- Browser integrations require origin controls
- Local files and Memory Bridge content require strict boundaries
- Model output must not be treated as trusted instructions

## Reporting

Security issues should be opened cautiously through GitHub without including:

- Secrets or API keys
- Private data
- Exploit payloads
- Personal or local paths

A private reporting channel remains an owner decision.

## Current Non-Goals

The repository does not currently claim:

- Hardened multi-user deployment
- Public internet exposure
- Secure distributed Relay Nodes
- Sandboxed arbitrary third-party plugins
- Enterprise secrets management
