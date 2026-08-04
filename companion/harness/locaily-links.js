const fs = require("node:fs");
const path = require("node:path");

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function relativePath(repoRoot, filePath) {
  return path.relative(repoRoot, filePath).split(path.sep).join("/") || ".";
}

function exists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function countJsonFiles(directory) {
  if (!exists(directory)) return 0;
  try {
    return fs.readdirSync(directory).filter((file) => file.endsWith(".json")).length;
  } catch {
    return 0;
  }
}

function readValidation(repoRoot, milestoneId) {
  const indexPath = path.join(repoRoot, "development", "validation-index.json");
  const index = readJson(indexPath);
  const indexedId = index && index.latestByMilestone && index.latestByMilestone[milestoneId];
  if (indexedId) {
    const indexedPath = path.join(repoRoot, "development", "validation-results", `${indexedId}.json`);
    const indexed = readJson(indexedPath);
    if (indexed) return { value: indexed, filePath: indexedPath };
  }

  const resultsDir = path.join(repoRoot, "development", "validation-results");
  if (!exists(resultsDir)) return null;

  const candidates = fs.readdirSync(resultsDir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => ({ filePath: path.join(resultsDir, file), value: readJson(path.join(resultsDir, file)) }))
    .filter((item) => item.value && item.value.milestoneId === milestoneId)
    .sort((left, right) => Date.parse(right.value.completedAt || "") - Date.parse(left.value.completedAt || ""));

  return candidates[0] || null;
}

function makeLink({ available, filePath, repoRoot, id = null, status = null }) {
  return {
    available,
    path: relativePath(repoRoot, filePath),
    id,
    status,
    readOnly: true
  };
}

function collectReviewedMemoryLink(repoRoot) {
  const root = path.join(repoRoot, "data", "memory", "development-candidates");
  const candidatesDir = path.join(root, "candidates");
  const reviewsDir = path.join(root, "reviews");
  const candidateFiles = exists(candidatesDir)
    ? fs.readdirSync(candidatesDir).filter((file) => file.endsWith(".json"))
    : [];
  const reviewFiles = exists(reviewsDir)
    ? fs.readdirSync(reviewsDir).filter((file) => file.endsWith(".json"))
    : [];

  let pendingReviewCount = 0;
  for (const candidateFile of candidateFiles) {
    const reviewPath = path.join(reviewsDir, candidateFile);
    const review = readJson(reviewPath);
    if (!review || review.status === "pending") pendingReviewCount += 1;
  }

  return {
    available: exists(root),
    path: relativePath(repoRoot, root),
    candidateCount: candidateFiles.length,
    pendingReviewCount,
    readOnly: true
  };
}

function collectLocailyLinks(repoRoot) {
  const projectStatePath = path.join(repoRoot, "development", "project-state.json");
  const projectState = readJson(projectStatePath);
  const milestoneId = projectState && projectState.currentMilestone ? projectState.currentMilestone : null;
  const sessionId = projectState && projectState.activeSession ? projectState.activeSession : null;

  const milestonePath = milestoneId
    ? path.join(repoRoot, "development", "milestones", `${milestoneId}.json`)
    : path.join(repoRoot, "development", "milestones");
  const milestone = readJson(milestonePath);

  const sessionPath = sessionId
    ? path.join(repoRoot, "development", "sessions", `${sessionId}.json`)
    : path.join(repoRoot, "development", "sessions");
  const session = readJson(sessionPath);

  const closeoutPath = path.join(repoRoot, "docs", "07-progress", "work-closeout.json");
  const closeout = readJson(closeoutPath);
  const validation = milestoneId ? readValidation(repoRoot, milestoneId) : null;
  const validationPath = validation ? validation.filePath : path.join(repoRoot, "development", "validation-results");

  return {
    projectState: {
      available: Boolean(projectState),
      path: relativePath(repoRoot, projectStatePath),
      currentMilestoneId: milestoneId,
      activeSessionId: sessionId,
      status: projectState ? projectState.status || null : null,
      branch: projectState ? projectState.activeBranch || null : null,
      readOnly: true
    },
    milestone: {
      ...makeLink({
        available: Boolean(milestone),
        filePath: milestonePath,
        repoRoot,
        id: milestone ? milestone.id || null : milestoneId,
        status: milestone ? milestone.status || null : null
      }),
      title: milestone ? milestone.title || null : null
    },
    session: {
      ...makeLink({
        available: Boolean(session),
        filePath: sessionPath,
        repoRoot,
        id: session ? session.id || null : sessionId,
        status: session ? session.status || null : null
      }),
      branch: session ? session.branch || null : null
    },
    workCloseout: {
      available: Boolean(closeout),
      path: relativePath(repoRoot, closeoutPath),
      workId: closeout ? closeout.work_id || null : null,
      status: closeout ? closeout.status || null : null,
      readOnly: true
    },
    validation: {
      ...makeLink({
        available: Boolean(validation),
        filePath: validationPath,
        repoRoot,
        id: validation ? validation.value.id || null : null,
        status: validation ? validation.value.status || null : null
      }),
      profileId: validation ? validation.value.profileId || null : null
    },
    reviewedMemory: collectReviewedMemoryLink(repoRoot)
  };
}

module.exports = {
  collectLocailyLinks,
  relativePath
};
