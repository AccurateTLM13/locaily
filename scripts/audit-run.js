#!/usr/bin/env node

const { spawn } = require("node:child_process");
const { inspect } = require("node:util");

const SERVER = "http://127.0.0.1:31313";

async function main(argv = process.argv.slice(2)) {
  const flags = parseFlags(argv);

  if (flags.help || !flags.url || !flags.track) {
    printHelp();
    if ((!flags.url || !flags.track) && !flags.help) process.exitCode = 1;
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

    const input = {
      url: flags.url,
      scores: {
        performance: score(flags.performance, 50, "performance"),
        accessibility: score(flags.accessibility, 85, "accessibility"),
        bestPractices: score(flags.best_practices ?? flags.bestPractices, 82, "best-practices"),
        seo: score(flags.seo, 88, "seo")
      },
      audits: {}
    };

    const timeoutMs = Number(flags.timeout_ms || 180000);
    const response = await postJson("/tracks/run", {
      track_id: flags.track,
      input,
      options: { timeoutMs }
    }, timeoutMs + 5000);

    if (!response.body || response.body.ok !== true) {
      const message = response.body?.error?.message || `HTTP ${response.status}`;
      throw new Error(`${flags.track} run failed: ${message}`);
    }

    const evidence = response.body.evidence || {};
    const result = response.body.result || {};

    console.log("");
    console.log(`=== ${flags.track} ===`);
    console.log(`URL: ${flags.url}`);
    console.log(`Run ID: ${evidence.trackRunRecordId || "-"}`);
    console.log(`Provider: ${response.body.provider || originalProvider || "-"}`);
    console.log(`Score: ${result.score ?? "-"}`);
    console.log(`Findings: ${Array.isArray(result.findings) ? result.findings.length : "-"}`);
    console.log(`Recommendations: ${Array.isArray(result.recommendations) ? result.recommendations.length : "-"}`);

    if (result.reportMarkdown) {
      const mdPath = `${flags.track.replace(/\./g, "-")}-${Date.now()}.md`;
      const { writeFile } = require("node:fs/promises");
      const { join } = require("node:path");
      await writeFile(join(process.cwd(), mdPath), result.reportMarkdown, "utf8");
      console.log(`Report: ${mdPath}`);
    }

    console.log("===========================================");
    return { trackRunRecordId: evidence.trackRunRecordId, result };
  } finally {
    if (flags.mock && originalProvider && originalProvider !== "mock" && alreadyRunning) {
      await setProvider(originalProvider).catch(() => {});
    }
    if (server) server.kill();
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

function score(value, fallback, label) {
  if (value === undefined || value === true) return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 100) {
    throw new Error(`--${label} must be a number from 0 to 100.`);
  }
  return number;
}

async function isServerRunning() {
  try {
    const health = await getJson("/health", 1500);
    return health.status === 200 && health.body?.ok === true;
  } catch { return false; }
}

async function startServer() {
  const child = spawn(process.execPath, ["companion/server.js"], {
    cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"], windowsHide: true
  });
  let output = "";
  child.stdout.on("data", (c) => { output += c.toString(); });
  child.stderr.on("data", (c) => { output += c.toString(); });
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Server exited.\n${output.trim()}`);
    if (await isServerRunning()) return child;
    await sleep(300);
  }
  child.kill();
  throw new Error(`Timed out.\n${output.trim()}`);
}

async function getActiveProvider() {
  try {
    const s = await getJson("/providers/status", 3000);
    return s.body?.active_provider || null;
  } catch { return null; }
}

async function setProvider(provider) {
  const r = await postJson("/providers/set", { provider }, 10000);
  if (!r.body?.ok) throw new Error(`Failed to set provider '${provider}'.`);
}

async function getJson(path, t) { return requestJson(path, { method: "GET" }, t); }

async function postJson(path, body, t) {
  return requestJson(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, t);
}

async function requestJson(path, options, t) {
  const c = new AbortController();
  const timer = setTimeout(() => c.abort(), t);
  try {
    const r = await fetch(`${SERVER}${path}`, { ...options, signal: c.signal });
    const text = await r.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
    return { status: r.status, body };
  } finally { clearTimeout(timer); }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function printHelp() {
  console.log(`Run an audit track for a URL.

Usage:
  npm.cmd run audit:a11y -- --url https://your-site.com
  npm.cmd run audit:seo -- --url https://your-site.com
  npm.cmd run audit:budget -- --url https://your-site.com

Or with explicit track:
  node scripts/audit-run.js --track website_audit.accessibility_deep --url https://your-site.com

Flags:
  --track TRACK_ID    Track to run (or use npm script)
  --url URL           Required. The page URL to analyze.
  --mock              Use mock provider.
  --performance N     Override performance score.
  --timeout-ms N      Timeout in ms (default 180000).
  --help              Show this help.
`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(inspect(error, { depth: 4, colors: false }));
    process.exitCode = 1;
  });
}

module.exports = { main, parseFlags };
