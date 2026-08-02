const { collectLocailyLinks } = require("./locaily-links");

const ADAPTER_VERSION = "0.1.0";

function slug(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "-");
}

function statusRecord(rawEvidence, key, fallback, sourceRef) {
  const supplied = rawEvidence && rawEvidence[key] ? rawEvidence[key] : {};
  return {
    status: supplied.status || fallback,
    reason: supplied.reason || `${key} evidence was reported by the fixture adapter.`,
    sourceRef: supplied.source_ref || sourceRef,
    redacted: supplied.status === "redacted"
  };
}

function createEvidenceCollector(rawEvidence, harnessId) {
  const records = [];

  function add(field, key, fallback, sourceRef, overrides = {}) {
    const supplied = statusRecord(rawEvidence, key, fallback, sourceRef);
    const record = {
      id: `evidence-${slug(field)}`,
      field,
      status: overrides.status || supplied.status,
      reason: overrides.reason || supplied.reason,
      sourceRef: overrides.sourceRef || supplied.sourceRef,
      redacted: overrides.redacted !== undefined ? overrides.redacted : supplied.redacted
    };
    records.push(record);
    return record.id;
  }

  function idFor(field) {
    return `evidence-${slug(field)}`;
  }

  add("harness", "harness", "available", `${harnessId}.harness`);
  add("workers", "workers", "available", `${harnessId}.workers`);
  add("worktrees", "worktrees", "available", `${harnessId}.worktrees`);
  add("objectives", "objectives", "available", `${harnessId}.objectives`);
  add("handoffs", "handoffs", "available", `${harnessId}.handoffs`);
  add("checks", "checks", "available", `${harnessId}.checks`);
  add("hud.contextPressure", "context", "available", `${harnessId}.hud.context`);
  add("hud.toolActivity", "tool_activity", "available", `${harnessId}.hud.tool_activity`);
  add("hud.risk", "risk", "available", `${harnessId}.hud.risk`);
  add("hud.cost", "cost", "unsupported", `${harnessId}.hud.cost`);
  add("hud.sync", "sync", "unavailable", `${harnessId}.hud.sync`);

  function addWorkerModel(workerId) {
    return add(`workers.${workerId}.model`, "model", "redacted", `${harnessId}.workers.${workerId}.model`, {
      redacted: true
    });
  }

  function addLocailyLink(key, link) {
    return add(`locailyLinks.${key}`, "locaily", link.available ? "available" : "unavailable", link.path, {
      reason: link.available ? "Local control-plane record was read." : "Local control-plane record is unavailable; no value was inferred."
    });
  }

  return { records, add, addWorkerModel, addLocailyLink, idFor };
}

function mapSessionStatus(value) {
  return ({ running: "active", active: "active", idle: "idle", completed: "completed", paused: "paused", failed: "failed" })[value] || "unknown";
}

function mapLifecycleStatus(value) {
  return ({ queued: "queued", running: "active", active: "active", blocked: "blocked", paused: "paused", completed: "completed", cancelled: "cancelled" })[value] || "unknown";
}

function mapWorkerStatus(value) {
  return ({ queued: "queued", working: "working", running: "working", blocked: "blocked", idle: "idle", completed: "completed", failed: "failed" })[value] || "unknown";
}

function mapObjectiveStatus(value) {
  return ({ queued: "queued", planned: "queued", active: "active", running: "active", blocked: "blocked", completed: "completed", cancelled: "cancelled" })[value] || "unknown";
}

function mapHandoffStatus(value) {
  return ({ pending: "pending", sent: "sent", accepted: "accepted", rejected: "rejected" })[value] || "unknown";
}

function normalizePercent(usedTokens, limitTokens) {
  if (!Number.isInteger(usedTokens) || !Number.isInteger(limitTokens) || limitTokens <= 0) return null;
  return Math.round((usedTokens / limitTokens) * 10000) / 100;
}

function normalizeRawFixture({ raw, harness, repoRoot, fixturePath, sourceId, session, workers, worktrees, objectives, handoffs, checks, hud, sourceEvidence }) {
  const evidence = createEvidenceCollector(sourceEvidence, harness.id);
  const sessionStatus = mapSessionStatus(session.status);
  const costEvidenceStatus = sourceEvidence.cost && sourceEvidence.cost.status
    ? sourceEvidence.cost.status
    : "unsupported";
  const syncEvidenceStatus = sourceEvidence.sync && sourceEvidence.sync.status
    ? sourceEvidence.sync.status
    : "unavailable";
  const usedTokens = hud.context.usedTokens;
  const limitTokens = hud.context.limitTokens;
  const contextPercent = normalizePercent(usedTokens, limitTokens);

  const normalizedWorkers = workers.map((worker) => {
    const model = worker.model && worker.model.status === "available" ? worker.model.value : null;
    const modelEvidenceId = worker.model && worker.model.status === "available"
      ? evidence.idFor("workers")
      : evidence.addWorkerModel(worker.id);
    return {
      id: worker.id,
      name: worker.name,
      role: worker.role,
      status: mapWorkerStatus(worker.status),
      model,
      objectiveIds: worker.objectiveIds,
      worktreeId: worker.worktreeId || null,
      evidenceIds: [evidence.idFor("workers"), modelEvidenceId]
    };
  });

  const normalizedWorktrees = worktrees.map((worktree) => ({
    id: worktree.id,
    path: worktree.path,
    branch: worktree.branch,
    commit: worktree.commit || null,
    dirty: typeof worktree.dirty === "boolean" ? worktree.dirty : null,
    evidenceIds: [evidence.idFor("worktrees")]
  }));

  const normalizedObjectives = objectives.map((objective) => ({
    id: objective.id,
    title: objective.title,
    status: mapObjectiveStatus(objective.status),
    priority: objective.priority || null,
    workerIds: objective.workerIds,
    worktreeIds: objective.worktreeIds,
    evidenceIds: [evidence.idFor("objectives")]
  }));

  const normalizedHandoffs = handoffs.map((handoff) => ({
    id: handoff.id,
    fromWorkerId: handoff.fromWorkerId,
    toWorkerId: handoff.toWorkerId || null,
    status: mapHandoffStatus(handoff.status),
    summary: handoff.summary || null,
    createdAt: handoff.createdAt,
    evidenceIds: [evidence.idFor("handoffs")]
  }));

  const normalizedChecks = checks.map((check) => ({
    id: check.id,
    name: check.name,
    status: check.status || "unknown",
    command: check.command || null,
    completedAt: check.completedAt || null,
    evidenceIds: [evidence.idFor("checks")]
  }));

  const links = collectLocailyLinks(repoRoot);
  for (const [key, link] of Object.entries(links)) evidence.addLocailyLink(key, link);

  return {
    schema: "locaily.harness.operations_snapshot.v1",
    snapshotId: `harness-snapshot-${slug(harness.id)}-${slug(sourceId)}`,
    capturedAt: raw.capturedAt,
    mode: "fixture",
    readOnly: true,
    harness: {
      id: harness.id,
      name: harness.name,
      version: harness.version || null,
      sessionId: session.id,
      sessionStatus
    },
    state: {
      overallStatus: sessionStatus,
      lifecycleStatus: mapLifecycleStatus(session.lifecycleStatus || session.status),
      reason: session.reason || null
    },
    workers: normalizedWorkers,
    worktrees: normalizedWorktrees,
    objectives: normalizedObjectives,
    handoffs: normalizedHandoffs,
    checks: normalizedChecks,
    hud: {
      contextPressure: {
        level: hud.context.level || "unknown",
        usedTokens,
        limitTokens,
        percent: contextPercent,
        evidenceIds: [evidence.idFor("hud.contextPressure")]
      },
      toolActivity: {
        state: hud.toolActivity.state || "unknown",
        activeCount: Number.isInteger(hud.toolActivity.activeCount) ? hud.toolActivity.activeCount : null,
        lastTool: hud.toolActivity.lastTool || null,
        evidenceIds: [evidence.idFor("hud.toolActivity")]
      },
      risk: {
        level: hud.risk.level || "unknown",
        flags: Array.isArray(hud.risk.flags) ? hud.risk.flags : [],
        evidenceIds: [evidence.idFor("hud.risk")]
      },
      cost: {
        availability: costEvidenceStatus,
        currency: "USD",
        amount: costEvidenceStatus === "available" && typeof hud.cost.amount === "number" ? hud.cost.amount : null,
        evidenceIds: [evidence.idFor("hud.cost")]
      },
      sync: {
        status: syncEvidenceStatus === "available" ? hud.sync.status || "unknown" : "unknown",
        lastSyncedAt: syncEvidenceStatus === "available" ? hud.sync.lastSyncedAt || null : null,
        evidenceIds: [evidence.idFor("hud.sync")]
      }
    },
    evidence: {
      collectionMode: "fixture",
      readOnly: true,
      records: evidence.records
    },
    provenance: {
      sourceKind: "fixture",
      sourceId,
      fixturePath,
      adapterId: `${harness.id}-fixture-adapter`,
      adapterVersion: ADAPTER_VERSION,
      sourceHarness: harness.id,
      sourceSessionId: session.id,
      transformations: [
        { field: "state", operation: "normalized", note: "Harness lifecycle labels were mapped to the canonical Locaily state vocabulary." },
        { field: "workers", operation: "normalized", note: "Harness worker records were mapped to the canonical worker shape." },
        { field: "worktrees", operation: "normalized", note: "Harness worktree records were mapped to the canonical worktree shape." },
        { field: "objectives", operation: "normalized", note: "Harness objective records were mapped to the canonical objective shape." },
        { field: "handoffs", operation: "normalized", note: "Harness handoff records were mapped to the canonical handoff shape." },
        { field: "checks", operation: "normalized", note: "Harness checks were mapped without executing or re-running them." },
        { field: "hud", operation: "normalized", note: "HUD fields preserve source availability and use null for unavailable values." },
        { field: "workers[].model", operation: "redacted", note: "Fixture model values are intentionally redacted and never inferred." }
      ]
    },
    locailyLinks: links
  };
}

function normalizeCodex(raw, options = {}) {
  return normalizeRawFixture({
    raw,
    harness: { id: "codex", name: raw.harness.name, version: raw.harness.version },
    repoRoot: options.repoRoot,
    fixturePath: options.fixturePath,
    sourceId: raw.fixtureId,
    session: { id: raw.session.id, status: raw.session.status, lifecycleStatus: raw.session.lifecycle_status, reason: raw.session.reason },
    workers: raw.workers.map((worker) => ({
      id: worker.worker_id,
      name: worker.display_name,
      role: worker.role,
      status: worker.state,
      model: worker.model,
      objectiveIds: worker.objective_ids,
      worktreeId: worker.worktree_id
    })),
    worktrees: raw.worktrees,
    objectives: raw.objectives,
    handoffs: raw.handoffs,
    checks: raw.checks,
    hud: {
      context: { usedTokens: raw.hud.context.used_tokens, limitTokens: raw.hud.context.limit_tokens, level: raw.hud.context.level },
      toolActivity: { state: raw.hud.tool_activity.state, activeCount: raw.hud.tool_activity.active_count, lastTool: raw.hud.tool_activity.last_tool },
      risk: raw.hud.risk,
      cost: raw.hud.cost,
      sync: raw.hud.sync
    },
    sourceEvidence: raw.evidence
  });
}

function normalizeOpenCode(raw, options = {}) {
  return normalizeRawFixture({
    raw,
    harness: { id: "opencode", name: raw.provider.display_name, version: raw.provider.version },
    repoRoot: options.repoRoot,
    fixturePath: options.fixturePath,
    sourceId: raw.fixture_id,
    session: { id: raw.run.session_id, status: raw.run.status, lifecycleStatus: raw.run.lifecycle, reason: raw.run.reason },
    workers: raw.agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      role: agent.role,
      status: agent.phase,
      model: agent.model,
      objectiveIds: agent.objective_refs,
      worktreeId: agent.worktree_ref
    })),
    worktrees: raw.checkouts.map((checkout) => ({
      id: checkout.ref,
      path: checkout.root,
      branch: checkout.git_branch,
      commit: checkout.git_commit,
      dirty: checkout.has_changes
    })),
    objectives: raw.goals.map((goal) => ({
      id: goal.ref,
      title: goal.label,
      status: goal.phase,
      priority: goal.priority,
      workerIds: goal.assigned_agents,
      worktreeIds: goal.checkout_refs
    })),
    handoffs: raw.transfers.map((transfer) => ({
      id: transfer.ref,
      fromWorkerId: transfer.from,
      toWorkerId: transfer.to,
      status: transfer.state,
      summary: transfer.summary,
      createdAt: transfer.created_at
    })),
    checks: raw.verifications,
    hud: {
      context: { usedTokens: raw.hud.context.used, limitTokens: raw.hud.context.budget, level: raw.hud.context.pressure },
      toolActivity: { state: raw.hud.tools.state, activeCount: raw.hud.tools.active, lastTool: raw.hud.tools.last },
      risk: raw.hud.risk,
      cost: raw.hud.cost,
      sync: raw.hud.sync
    },
    sourceEvidence: raw.evidence
  });
}

module.exports = {
  ADAPTER_VERSION,
  normalizeCodex,
  normalizeOpenCode
};
