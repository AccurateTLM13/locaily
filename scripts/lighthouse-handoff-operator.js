#!/usr/bin/env node

const { spawn } = require("node:child_process");
const { join } = require("node:path");
const { inspect } = require("node:util");
const { main: runQualityGate } = require("./lighthouse-human-gate");

const SERVER = "http://127.0.0.1:31313";
const TRACK_ID = "website_audit.lighthouse_handoff";
const REVIEW_DIR = join(__dirname, "..", "benchmark-lab", "evidence", "reviews");
const FULL_HANDOFF_MD = join(REVIEW_DIR, "lighthouse-human-gate-full-handoff-v1.md");

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
    const timeoutMs = Number(flags.timeout_ms || 360000);
    const trackResponse = await postJson("/tracks/run", {
      track_id: TRACK_ID,
      input,
      options: { timeoutMs }
    }, timeoutMs + 5000);

    if (!trackResponse.body || trackResponse.body.ok !== true) {
      const message = trackResponse.body?.error?.message || `HTTP ${trackResponse.status}`;
      throw new Error(`Lighthouse handoff track run failed: ${message}`);
    }

    const evidence = trackResponse.body.evidence || {};
    const trackRunRecordId = evidence.trackRunRecordId || "-";
    const steps = trackResponse.body.steps || [];
    const enforcedSteps = steps.filter((s) => s.enforcementDecision?.applied === true);
    const fallbackSteps = steps.filter((s) => s.enforcementDecision?.fallbackTriggered === true);

    console.log("");
    console.log(`Track run complete: ${trackRunRecordId}`);
    console.log(`url=${input.url}`);
    console.log(`provider=${trackResponse.body.provider || originalProvider || "-"}`);
    console.log(`enforced_roles=${enforcedSteps.length}`);
    console.log(`fallback_count=${fallbackSteps.length}`);

    const gateArgs = [
      "--url", flags.url,
      "--artifact", "full-handoff",
      "--latest-n", "1"
    ];
    if (flags.dry_run) gateArgs.push("--dry-run");
    if (flags.approve_safe) gateArgs.push("--approve-safe");

    const gateResult = await runQualityGate(gateArgs);

    const summary = gateResult?.summary || {};
    const decision = gateResult?.decision || {};

    console.log("");
    console.log("=== Lighthouse Handoff Operator Summary ===");
    console.log(`URL: ${input.url}`);
    console.log(`Run ID: ${trackRunRecordId}`);
    console.log(`Enforced roles applied: ${enforcedSteps.length}`);
    console.log(`Fallback count: ${fallbackSteps.length}`);
    console.log(`Quality gate decision: ${decision.recommendedDecision || "-"}`);
    console.log(`Proposed pass: ${summary.proposedPass || 0}`);
    console.log(`Proposed needs_edit: ${summary.proposedNeedsEdit || 0}`);
    console.log(`Proposed fail: ${summary.proposedFail || 0}`);
    console.log(`Safe reviews written: ${gateResult?.approvedCount || 0}`);
    console.log(`Full handoff: ${FULL_HANDOFF_MD}`);
    if (flags.dry_run) console.log("Mode: dry-run (no review records written)");
    console.log("===========================================");

    return { trackRunRecordId, gateResult };
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
      performance: score(flags.performance, 50, "performance"),
      accessibility: score(flags.accessibility, 85, "accessibility"),
      bestPractices: score(flags.best_practices ?? flags.bestPractices, 82, "best-practices"),
      seo: score(flags.seo, 88, "seo")
    },
    opportunities: parseOpportunities(flags.opportunity)
  };
}

function score(value, fallback, label) {
  if (value === undefined || value === true) return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 100) {
    throw new Error(`--${label} must be a number from 0 to 100.`);
  }
  return number;
}

function parseOpportunities(value) {
  if (value === undefined || value === true) {
    return [
      { id: "largest-contentful-paint-element", title: "Largest Contentful Paint element", severity: "high" },
      { id: "render-blocking-resources", title: "Eliminate render-blocking resources", severity: "high" }
    ];
  }
  const values = Array.isArray(value) ? value : [value];
  return values.map((item) => {
    const [id, title, severity = "medium"] = String(item).split(":");
    if (!id || !title) {
      throw new Error("--opportunity must use id:title:severity, e.g. render-blocking-resources:\"Eliminate render-blocking resources\":high");
    }
    return { id: id.trim(), title: title.trim(), severity: severity.trim() };
  });
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
  console.log(`Run the full Lighthouse Handoff pipeline for a URL.

Usage:
  npm.cmd run lighthouse:handoff -- --url https://your-site.com
  npm.cmd run lighthouse:handoff -- --url https://your-site.com --dry-run
  npm.cmd run lighthouse:handoff -- --url https://your-site.com --approve-safe

Pipeline:
  1. Run Lighthouse handoff track (priority_helper → developer_task_writer → guardrail_writer → testing_checklist_writer → compose-handoff)
  2. Generate full-handoff quality gate packet
  3. Print operator summary

Flags:
  --url URL            Required. The page URL to analyze.
  --dry-run            Generate quality gate packet without writing review records.
  --approve-safe       Auto-approve safe pass reviews after gate validation.
  --mock               Use mock provider instead of Ollama.
  --performance N      Override performance score (0-100, default 50).
  --accessibility N    Override accessibility score (0-100, default 85).
  --best-practices N   Override best practices score (0-100, default 82).
  --seo N              Override SEO score (0-100, default 88).
  --opportunity STR    Override opportunity (id:title:severity). Repeatable.
  --timeout-ms N       Track run timeout in ms (default 360000).
  --help               Show this help.
`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(inspect(error, { depth: 4, colors: false }));
    process.exitCode = 1;
  });
}

module.exports = { main, buildInput, parseFlags };
