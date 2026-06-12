# 04 — Permission Manager Spec

## Purpose

The Permission Manager protects:

1. the user
2. the machine
3. local files
4. app boundaries
5. private context
6. network boundaries
7. model resource usage

It does not exist to make the system annoying. It exists so community tool packs can be trusted.

## Permission Categories

### Model Permissions

```txt
model.run
model.escalate
model.load
model.unload
model.benchmark
```

### Clipboard Permissions

```txt
clipboard.read
clipboard.write
```

### File Permissions

```txt
file.read
file.write
file.search
file.delete
```

File permissions should require scoped folders.

Example:

```json
{
  "permission": "file.read",
  "scope": "C:/Users/JP/Documents/LocalAIEngine"
}
```

### Browser Permissions

```txt
browser.read
browser.write
browser.capture_selection
browser.capture_page_text
browser.capture_url
```

### Network Permissions

```txt
network.fetch
network.send
```

Default v1 should block network access for community tools unless explicitly approved.

### Voice Permissions

```txt
voice.record
voice.transcribe
```

### Notes / Memory Permissions

```txt
notes.write
notes.read
memory.read
memory.write
memory.delete
```

### App Context Permissions

```txt
app.context.read
app.context.write
app.connect
app.disconnect
```

## Tool Manifest Permission Example

```json
{
  "id": "content-os",
  "name": "Content OS Tools",
  "version": "0.1.0",
  "permissions": [
    "model.run",
    "notes.write",
    "clipboard.write"
  ]
}
```

## Approval Modes

```txt
deny
allow_once
allow_session
always_allow
always_allow_scoped
```

## Runtime Behavior

Before any tool runs:

1. read requested permissions from tool manifest
2. compare against approved permissions
3. check scope restrictions
4. block or continue
5. log permissions used

## User-Facing Permission Prompt

```txt
Tool Pack: Content OS Tools

Wants to use:
✅ model.run — generate cleaned text
✅ notes.write — save generated note
⚠️ clipboard.write — copy result to clipboard

Allow?
[Allow Once] [Allow Always] [Deny]
```

## Security Rules

- A tool should only receive permissions declared in its manifest.
- A client should not grant permissions to another client.
- Community tools should be denied high-risk permissions by default.
- File access must be scoped.
- Network access must be explicit.
- Model escalation should be permissioned if it may load larger models.

## High-Risk Permissions

```txt
file.delete
file.write
network.send
browser.write
memory.delete
model.load_heavy
```

These should require explicit approval.

## Acceptance Criteria

The Permission Manager is done when:

- tools declare permissions
- engine blocks undeclared permissions
- engine prompts for missing approvals
- file scopes are enforced
- network access is off by default
- permissions are logged in audit events
