const { recordCaptureEventNonBlocking } = require("./recorder");
const {
  getRepositoryIdentity,
  getCommitMetadata,
  listCommitsSince
} = require("./git-metadata");

function withGitSource(projectRoot, adapter, extra = {}) {
  const identity = getRepositoryIdentity(projectRoot);
  return {
    adapter,
    repository: identity.repository,
    branch: identity.branch,
    ...extra
  };
}

function emitObjectiveStarted({ projectRoot, objectiveId, runId, baseCommit }) {
  recordCaptureEventNonBlocking({
    eventType: "objective_started",
    summary: `Objective '${objectiveId}' activated by sequencer.`,
    source: withGitSource(projectRoot, "controller", {
      objectiveSlug: objectiveId,
      commit: baseCommit || undefined
    }),
    correlation: { runId, objectiveId, taskId: null, sessionId: null },
    idParts: [objectiveId, "objective_started", runId || "sequencer"]
  });
}

function emitObjectiveCompleted({ projectRoot, objectiveId, runId, acceptedTaskCount = 0 }) {
  recordCaptureEventNonBlocking({
    eventType: "objective_completed",
    summary: `Objective '${objectiveId}' completed (${acceptedTaskCount} accepted tasks).`,
    source: withGitSource(projectRoot, "controller", { objectiveSlug: objectiveId }),
    correlation: { runId, objectiveId, taskId: null, sessionId: null },
    idParts: [objectiveId, "objective_completed", runId || "sequencer"]
  });
}

function emitObjectiveBlocked({ projectRoot, objectiveId, runId, blocker, adapter = "supervisor" }) {
  recordCaptureEventNonBlocking({
    eventType: "objective_blocked",
    summary: `Objective '${objectiveId}' blocked: ${blocker || "unknown blocker"}.`,
    source: withGitSource(projectRoot, adapter, { objectiveSlug: objectiveId }),
    correlation: { runId, objectiveId, taskId: null, sessionId: null },
    idParts: [objectiveId, "objective_blocked", runId || "controller", blocker || "unknown"]
  });
}

function emitTaskDispatched({ projectRoot, objectiveId, taskId, runId, iteration }) {
  recordCaptureEventNonBlocking({
    eventType: "task_dispatched",
    summary: `Task '${taskId}' dispatched for objective '${objectiveId}'.`,
    source: withGitSource(projectRoot, "supervisor", {
      objectiveSlug: objectiveId,
      taskSlug: taskId
    }),
    correlation: { runId, objectiveId, taskId, sessionId: null },
    idParts: [objectiveId, "task_dispatched", taskId, runId, iteration]
  });
}

function emitTaskAccepted({ projectRoot, objectiveId, taskId, runId, iteration }) {
  recordCaptureEventNonBlocking({
    eventType: "task_accepted",
    summary: `Task '${taskId}' accepted for objective '${objectiveId}'.`,
    source: withGitSource(projectRoot, "supervisor", {
      objectiveSlug: objectiveId,
      taskSlug: taskId
    }),
    correlation: { runId, objectiveId, taskId, sessionId: null },
    idParts: [objectiveId, "task_accepted", taskId, runId, iteration]
  });
}

function emitTaskRejected({ projectRoot, objectiveId, taskId, runId, iteration, reason }) {
  recordCaptureEventNonBlocking({
    eventType: "task_rejected",
    summary: `Task '${taskId}' rejected for objective '${objectiveId}'${reason ? `: ${reason}` : "."}`,
    source: withGitSource(projectRoot, "supervisor", {
      objectiveSlug: objectiveId,
      taskSlug: taskId
    }),
    correlation: { runId, objectiveId, taskId, sessionId: null },
    idParts: [objectiveId, "task_rejected", taskId, runId, iteration]
  });
}

function emitBlockerRecorded({ projectRoot, objectiveId, taskId, runId, blocker, adapter = "worker" }) {
  recordCaptureEventNonBlocking({
    eventType: "blocker_recorded",
    summary: `Blocker recorded for task '${taskId}': ${blocker}.`,
    source: withGitSource(projectRoot, adapter, {
      objectiveSlug: objectiveId,
      taskSlug: taskId
    }),
    correlation: { runId, objectiveId, taskId, sessionId: null },
    idParts: [objectiveId, "blocker_recorded", taskId, runId, blocker]
  });
}

function emitTestCompleted({ projectRoot, objectiveId, taskId, runId, passed, commandCount = 0 }) {
  recordCaptureEventNonBlocking({
    eventType: "test_completed",
    summary: `Tests ${passed ? "passed" : "failed"} for task '${taskId}' (${commandCount} command(s) reported).`,
    source: withGitSource(projectRoot, "worker", {
      objectiveSlug: objectiveId,
      taskSlug: taskId
    }),
    correlation: { runId, objectiveId, taskId, sessionId: null },
    artifacts: commandCount > 0
      ? [{ kind: "record_id", ref: `tests:${commandCount}`, label: "Worker-reported test commands" }]
      : [],
    idParts: [objectiveId, "test_completed", taskId, runId, passed ? "pass" : "fail"]
  });
}

function emitCommitCreated({ projectRoot, objectiveId, taskId, runId, commitSha }) {
  const metadata = getCommitMetadata(projectRoot, commitSha);
  if (!metadata) {
    return;
  }

  const identity = getRepositoryIdentity(projectRoot);
  recordCaptureEventNonBlocking({
    eventType: "commit_created",
    summary: `Commit ${metadata.sha.slice(0, 12)}: ${metadata.subject}`.slice(0, 2000),
    source: withGitSource(projectRoot, "git", {
      objectiveSlug: objectiveId,
      taskSlug: taskId,
      commit: metadata.sha
    }),
    correlation: { runId, objectiveId, taskId, sessionId: null },
    artifacts: [
      { kind: "commit_sha", ref: metadata.sha, label: metadata.subject },
      ...metadata.changedPaths.slice(0, 20).map((filePath) => ({
        kind: "file_path",
        ref: filePath,
        label: "Changed file"
      }))
    ],
    idParts: ["commit_created", metadata.sha]
  });
}

function emitCommitsSinceRef({ projectRoot, objectiveId, taskId, runId, baseRef, headRef = "HEAD" }) {
  const commits = listCommitsSince(projectRoot, baseRef, headRef);
  for (const commitSha of commits) {
    emitCommitCreated({ projectRoot, objectiveId, taskId, runId, commitSha });
  }
}

function emitDecisionRecorded({ projectRoot, projectSlug, title, reason, recordedBy = "human" }) {
  recordCaptureEventNonBlocking({
    eventType: "decision_recorded",
    summary: `${title}${reason ? ` — ${reason}` : ""}`.slice(0, 2000),
    source: {
      adapter: "human",
      repository: getRepositoryIdentity(projectRoot).repository
    },
    correlation: { runId: null, objectiveId: null, taskId: null, sessionId: null },
    artifacts: [{ kind: "record_id", ref: recordedBy, label: "Decision author" }],
    idParts: [projectSlug || "locaily", "decision_recorded", title, reason || ""]
  });
}

function emitWorkerValidationCompleted({ projectRoot, objectiveId, taskId, runId, workerResult }) {
  if (workerResult && workerResult.blocker) {
    emitBlockerRecorded({
      projectRoot,
      objectiveId,
      taskId,
      runId,
      blocker: workerResult.blocker,
      adapter: "worker"
    });
  }

  const tests = Array.isArray(workerResult && workerResult.tests) ? workerResult.tests : [];
  if (tests.length > 0) {
    const passed = tests.every((entry) => {
      if (typeof entry === "string") {
        return /pass|ok|success/i.test(entry);
      }
      if (entry && typeof entry === "object") {
        return entry.passed === true || entry.ok === true || entry.status === "pass";
      }
      return false;
    });
    emitTestCompleted({
      projectRoot,
      objectiveId,
      taskId,
      runId,
      passed,
      commandCount: tests.length
    });
  }
}

module.exports = {
  emitObjectiveStarted,
  emitObjectiveCompleted,
  emitObjectiveBlocked,
  emitTaskDispatched,
  emitTaskAccepted,
  emitTaskRejected,
  emitBlockerRecorded,
  emitTestCompleted,
  emitCommitCreated,
  emitCommitsSinceRef,
  emitDecisionRecorded,
  emitWorkerValidationCompleted,
  buildStableEventId: require("./event-id").buildStableEventId
};
