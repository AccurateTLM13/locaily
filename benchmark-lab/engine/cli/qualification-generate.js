#!/usr/bin/env node
const { generateQualification } = require("../qualification");
const { parseArgs, printHelp, requireArgs } = require("./args");

async function main() {
  const args = parseArgs(process.argv.slice(2), {
    model: {},
    evidence: {},
    role: {},
    status: {},
    roleStatus: {},
    note: {},
    overwrite: { boolean: true },
    force: { flag: true }
  });

  if (args.help) {
    printHelp({
      command: "npm run qualification:generate -- --model <model-id> --evidence <evidence-id> [--role <role> --role-status <status>] [--overwrite|--force]",
      description: "Generate a model qualification record from explicitly promoted evidence.",
      options: [
        { flag: "--model <id>", description: "Model manifest id." },
        { flag: "--evidence <id>", description: "Promoted evidence id." },
        { flag: "--status <state>", description: "Record status. Defaults to screening." },
        { flag: "--role <role>", description: "Optional Locaily model role." },
        { flag: "--role-status <state>", description: "Optional role qualification status." },
        { flag: "--note <text>", description: "Optional note." },
        { flag: "--overwrite", description: "Explicitly replace a differing qualification record." },
        { flag: "--force", description: "Replace an existing record whose content would differ." },
        { flag: "--help", description: "Show this help." }
      ]
    });
    return;
  }

  requireArgs(args, ["model", "evidence"]);
  const result = await generateQualification({
    modelId: args.model,
    evidenceId: args.evidence,
    role: args.role,
    status: args.status || "screening",
    roleStatus: args.roleStatus,
    notes: args.note ? [args.note] : [],
    overwrite: args.overwrite === true || args.force === true
  });

  console.log(JSON.stringify({
    ok: true,
    recordPath: result.recordPath,
    checksumPath: result.checksumPath,
    record: result.record
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: {
      message: error.message,
      validation: error.validation || null
    }
  }, null, 2));
  process.exitCode = 1;
});
