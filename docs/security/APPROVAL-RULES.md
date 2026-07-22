# Approval Rules

## Automatic Approval

These actions execute without human approval:

- Read files inside the active project workspace
- Write temporary files created during the current session
- Write files inside the active project workspace
- Run approved deterministic tools (schema validation, text cleanup, Lighthouse parsing)
- Query registered local models (Ollama)
- Access Locaily internal endpoints (`/health`, `/tracks`, `/tools`, etc.)
- Access local model runtime (Ollama `/api/*`)
- Open local URLs (localhost)

## Human Approval Required

These actions pause execution and require explicit operator approval:

- Delete or overwrite existing user files
- Execute shell commands (pre-approved or arbitrary)
- Install software or dependencies
- Send messages or notifications
- Publish content to any external service
- Use paid APIs or services with billing implications
- Access or pass credentials to any service
- Transfer data to another device (NearbyNode or network)
- Add or modify a NearbyNode capability
- Write to Locaily configuration files
- Open external URLs in a browser
- Interact with browser extensions
- Register a new NearbyNode device
- Modify Locaily security or audit configuration

## Always Denied

These actions are rejected regardless of context:

- Disable audit logging
- Modify active security policy during execution
- Read credential stores directly
- Delete security or audit logs
- Execute unknown downloaded binaries
- Post to social media or public forums
- Install system-level packages
- Send Locaily project data to external services without explicit operator action
- Invoke unregistered NearbyNode capabilities
- Bypass the execution gate

## Approval Flow

When an action requires approval:

1. The action is paused before execution
2. The operator receives the action request with full context (action type, target, reason, risk level)
3. The operator may approve, deny, or add constraints
4. Approved actions execute with any applied constraints
5. The decision is recorded in the audit log

## Design Rationale

The approval boundary is deliberately conservative. Locaily is a local-first tool, but local-first does not mean risk-free. Model output is not trusted instruction — it is proposal. The operator is the final authority on what executes.
