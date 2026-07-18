#!/usr/bin/env node

const path = require("node:path");
const { createDevelopmentCandidateReviewInbox } = require("../companion/memory/events/candidate-review-inbox");

const ROOT = path.resolve(__dirname, "..");

function parseCommonArgs(argv) {
  const parsed = {
    project: "locaily",
    eventsDir: path.join(ROOT, "data", "memory", "development-events"),
    candidatesRoot: path.join(ROOT, "data", "memory", "development-candidates"),
    candidateId: null,
    status: "pending",
    action: null,
    reviewer: "cli",
    editedStatement: null,
    mergeTargetId: null,
    notes: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--project" && argv[index + 1]) {
      parsed.project = argv[index + 1];
      index += 1;
    } else if (token === "--events-dir" && argv[index + 1]) {
      parsed.eventsDir = path.resolve(argv[index + 1]);
      index += 1;
    } else if (token === "--candidates-root" && argv[index + 1]) {
      parsed.candidatesRoot = path.resolve(argv[index + 1]);
      index += 1;
    } else if (token === "--candidate-id" && argv[index + 1]) {
      parsed.candidateId = argv[index + 1];
      index += 1;
    } else if (token === "--status" && argv[index + 1]) {
      parsed.status = argv[index + 1];
      index += 1;
    } else if (token === "--action" && argv[index + 1]) {
      parsed.action = argv[index + 1];
      index += 1;
    } else if (token === "--reviewer" && argv[index + 1]) {
      parsed.reviewer = argv[index + 1];
      index += 1;
    } else if (token === "--edited-statement" && argv[index + 1]) {
      parsed.editedStatement = argv[index + 1];
      index += 1;
    } else if (token === "--merge-target-id" && argv[index + 1]) {
      parsed.mergeTargetId = argv[index + 1];
      index += 1;
    } else if (token === "--notes" && argv[index + 1]) {
      parsed.notes = argv[index + 1];
      index += 1;
    }
  }

  return parsed;
}

function createInbox(args) {
  return createDevelopmentCandidateReviewInbox({
    eventsDir: args.eventsDir,
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

async function runList(args) {
  const inbox = createInbox(args);
  const result = await inbox.listInbox({
    project: args.project,
    status: args.status
  });
  printResult(result);
}

async function runShow(args) {
  if (!args.candidateId) {
    console.error("Usage: npm run memory:candidates:show -- --candidate-id cand_...");
    process.exit(1);
  }

  const inbox = createInbox(args);
  const result = await inbox.getReviewDetail(args.candidateId);
  printResult(result);
}

async function runStatus(args) {
  const inbox = createInbox(args);
  const result = inbox.getInboxSummary({ project: args.project });
  printResult(result);
}

async function runAction(args) {
  if (!args.candidateId || !args.action) {
    console.error("Usage: npm run memory:candidates:review -- --candidate-id cand_... --action approve|edit_approve|reject|defer|merge");
    process.exit(1);
  }

  const inbox = createInbox(args);
  const result = await inbox.performAction({
    candidateId: args.candidateId,
    action: args.action,
    reviewer: args.reviewer,
    editedStatement: args.editedStatement,
    mergeTargetId: args.mergeTargetId,
    notes: args.notes
  });
  printResult(result);
}

function usage() {
  console.error(`Usage:
  npm run memory:candidates:review-status
  npm run memory:candidates:review-list -- [--status pending|deferred|approved|rejected|merged|all]
  npm run memory:candidates:review-show -- --candidate-id cand_...
  npm run memory:candidates:review -- --candidate-id cand_... --action approve|edit_approve|reject|defer|merge`);
}

async function main() {
  const command = process.argv[2];
  const args = parseCommonArgs(process.argv.slice(3));

  if (command === "status") {
    await runStatus(args);
    return;
  }

  if (command === "list") {
    await runList(args);
    return;
  }

  if (command === "show") {
    await runShow(args);
    return;
  }

  if (command === "action") {
    await runAction(args);
    return;
  }

  usage();
  process.exit(1);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
