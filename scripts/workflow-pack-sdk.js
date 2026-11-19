#!/usr/bin/env node
/**
 * scripts/workflow-pack-sdk.js
 *
 * Starter SDK CLI for Locaily Workflow Packs.
 *
 * Commands:
 *   list
 *   validate <pack-dir>
 *   init --id <pack-id> --name "<Name>" [--dir <parent-dir>] [--workflow-id <wf-id>]
 *   test <pack-dir>
 */

const fs = require("node:fs");
const path = require("node:path");
const {
  DEFAULT_PACKS_DIR,
  validateWorkflowPack,
  getDefaultWorkflowPackRegistry,
  reloadDefaultWorkflowPacks,
  evaluatePackPermissions,
  evaluatePackQualificationReadiness
} = require("../companion/packs");
const { createPermissionManager } = require("../companion/core/permissions");
const { createModelQualificationLoader } = require("../companion/core/model-qualification-loader");
const { createQualificationResolver } = require("../companion/core/qualification-resolver");
const { createToolRegistry } = require("../companion/tools/registry");
const { createMockRuntime } = require("../companion/providers/router");
const { buildRunPlan, executeRunPlan } = require("../companion/orchestration");

function parseFlagArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i += 1;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(token);
    }
  }
  return { flags, positional };
}

function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function cmdList() {
  const registry = getDefaultWorkflowPackRegistry();
  const permissionManager = createPermissionManager();
  const loader = createModelQualificationLoader();
  const resolver = createQualificationResolver({ loader });

  const packs = registry.listPacks().map((pack) => ({
    ...pack,
    permissionStatus: evaluatePackPermissions(pack, permissionManager),
    qualificationReadiness: evaluatePackQualificationReadiness(pack, resolver)
  }));

  console.log(JSON.stringify({
    ok: true,
    packsDir: DEFAULT_PACKS_DIR,
    count: packs.length,
    packs,
    errors: registry.getLoadErrors()
  }, null, 2));
}

function cmdValidate(positional) {
  const target = positional[0];
  if (!target) {
    console.error("Usage: node scripts/workflow-pack-sdk.js validate <pack-dir>");
    process.exit(1);
  }
  const result = validateWorkflowPack(path.resolve(target));
  const payload = {
    ok: result.ok,
    packId: result.packId,
    packDir: result.packDir,
    summary: result.summary,
    errors: result.errors,
    errorCodes: result.errorCodes,
    warnings: result.warnings
  };
  console.log(JSON.stringify(payload, null, 2));
  if (!result.ok) {
    process.exit(1);
  }
}

function cmdInit(flags) {
  const packId = typeof flags.id === "string" ? flags.id.trim() : "";
  if (!/^[a-z0-9][a-z0-9-]*$/.test(packId)) {
    console.error("Error: --id must be a non-empty kebab-case slug matching ^[a-z0-9][a-z0-9-]*$.");
    process.exit(1);
  }

  const name = typeof flags.name === "string" && flags.name.trim()
    ? flags.name.trim()
    : packId.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

  const defaultWfId = packId.replace(/-/g, "_").replace(/^([0-9])/, "pack_$1");
  const workflowId = typeof flags["workflow-id"] === "string" && flags["workflow-id"].trim()
    ? flags["workflow-id"].trim()
    : defaultWfId;

  if (!/^[a-z][a-z0-9_]*$/.test(workflowId)) {
    console.error("Error: --workflow-id must match ^[a-z][a-z0-9_]*$.");
    process.exit(1);
  }

  const parentDir = flags.dir ? path.resolve(flags.dir) : DEFAULT_PACKS_DIR;
  const targetDir = path.join(parentDir, packId);

  if (fs.existsSync(targetDir) && fs.readdirSync(targetDir).length > 0) {
    console.error(`Error: Target directory '${targetDir}' already exists and is not empty.`);
    process.exit(1);
  }

  const toolId = `${workflowId}.prepare`;
  const prepareTrackId = `${workflowId}.prepare`;
  const promptKey = `${workflowId}_prompt`;

  writeJsonFile(path.join(targetDir, "pack.json"), {
    schema: "locaily.workflow_pack.v1",
    id: packId,
    name,
    version: "0.1.0",
    trust: "experimental",
    description: `${name} self-contained Workflow Pack.`,
    workflows: [
      {
        workflow_id: workflowId,
        name,
        description: `Prepare input deterministically and summarize via core.summarize for ${name}.`,
        input_type: `${workflowId}_request`,
        output_type: `${workflowId}_summary`,
        status: "implemented",
        output_alias: "summarize",
        input_requirements: [
          {
            field: "text",
            type: "string",
            required: true,
            help: "Input text to prepare and summarize."
          }
        ],
        intake: {
          keywords: [packId, workflowId.replace(/_/g, " ")],
          phrases: [`run ${workflowId}`],
          examples: [`Run ${name} on this text`],
          input_hints: ["text"],
          negative_keywords: []
        },
        composition: [
          {
            as: "prepare",
            track_id: prepareTrackId,
            input_map: {
              text: "$input.text"
            }
          },
          {
            as: "summarize",
            track_id: "core.summarize",
            input_map: {
              text: "$artifacts.prepare.normalized_text",
              style: "brief",
              max_points: 3
            }
          }
        ]
      }
    ],
    tracks: [
      `tracks/${prepareTrackId}.track.json`
    ],
    track_metadata: {
      [prepareTrackId]: {
        purpose: `Normalize input text for ${name}.`,
        input_type: `${workflowId}_request`,
        output_type: "prepared_text",
        preferred_worker_type: "tool_only",
        fallback_behavior: "deterministic_tool",
        validation_expectations: {
          output_schema: "schemas/output.schema.json",
          required_result_sections: ["normalized_text", "char_count"]
        }
      }
    },
    tools: "tools/tool.json",
    prompts: {
      [promptKey]: `prompts/${workflowId}.md`
    },
    schemas: [
      "schemas/output.schema.json",
      `tools/schemas/${toolId}.input.schema.json`,
      `tools/schemas/${toolId}.output.schema.json`
    ],
    fixtures: [
      {
        name: "Default Starter Fixture",
        workflow_id: workflowId,
        path: "fixtures/sample.json",
        expected_fields: ["summary", "key_points"]
      }
    ],
    permissions: "permissions.json",
    qualification_requirements: "qualification-requirements.json",
    readme: "README.md"
  });

  writeJsonFile(path.join(targetDir, "tracks", `${prepareTrackId}.track.json`), {
    track_id: prepareTrackId,
    version: "0.1.0",
    name: `${name} Prepare`,
    description: `Deterministically normalize text for ${name}.`,
    output_schema: "schemas/output.schema.json",
    result_step: "prepare",
    steps: [
      {
        id: "prepare",
        input_map: {
          text: "$input.text"
        },
        executor: {
          type: "tool",
          tool: toolId,
          task: "run"
        }
      }
    ]
  });

  writeJsonFile(path.join(targetDir, "tools", "tool.json"), {
    id: `${packId}-tools`,
    name: `${name} Tools`,
    version: "0.1.0",
    trust: "experimental",
    description: `Tools bundled with ${name}.`,
    tools: [
      {
        id: toolId,
        name: `${name} Prepare Tool`,
        description: "Normalize caller text before summarization.",
        model_role: null,
        permissions: [],
        tasks: ["run"],
        input_schema: `schemas/${toolId}.input.schema.json`,
        output_schema: `schemas/${toolId}.output.schema.json`
      }
    ]
  });

  fs.mkdirSync(path.join(targetDir, "tools"), { recursive: true });
  fs.writeFileSync(
    path.join(targetDir, "tools", "index.js"),
`module.exports = {
  ${JSON.stringify(toolId)}: {
    validateInput(input) {
      if (!input || typeof input.text !== "string" || !input.text.trim()) {
        return {
          code: "INVALID_INPUT",
          message: "Input requires non-empty text.",
          nextStep: "Provide text as a non-empty string."
        };
      }
      return null;
    },
    async handle({ input }) {
      const normalized = String(input.text).replace(/\\s+/g, " ").trim();
      return {
        normalized_text: normalized,
        char_count: normalized.length
      };
    }
  }
};
`,
    "utf8"
  );

  const prepOutputSchema = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: `${name} Output`,
    type: "object",
    required: ["normalized_text", "char_count"],
    properties: {
      normalized_text: { type: "string", minLength: 1 },
      char_count: { type: "number", minimum: 1 }
    },
    additionalProperties: true
  };

  writeJsonFile(path.join(targetDir, "schemas", "output.schema.json"), prepOutputSchema);
  writeJsonFile(path.join(targetDir, "tools", "schemas", `${toolId}.output.schema.json`), prepOutputSchema);
  writeJsonFile(path.join(targetDir, "tools", "schemas", `${toolId}.input.schema.json`), {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: `${name} Input`,
    type: "object",
    required: ["text"],
    properties: {
      text: { type: "string", minLength: 1 }
    },
    additionalProperties: true
  });

  fs.mkdirSync(path.join(targetDir, "prompts"), { recursive: true });
  fs.writeFileSync(
    path.join(targetDir, "prompts", `${workflowId}.md`),
    `Summarize the prepared text for ${name}.\n\nText: {{text}}\n`,
    "utf8"
  );

  writeJsonFile(path.join(targetDir, "fixtures", "sample.json"), {
    input: {
      text: `Starter fixture input for ${name} workflow execution.`
    }
  });

  writeJsonFile(path.join(targetDir, "permissions.json"), {
    required: ["model.run"],
    optional: []
  });

  writeJsonFile(path.join(targetDir, "qualification-requirements.json"), [
    {
      track_id: "core.summarize",
      role: "default_worker",
      min_status: "qualified",
      min_score: 0.7
    }
  ]);

  fs.writeFileSync(
    path.join(targetDir, "README.md"),
    `# ${name}\n\nScaffolded by Locaily Workflow Pack Starter SDK.\n\n\`\`\`bash\nnpm run pack:validate -- ${targetDir}\nnpm run pack:test -- ${targetDir}\n\`\`\`\n`,
    "utf8"
  );

  const validation = validateWorkflowPack(targetDir);
  console.log(JSON.stringify({
    ok: validation.ok,
    packId,
    workflowId,
    targetDir,
    errors: validation.errors
  }, null, 2));

  if (!validation.ok) {
    process.exit(1);
  }
}

async function cmdTest(positional) {
  const target = positional[0];
  if (!target) {
    console.error("Usage: node scripts/workflow-pack-sdk.js test <pack-dir>");
    process.exit(1);
  }

  const packDir = path.resolve(target);
  const validation = validateWorkflowPack(packDir);
  if (!validation.ok) {
    console.error(JSON.stringify({
      ok: false,
      packDir,
      errors: validation.errors
    }, null, 2));
    process.exit(1);
  }

  const fixtures = validation.loaded.fixtures || [];
  if (fixtures.length === 0) {
    console.error(JSON.stringify({
      ok: false,
      packId: validation.packId,
      errors: ["Pack declares no fixtures to execute."]
    }, null, 2));
    process.exit(1);
  }

  const results = [];
  let passedCount = 0;

  try {
    reloadDefaultWorkflowPacks({ packDirs: [packDir] });
    const toolRegistry = createToolRegistry();
    const runtime = createMockRuntime();

    for (const fixture of fixtures) {
      const plan = buildRunPlan({
        workflowId: fixture.workflow_id,
        input: fixture.input
      });

      const execution = await executeRunPlan({
        plan,
        runtime,
        toolRegistry,
        recordOpts: { enabled: false }
      });

      const finalTarget = execution.result && execution.result.final
        ? execution.result.final
        : execution.result;
      const missingFields = (fixture.expected_fields || []).filter(
        (field) => !finalTarget || finalTarget[field] === undefined || finalTarget[field] === null
      );

      const passed = execution.plan.status === "completed"
        && execution.schemaValid !== false
        && missingFields.length === 0;

      if (passed) passedCount += 1;

      results.push({
        fixture: fixture.name,
        workflowId: fixture.workflow_id,
        status: execution.plan.status,
        schemaValid: execution.schemaValid,
        missingFields,
        passed
      });
    }
  } finally {
    reloadDefaultWorkflowPacks();
  }

  const ok = passedCount === results.length;
  console.log(JSON.stringify({
    ok,
    packId: validation.packId,
    packDir,
    passed: passedCount,
    total: results.length,
    results
  }, null, 2));

  if (!ok) {
    process.exit(1);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const { flags, positional } = parseFlagArgs(args.slice(1));

  if (!command || command === "--help" || command === "help") {
    console.log(`Locaily Workflow Pack Starter SDK

Usage:
  node scripts/workflow-pack-sdk.js list
  node scripts/workflow-pack-sdk.js validate <pack-dir>
  node scripts/workflow-pack-sdk.js init --id <pack-id> [--name "<Name>"] [--dir <parent-dir>] [--workflow-id <wf-id>]
  node scripts/workflow-pack-sdk.js test <pack-dir>`);
    return;
  }

  if (command === "list") {
    cmdList();
    return;
  }
  if (command === "validate") {
    cmdValidate(positional);
    return;
  }
  if (command === "init") {
    cmdInit(flags);
    return;
  }
  if (command === "test") {
    await cmdTest(positional);
    return;
  }

  console.error(`Unknown SDK command '${command}'.`);
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
