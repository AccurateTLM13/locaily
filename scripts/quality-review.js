#!/usr/bin/env node

const { inspect } = require("node:util");
const { loadRecord, listAllRecords } = require("../companion/evidence/track-run-record-store");
const {
  buildQualitySummary,
  listReviews,
  loadReview,
  upsertReview
} = require("../companion/evidence/human-review-record-store");

const VERDICT_DEFAULTS = {
  pass: {
    usefulnessScore: 4,
    accuracyScore: 4,
    structureScore: 4,
    clarityScore: 4,
    riskScore: 1,
    correctionRequired: false
  },
  needs_edit: {
    usefulnessScore: 3,
    accuracyScore: 3,
    structureScore: 4,
    clarityScore: 3,
    riskScore: 2,
    correctionRequired: true
  },
  fail: {
    usefulnessScore: 1,
    accuracyScore: 1,
    structureScore: 2,
    clarityScore: 2,
    riskScore: 4,
    correctionRequired: true
  }
};

async function main(argv = process.argv.slice(2)) {
  const { command, args, flags } = parseArgs(argv);
  const normalized = normalizeCommand(command);

  if (!normalized || normalized === "help") {
    printHelp();
    return;
  }

  if (normalized === "list") {
    await listRuns(flags);
    return;
  }

  if (normalized === "show") {
    await showRun(args[0]);
    return;
  }

  if (normalized === "summary") {
    await printSummary();
    return;
  }

  if (["pass", "needs_edit", "fail"].includes(normalized)) {
    await writeReview(normalized, args[0], flags);
    return;
  }

  throw new CliError(`Unknown command '${command}'. Run: npm.cmd run quality-review -- help`);
}

function parseArgs(argv) {
  const positional = [];
  const flags = {};

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }

    const eqIndex = token.indexOf("=");
    const key = normalizeFlagName(token.slice(2, eqIndex === -1 ? undefined : eqIndex));
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

  return {
    command: positional[0],
    args: positional.slice(1),
    flags
  };
}

function normalizeCommand(command = "") {
  if (command === "needs-edit") return "needs_edit";
  return command;
}

function normalizeFlagName(name) {
  return name.replace(/-/g, "_");
}

async function listRuns(flags) {
  const limit = toNumber(flags.limit, 10);
  const records = await listAllRecords();
  const reviews = await listReviews();
  const reviewByRun = new Map(reviews.map((review) => [review.trackRunId, review]));

  const filtered = records
    .filter((record) => !record.parentRunId)
    .filter((record) => !flags.track || record.trackId === flags.track)
    .slice(0, limit);

  if (filtered.length === 0) {
    console.log("No Track Run Records found.");
    return;
  }

  for (const record of filtered) {
    const modelChild = findModelChild(record);
    const review = reviewByRun.get(record.recordId);
    const enforcement = modelChild?.routing?.enforcementDecision;
    const executed = enforcement?.executedCapabilityId || modelChild?.execution?.modelInfo?.modelId || "-";
    const role = modelChild?.execution?.modelInfo?.role || "-";
    const verdict = review ? review.verdict : "unreviewed";
    console.log(`${record.recordId} | ${record.trackId} | ${record.execution?.status || "-"} | ${verdict}`);
    console.log(`  created=${record.timestamps?.createdAt || "-"} role=${role} executed=${executed}`);
    console.log(`  output=${record.output?.outputSummary || "-"}`);
  }
}

async function showRun(trackRunId) {
  if (!trackRunId) throw new CliError("Missing trackRunId. Example: npm.cmd run quality-review -- show track-...");

  const record = await loadRecord(trackRunId);
  if (!record) throw new CliError(`Track Run Record not found: ${trackRunId}`);

  const review = await loadReview(trackRunId);
  const modelChild = findModelChild(record);

  console.log(`${record.recordId}`);
  console.log(`track=${record.trackId}`);
  console.log(`status=${record.execution?.status || "-"}`);
  console.log(`created=${record.timestamps?.createdAt || "-"}`);
  console.log(`output=${record.output?.outputSummary || "-"}`);

  if (modelChild) {
    const enforcement = modelChild.routing?.enforcementDecision;
    console.log("");
    console.log("Model step:");
    console.log(`  role=${modelChild.execution?.modelInfo?.role || "-"}`);
    console.log(`  selected=${modelChild.routing?.capabilityId || "-"}`);
    console.log(`  executed=${enforcement?.executedCapabilityId || modelChild.execution?.modelInfo?.modelId || "-"}`);
    console.log(`  output=${modelChild.output?.outputSummary || "-"}`);
  }

  console.log("");
  if (review) {
    console.log("Review:");
    printReview(review);
  } else {
    console.log("Review: unreviewed");
  }
}

async function printSummary() {
  const summary = buildQualitySummary(await listReviews());
  console.log(`total=${summary.totalReviewedRuns}`);
  console.log(`pass=${summary.passCount}`);
  console.log(`needs_edit=${summary.needsEditCount}`);
  console.log(`fail=${summary.failCount}`);
  console.log(`pass_rate=${formatMetric(summary.passRate)}%`);
  console.log(`correction_rate=${formatMetric(summary.correctionRate)}%`);
  console.log(`avg_usefulness=${formatMetric(summary.averageUsefulnessScore)}`);
  console.log(`avg_accuracy=${formatMetric(summary.averageAccuracyScore)}`);
  console.log(`avg_structure=${formatMetric(summary.averageStructureScore)}`);
  console.log(`critical_risk=${summary.criticalRiskCount}`);
  console.log(`common_failure_reasons=${formatFailureReasons(summary.commonFailureReasons)}`);
}

async function writeReview(verdict, trackRunId, flags) {
  if (!trackRunId) throw new CliError(`Missing trackRunId. Example: npm.cmd run quality-review -- ${verdict} track-...`);

  const trackRun = await loadRecord(trackRunId);
  if (!trackRun) throw new CliError(`Track Run Record not found: ${trackRunId}`);

  if (verdict === "needs_edit" && !stringFlag(flags.correction)) {
    throw new CliError("needs-edit requires --correction \"...\" so the fix is captured separately from model output.");
  }

  if (verdict === "fail" && normalizeList(flags.reason).length === 0) {
    throw new CliError("fail requires at least one --reason \"...\".");
  }

  const defaults = VERDICT_DEFAULTS[verdict];
  const body = {
    ...defaults,
    reviewer: stringFlag(flags.reviewer) || process.env.USERNAME || process.env.USER || "operator",
    usefulnessScore: scoreFlag(flags.usefulness, defaults.usefulnessScore, "usefulness"),
    accuracyScore: scoreFlag(flags.accuracy, defaults.accuracyScore, "accuracy"),
    structureScore: scoreFlag(flags.structure, defaults.structureScore, "structure"),
    clarityScore: scoreFlag(flags.clarity, defaults.clarityScore, "clarity"),
    riskScore: scoreFlag(flags.risk, defaults.riskScore, "risk"),
    riskFlags: normalizeList(flags.risk_flag),
    verdict,
    correctionText: stringFlag(flags.correction) || "",
    reviewerNotes: stringFlag(flags.notes) || "",
    failureReasons: normalizeList(flags.reason)
  };

  const { review, created } = await upsertReview({ trackRun, body });
  console.log(`${created ? "created" : "updated"} review for ${trackRunId}`);
  printReview(review);
}

function findModelChild(record) {
  const children = Array.isArray(record.childRuns) ? record.childRuns : [];
  return children.find((child) => child.routing?.enforcementDecision)
    || children.find((child) => child.routing?.executorType === "model")
    || null;
}

function printReview(review) {
  console.log(`  verdict=${review.verdict}`);
  console.log(`  reviewer=${review.reviewer}`);
  console.log(`  scores=usefulness:${review.usefulnessScore} accuracy:${review.accuracyScore} structure:${review.structureScore} clarity:${review.clarityScore} risk:${review.riskScore}`);
  console.log(`  correction_required=${review.correctionRequired}`);
  if (review.correctionText) console.log(`  correction=${review.correctionText}`);
  if (review.reviewerNotes) console.log(`  notes=${review.reviewerNotes}`);
  if (review.failureReasons?.length) console.log(`  failure_reasons=${review.failureReasons.join(", ")}`);
  if (review.riskFlags?.length) console.log(`  risk_flags=${review.riskFlags.join(", ")}`);
}

function toNumber(value, fallback) {
  if (value === undefined || value === true) return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function scoreFlag(value, fallback, label) {
  const score = toNumber(value, fallback);
  if (score < 0 || score > 5) throw new CliError(`${label} score must be between 0 and 5.`);
  return score;
}

function stringFlag(value) {
  if (value === undefined || value === true) return "";
  if (Array.isArray(value)) return String(value[value.length - 1] || "").trim();
  return String(value).trim();
}

function normalizeList(value) {
  if (value === undefined || value === true) return [];
  const values = Array.isArray(value) ? value : [value];
  return values
    .flatMap((item) => String(item).split(","))
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatMetric(value) {
  return value === null || value === undefined ? "-" : value;
}

function formatFailureReasons(reasons) {
  if (!reasons || reasons.length === 0) return "-";
  return reasons.map((item) => `${item.reason}:${item.count}`).join(", ");
}

function printHelp() {
  console.log(`Quality review operator commands:

  npm.cmd run quality-review -- list [--limit 10] [--track website_audit.lighthouse_handoff]
  npm.cmd run quality-review -- show <trackRunId>
  npm.cmd run quality-review -- summary

  npm.cmd run quality-review -- pass <trackRunId> --notes "Useful as-is"
  npm.cmd run quality-review -- needs-edit <trackRunId> --correction "Corrected handoff text"
  npm.cmd run quality-review -- fail <trackRunId> --reason "invented_audit" --notes "Why it failed"

Optional score flags: --usefulness 0-5 --accuracy 0-5 --structure 0-5 --clarity 0-5 --risk 0-5
Optional metadata: --reviewer "JP" --risk-flag "critical" --reason "vague,unsafe"
`);
}

class CliError extends Error {}

if (require.main === module) {
  main().catch((error) => {
    if (error instanceof CliError) {
      console.error(error.message);
    } else {
      console.error(inspect(error, { depth: 4, colors: false }));
    }
    process.exitCode = 1;
  });
}

module.exports = {
  main,
  parseArgs,
  normalizeCommand,
  normalizeList
};
