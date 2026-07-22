#!/usr/bin/env node
/**
 * scripts/dev-lifecycle.js
 *
 * Development lifecycle commands for the Control Plane.
 * Phase 2A: start, checkpoint, pause, block, resume.
 * Phase 2B: validate, complete, session:close.
 * Phase 2C: prepare.
 *
 * Usage:
 *   node scripts/dev-lifecycle.js start --slug <id> --title "Title" --purpose "Why"
 *   node scripts/dev-lifecycle.js checkpoint --message "What was done"
 *   node scripts/dev-lifecycle.js pause --reason "Why pausing"
 *   node scripts/dev-lifecycle.js block --reason "Why blocked" --type <type>
 *   node scripts/dev-lifecycle.js resume
 *   node scripts/dev-lifecycle.js validate
 *   node scripts/dev-lifecycle.js complete
 *   node scripts/dev-lifecycle.js prepare
 *   node scripts/dev-lifecycle.js session:close --summary "What was accomplished"
 *   node scripts/dev-lifecycle.js status
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const DEVELOPMENT_DIR = path.join(PROJECT_ROOT, "development");
const PROJECT_STATE_PATH = path.join(DEVELOPMENT_DIR, "project-state.json");
const MILESTONES_DIR = path.join(DEVELOPMENT_DIR, "milestones");
const SESSIONS_DIR = path.join(DEVELOPMENT_DIR, "sessions");
const VALIDATION_RESULTS_DIR = path.join(DEVELOPMENT_DIR, "validation-results");
const VALIDATION_INDEX_PATH = path.join(DEVELOPMENT_DIR, "validation-index.json");
const PROFILES_DIR = path.join(DEVELOPMENT_DIR, "profiles");

// ---- helpers ----

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return fallback; }
}

function writeJson(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + "\n");
}

function git(args) {
  const result = spawnSync("git", args, {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    shell: process.platform === "win32",
  });
  return result.status === 0 ? (result.stdout || "").trim() : null;
}

function gitResult(args) {
  return spawnSync("git", args, {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    shell: process.platform === "win32",
  });
}

function extractArg(args, name) {
  const idx = args.indexOf(name);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1];
}

function hasFlag(args, name) {
  return args.includes(name);
}

function now() {
  return new Date().toISOString();
}

function nextSessionId() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const existing = fs.readdirSync(SESSIONS_DIR).filter(f => f.startsWith(`session-${date}-`));
  const seq = existing.length + 1;
  return `session-${date}-${String(seq).padStart(3, "0")}`;
}

// ---- git inspection ----

function getCurrentBranch() {
  return git(["rev-parse", "--abbrev-ref", "HEAD"]);
}

function getCurrentHead() {
  return git(["rev-parse", "HEAD"]);
}

function isDirty() {
  return (git(["status", "--porcelain"]) || "").length > 0;
}

// ---- project state ----

function readProjectState() {
  return readJson(PROJECT_STATE_PATH, null);
}

function writeProjectState(state) {
  state.updatedAt = now();
  writeJson(PROJECT_STATE_PATH, state);
}

// ---- milestone operations ----

function milestonePath(id) {
  return path.join(MILESTONES_DIR, `${id}.json`);
}

function readMilestone(id) {
  return readJson(milestonePath(id), null);
}

function writeMilestone(milestone) {
  writeJson(milestonePath(milestone.id), milestone);
}

function listMilestones() {
  if (!fs.existsSync(MILESTONES_DIR)) return [];
  return fs.readdirSync(MILESTONES_DIR)
    .filter(f => f.endsWith(".json"))
    .map(f => readJson(path.join(MILESTONES_DIR, f), null))
    .filter(Boolean);
}

function findActiveMilestone() {
  return listMilestones().find(m => m.status === "active") || null;
}

function findPausedMilestone() {
  return listMilestones().find(m => m.status === "paused") || null;
}

// ---- session operations ----

function sessionPath(id) {
  return path.join(SESSIONS_DIR, `${id}.json`);
}

function readSession(id) {
  return readJson(sessionPath(id), null);
}

function writeSession(session) {
  writeJson(sessionPath(session.id), session);
}

function listSessions() {
  if (!fs.existsSync(SESSIONS_DIR)) return [];
  return fs.readdirSync(SESSIONS_DIR)
    .filter(f => f.endsWith(".json"))
    .map(f => readJson(path.join(SESSIONS_DIR, f), null))
    .filter(Boolean);
}

function findActiveSession() {
  return listSessions().find(s => s.status === "active") || null;
}

function findPausedSession() {
  return listSessions().find(s => s.status === "paused") || null;
}

// ---- git state fingerprint ----

function computeGitFingerprint() {
  const branch = getCurrentBranch();
  const head = getCurrentHead();

  // Get list of changed files with their git status
  // Exclude development/ directory (control plane state, expected to change during validation)
  const statusOutput = git(["status", "--porcelain"]) || "";
  const lines = statusOutput.split(/\r?\n/).filter(Boolean);

  const changedFiles = [];
  const excludedPrefixes = ["development/", ".opencode/"];
  for (const line of lines) {
    const gitStatus = line.slice(0, 2).trim();
    const filePath = line.slice(3);
    const isExcluded = excludedPrefixes.some(p => filePath.startsWith(p));
    if (!isExcluded) {
      changedFiles.push({ path: filePath, state: gitStatus || "?" });
    }
  }

  // Compute content hash of tracked source files (exclude development/ and .opencode/)
  const treeHash = git(["rev-parse", "HEAD^{tree}"]) || "";

  // Compute hash of uncommitted changes (exclude development/ and .opencode/)
  const diffHash = git(["diff", "--", ":(exclude)development/", ":(exclude).opencode/"]) || "";
  const indexHash = git(["diff", "--cached", ":(exclude)development/", ":(exclude).opencode/"]) || "";
  const untrackedFiles = (git(["ls-files", "--others", "--exclude-standard"]) || "")
    .split(/\r?\n/)
    .filter(f => f && !excludedPrefixes.some(p => f.startsWith(p)))
    .join("\n");

  const fingerprint = crypto.createHash("sha256");
  fingerprint.update(treeHash);
  fingerprint.update(diffHash);
  fingerprint.update(indexHash);
  fingerprint.update(untrackedFiles);

  return {
    branch,
    headCommit: head,
    treeHash,
    fingerprint: `sha256:${fingerprint.digest("hex").slice(0, 16)}`,
    changedFiles,
    computedAt: now(),
  };
}

function isFingerprintStale(validation, currentFingerprint) {
  if (!validation || !validation.gitState) return true;
  if (validation.gitState.branch !== currentFingerprint.branch) return true;
  if (validation.gitState.headCommit !== currentFingerprint.headCommit) return true;
  if (validation.gitState.fingerprint !== currentFingerprint.fingerprint) return true;
  return false;
}

// ---- validation result operations ----

function validationResultPath(id) {
  return path.join(VALIDATION_RESULTS_DIR, `${id}.json`);
}

function writeValidationResult(result) {
  writeJson(validationResultPath(result.id), result);
}

function readValidationResult(id) {
  return readJson(validationResultPath(id), null);
}

function readValidationIndex() {
  return readJson(VALIDATION_INDEX_PATH, { latestByMilestone: {} });
}

function writeValidationIndex(index) {
  writeJson(VALIDATION_INDEX_PATH, index);
}

function getLatestValidationForMilestone(milestoneId) {
  const index = readValidationIndex();
  const validationId = index.latestByMilestone[milestoneId];
  if (!validationId) return null;
  return readValidationResult(validationId);
}

function updateValidationIndex(validationResult) {
  const index = readValidationIndex();
  index.latestByMilestone[validationResult.milestoneId] = validationResult.id;
  writeValidationIndex(index);
}

function generateValidationId() {
  const ts = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
  const rand = crypto.randomBytes(4).toString("hex");
  return `validation-${ts}-${rand}`;
}

// ---- profile operations ----

function loadProfile(profileId) {
  const profilePath = path.join(PROFILES_DIR, `${profileId}.json`);
  return readJson(profilePath, null);
}

function loadDefaultProfile() {
  // Built-in quick profile for milestones without a custom profile.
  // Note: dev:status strict checks are run separately before profile execution.
  return {
    schema: "locaily.development.validation_profile.v1",
    id: "builtin-quick",
    name: "Quick Validation",
    level: "quick",
    description: "Built-in quick validation. Strict status checks run separately before profile commands.",
    required: [
      {
        id: "lifecycle-integrity",
        command: "node scripts/objective-lifecycle.js check",
        description: "Objective lifecycle integrity check"
      },
      {
        id: "schema-validation",
        command: "node scripts/test-development-schemas.js",
        description: "Development schema validation"
      }
    ],
    optional: [
      {
        id: "controller-tests",
        command: "node scripts/test-controller-invariants.js",
        description: "Controller invariants tests"
      },
      {
        id: "lifecycle-tests",
        command: "node scripts/test-lifecycle.js",
        description: "Lifecycle tests"
      }
    ],
    manualChecks: [],
    completionPolicy: {
      requireCleanTree: true,
      requireCloseout: true,
      requireEmptyRemainingWork: true,
      requireManualChecksComplete: true,
      allowedChangedPathsAfterValidation: [],
      validationMaxAgeMinutes: 120,
    },
  };
}

function getCompletionPolicy(milestone) {
  const profile = milestone.validationProfile ? loadProfile(milestone.validationProfile) : loadDefaultProfile();
  return (profile && profile.completionPolicy) || {
    requireCleanTree: true,
    requireCloseout: true,
    requireEmptyRemainingWork: true,
    requireManualChecksComplete: true,
    allowedChangedPathsAfterValidation: [],
    validationMaxAgeMinutes: 120,
  };
}

// ---- milestone completion evidence ----

function loadAcceptanceEvidence(milestoneId) {
  const evidencePath = path.join(DEVELOPMENT_DIR, "evidence", `${milestoneId}.json`);
  return readJson(evidencePath, { milestoneId, criteria: [], acknowledgedWarnings: [] });
}

function saveAcceptanceEvidence(milestoneId, evidence) {
  const evidenceDir = path.join(DEVELOPMENT_DIR, "evidence");
  fs.mkdirSync(evidenceDir, { recursive: true });
  writeJson(path.join(evidenceDir, `${milestoneId}.json`), evidence);
}

// ---- commands ----

function cmdStart(args) {
  const slug = extractArg(args, "--slug");
  const title = extractArg(args, "--title");
  const purpose = extractArg(args, "--purpose");
  const type = extractArg(args, "--type") || "feature";
  const priority = extractArg(args, "--priority") || "medium";

  if (!slug || !title || !purpose) {
    console.error("Usage: dev-lifecycle.js start --slug <id> --title \"Title\" --purpose \"Why\" [--type feature] [--priority medium]");
    process.exit(1);
  }

  // Check no active milestone
  const active = findActiveMilestone();
  if (active) {
    console.error(`Error: Active milestone already exists: ${active.id}`);
    console.error("Complete, pause, or cancel it before starting a new one.");
    process.exit(1);
  }

  // Check no active session
  const activeSession = findActiveSession();
  if (activeSession) {
    console.error(`Error: Active session already exists: ${activeSession.id}`);
    console.error("Close or pause it before starting a new milestone.");
    process.exit(1);
  }

  const branch = getCurrentBranch();
  const head = getCurrentHead();

  // Create or update milestone
  let milestone = readMilestone(slug);
  if (milestone) {
    // Update existing milestone to active
    milestone.status = "active";
    milestone.startedAt = now();
    if (!milestone.type) milestone.type = type;
    if (!milestone.priority) milestone.priority = priority;
  } else {
    // Create new milestone
    milestone = {
      schema: "locaily.development.milestone.v1",
      id: slug,
      title,
      status: "active",
      type,
      priority,
      purpose,
      scope: { included: [], excluded: [] },
      acceptanceCriteria: [],
      validationProfile: null,
      dependencies: [],
      blockers: [],
      lifecycleRef: null,
      createdAt: now(),
      startedAt: now(),
      completedAt: null,
      mergedAt: null,
    };
  }
  writeMilestone(milestone);

  // Create session
  const sessionId = nextSessionId();
  const session = {
    schema: "locaily.development.session.v1",
    id: sessionId,
    milestoneId: slug,
    agent: { platform: "unknown", model: "unknown" },
    status: "active",
    objective: purpose,
    branch,
    startingCommit: head,
    plannedFiles: [],
    completedWork: [],
    remainingWork: [],
    blockers: [],
    validationRunIds: [],
    checks: [],
    startedAt: now(),
    closedAt: null,
  };
  writeSession(session);

  // Update project state
  const ps = readProjectState();
  if (ps) {
    ps.currentMilestone = slug;
    ps.activeSession = sessionId;
    ps.status = "active";
    ps.activeBranch = branch;
    ps.nextRecommendedAction = `Working on milestone '${slug}' — session '${sessionId}'`;
    writeProjectState(ps);
  }

  console.log(JSON.stringify({
    ok: true,
    milestone: { id: slug, status: "active" },
    session: { id: sessionId, branch, startingCommit: head },
    projectState: { status: "active", currentMilestone: slug },
  }, null, 2));
}

function cmdCheckpoint(args) {
  const message = extractArg(args, "--message");

  if (!message) {
    console.error("Usage: dev-lifecycle.js checkpoint --message \"What was done\"");
    process.exit(1);
  }

  const session = findActiveSession();
  if (!session) {
    console.error("Error: No active session. Start or resume a milestone first.");
    process.exit(1);
  }

  const head = getCurrentHead();
  const dirty = isDirty();

  // Add checkpoint
  session.checks.push({
    timestamp: now(),
    message,
    filesChanged: dirty ? ["(uncommitted changes)"] : [],
  });

  // Update completed work
  session.completedWork.push(message);

  writeSession(session);

  console.log(JSON.stringify({
    ok: true,
    session: session.id,
    checkpoint: { timestamp: now(), message },
    head,
    dirty,
  }, null, 2));
}

function cmdPause(args) {
  const reason = extractArg(args, "--reason");

  if (!reason) {
    console.error("Usage: dev-lifecycle.js pause --reason \"Why pausing\"");
    process.exit(1);
  }

  const session = findActiveSession();
  if (!session) {
    console.error("Error: No active session to pause.");
    process.exit(1);
  }

  const milestone = findActiveMilestone();
  const head = getCurrentHead();
  const branch = getCurrentBranch();

  // Get dirty files
  const staged = (git(["diff", "--cached", "--name-only"]) || "").split(/\r?\n/).filter(Boolean);
  const modified = (git(["diff", "--name-only"]) || "").split(/\r?\n/).filter(Boolean);
  const untracked = (git(["ls-files", "--others", "--exclude-standard"]) || "").split(/\r?\n/).filter(Boolean);
  const dirtyFiles = [...staged, ...modified, ...untracked];

  // Close session
  session.status = "paused";
  session.closedAt = now();
  session.closingCommit = head;
  session.dirtyFiles = dirtyFiles;
  session.risks = [reason];
  session.nextRecommendedAction = reason;
  writeSession(session);

  // Pause milestone
  if (milestone) {
    milestone.status = "paused";
    writeMilestone(milestone);
  }

  // Update project state
  const ps = readProjectState();
  if (ps) {
    ps.currentMilestone = milestone ? milestone.id : null;
    ps.activeSession = null;
    ps.status = "paused";
    ps.activeBranch = branch;
    ps.nextRecommendedAction = `Resume milestone '${milestone ? milestone.id : "unknown"}' — ${reason}`;
    writeProjectState(ps);
  }

  console.log(JSON.stringify({
    ok: true,
    session: { id: session.id, status: "paused" },
    milestone: milestone ? { id: milestone.id, status: "paused" } : null,
    dirtyFiles,
    head,
    reason,
  }, null, 2));
}

function cmdBlock(args) {
  const reason = extractArg(args, "--reason");
  const type = extractArg(args, "--type") || "human-action";

  if (!reason) {
    console.error("Usage: dev-lifecycle.js block --reason \"Why blocked\" [--type human-action]");
    process.exit(1);
  }

  const milestone = findActiveMilestone();
  if (!milestone) {
    console.error("Error: No active milestone to block.");
    process.exit(1);
  }

  const validTypes = ["human-action", "external-dependency", "hardware", "decision-required"];
  if (!validTypes.includes(type)) {
    console.error(`Error: Invalid blocker type '${type}'. Must be one of: ${validTypes.join(", ")}`);
    process.exit(1);
  }

  const head = getCurrentHead();

  // Add blocker to milestone
  const blockerId = `blocker-${Date.now()}`;
  milestone.blockers.push({
    id: blockerId,
    type,
    description: reason,
    resolutionCondition: "Resolve the blocking condition and run dev:block --clear",
    createdAt: now(),
  });
  milestone.status = "blocked";
  writeMilestone(milestone);

  // Update project state
  const ps = readProjectState();
  if (ps) {
    ps.currentMilestone = milestone.id;
    ps.status = "blocked";
    ps.blockers.push(reason);
    ps.nextRecommendedAction = `Resolve blocker: ${reason}`;
    writeProjectState(ps);
  }

  console.log(JSON.stringify({
    ok: true,
    milestone: { id: milestone.id, status: "blocked" },
    blocker: { id: blockerId, type, description: reason },
    head,
  }, null, 2));
}

function cmdResume(args) {
  // Find paused milestone or session
  const milestone = findActiveMilestone() || findPausedMilestone();
  const session = findActiveSession() || findPausedSession();

  if (!milestone && !session) {
    console.error("Error: No paused milestone or session to resume.");
    console.error("Use dev:milestone:start to begin a new milestone.");
    process.exit(1);
  }

  const branch = getCurrentBranch();
  const head = getCurrentHead();

  // Resume session
  if (session && session.status === "paused") {
    // Update milestone to active if it was paused
    if (milestone && milestone.status === "paused") {
      milestone.status = "active";
      milestone.startedAt = milestone.startedAt || now();
      writeMilestone(milestone);
    }

    // Create new session (don't reuse paused one)
    const sessionId = nextSessionId();
    const newSession = {
      schema: "locaily.development.session.v1",
      id: sessionId,
      milestoneId: session.milestoneId,
      agent: { platform: "unknown", model: "unknown" },
      status: "active",
      objective: `Resumed: ${session.objective}`,
      branch,
      startingCommit: head,
      plannedFiles: [],
      completedWork: [],
      remainingWork: session.remainingWork || [],
      blockers: [],
      validationRunIds: [],
      checks: [],
      startedAt: now(),
      closedAt: null,
    };
    writeSession(newSession);

    // Update project state
    const ps = readProjectState();
    if (ps) {
      ps.activeSession = sessionId;
      ps.status = "active";
      ps.activeBranch = branch;
      writeProjectState(ps);
    }

    console.log(JSON.stringify({
      ok: true,
      resumedFrom: session.id,
      session: { id: sessionId, branch, startingCommit: head },
      milestone: milestone ? { id: milestone.id, status: "active" } : null,
    }, null, 2));
    return;
  }

  // Resume milestone only (no paused session)
  if (milestone && milestone.status === "paused") {
    milestone.status = "active";
    milestone.startedAt = milestone.startedAt || now();
    writeMilestone(milestone);

    // Create new session
    const sessionId = nextSessionId();
    const newSession = {
      schema: "locaily.development.session.v1",
      id: sessionId,
      milestoneId: milestone.id,
      agent: { platform: "unknown", model: "unknown" },
      status: "active",
      objective: `Resumed milestone: ${milestone.title || milestone.id}`,
      branch,
      startingCommit: head,
      plannedFiles: [],
      completedWork: [],
      remainingWork: [],
      blockers: [],
      validationRunIds: [],
      checks: [],
      startedAt: now(),
      closedAt: null,
    };
    writeSession(newSession);

    // Update project state
    const ps = readProjectState();
    if (ps) {
      ps.currentMilestone = milestone.id;
      ps.activeSession = sessionId;
      ps.status = "active";
      ps.activeBranch = branch;
      writeProjectState(ps);
    }

    console.log(JSON.stringify({
      ok: true,
      milestone: { id: milestone.id, status: "active" },
      session: { id: sessionId, branch, startingCommit: head },
    }, null, 2));
    return;
  }

  // Nothing to resume
  console.error("Error: No resumable milestone or session found.");
  process.exit(1);
}

// ---- Phase 2B: validate ----

function cmdValidate(args) {
  const milestone = findActiveMilestone();
  if (!milestone) {
    console.error("Error: No active milestone. Start or resume a milestone first.");
    process.exit(1);
  }

  const profile = milestone.validationProfile ? loadProfile(milestone.validationProfile) : loadDefaultProfile();
  if (!profile) {
    console.error(`Error: Validation profile '${milestone.validationProfile}' not found.`);
    process.exit(1);
  }

  const branch = getCurrentBranch();
  const head = getCurrentHead();
  const dirty = isDirty();
  const gitState = computeGitFingerprint();
  const validationId = generateValidationId();

  // Save previous milestone status for restore on failure
  const previousStatus = milestone.status;

  const startedAt = now();
  const results = [];
  let overallStatus = "passed";

  // Gate 0: Run strict status checks FIRST (before setting validating state)
  const statusResult = runDevStatus();
  const statusContradictions = (statusResult.contradictions || []).filter(c => c.severity === "error" || c.severity === "critical");
  if (statusContradictions.length > 0) {
    overallStatus = "failed";
    results.push({
      id: "strict-status",
      command: "node scripts/dev-status.js --strict --json",
      status: "failed",
      exitCode: 1,
      durationMs: 0,
      stdout: JSON.stringify(statusContradictions),
      stderr: "",
      summary: `${statusContradictions.length} error/critical contradiction(s)`,
      required: true,
    });
  } else {
    results.push({
      id: "strict-status",
      command: "node scripts/dev-status.js --strict --json",
      status: "passed",
      exitCode: 0,
      durationMs: 0,
      stdout: "",
      stderr: "",
      summary: "No error/critical contradictions",
      required: true,
    });
  }

  // Set milestone to validating (only during profile execution)
  milestone.status = "validating";
  writeMilestone(milestone);

  // Run required commands from profile
  for (const check of (profile.required || [])) {
    const checkResult = runValidationCommand(check);
    results.push(checkResult);
    if (checkResult.status !== "passed") {
      overallStatus = "failed";
    }
  }

  // Run optional commands (don't affect overall status)
  for (const check of (profile.optional || [])) {
    const checkResult = runValidationCommand(check);
    results.push(checkResult);
  }

  const completedAt = now();

  // Build manual checks
  const manualChecks = (profile.manualChecks || []).map(mc => ({
    id: mc.id,
    description: mc.description,
    acknowledged: false,
  }));

  // Build validation result
  const validationResult = {
    schema: "locaily.development.validation_result.v1",
    id: validationId,
    milestoneId: milestone.id,
    profileId: profile.id,
    status: overallStatus,
    gitState,
    startedAt,
    completedAt,
    results,
    manualChecks,
    warnings: [],
    error: null,
  };

  // Write validation result (immutable once created)
  fs.mkdirSync(VALIDATION_RESULTS_DIR, { recursive: true });
  writeValidationResult(validationResult);

  // Update validation index (milestone-scoped)
  updateValidationIndex(validationResult);

  // Update milestone with latestValidationId
  milestone.latestValidationId = validationId;
  writeMilestone(milestone);

  // Restore milestone status after validation
  if (overallStatus === "failed") {
    milestone.status = previousStatus;
  } else {
    milestone.status = previousStatus; // Restore to active (validating is transient)
  }
  writeMilestone(milestone);

  console.log(JSON.stringify({
    ok: overallStatus === "passed",
    validationId,
    milestoneId: milestone.id,
    profileId: profile.id,
    status: overallStatus,
    gitState: gitState.fingerprint,
    requiredPassed: results.filter(r => r.required !== false && r.status === "passed").length,
    requiredFailed: results.filter(r => r.required !== false && r.status !== "passed").length,
    optionalPassed: results.filter(r => r.required === false && r.status === "passed").length,
    optionalFailed: results.filter(r => r.required === false && r.status !== "passed").length,
    manualChecks: manualChecks.length,
    durationMs: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
  }, null, 2));

  process.exit(overallStatus === "passed" ? 0 : 1);
}

function runValidationCommand(check) {
  const timeout = check.timeout || 120000;
  const startMs = Date.now();

  try {
    const result = spawnSync("node", check.command.replace(/^node\s+/, "").split(/\s+/), {
      cwd: PROJECT_ROOT,
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
      shell: process.platform === "win32",
      timeout,
    });

    const durationMs = Date.now() - startMs;
    const exitCode = result.status || 0;
    const stdout = (result.stdout || "").slice(0, 2000);
    const stderr = (result.stderr || "").slice(0, 2000);

    let status = "passed";
    if (exitCode !== 0) status = "failed";
    if (result.error && result.error.code === "ETIMEDOUT") status = "timeout";

    // Extract summary from last line of stdout
    const lines = stdout.trim().split(/\r?\n/);
    const summary = lines[lines.length - 1] || "";

    return {
      id: check.id,
      command: check.command,
      status,
      exitCode,
      durationMs,
      stdout: stdout.slice(0, 500),
      stderr: stderr.slice(0, 500),
      summary: summary.slice(0, 200),
      required: true,
    };
  } catch (err) {
    return {
      id: check.id,
      command: check.command,
      status: "error",
      exitCode: -1,
      durationMs: Date.now() - startMs,
      stdout: "",
      stderr: err.message,
      summary: err.message,
      required: true,
    };
  }
}

// ---- Phase 2B: complete ----

function cmdComplete(args) {
  const milestone = findActiveMilestone() || findPausedMilestone() ||
    listMilestones().find(m => m.status === "blocked");
  if (!milestone) {
    console.error("Error: No active, paused, or blocked milestone to complete.");
    process.exit(1);
  }

  const errors = [];
  const warnings = [];
  const policy = getCompletionPolicy(milestone);

  function addError(code, message) { errors.push({ code, message }); }
  function addWarning(code, message) { warnings.push({ code, message }); }

  // Gate 1: No unresolved blockers
  if (milestone.blockers && milestone.blockers.length > 0) {
    addError("HAS_BLOCKERS", `Milestone has ${milestone.blockers.length} unresolved blocker(s)`);
  }

  // Gate 2: No error or critical contradictions from dev:status
  const statusResult = runDevStatus();
  if (statusResult.contradictions) {
    const criticalErrors = statusResult.contradictions.filter(c => c.severity === "critical" || c.severity === "error");
    for (const c of criticalErrors) {
      addError("CONTRADICTION", `[${c.severity.toUpperCase()}] ${c.message}`);
    }
  }

  // Gate 3: Required validation passed
  const latestValidation = milestone.latestValidationId
    ? readValidationResult(milestone.latestValidationId)
    : null;
  if (!latestValidation) {
    addError("NO_VALIDATION", "No validation has been run. Run dev:validate first.");
  } else if (latestValidation.status !== "passed") {
    addError("VALIDATION_FAILED", `Validation '${latestValidation.id}' has status '${latestValidation.status}'`);
  } else if (latestValidation.milestoneId !== milestone.id) {
    addError("VALIDATION_WRONG_MILESTONE", `Validation is for milestone '${latestValidation.milestoneId}', not '${milestone.id}'`);
  }

  // Gate 4: Validation matches current branch, HEAD, and working-tree fingerprint
  const currentFingerprint = computeGitFingerprint();
  if (latestValidation && latestValidation.status === "passed") {
    if (isFingerprintStale(latestValidation, currentFingerprint)) {
      addError("VALIDATION_STALE",
        `Validation fingerprint mismatch: branch='${latestValidation.gitState.branch}' vs '${currentFingerprint.branch}', ` +
        `HEAD=${latestValidation.gitState.headCommit.slice(0, 8)} vs ${currentFingerprint.headCommit.slice(0, 8)}, ` +
        `fingerprint=${latestValidation.gitState.fingerprint} vs ${currentFingerprint.fingerprint}`);
    }
  }

  // Gate 4b: Clean tree requirement (from profile)
  if (policy.requireCleanTree && latestValidation && latestValidation.status === "passed") {
    const currentDirty = isDirty();
    const validatedDirty = latestValidation.gitState && latestValidation.gitState.changedFiles &&
      latestValidation.gitState.changedFiles.length > 0;

    if (!validatedDirty && currentDirty) {
      // Was clean, now dirty — check if only allowed paths changed
      const allowed = policy.allowedChangedPathsAfterValidation || [];
      const currentChanged = currentFingerprint.changedFiles.map(f => f.path);
      const disallowed = currentChanged.filter(f => !allowed.some(a => f.startsWith(a)));
      if (disallowed.length > 0) {
        addError("DIRTY_SINCE_VALIDATION",
          `Working tree has ${disallowed.length} uncommitted change(s) not in allowed paths after validation`);
      }
    } else if (validatedDirty && currentDirty) {
      // Was dirty, still dirty — check if fingerprint changed
      if (latestValidation.gitState.fingerprint !== currentFingerprint.fingerprint) {
        const allowed = policy.allowedChangedPathsAfterValidation || [];
        const validatedPaths = new Set(latestValidation.gitState.changedFiles.map(f => f.path));
        const currentChanged = currentFingerprint.changedFiles.filter(f => !validatedPaths.has(f.path));
        const disallowed = currentChanged.filter(f => !allowed.some(a => f.path.startsWith(a)));
        if (disallowed.length > 0) {
          addError("WORKING_TREE_CHANGED",
            `Working tree content changed since validation (${disallowed.length} new/modified file(s))`);
        }
      }
    }
  }

  // Gate 4c: Validation age check (from profile)
  if (policy.validationMaxAgeMinutes && latestValidation && latestValidation.completedAt) {
    const ageMs = Date.now() - new Date(latestValidation.completedAt).getTime();
    const maxMs = policy.validationMaxAgeMinutes * 60 * 1000;
    if (ageMs > maxMs) {
      addError("VALIDATION_EXPIRED",
        `Validation is ${Math.floor(ageMs / 60000)} minutes old, max allowed is ${policy.validationMaxAgeMinutes} minutes`);
    }
  }

  // Gate 5: Active session is closed
  const activeSession = findActiveSession();
  if (activeSession) {
    addError("SESSION_OPEN", `Active session '${activeSession.id}' must be closed before completing. Run dev:pause.`);
  }

  // Gate 6: Closeout information exists (blocking per policy)
  const closeout = readJson(path.join(PROJECT_ROOT, "docs", "07-progress", "work-closeout.json"), null);
  if (policy.requireCloseout) {
    if (!closeout) {
      addError("NO_CLOSEOUT", "No work-closeout.json found. Create one before completing.");
    } else if (closeout.status !== "complete") {
      addError("CLOSEOUT_INCOMPLETE", `Closeout status is '${closeout.status}', not 'complete'`);
    }
  }

  // Gate 7: Acceptance criteria have evidence (if any are defined)
  if (milestone.acceptanceCriteria && milestone.acceptanceCriteria.length > 0) {
    const evidence = loadAcceptanceEvidence(milestone.id);
    const evidenceMap = new Map((evidence.criteria || []).map(e => [e.criterion, e]));
    for (const criterion of milestone.acceptanceCriteria) {
      const e = evidenceMap.get(criterion);
      if (!e || !e.satisfied) {
        addError("CRITERIA_UNSATISFIED", `Acceptance criterion not satisfied: "${criterion}"`);
      }
    }
  }

  // Gate 8: Remaining work is empty or formally deferred (blocking per policy)
  if (policy.requireEmptyRemainingWork) {
    const lastSession = findPausedSession() || findActiveSession();
    if (lastSession && lastSession.remainingWork && lastSession.remainingWork.length > 0) {
      // Check if all remaining work is formally deferred
      const undeferred = lastSession.remainingWork.filter(w => {
        if (typeof w === "string") return true; // string = not deferred
        if (w.disposition === "deferred" && w.targetMilestoneId && w.approvedBy) return false;
        return true;
      });
      if (undeferred.length > 0) {
        addError("REMAINING_WORK",
          `Session has ${undeferred.length} undeferred remaining work item(s). Defer to another milestone or complete them.`);
      }
    }
  }

  // Gate 9: Manual checks complete (from profile)
  if (policy.requireManualChecksComplete && latestValidation && latestValidation.manualChecks) {
    const incomplete = latestValidation.manualChecks.filter(mc => !mc.acknowledged);
    if (incomplete.length > 0) {
      addError("MANUAL_CHECKS_INCOMPLETE",
        `${incomplete.length} manual check(s) not acknowledged: ${incomplete.map(mc => mc.id).join(", ")}`);
    }
  }

  // If there are errors, refuse completion
  if (errors.length > 0) {
    console.log(JSON.stringify({
      ok: false,
      milestoneId: milestone.id,
      errors,
      warnings,
      message: "Milestone completion refused. Resolve errors above.",
    }, null, 2));
    process.exit(1);
  }

  // Transition to ready-for-delivery
  milestone.status = "ready-for-delivery";
  milestone.completedAt = now();
  milestone.completionBranch = currentFingerprint.branch;
  milestone.completionHead = currentFingerprint.headCommit;
  writeMilestone(milestone);

  // Update project state
  const ps = readProjectState();
  if (ps) {
    ps.currentMilestone = null;
    ps.activeSession = null;
    ps.status = "ready-for-delivery";
    ps.lastCompletedMilestone = milestone.id;
    ps.nextRecommendedAction = `Deliver milestone '${milestone.id}' (deliver-milestone.js --slug ${milestone.id} --all)`;
    ps.updatedBy = { type: "agent", name: "dev-lifecycle", platform: "system" };
    writeProjectState(ps);
  }

  console.log(JSON.stringify({
    ok: true,
    milestoneId: milestone.id,
    status: "ready-for-delivery",
    completedAt: milestone.completedAt,
    branch: currentFingerprint.branch,
    head: currentFingerprint.headCommit,
    warnings,
    nextAction: `Deliver: deliver-milestone.js --slug ${milestone.id} --all`,
  }, null, 2));
}

function runDevStatus() {
  try {
    const result = spawnSync("node", [
      path.join(PROJECT_ROOT, "scripts", "dev-status.js"),
      "--json"
    ], { cwd: PROJECT_ROOT, encoding: "utf8", shell: process.platform === "win32" });
    return JSON.parse(result.stdout || "{}");
  } catch {
    return { contradictions: [] };
  }
}

// ---- Phase 2C: prepare ----

function cmdPrepare(args) {
  const milestone = findActiveMilestone();
  if (!milestone) {
    console.error("Error: No active milestone. Start a milestone first.");
    process.exit(1);
  }

  // Gate 1: Session must be closed
  const activeSession = findActiveSession();
  if (activeSession) {
    console.error("Error: Active session must be closed before prepare. Run dev:session:close.");
    process.exit(1);
  }

  // Gate 2: Must be on a branch (not default)
  const branch = getCurrentBranch();
  const defaultBranch = git(["rev-parse", "--verify", "main"]) ? "main" : "master";
  if (branch === defaultBranch) {
    console.error("Error: Must be on a feature branch, not the default branch.");
    process.exit(1);
  }

  // Gate 3: Working tree must have changes to commit
  const status = git(["status", "--porcelain"]) || "";
  if (!status.trim()) {
    console.error("Error: Working tree is clean. Nothing to prepare.");
    process.exit(1);
  }

  // Inspect files
  const staged = (git(["diff", "--cached", "--name-only"]) || "").split(/\r?\n/).filter(Boolean);
  const modified = (git(["diff", "--name-only"]) || "").split(/\r?\n/).filter(Boolean);
  const untracked = (git(["ls-files", "--others", "--exclude-standard"]) || "").split(/\r?\n/).filter(Boolean);
  const allDirty = [...new Set([...staged, ...modified, ...untracked])];

  // Compare against milestone scope
  const scopeFiles = [
    ...(milestone.scope?.included || []),
    // Always allowed: development control plane files
    "development/",
    "AGENTS.md",
    "docs/",
    "package.json",
    "scripts/",
    "policies/",
    ".opencode/agents/objectives/",
    ".opencode/agents/state/",
    "README.md",
  ];

  const isScoped = (f) => {
    // Check if file matches any scope pattern
    for (const pattern of scopeFiles) {
      if (f === pattern || f.startsWith(pattern)) return true;
    }
    // Check if file is under milestone's changed_files from validation
    if (milestone.latestValidationId) {
      const validation = readValidationResult(milestone.latestValidationId);
      if (validation && validation.gitState && validation.gitState.changedFiles) {
        for (const vf of validation.gitState.changedFiles) {
          if (vf.path === f) return true;
        }
      }
    }
    return false;
  };

  const scoped = allDirty.filter(isScoped);
  const unscoped = allDirty.filter(f => !isScoped(f));

  // Gate 4: Require acknowledgement for unscoped files
  if (unscoped.length > 0) {
    const autoAck = extractArg(args, "--acknowledge-unrelated");
    if (!autoAck) {
      console.log(JSON.stringify({
        ok: false,
        error: "UNRELATED_FILES",
        message: `${unscoped.length} file(s) are outside milestone scope`,
        unscoped,
        scoped: scoped.length,
        hint: "Remove unrelated files, or run: dev:prepare --acknowledge-unrelated 'reason'",
      }, null, 2));
      process.exit(1);
    }
  }

  // Stage approved files
  for (const f of scoped) {
    git(["add", f]);
  }

  // Check if anything is staged after staging
  const stagedAfter = (git(["diff", "--cached", "--name-only"]) || "").split(/\r?\n/).filter(Boolean);
  if (stagedAfter.length === 0) {
    console.error("Error: No changes to commit after staging scoped files.");
    process.exit(1);
  }

  // Create conventional commit
  const head = getCurrentHead();
  const completed = milestone.acceptanceCriteria?.slice(0, 5) || [];
  const subject = `feat(${deriveAreaFromFiles(stagedAfter)}): complete ${milestone.id}`;
  const bodyLines = [];
  if (completed.length > 0) {
    bodyLines.push(...completed.map(c => `- ${c}`));
    bodyLines.push("");
  }
  bodyLines.push(`Prepared from branch: ${branch}`);
  bodyLines.push(`Files staged: ${stagedAfter.length}`);
  const commitMsg = bodyLines.length > 0 ? `${subject}\n\n${bodyLines.join("\n")}` : subject;

  // Write commit message to temp file to avoid shell splitting
  const commitMsgPath = path.join(PROJECT_ROOT, ".git", "COMMIT_MSG_TEMP");
  fs.writeFileSync(commitMsgPath, commitMsg, "utf8");

  const commitResult = gitResult(["commit", "--file", commitMsgPath]);
  try { fs.unlinkSync(commitMsgPath); } catch {}

  if (commitResult.status !== 0) {
    console.error(`Error: Commit failed: ${(commitResult.stderr || commitResult.stdout || "").trim()}`);
    process.exit(1);
  }

  const commitSha = git(["rev-parse", "HEAD"]);

  // Gate 5: Verify clean tree after commit
  const postStatus = git(["status", "--porcelain"]) || "";
  if (postStatus.trim()) {
    console.error("Error: Working tree is not clean after commit.");
    process.exit(1);
  }

  // Record prepared state on milestone
  milestone.preparedCommit = commitSha;
  milestone.preparedBranch = branch;
  milestone.preparedAt = now();
  writeMilestone(milestone);

  // Update project state
  const ps = readProjectState();
  if (ps) {
    ps.activeBranch = branch;
    writeProjectState(ps);
  }

  console.log(JSON.stringify({
    ok: true,
    milestoneId: milestone.id,
    commit: commitSha,
    branch,
    filesStaged: stagedAfter.length,
    unscoped: unscoped.length,
    message: `Prepared commit ${commitSha.slice(0, 8)} on ${branch}`,
    nextAction: "Run dev:validate against committed HEAD",
  }, null, 2));
}

function deriveAreaFromFiles(files) {
  if (!files || files.length === 0) return "core";
  const areas = new Map();
  for (const f of files) {
    const parts = f.split("/");
    if (parts.length >= 2) {
      const area = parts[0] === "companion" ? (parts[1] || "core") : parts[0];
      areas.set(area, (areas.get(area) || 0) + 1);
    }
  }
  if (areas.size === 0) return "core";
  let best = null;
  let bestCount = 0;
  for (const [area, count] of areas) {
    if (count > bestCount) { best = area; bestCount = count; }
  }
  return best || "core";
}

// ---- Phase 2B hardening: session close ----

function cmdSessionClose(args) {
  const summary = extractArg(args, "--summary") || "Session closed";
  const session = findActiveSession();
  if (!session) {
    console.error("Error: No active session to close.");
    process.exit(1);
  }

  const head = getCurrentHead();
  const branch = getCurrentBranch();

  // Get dirty files
  const staged = (git(["diff", "--cached", "--name-only"]) || "").split(/\r?\n/).filter(Boolean);
  const modified = (git(["diff", "--name-only"]) || "").split(/\r?\n/).filter(Boolean);
  const untracked = (git(["ls-files", "--others", "--exclude-standard"]) || "").split(/\r?\n/).filter(Boolean);
  const dirtyFiles = [...staged, ...modified, ...untracked];

  // Close session
  session.status = "closed";
  session.closedAt = now();
  session.closingCommit = head;
  session.dirtyFiles = dirtyFiles;
  session.completedWork.push(summary);
  writeSession(session);

  console.log(JSON.stringify({
    ok: true,
    sessionId: session.id,
    status: "closed",
    closingCommit: head,
    branch,
    dirtyFiles: dirtyFiles.length,
    summary,
  }, null, 2));
}

function cmdStatus() {
  const ps = readProjectState();
  const activeMilestone = findActiveMilestone();
  const pausedMilestone = findPausedMilestone();
  const activeSession = findActiveSession();
  const pausedSession = findPausedSession();
  const allMilestones = listMilestones();
  const allSessions = listSessions();

  console.log(JSON.stringify({
    projectState: ps ? { status: ps.status, currentMilestone: ps.currentMilestone, activeSession: ps.activeSession } : null,
    milestones: {
      active: activeMilestone ? { id: activeMilestone.id, status: activeMilestone.status } : null,
      paused: pausedMilestone ? { id: pausedMilestone.id, status: pausedMilestone.status } : null,
      total: allMilestones.length,
    },
    sessions: {
      active: activeSession ? { id: activeSession.id, milestoneId: activeSession.milestoneId } : null,
      paused: pausedSession ? { id: pausedSession.id, milestoneId: pausedSession.milestoneId } : null,
      total: allSessions.length,
    },
  }, null, 2));
}

// ---- main ----

function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "help") {
    console.log(`
Development Lifecycle Commands (Phase 2A + 2B + 2C)

Usage: node scripts/dev-lifecycle.js <command> [options]

Commands:
  start      --slug <id> --title "Title" --purpose "Why" [--type feature] [--priority medium]
  checkpoint --message "What was done"
  pause      --reason "Why pausing"
  block      --reason "Why blocked" [--type human-action|external-dependency|hardware|decision-required]
  resume
  session:close --summary "What was accomplished"
  prepare    [--acknowledge-unrelated "reason"]
  validate   [--profile <id>]
  complete
  status
`);
    process.exit(0);
  }

  switch (command) {
    case "start": cmdStart(args.slice(1)); break;
    case "checkpoint": cmdCheckpoint(args.slice(1)); break;
    case "pause": cmdPause(args.slice(1)); break;
    case "block": cmdBlock(args.slice(1)); break;
    case "resume": cmdResume(args.slice(1)); break;
    case "session:close": cmdSessionClose(args.slice(1)); break;
    case "prepare": cmdPrepare(args.slice(1)); break;
    case "validate": cmdValidate(args.slice(1)); break;
    case "complete": cmdComplete(args.slice(1)); break;
    case "status": cmdStatus(); break;
    default:
      console.error(`Unknown command: ${command}`);
      process.exit(1);
  }
}

main();
