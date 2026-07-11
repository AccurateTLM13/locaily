#!/usr/bin/env node

const { spawn } = require("node:child_process");
const { inspect } = require("node:util");

const SERVER = "http://127.0.0.1:31313";
const TRACK_ID = "website_audit.lighthouse_handoff";
const DEFAULT_SCORES = {
  performance: 35,
  accessibility: 85,
  bestPractices: 82,
  seo: 88
};
const DEFAULT_OPPORTUNITIES = [
  {
    id: "largest-contentful-paint-element",
    title: "Largest Contentful Paint element",
    severity: "high"
  },
  {
    id: "render-blocking-resources",
    title: "Eliminate render-blocking resources",
    severity: "high"
  }
];

async function main(argv = process.argv.slice(2)) {
  const flags = parseFlags(argv);

  if (flags.help || !flags.url) {
    printHelp();
    if (!flags.url && !flags.help) process.exitCode = 1;
    return;
  }

  validateUrl(flags.url);

  const alreadyRunning = await isServerRunning();
  const server = alreadyRunning ? null : await startServer();
  const originalProvider = await getActiveProvider();

  try {
    if (flags.mock) {
      await setProvider("mock");
    }

    const input = buildInput(flags);
    const count = countFlag(flags.count);
    const results = [];

    for (let index = 0; index < count; index++) {
      const response = await postJson("/tracks/run", {
        track_id: TRACK_ID,
        input,
        options: buildRunOptions(flags)
      }, Number(flags.timeout_ms || 180000));

      if (!response.body || response.body.ok !== true) {
        const message = response.body?.error?.message || response.body?.message || `HTTP ${response.status}`;
        throw new Error(`Lighthouse run ${index + 1}/${count} failed: ${message}`);
      }

      results.push(response.body);
      const evidence = response.body.evidence || {};
      console.log(`run ${index + 1}/${count}: track_run_record_id=${evidence.trackRunRecordId || "-"}`);
    }

    const lastEvidence = results[results.length - 1]?.evidence || {};
    console.log("");
    console.log("Lighthouse run complete");
    console.log(`url=${input.url}`);
    console.log(`provider=${results[0]?.provider || originalProvider || "-"}`);
    console.log(`count=${count}`);
    console.log(`latest_track_run_record_id=${lastEvidence.trackRunRecordId || "-"}`);
    console.log(`latest_record_ref=${lastEvidence.trackRunRecordRef || "-"}`);
    console.log("");
    console.log("Next:");
    console.log("npm.cmd run quality-gate:lighthouse -- --dry-run");
  } finally {
    if (flags.mock && originalProvider && originalProvider !== "mock" && alreadyRunning) {
      await setProvider(originalProvider).catch(() => {});
    }
    if (server) {
      server.kill();
    }
  }
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

function validateUrl(url) {
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("URL must start with http:// or https://");
    }
  } catch (error) {
    throw new Error(`Invalid --url value: ${error.message}`);
  }
}

function buildInput(flags) {
  return {
    url: flags.url,
    scores: {
      performance: score(flags.performance, DEFAULT_SCORES.performance, "performance"),
      accessibility: score(flags.accessibility, DEFAULT_SCORES.accessibility, "accessibility"),
      bestPractices: score(flags.best_practices ?? flags.bestPractices, DEFAULT_SCORES.bestPractices, "best-practices"),
      seo: score(flags.seo, DEFAULT_SCORES.seo, "seo")
    },
    opportunities: parseOpportunities(flags.opportunity)
  };
}

function buildRunOptions(flags) {
  const options = {};
  if (flags.timeout_ms !== undefined && flags.timeout_ms !== true) {
    options.timeoutMs = Number(flags.timeout_ms);
  }
  if (flags.num_predict !== undefined && flags.num_predict !== true) {
    options.numPredict = Number(flags.num_predict);
  }
  return options;
}

function score(value, fallback, label) {
  if (value === undefined || value === true) return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 100) {
    throw new Error(`--${label} must be a number from 0 to 100.`);
  }
  return number;
}

function countFlag(value) {
  if (value === undefined || value === true) return 1;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    throw new Error("--count must be a positive integer.");
  }
  return number;
}

function parseOpportunities(value) {
  if (value === undefined || value === true) return DEFAULT_OPPORTUNITIES;
  const values = Array.isArray(value) ? value : [value];
  const parsed = values.map((item) => {
    const [id, title, severity = "medium"] = String(item).split(":");
    if (!id || !title) {
      throw new Error("--opportunity must use id:title:severity, for example render-blocking-resources:\"Eliminate render-blocking resources\":high");
    }
    return { id: id.trim(), title: title.trim(), severity: severity.trim() };
  });
  return parsed.length > 0 ? parsed : DEFAULT_OPPORTUNITIES;
}

async function isServerRunning() {
  try {
    const health = await getJson("/health", 1500);
    return health.status === 200 && health.body?.ok === true;
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
    if (await isServerRunning()) {
      return child;
    }
    await sleep(300);
  }

  child.kill();
  throw new Error(`Timed out waiting for companion server.\n${output.trim()}`);
}

async function getActiveProvider() {
  try {
    const status = await getJson("/providers/status", 3000);
    return status.body?.active_provider || null;
  } catch {
    return null;
  }
}

async function setProvider(provider) {
  const response = await postJson("/providers/set", { provider }, 10000);
  if (!response.body?.ok) {
    throw new Error(`Failed to set provider '${provider}'.`);
  }
}

async function getJson(path, timeoutMs) {
  return requestJson(path, { method: "GET" }, timeoutMs);
}

async function postJson(path, body, timeoutMs) {
  return requestJson(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  }, timeoutMs);
}

async function requestJson(path, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${SERVER}${path}`, {
      ...options,
      signal: controller.signal
    });
    const text = await response.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text };
    }
    return { status: response.status, body };
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function printHelp() {
  console.log(`Run the Lighthouse Handoff track for a URL and create a Track Run Record.

Usage:
  npm.cmd run lighthouse:run -- --url https://your-site.com
  npm.cmd run lighthouse:run -- --url https://your-site.com --count 5

Optional:
  --performance 35 --accessibility 85 --best-practices 82 --seo 88
  --opportunity "render-blocking-resources:Eliminate render-blocking resources:high"
  --mock

Notes:
  This command does not fetch a real Lighthouse report. It creates a synthetic
  Lighthouse input payload for the supplied URL unless you pass scores/findings.
`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(inspect(error, { depth: 4, colors: false }));
    process.exitCode = 1;
  });
}

module.exports = {
  buildInput,
  parseFlags,
  parseOpportunities,
  main
};
