#!/usr/bin/env node

const { spawn } = require("node:child_process");
const { writeFile, mkdir } = require("node:fs/promises");
const { resolve, join } = require("node:path");
const { inspect } = require("node:util");

const VALID_POLICIES = ["local-only", "local-first", "distributed"];
const POLICY_TO_RELAY = {
  "local-only": "local_only",
  "local-first": "route_if_unavailable",
  "distributed": "distribute"
};

const DEFAULT_SERVER = "http://127.0.0.1:31313";
const DEFAULT_WORKFLOW = "website_audit.lighthouse_handoff";
const DEFAULT_REPEAT = 1;
const DEFAULT_OUTPUT_DIR = "data/pilot-evidence";

async function main(argv = process.argv.slice(2)) {
  const flags = parseFlags(argv);

  if (flags.help) {
    printHelp();
    return;
  }

  const policy = flags.policy || "local-only";
  if (!VALID_POLICIES.includes(policy)) {
    throw new Error(`Invalid --policy '${policy}'. Must be one of: ${VALID_POLICIES.join(", ")}`);
  }

  const workflow = flags.workflow || DEFAULT_WORKFLOW;
  const repeat = parseRepeat(flags.repeat);
  const outputDir = resolve(flags.output_dir || DEFAULT_OUTPUT_DIR);
  const serverUrl = flags.server || DEFAULT_SERVER;
  const inputPath = flags.input ? resolve(flags.input) : null;

  await mkdir(outputDir, { recursive: true });

  const input = inputPath ? require(inputPath) : buildDefaultInput();

  const alreadyRunning = await isServerRunning(serverUrl);
  const server = alreadyRunning ? null : await startServer();

  const runId = createRunId();
  const startedAt = new Date().toISOString();
  const results = [];

  console.log(`Pilot run ${runId}`);
  console.log(`  policy: ${policy}`);
  console.log(`  workflow: ${workflow}`);
  console.log(`  repeat: ${repeat}`);
  console.log(`  output: ${outputDir}`);
  console.log(`  server: ${serverUrl}`);
  console.log("");

  try {
    for (let i = 0; i < repeat; i++) {
      const runNumber = i + 1;
      console.log(`Run ${runNumber}/${repeat}...`);

      const runStart = Date.now();
      let response;
      let fetchError = null;

      try {
        response = await postJson(serverUrl, "/tracks/run", {
          track_id: workflow,
          input,
          options: {
            relay_policy: POLICY_TO_RELAY[policy]
          }
        }, 180000);
        if (!response || !response.body) {
          fetchError = new Error("No response received from server");
        }
      } catch (err) {
        fetchError = err;
      }

      const totalDurationMs = Date.now() - runStart;
      const ok = !fetchError && response && response.body && response.body.ok === true;
      const body = response ? response.body : null;

      if (!ok && process.env.PILOT_DEBUG) {
        console.log(`  DEBUG: fetchError=${fetchError ? fetchError.message : "null"}`);
        console.log(`  DEBUG: response.status=${response ? response.status : "null"}`);
        console.log(`  DEBUG: response.body=${body ? JSON.stringify(body).slice(0, 200) : "null"}`);
      }

      const relayPlacement = body && body.ok && body.relay_placement
        ? summarizeRelayPlacement(body.relay_placement)
        : null;

      const evidence = {
        run_id: runId,
        run_number: runNumber,
        policy,
        workflow,
        server: serverUrl,
        started_at: new Date(runStart).toISOString(),
        total_duration_ms: totalDurationMs,
        ok,
        error: fetchError ? { message: fetchError.message } : (body && body.error ? body.error : null),
        relay_placement: relayPlacement,
        track_run_record_id: body && body.ok && body.evidence ? body.evidence.trackRunRecordId : null,
        steps: body && body.ok && body.meta && body.meta.steps ? body.meta.steps : null,
        provider: body && body.ok ? body.provider : null,
        model: body && body.ok ? body.model : null
      };

      results.push(evidence);

      const evidenceFile = join(outputDir, `run-${runId}-${String(runNumber).padStart(3, "0")}.json`);
      await writeFile(evidenceFile, JSON.stringify(evidence, null, 2), "utf-8");

      console.log(`  ok=${ok}  duration=${totalDurationMs}ms  evidence=${evidenceFile}`);
    }

    const summaryFile = join(outputDir, `summary-${runId}.csv`);
    await writeFile(summaryFile, buildSummaryCsv(results, policy, workflow), "utf-8");

    console.log("");
    console.log(`Pilot run complete`);
    console.log(`  runs: ${results.length}`);
    console.log(`  ok: ${results.filter((r) => r.ok).length}`);
    console.log(`  summary: ${summaryFile}`);
  } finally {
    if (server) {
      server.kill();
    }
  }
}

function summarizeRelayPlacement(placement) {
  const planned = placement.planned || null;
  const actual = Array.isArray(placement.actual) ? placement.actual : [];
  const nodesUsed = new Set();
  for (const step of actual) {
    if (step.nodeId) nodesUsed.add(step.nodeId);
  }
  return {
    planned,
    actual_step_count: actual.length,
    relay_nodes_used: nodesUsed.size,
    relay_node_ids: Array.from(nodesUsed)
  };
}

function buildSummaryCsv(results, policy, workflow) {
  const header = "policy,workflow,run_number,total_duration_ms,ok,relay_nodes_used";
  const rows = results.map((r) => {
    const relayNodes = r.relay_placement ? r.relay_placement.relay_nodes_used : 0;
    return [
      csvEscape(policy),
      csvEscape(workflow),
      r.run_number,
      r.total_duration_ms,
      r.ok,
      relayNodes
    ].join(",");
  });
  return [header, ...rows].join("\n") + "\n";
}

function csvEscape(value) {
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildDefaultInput() {
  return {
    url: "https://example.com",
    scores: {
      performance: 35,
      accessibility: 85,
      bestPractices: 82,
      seo: 88
    },
    opportunities: [
      { id: "largest-contentful-paint-element", title: "Largest Contentful Paint element", severity: "high" },
      { id: "render-blocking-resources", title: "Eliminate render-blocking resources", severity: "high" }
    ]
  };
}

function parseRepeat(value) {
  if (value === undefined || value === true) return DEFAULT_REPEAT;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error("--repeat must be a positive integer.");
  }
  return n;
}

function parseFlags(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const eqIndex = token.indexOf("=");
    const key = token.slice(2, eqIndex === -1 ? undefined : eqIndex).replace(/-/g, "_");
    let value = eqIndex === -1 ? argv[i + 1] : token.slice(eqIndex + 1);

    if (eqIndex === -1 && (value === undefined || value.startsWith("--"))) {
      value = true;
    } else if (eqIndex === -1) {
      i++;
    }

    if (flags[key] === undefined) {
      flags[key] = value;
    } else if (Array.isArray(flags[key])) {
      flags[key].push(value);
    } else {
      flags[key] = [flags[key], value];
    }
  }
  return flags;
}

function createRunId() {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `pilot-${ts}-${rand}`;
}

async function isServerRunning(serverUrl) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    const response = await fetch(`${serverUrl}/health`, { signal: controller.signal });
    clearTimeout(timer);
    const body = await response.json();
    return body.ok === true;
  } catch {
    return false;
  }
}

async function startServer() {
  const child = spawn(process.execPath, ["companion/server.js"], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });

  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk) => { output += chunk.toString(); });

  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Companion server exited before startup.\n${output.trim()}`);
    }
    if (await isServerRunning(DEFAULT_SERVER)) {
      return child;
    }
    await sleep(300);
  }

  child.kill();
  throw new Error(`Timed out waiting for companion server.\n${output.trim()}`);
}

async function postJson(serverUrl, path, body, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${serverUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const text = await response.text();
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = { raw: text };
    }
    return { status: response.status, body: parsed };
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function printHelp() {
  console.log(`Pilot runner — execute track workflows and collect evidence for the M9 multi-device pilot.

Usage:
  node scripts/pilot/pilot-runner.js [options]

Options:
  --policy <mode>        Relay policy: local-only, local-first, distributed (default: local-only)
  --workflow <track-id>  Track ID to execute (default: website_audit.lighthouse_handoff)
  --input <path>         Path to JSON input file (default: synthetic Lighthouse input)
  --output-dir <path>    Where to write evidence files (default: data/pilot-evidence)
  --repeat <n>           Number of repeat runs (default: 1)
  --server <url>         Local Brain URL (default: http://127.0.0.1:31313)
  --help                 Show this help

Examples:
  node scripts/pilot/pilot-runner.js --policy local-only --repeat 3
  node scripts/pilot/pilot-runner.js --policy distributed --workflow website_audit.lighthouse_handoff
  node scripts/pilot/pilot-runner.js --policy local-first --input ./my-input.json
`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(inspect(error, { depth: 4, colors: false }));
    process.exitCode = 1;
  });
}

module.exports = { main, parseFlags, buildSummaryCsv, summarizeRelayPlacement };
