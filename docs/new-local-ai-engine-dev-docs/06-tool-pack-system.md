# 06 — Tool Pack System

## Purpose

Tool Packs are the plugin system.

They let people add capabilities without changing Engine Core.

## Mental Model

```txt
Tool Pack = WordPress plugin for local AI tools
Tool      = one function/action inside that plugin
```

## Directory Shape

```txt
tool-packs/
└── content-os/
    ├── tool.json
    ├── README.md
    ├── index.ts
    ├── schemas.ts
    ├── examples/
    │   ├── clean-builder-note.input.json
    │   └── clean-builder-note.output.json
    └── tests/
```

## Tool Manifest

```json
{
  "id": "standard-text-pack",
  "name": "Standard Text Tools",
  "version": "0.1.0",
  "author": "Local AI Engine",
  "description": "Core text cleanup, summarization, extraction, and validation tools.",
  "permissions": [
    "model.run"
  ],
  "tools": [
    {
      "id": "text.clean",
      "description": "Clean messy text into a structured format.",
      "model_role": "default_worker",
      "input_schema": "schemas/text.clean.input.schema.json",
      "output_schema": "schemas/text.clean.output.schema.json"
    },
    {
      "id": "text.extract_json",
      "description": "Extract structured JSON from unstructured text.",
      "model_role": "fast_worker",
      "input_schema": "schemas/text.extract_json.input.schema.json",
      "output_schema": "schemas/text.extract_json.output.schema.json"
    }
  ]
}
```

## Tool ID Naming

Use dot notation:

```txt
category.action
```

Examples:

```txt
text.clean
text.summarize
text.extract_json
clipboard.write
browser.extract_selection
content.clean_builder_note
voice.transcribe
```

## Tool Contract

Every tool must define:

```txt
id
description
permissions
input schema
output schema
default model role
run handler
examples
tests
```

## Tool Run Handler Shape

```ts
export default defineTool({
  id: "text.clean",
  description: "Clean messy text into structured markdown.",
  permissions: ["model.run"],
  modelRole: "default_worker",
  inputSchema,
  outputSchema,
  run: async ({ input, context, model, logger }) => {
    const result = await model.generateStructured({
      role: "default_worker",
      task: "clean_text",
      input,
      outputSchema
    });

    return result;
  }
});
```

## Standard Tool Pack Categories

### standard-text-pack

```txt
text.clean
text.summarize
text.extract_json
text.classify
text.detect_injection
text.validate_schema
```

### clipboard-pack

```txt
clipboard.read
clipboard.write
```

### notes-pack

```txt
notes.create
notes.append
notes.search
```

### browser-pack

```txt
browser.receive_context
browser.summarize_selection
browser.extract_page_text
```

### voice-pack

Phase 2:

```txt
voice.transcribe
voice.clean_transcript
voice.command_to_action
```

## Tool Pack Trust Levels

```txt
official
verified
community
experimental
local_private
```

## Tool Installation Rules

- official packs can be enabled by default
- community packs require permission review
- experimental packs show warning
- private local packs are user-controlled
- high-risk permissions require explicit approval

## Acceptance Criteria

The Tool Pack system is done when:

- engine can discover packs
- engine can validate manifests
- engine can list tools
- engine can run a tool by ID
- permissions are enforced
- invalid packs are ignored with useful errors
- tool results use the standard result envelope
