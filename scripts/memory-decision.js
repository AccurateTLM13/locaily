#!/usr/bin/env node

const path = require("node:path");
const capture = require("../companion/memory/events/capture");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data", "memory", "development-events");

function parseArgs(argv) {
  const parsed = {
    project: "locaily",
    title: "",
    reason: "",
    dataDir: path.join(ROOT, "data", "memory", "development-events")
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--project" && argv[index + 1]) {
      parsed.project = argv[index + 1];
      index += 1;
    } else if (token === "--title" && argv[index + 1]) {
      parsed.title = argv[index + 1];
      index += 1;
    } else if (token === "--reason" && argv[index + 1]) {
      parsed.reason = argv[index + 1];
      index += 1;
    } else if (token === "--data-dir" && argv[index + 1]) {
      parsed.dataDir = path.resolve(argv[index + 1]);
      index += 1;
    }
  }

  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.title.trim()) {
    console.error("Usage: npm run memory:decision -- --project locaily --title \"Decision title\" --reason \"Why\"");
    process.exit(1);
  }

  capture.init({
    project: args.project,
    dataDir: args.dataDir,
    failureLogPath: path.join(args.dataDir, "capture-failures.jsonl")
  });

  capture.emitDecisionRecorded({
    projectRoot: ROOT,
    projectSlug: args.project,
    title: args.title.trim(),
    reason: args.reason.trim()
  });

  // Allow async append to finish before exit.
  await new Promise((resolve) => setTimeout(resolve, 250));

  const { createDevelopmentEventStore } = require("../companion/memory/events/event-store");
  const store = createDevelopmentEventStore({ dataDir: args.dataDir });
  const recent = await store.queryEvents({ project: args.project, eventType: "decision_recorded", limit: 5 });
  const match = (recent.result.events || []).find((event) => event.summary.includes(args.title.trim()));

  if (!match) {
    console.error("Decision capture did not persist. Check capture-failures.jsonl for details.");
    process.exit(1);
  }

  console.log(JSON.stringify({ ok: true, eventId: match.eventId, summary: match.summary }, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
