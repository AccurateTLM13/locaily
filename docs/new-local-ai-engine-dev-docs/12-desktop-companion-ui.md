# 12 — Desktop Companion UI Spec

## Purpose

The Desktop Companion makes the invisible engine visible.

It should start as a control panel, not a chatbot.

## Primary Screens

```txt
Dashboard
Tools
Apps
Models
Logs
Settings
```

## Dashboard

Shows:

```txt
Engine status
Active provider
Loaded model
Installed tool count
Connected apps
Recent runs
Warnings
```

## Tools

Shows installed tool packs:

```txt
Official
Verified
Community
Experimental
Private
```

Each pack shows:

```txt
name
version
author
permissions
tools included
enabled/disabled
trust level
```

## Apps

Shows connected clients:

```txt
Desktop Companion
Chrome Bridge
Voice/Mumble
Demo Web App
Internal Tool
```

Each client shows:

```txt
status
last connected
approved permissions
source ID
```

## Models

Shows user-friendly roles first:

```txt
Fast Worker
Default Worker
Reasoning Worker
Voice Worker
```

Advanced view shows raw model names.

Controls:

```txt
Auto Model Switching: On/Off
Profile: Lightweight / Balanced / Developer
Unload sleeping models
Benchmark model
```

## Logs

Shows:

```txt
time
source
tool
model role
status
duration
warnings
```

Clicking a run opens details.

## Settings

Controls:

```txt
start on boot
default provider
model profile
allowed app origins
allowed file folders
audit log mode
```

## Design Rule

Do not make v1 a full chat UI.

The companion should answer:

```txt
Is the engine running?
What tools are installed?
What apps are connected?
What model is active?
What happened recently?
What needs permission?
```

## Acceptance Criteria

UI v1 is complete when:

- user can see engine running
- user can list tools
- user can approve/deny permissions
- user can see current model role
- user can view audit logs
- user can switch model profile
