#!/usr/bin/env node

const path = require("node:path");
const { createDevelopmentCandidateManager } = require("../companion/memory/events/candidate-manager");

const ROOT = path.resolve(__dirname, "..");

function parseCommonArgs(argv) {
  const parsed = {
    project: "locaily",
    eventsDir: path.join(ROOT, "data", "memory", "development-events"),
    sessionsRoot: path.join(ROOT, "data", "memory", "development-sessions"),
    candidatesRoot: path.join(ROOT, "data", "memory", "development-candidates"),
    sessionId: null,
    candidateType: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--project" && argv[index + 1]) {
      parsed.project = argv[index + 1];
      index += 1;
    } else if (token === "--events-dir" && argv[index + 1]) {
      parsed.eventsDir = path.resolve(argv[index + 1]);
      index += 1;
    } else if (token === "--sessions-root" && argv[index + 1]) {
      parsed.sessionsRoot = path.resolve(argv[index + 1]);
      index += 1;
    } else if (token === "--candidates-root" && argv[index + 1]) {
      parsed.candidatesRoot = path.resolve(argv[index + 1]);
      index += 1;
    } else if (token === "--session-id" && argv[index + 1]) {
      parsed.sessionId = argv[index + 1];
      index += 1;
    } else if (token === "--candidate-type" && argv[index + 1]) {
      parsed.candidateType = argv[index + 1];
      index += 1;
    }
  }

  return parsed;
}

function createManager(args) {
  return createDevelopmentCandidateManager({
    project: args.project,
    eventsDir: args.eventsDir,
    sessionsRoot: args.sessionsRoot,
    candidatesRoot: args.candidatesRoot
  });
}

function printResult(result) {
  if (!result.ok) {
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify(result, null, 2));
}

async function runExtract(args) {
  if (!args.sessionId) {
    console.error("Usage: npm run memory:candidates:extract -- --session-id sess_...");
    process.exit(1);
  }

  const manager = createManager(args);
  const result = await manager.extractFromSession({ sessionId: args.sessionId });
  printResult(result);
}

async function runList(args) {
  const manager = createManager(args);
  const result = manager.listCandidates({
    project: args.project,
    sessionId: args.sessionId || undefined,
    candidateType: args.candidateType || undefined
  });
  printResult(result);
}

async function runStatus(args) {
  const manager = createManager(args);
  const result = await manager.getStatus({ project: args.project });
  printResult(result);
}

function usage() {
  console.error(`Usage:
  npm run memory:candidates:extract -- --session-id sess_...
  npm run memory:candidates:list -- [--project locaily] [--session-id sess_...] [--candidate-type decision]
  npm run memory:candidates:status -- [--project locaily]`);
}

async function main() {
  const command = process.argv[2];
  const args = parseCommonArgs(process.argv.slice(3));

  if (command === "extract") {
    await runExtract(args);
    return;
  }

  if (command === "list") {
    await runList(args);
    return;
  }

  if (command === "status") {
    await runStatus(args);
    return;
  }

  usage();
  process.exit(1);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
