#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const PROJECT_ROOT = path.resolve(__dirname, "..");

const STATES = {
  PLANNED: "planned",
  QUEUED: "queued",
  ACTIVE: "active",
  BLOCKED: "blocked",
  HELD: "held",
  FAILED: "failed",
  COMPLETED: "completed",
  ABANDONED: "abandoned",
  SUPERSEDED: "superseded",
};

const TERMINAL_STATES = new Set([STATES.COMPLETED, STATES.FAILED, STATES.ABANDONED]);

const VALID_TRANSITIONS = {
  [STATES.PLANNED]: [STATES.QUEUED, STATES.ABANDONED],
  [STATES.QUEUED]: [STATES.ACTIVE, STATES.HELD, STATES.FAILED, STATES.ABANDONED],
  [STATES.ACTIVE]: [STATES.BLOCKED, STATES.COMPLETED, STATES.FAILED, STATES.HELD, STATES.ABANDONED],
  [STATES.BLOCKED]: [STATES.ACTIVE, STATES.FAILED, STATES.HELD, STATES.ABANDONED],
  [STATES.HELD]: [STATES.ACTIVE, STATES.FAILED, STATES.COMPLETED, STATES.ABANDONED, STATES.SUPERSEDED],
  [STATES.FAILED]: [STATES.QUEUED, STATES.ABANDONED, STATES.SUPERSEDED],
  [STATES.COMPLETED]: [STATES.SUPERSEDED],
  [STATES.ABANDONED]: [STATES.SUPERSEDED],
  [STATES.SUPERSEDED]: [],
};

const HUMAN_APPROVAL_REQUIRED = new Set([
  [STATES.ACTIVE, STATES.COMPLETED],
  [STATES.ACTIVE, STATES.ABANDONED],
  [STATES.HELD, STATES.ACTIVE],
  [STATES.FAILED, STATES.QUEUED],
]);

const DEFAULT_OBJECTIVE_META = {
  objective_id: null,
  slug: null,
  status: STATES.QUEUED,
  revision: 1,
  supersedes: null,
  superseded_by: null,
  source_objective: null,
  activated_at: null,
  completed_at: null,
  completion_commit: null,
  failed_at: null,
  failure_reason: null,
  abandoned_at: null,
  abandon_reason: null,
  held_at: null,
  hold_reason: null,
};

function isTerminal(state) {
  return TERMINAL_STATES.has(state);
}

function isValidTransition(from, to) {
  if (!VALID_TRANSITIONS[from]) return false;
  return VALID_TRANSITIONS[from].includes(to);
}

function requiresHumanApproval(from, to) {
  return HUMAN_APPROVAL_REQUIRED.has(`${from},${to}`);
}

function createObjectiveMeta(opts = {}) {
  return { ...DEFAULT_OBJECTIVE_META, ...opts };
}

function findObjectiveFiles(queueDir) {
  const results = [];
  if (!fs.existsSync(queueDir)) return results;
  for (const entry of fs.readdirSync(queueDir, { withFileTypes: true })) {
    if (!entry.name.endsWith(".md")) continue;
    if (entry.name === "BULK_MILESTONE_GUIDE.md" || entry.name === "TEMPLATE.md" || entry.name === ".gitkeep") continue;
    results.push({ name: entry.name, dir: entry.isDirectory() });
  }
  const subdirs = ["completed", "failed", "held"];
  for (const sub of subdirs) {
    const subPath = path.join(queueDir, sub);
    if (!fs.existsSync(subPath)) continue;
    for (const entry of fs.readdirSync(subPath, { withFileTypes: true })) {
      if (!entry.name.endsWith(".md") || entry.name === ".gitkeep") continue;
      results.push({ name: entry.name, dir: entry.isDirectory(), subdir: sub });
    }
  }
  return results;
}

function parseObjectiveId(name) {
  const match = name.match(/^(?:(\d+)-)?(.+?)\.md$/);
  if (!match) return { prefix: null, slug: name.replace(/\.md$/, "") };
  return { prefix: match[1] || null, slug: match[2] };
}

function detectDuplicates(files) {
  const bySlug = {};
  const byPrefix = {};
  const issues = [];

  for (const f of files) {
    const { prefix, slug } = parseObjectiveId(f.name);
    if (!bySlug[slug]) bySlug[slug] = [];
    bySlug[slug].push({ ...f, prefix, slug });
    if (prefix && !byPrefix[prefix]) byPrefix[prefix] = [];
    if (prefix) byPrefix[prefix].push({ ...f, prefix, slug });
  }

  for (const [slug, entries] of Object.entries(bySlug)) {
    if (entries.length > 1) {
      const locs = entries.map(e => e.subdir ? `${e.subdir}/${e.name}` : e.name);
      issues.push({ type: "duplicate_slug", slug, locations: locs, severity: "warning", fix: `Retain one canonical copy; mark others as superseded.` });
    }
  }

  for (const [prefix, entries] of Object.entries(byPrefix)) {
    if (entries.length > 1) {
      const slugs = entries.map(e => e.slug);
      issues.push({ type: "colliding_prefix", prefix, slugs, locations: entries.map(e => e.subdir ? `${e.subdir}/${e.name}` : e.name), severity: "warning", fix: `Assign unique numeric prefixes. Prefix ${prefix} is used by: ${slugs.join(", ")}` });
    }
  }

  return issues;
}

function checkEncoding(filePath) {
  const issues = [];
  try {
    const buf = fs.readFileSync(filePath);
    if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) {
      issues.push({ type: "utf16le_bom", file: filePath, severity: "error", fix: "Re-encode as clean UTF-8 without BOM." });
      return issues;
    }
    if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
      issues.push({ type: "utf8_bom", file: filePath, severity: "warning", fix: "Remove UTF-8 BOM. Re-save as UTF-8 without BOM." });
      return issues;
    }
    const text = buf.toString("utf8");
    const decoded = Buffer.from(text, "utf8");
    if (Buffer.compare(buf, decoded) !== 0) {
      issues.push({ type: "likely_mojibake", file: filePath, severity: "warning", fix: "May be mojibake. Re-save as clean UTF-8." });
    }
  } catch {
    issues.push({ type: "unreadable", file: filePath, severity: "error", fix: "File cannot be read." });
  }
  return issues;
}

function normalizeToUtf8(sourcePath, destPath) {
  let buf = fs.readFileSync(sourcePath);
  if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) {
    buf = Buffer.from(buf.toString("utf16le"), "utf8");
  }
  let text = buf.toString("utf8");
  if (text.charCodeAt(0) === 0xFEFF) {
    text = text.slice(1);
  }
  if (text.length > 0 && text.charCodeAt(0) === 0xFEFF) {
    text = text.slice(1);
  }
  fs.writeFileSync(destPath, text, "utf8");
}

function detectObjectiveIdCollisions(files, queueDir) {
  const byId = {};
  const issues = [];
  for (const f of files) {
    if (f.dir) continue;
    const sub = f.subdir || "";
    const filePath = path.join(queueDir, sub, f.name);
    const metaPath = path.join(path.dirname(filePath), path.basename(f.name, ".md") + ".meta.json");
    if (!fs.existsSync(metaPath)) continue;
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
      const oid = meta.objective_id;
      if (!oid) continue;
      if (!byId[oid]) byId[oid] = [];
      byId[oid].push({ name: f.name, subdir: sub, slug: meta.slug, metaPath });
    } catch {}
  }
  for (const [oid, entries] of Object.entries(byId)) {
    if (entries.length > 1) {
      const locs = entries.map(e => e.subdir ? `${e.subdir}/${e.name}` : e.name);
      const slugs = entries.map(e => e.slug);
      issues.push({
        type: "duplicate_objective_id",
        code: "DUP_OBJECTIVE_ID",
        objective_id: oid,
        slugs,
        locations: locs,
        severity: "error",
        fix: `objective_id "${oid}" is used by multiple objectives: ${slugs.join(", ")}. Assign unique objective_id values.`,
      });
    }
  }
  return issues;
}

function classifyIssues(issues) {
  for (const issue of issues) {
    if (issue.type === "duplicate_slug") {
      if (!issue.code) issue.code = "DUP_SLUG";
      if (!issue.classification) issue.classification = "ACCEPTABLE_WITH_META";
      if (!issue.safe_reason) issue.safe_reason = "Duplicate in different lifecycle directories with .meta.json linking supersession chain.";
    }
    if (issue.type === "colliding_prefix") {
      if (!issue.code) issue.code = "COL_PREFIX";
      if (!issue.classification) issue.classification = "ACCEPTABLE_WITH_META";
      if (!issue.safe_reason) issue.safe_reason = "Prefix collision resolved via .meta.json supersession records. Prospective new objectives should avoid reusing numeric prefixes.";
    }
  }
}

function runIntegrityCheck(opts = {}) {
  const queueDir = opts.queueDir || path.join(PROJECT_ROOT, ".opencode", "agents", "objectives", "queue");
  const issues = [];
  const hasMeta = {};

  const files = findObjectiveFiles(queueDir);
  const dupIssues = detectDuplicates(files);
  issues.push(...dupIssues);

  for (const f of files) {
    if (f.dir) continue;
    const sub = f.subdir || "";
    const filePath = path.join(queueDir, sub, f.name);
    const encIssues = checkEncoding(filePath);
    issues.push(...encIssues);
    const metaPath = path.join(path.dirname(filePath), path.basename(f.name, ".md") + ".meta.json");
    if (fs.existsSync(metaPath)) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
        hasMeta[f.name] = meta;
      } catch {}
    }
  }

  const oidCollisions = detectObjectiveIdCollisions(files, queueDir);
  issues.push(...oidCollisions);

  classifyIssues(issues);
  for (const issue of issues) {
    if (issue.type === "utf8_bom") {
      issue.code = "ENC_BOM_UTF8";
      if (!issue.classification) issue.classification = "RESOLVED";
      if (!issue.safe_reason) issue.safe_reason = "UTF-8 BOM already stripped. Remnant detection may be from tooling re-encoding.";
    }
    if (issue.type === "utf16le_bom") {
      issue.code = "ENC_BOM_UTF16";
    }
    if (issue.type === "likely_mojibake") {
      issue.code = "ENC_MOJIBAKE";
    }
  }

  const activeObjPath = path.join(PROJECT_ROOT, ".opencode", "agents", "objectives", "active-objective.md");
  if (fs.existsSync(activeObjPath)) {
    const content = fs.readFileSync(activeObjPath, "utf8").trim();
    if (content) {
      const isCanonicalEmpty = content === "# Active Objective" || content.startsWith("# Active Objective\n\nNo objective is currently active.");
      if (!isCanonicalEmpty) {
        issues.push({
          type: "stale_active_objective",
          code: "STALE_ACTIVE",
          file: activeObjPath,
          severity: "warning",
          fix: "active-objective.md contains objective content. Clear to # Active Objective with 'No objective is currently active.'",
          classification: "REQUIRES_CLEARING",
          safe_reason: "Warns when a completed/superseded objective remains in the active slot."
        });
      }
    }
  }

  const milestonesDir = path.join(PROJECT_ROOT, ".opencode", "agents", "state", "milestones");
  if (fs.existsSync(milestonesDir)) {
    for (const f of fs.readdirSync(milestonesDir)) {
      if (!f.endsWith(".json")) continue;
      try {
        const data = JSON.parse(fs.readFileSync(path.join(milestonesDir, f), "utf8"));
        if (data.status === "in_progress" || data.status === "running") {
          issues.push({ type: "stale_milestone", code: "STALE_MS", file: `milestones/${f}`, slug: data.objective_id || f, severity: "warning", fix: `Milestone ${f} still shows status '${data.status}'. Verify completion and finalize.` });
        }
      } catch {}
    }
  }

  return issues;
}

function transactionalArchive(opts = {}) {
  const { sourcePath, destDir, status, objectiveId, commit, slug, meta } = opts;
  const results = { ok: true, steps: [], errors: [] };

  try {
    results.steps.push("validate_source");
    if (!fs.existsSync(sourcePath)) {
      results.ok = false;
      results.errors.push({ step: "validate_source", message: `Source not found: ${sourcePath}` });
      return results;
    }

    results.steps.push("ensure_dest_dir");
    fs.mkdirSync(destDir, { recursive: true });

    const destFileName = path.basename(sourcePath);
    const destPath = path.join(destDir, destFileName);

    results.steps.push("normalize_encoding");
    normalizeToUtf8(sourcePath, destPath);

    results.steps.push("remove_source");
    fs.unlinkSync(sourcePath);

    results.steps.push("write_meta");
    const metaPath = destPath.replace(/\.md$/, ".meta.json");
    const metaData = createObjectiveMeta({
      objective_id: objectiveId,
      slug: slug || path.basename(sourcePath).replace(/\.md$/, ""),
      status: status || STATES.COMPLETED,
      completed_at: status === STATES.COMPLETED ? new Date().toISOString() : null,
      completion_commit: commit || null,
      source_objective: sourcePath,
    });
    fs.writeFileSync(metaPath, JSON.stringify(metaData, null, 2) + "\n");

    results.steps.push("verify");
    if (!fs.existsSync(destPath)) {
      results.ok = false;
      results.errors.push({ step: "verify", message: "Destination not found after archive." });
      return results;
    }
    const verifyIssues = checkEncoding(destPath);
    if (verifyIssues.length > 0) {
      results.ok = false;
      results.errors.push({ step: "verify", message: "Encoding issue after normalization.", issues: verifyIssues });
      return results;
    }

    results.destPath = destPath;
    results.metaPath = metaPath;
  } catch (err) {
    results.ok = false;
    results.errors.push({ step: "unknown", message: err.message });
  }

  return results;
}

function checkStartupContinuity(closeoutPath) {
  if (!fs.existsSync(closeoutPath)) {
    return { unresolved: false, reason: "No closeout record found.", message: "No previous work session recorded. Safe to begin new work." };
  }
  try {
    const closeout = JSON.parse(fs.readFileSync(closeoutPath, "utf8"));
    if (!closeout || closeout.safe_to_start_unrelated_work !== false) {
      return { unresolved: false, reason: "Closeout indicates unrelated work is safe.", message: "Previous session completed cleanly." };
    }
    return {
      unresolved: true,
      work_id: closeout.work_id,
      objective_id: closeout.objective_id,
      status: closeout.status,
      original_goal: closeout.original_goal,
      completed: closeout.completed || [],
      remaining: closeout.remaining || [],
      next_required_action: closeout.next_required_action,
      blockers: closeout.blockers || [],
      working_branch: closeout.working_branch,
      last_commit: closeout.last_commit,
      validation: closeout.validation || { passed: [], failed: [], not_run: [] },
      recommended_next_agent: closeout.recommended_next_agent,
      message: buildContinuityMessage(closeout),
    };
  } catch {
    return { unresolved: false, reason: "Closeout record corrupted or unreadable.", message: "Closeout record could not be read. Verify manually." };
  }
}

function buildContinuityMessage(closeout) {
  const lines = [];
  lines.push("There is unresolved work from the previous session:");
  lines.push("");
  lines.push(`  ${closeout.original_goal || closeout.work_id || "Unknown work"}`);
  lines.push("");
  if (closeout.completed && closeout.completed.length > 0) {
    lines.push("Completed:");
    closeout.completed.forEach(c => lines.push(`  - ${c}`));
    lines.push("");
  }
  if (closeout.remaining && closeout.remaining.length > 0) {
    lines.push("Remaining:");
    closeout.remaining.forEach(r => lines.push(`  - ${r}`));
    lines.push("");
  }
  if (closeout.working_branch) lines.push(`Current branch: ${closeout.working_branch}`);
  if (closeout.last_commit) lines.push(`Last commit: ${closeout.last_commit}`);
  if (closeout.blockers && closeout.blockers.length > 0) {
    lines.push("");
    lines.push("Blockers:");
    closeout.blockers.forEach(b => lines.push(`  - ${b}`));
  }
  if (closeout.validation) {
    if (closeout.validation.passed && closeout.validation.passed.length > 0) {
      lines.push("");
      lines.push("Tests passed:");
      closeout.validation.passed.forEach(t => lines.push(`  - ${t}`));
    }
    if (closeout.validation.failed && closeout.validation.failed.length > 0) {
      lines.push("");
      lines.push("Tests failed:");
      closeout.validation.failed.forEach(t => lines.push(`  - ${t}`));
    }
    if (closeout.validation.not_run && closeout.validation.not_run.length > 0) {
      lines.push("");
      lines.push("Tests not run:");
      closeout.validation.not_run.forEach(t => lines.push(`  - ${t}`));
    }
  }
  if (closeout.next_required_action) {
    lines.push("");
    lines.push(`Recommended action: ${closeout.next_required_action}`);
  }
  lines.push("");
  lines.push("Choose one: continue, hold, abandon, supersede, or explicitly override.");
  return lines.join("\n");
}

const HELP_TEXT = `
Usage: node scripts/objective-lifecycle.js <command> [options]

Commands:
  check                    Run integrity check on all objective files
  archive <source> <dest>  Transactionally archive an objective file
  continuity [closeout]    Check startup continuity from closeout record
  states                   List valid state transitions
  help                     Show this help

Options for 'archive':
  --status <status>        Status for archive meta (default: completed)
  --id <id>                Objective ID for archive meta
  --slug <slug>            Objective slug for archive meta
  --commit <sha>           Completion commit SHA

Examples:
  node scripts/objective-lifecycle.js check
  node scripts/objective-lifecycle.js archive queue/milestone.md completed/ --status completed --id m07
  node scripts/objective-lifecycle.js continuity docs/07-progress/work-closeout.json
`;

if (require.main === module) {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (!cmd || cmd === "help") {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  if (cmd === "check") {
    const issues = runIntegrityCheck();
    const errors = issues.filter(i => i.severity === "error");
    const warnings = issues.filter(i => i.severity === "warning");

    console.log("Objective Lifecycle Integrity Check\n");

    if (issues.length === 0) {
      console.log("  PASS  No issues found.");
      console.log("");
      console.log("Result: PASS");
      process.exit(0);
    }

    if (errors.length > 0) {
      console.log(`  FAIL  ${errors.length} error(s):\n`);
      for (const issue of errors) {
        console.log(`    FAIL  [${issue.code || issue.type}] ${issue.type}`);
        if (issue.slug) console.log(`          Slug: ${issue.slug}`);
        if (issue.file) console.log(`          File: ${issue.file}`);
        if (issue.locations) console.log(`          Locations: ${issue.locations.join(", ")}`);
        if (issue.slugs) console.log(`          Used by: ${issue.slugs.join(", ")}`);
        if (issue.classification) console.log(`          Classification: ${issue.classification}`);
        if (issue.safe_reason) console.log(`          Safe: ${issue.safe_reason}`);
        if (issue.fix) console.log(`          Fix: ${issue.fix}`);
        console.log("");
      }
    }

    if (warnings.length > 0) {
      console.log(`  WARN  ${warnings.length} warning(s):\n`);
      for (const issue of warnings) {
        console.log(`    WARN  [${issue.code || issue.type}] ${issue.type}`);
        if (issue.file) console.log(`          File: ${issue.file}`);
        if (issue.slug) console.log(`          Slug: ${issue.slug}`);
        if (issue.safe_reason) console.log(`          Safe: ${issue.safe_reason}`);
        if (issue.fix) console.log(`          Fix: ${issue.fix}`);
        console.log("");
      }
    }

    const blockingErrors = errors.filter(e => e.classification !== "ACCEPTABLE_WITH_META");
    const hasBlocking = blockingErrors.length > 0;
    const verdict = hasBlocking ? "FAIL" : "PASS_WITH_NOTES";
    const noteCount = errors.length - blockingErrors.length;
    const noteStr = noteCount > 0 ? ` (${noteCount} known-acceptable with meta documentation)` : "";
    console.log(`Result: ${verdict}${noteStr}  (${blockingErrors.length} blocking errors, ${errors.length} total errors, ${warnings.length} warnings)`);
    process.exit(hasBlocking ? 1 : 0);
  }

  if (cmd === "archive") {
    const sourceArg = args[1];
    const destArg = args[2];
    if (!sourceArg || !destArg) {
      console.error("Usage: node scripts/objective-lifecycle.js archive <source> <dest> [options]");
      process.exit(1);
    }
    const status = extractArg(args, "--status") || "completed";
    const id = extractArg(args, "--id");
    const slug = extractArg(args, "--slug");
    const commit = extractArg(args, "--commit");
    const result = transactionalArchive({
      sourcePath: path.resolve(PROJECT_ROOT, sourceArg),
      destDir: path.resolve(PROJECT_ROOT, destArg),
      status,
      objectiveId: id,
      slug,
      commit,
    });
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  }

  if (cmd === "continuity") {
    const closeoutArg = args[1] || "docs/07-progress/work-closeout.json";
    const closeoutPath = path.resolve(PROJECT_ROOT, closeoutArg);
    const result = checkStartupContinuity(closeoutPath);
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }

  if (cmd === "states") {
    console.log("Objective Lifecycle States and Valid Transitions:\n");
    for (const [state, transitions] of Object.entries(VALID_TRANSITIONS)) {
      if (transitions.length === 0) {
        console.log(`  ${state} (terminal)`);
      } else {
        console.log(`  ${state} -> ${transitions.join(", ")}`);
      }
    }
    console.log("\nTransitions requiring human approval:");
    for (const pair of HUMAN_APPROVAL_REQUIRED) {
      console.log(`  ${pair[0]} -> ${pair[1]}`);
    }
    process.exit(0);
  }

  console.error(`Unknown command: ${cmd}`);
  console.log(HELP_TEXT);
  process.exit(1);
}

function extractArg(args, name) {
  const idx = args.indexOf(name);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1];
}

module.exports = {
  STATES,
  TERMINAL_STATES,
  VALID_TRANSITIONS,
  HUMAN_APPROVAL_REQUIRED,
  DEFAULT_OBJECTIVE_META,
  isTerminal,
  isValidTransition,
  requiresHumanApproval,
  createObjectiveMeta,
  findObjectiveFiles,
  parseObjectiveId,
  detectDuplicates,
  detectObjectiveIdCollisions,
  checkEncoding,
  normalizeToUtf8,
  runIntegrityCheck,
  transactionalArchive,
  checkStartupContinuity,
  buildContinuityMessage,
};
