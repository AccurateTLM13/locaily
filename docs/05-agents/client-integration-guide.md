# Tool Integration Guide - Local AI Platform

## Client Flow

New clients should follow this flow:

```txt
1. Call GET /health.
2. Read canonicalEndpoint and compatibilityEndpoints.
3. Call GET /tools.
4. Run tools through POST /tasks/run.
5. Fall back gracefully when provider/model/tool execution is unavailable.
```

Existing clients may continue to use legacy `POST /analyze`.

## Health Check

```js
async function checkLocalAI() {
  try {
    const response = await fetch("http://127.0.0.1:31313/health");
    return await response.json();
  } catch (error) {
    return {
      ok: false,
      code: "COMPANION_NOT_RUNNING",
      message: "Local AI companion was not detected."
    };
  }
}
```

## Tool Discovery

```js
async function listTools() {
  const response = await fetch("http://127.0.0.1:31313/tools");
  return response.json();
}
```

## Canonical Task Run

```js
async function runTool(tool, input, options = {}) {
  const response = await fetch("http://127.0.0.1:31313/tasks/run", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      tool,
      input,
      context: {
        source: "example-client"
      },
      options
    })
  });

  return response.json();
}
```

Example:

```js
await runTool("text.validate_schema", {
  data: {
    title: "Example"
  },
  schema: {
    type: "object",
    required: ["title"]
  }
});
```

## Legacy Analyze

Legacy clients can keep this shape:

```js
async function analyzeListing(listing) {
  const response = await fetch("http://127.0.0.1:31313/analyze", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      tool: "deal-sniper",
      task: "analyze-listing",
      input: listing
    })
  });

  return response.json();
}
```

Do not build new integrations on `/analyze` unless compatibility with an old client is the goal.

## Tool Handler Contract

Tool handlers return raw result objects only. The platform wraps them into the endpoint envelope.

Tool definitions should declare:

```txt
id
name
pack
description
tasks
permissions
modelRole
requiresRuntime
input/output schema metadata
validateInput()
handle()
```

## Runtime-Free Tools

A tool can set:

```js
requiresRuntime: false
```

Runtime-free tools still pass through input validation, permissions, result validation, and audit logging.

## Client UI States

Suggested states:

| State | Meaning |
|---|---|
| `companion-missing` | Local server not detected |
| `provider-unavailable` | Provider such as Ollama is not reachable |
| `model-unavailable` | Selected model or role model is unavailable |
| `connected` | Local engine is ready |
| `running` | Request is in progress |
| `fallback` | Tool execution failed and client fallback is active |

## Lighthouse Handoff (first workflow client)

Extension repo: https://github.com/mnfrdrsh/lighthouse-handoff

The extension currently generates Markdown client-side from PSI. Optional Local Brain enhancement uses the same tool id:

```js
await runTool("lighthouse-handoff", {
  url: auditedUrl,
  scores: { performance, accessibility, bestPractices, seo },
  opportunities,
  diagnostics
}, {
  execution_mode: "orchestrated" // or "baseline" or omit for deterministic
});
```

Bridge spec and validation tiers: [../02-workflows/lighthouse-handoff-extension-integration.md](../02-workflows/lighthouse-handoff-extension-integration.md), [../02-workflows/lighthouse-handoff-validation.md](../02-workflows/lighthouse-handoff-validation.md).

## Compatibility Rule

Treat `/tasks/run` as canonical and `/analyze` as compatibility. Do not rely on raw model prose; always consume structured JSON envelopes.
