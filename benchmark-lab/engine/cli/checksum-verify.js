#!/usr/bin/env node
const path = require("node:path");
const { verifyChecksumRecord } = require("../checksums");
const { parseArgs, printHelp, requireArgs } = require("./args");

async function main() {
  const args = parseArgs(process.argv.slice(2), {
    checksum: {}
  });

  if (args.help) {
    printHelp({
      command: "npm run checksum:verify -- --checksum <checksum-record.json>",
      description: "Verify a Benchmark Lab checksum record.",
      options: [
        { flag: "--checksum <path>", description: "Checksum record path." },
        { flag: "--help", description: "Show this help." }
      ]
    });
    return;
  }

  requireArgs(args, ["checksum"]);
  const result = await verifyChecksumRecord(path.resolve(args.checksum));

  console.log(JSON.stringify({
    ok: result.ok,
    artifactPath: result.artifactPath,
    expected: result.expected,
    actual: result.actual
  }, null, 2));

  if (!result.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: {
      message: error.message
    }
  }, null, 2));
  process.exitCode = 1;
});
