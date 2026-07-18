#!/usr/bin/env node

const path = require("node:path");
const { createDevelopmentSessionManager } = require("../companion/memory/events/session-manager");

const ROOT = path.resolve(__dirname, "..");

function parseCommonArgs(argv) {
  const parsed = {
    project: "locaily",
    eventsDir: path.join(ROOT, "data", "memory", "development-events"),
    sessionsRoot: path.join(ROOT, "data", "memory", "development-sessions"),
    sessionId: null,
    objectiveId: null,
    runId: null,
    branch: null,
    label: null
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
    } else if (token === "--session-id" && argv[index + 1]) {
      parsed.sessionId = argv[index + 1];
      index += 1;
    } else if (token === "--objective-id" && argv[index + 1]) {
      parsed.objectiveId = argv[index + 1];
      index += 1;
    } else if (token === "--run-id" && argv[index + 1]) {
      parsed.runId = argv[index + 1];
      index += 1;
    } else if (token === "--branch" && argv[index + 1]) {
      parsed.branch = argv[index + 1];
      index += 1;
    } else if (token === "--label" && argv[index + 1]) {
      parsed.label = argv[index + 1];
      index += 1;
    }
  }

  return parsed;
}

function createManager(args) {
  return createDevelopmentSessionManager({
    project: args.project,
    eventsDir: args.eventsDir,
    sessionsRoot: args.sessionsRoot
  });
}

function printResult(result) {
  if (!result.ok) {
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify(result, null, 2));
}

async function runStart(args) {
  const manager = createManager(args);
  const result = manager.startSession({
    objectiveId: args.objectiveId,
    runId: args.runId,
    branch: args.branch,
    label: args.label
  });
  printResult(result);
}

async function runStatus(args) {
  const manager = createManager(args);
  const result = await manager.getStatus();
  printResult(result);
}

async function runClose(args) {
  const manager = createManager(args);
  const result = await manager.closeSession({
    sessionId: args.sessionId,
    interrupted: false
  });
  printResult(result);
}

async function runRebuild(args) {
  const manager = createManager(args);
  const sessionId = args.sessionId || manager.getActiveSessionId();
  const result = await manager.rebuildSession({ sessionId });
  printResult(result);
}

function usage() {
  console.error(`Usage:
  npm run memory:session:start -- [--project locaily] [--objective-id id] [--run-id id] [--branch name] [--label text]
  npm run memory:session:status -- [--project locaily]
  npm run memory:session:close -- [--session-id sess_...]
  npm run memory:session:rebuild -- [--session-id sess_...]`);
}

async function main() {
  const command = process.argv[2];
  const args = parseCommonArgs(process.argv.slice(3));

  if (command === "start") {
    await runStart(args);
    return;
  }

  if (command === "status") {
    await runStatus(args);
    return;
  }

  if (command === "close") {
    await runClose(args);
    return;
  }

  if (command === "rebuild") {
    await runRebuild(args);
    return;
  }

  usage();
  process.exit(1);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
