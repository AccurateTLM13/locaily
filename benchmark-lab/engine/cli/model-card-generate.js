#!/usr/bin/env node
const { generateModelCard } = require("../model-card");
const { parseArgs, printHelp, requireArgs } = require("./args");

async function main() {
  const args = parseArgs(process.argv.slice(2), {
    model: {},
    evidence: {
      multiple: true
    }
  });

  if (args.help) {
    printHelp({
      command: "npm run model-card:generate -- --model <model-id> --evidence <evidence-id>",
      description: "Generate committed model-card source and Markdown from promoted evidence.",
      options: [
        { flag: "--model <id>", description: "Model manifest id." },
        { flag: "--evidence <id>", description: "Promoted evidence id. May be repeated." },
        { flag: "--help", description: "Show this help." }
      ]
    });
    return;
  }

  requireArgs(args, ["model", "evidence"]);
  const result = await generateModelCard({
    modelId: args.model,
    evidenceIds: args.evidence
  });

  console.log(JSON.stringify({
    ok: true,
    modelId: result.modelId,
    sourcePath: result.sourcePath,
    markdownPath: result.markdownPath,
    checksumPaths: result.checksumPaths
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
