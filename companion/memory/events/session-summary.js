function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))];
}

function collectFilesFromEvent(event) {
  if (!Array.isArray(event.artifacts)) {
    return [];
  }

  return event.artifacts
    .filter((artifact) => artifact.kind === "file_path")
    .map((artifact) => artifact.ref);
}

function buildMetricsFromEvents(events) {
  const objectivesAttempted = uniqueStrings(
    events
      .filter((event) => event.eventType.startsWith("objective_"))
      .map((event) => event.correlation && event.correlation.objectiveId)
  );

  const tasksCompleted = events.filter((event) => event.eventType === "task_accepted").length;
  const commitsProduced = events.filter((event) => event.eventType === "commit_created").length;
  const testsExecuted = events.filter((event) => event.eventType === "test_completed").length;

  const filesAffected = uniqueStrings(events.flatMap(collectFilesFromEvent));

  const blockers = uniqueStrings(
    events
      .filter((event) => event.eventType === "blocker_recorded" || event.eventType === "objective_blocked")
      .map((event) => event.summary)
  );

  const unresolvedWork = uniqueStrings(
    events
      .filter((event) => event.eventType === "task_rejected" || event.eventType === "objective_blocked")
      .map((event) => event.summary)
  );

  return {
    objectivesAttempted,
    tasksCompleted,
    commitsProduced,
    testsExecuted,
    filesAffected,
    blockers,
    unresolvedWork
  };
}

function buildDeterministicSummary(events, metrics) {
  const sorted = [...events].sort((left, right) => {
    return Date.parse(left.occurredAt || 0) - Date.parse(right.occurredAt || 0);
  });

  const linkedEventIds = sorted.map((event) => event.eventId);
  const lines = [];

  if (metrics.objectivesAttempted.length > 0) {
    lines.push(`Objectives attempted: ${metrics.objectivesAttempted.join(", ")}.`);
  }

  lines.push(`Tasks completed: ${metrics.tasksCompleted}.`);
  lines.push(`Commits produced: ${metrics.commitsProduced}.`);
  lines.push(`Tests executed: ${metrics.testsExecuted}.`);

  if (metrics.blockers.length > 0) {
    lines.push(`Blockers: ${metrics.blockers.length}.`);
  }

  if (metrics.unresolvedWork.length > 0) {
    lines.push(`Unresolved items: ${metrics.unresolvedWork.length}.`);
  }

  lines.push("Evidence:");
  for (const event of sorted.slice(0, 20)) {
    lines.push(`- [${event.eventType}] ${event.summary}`);
  }

  if (sorted.length > 20) {
    lines.push(`- ... and ${sorted.length - 20} more event(s).`);
  }

  return {
    text: lines.join("\n").slice(0, 8000),
    linkedEventIds: linkedEventIds.length > 0 ? linkedEventIds : sorted.map((event) => event.eventId)
  };
}

module.exports = {
  buildMetricsFromEvents,
  buildDeterministicSummary,
  collectFilesFromEvent
};
