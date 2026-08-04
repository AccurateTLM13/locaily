const SECTIONS = {
  workbench:    { title: "Workbench",    render: renderWorkbench },
  create:       { title: "Create Task",  render: renderCreate },
  activity:     { title: "Activity",     render: renderActivity },
  review:       { title: "Review",       render: renderReview },
  operations:   { title: "Operations",   render: renderOperations },
  system:       { title: "System",       render: renderSystem },
  benchmarks:   { title: "Benchmark Lab", render: renderBenchmarks },
  workflows:    { title: "Workflows",    render: renderWorkflows },
  capabilities: { title: "Capabilities", render: renderCapabilities },
  runtime:      { title: "Runtime",      render: renderRuntime }
};

let currentSection = null;
let inspectorSelectedRunId = null;
const benchmarkUi = { models: [], suites: [], runs: [], activeRunId: null, eventSource: null, pollTimer: null };

function qs(id) { return document.getElementById(id); }
function showLoading(show) { const el = qs("shellLoading"); if (el) el.style.display = show ? "block" : "none"; }
function getContent() { return qs("shellSection"); }
function setContent(html) { const c = getContent(); if (c) c.innerHTML = html; showLoading(false); }

async function fetchJson(path) {
  try {
    const res = await fetch(path);
    const body = await res.json();
    return body;
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function fmtDuration(ms) {
  if (!ms && ms !== 0) return "—";
  if (ms < 1000) return ms + "ms";
  return (ms / 1000).toFixed(1) + "s";
}

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch { return iso; }
}

function statusBadge(status) {
  const map = {
    success: "badge--success", passed: "badge--success", completed: "badge--success", online: "badge--success", loaded: "badge--success", qualified: "badge--success",
    failure: "badge--fail", failed: "badge--fail", error: "badge--fail",
    partial: "badge--warn", timeout: "badge--warn", running: "badge--running", claimed: "badge--running",
    queued: "badge--neutral", pending: "badge--neutral", skipped: "badge--neutral", not_validated: "badge--neutral", offline: "badge--fail", cancelled: "badge--warn", preflight: "badge--running"
  };
  const cls = map[status] || "badge--neutral";
  return `<span class="badge ${cls}">${status || "unknown"}</span>`;
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function requestJson(path, options = {}) {
  const response = await fetch(path, options);
  const body = await response.json().catch(() => null);
  if (!response.ok || !body || body.ok === false) {
    const error = new Error(body?.message || `Request failed with HTTP ${response.status}.`);
    error.code = body?.code;
    error.nextStep = body?.nextStep;
    throw error;
  }
  return body;
}

async function navigate(section) {
  if (!SECTIONS[section]) section = "workbench";
  if (section === currentSection) return;
  if (currentSection === "benchmarks") closeBenchmarkStream();
  currentSection = section;
  history.replaceState(null, "", `#${section}`);
  document.querySelectorAll(".sidebar-link").forEach(el => {
    el.classList.toggle("sidebar-link--active", el.dataset.section === section);
  });
  showLoading(true);
  const renderer = SECTIONS[section];
  if (renderer) {
    document.title = `${renderer.title} — Locaily`;
    await renderer.render();
  }
}

// ─────────────────────────────────────────────
// WORKBENCH
// ─────────────────────────────────────────────
async function renderWorkbench() {
  let statusInfo = { brainOk: true, ollamaOk: true, modelName: "ollama", capabilitiesCount: 20 };
  try {
    const s = await fetchJson("/console/status");
    if (s && s.engine) {
      statusInfo.brainOk = Boolean(s.engine.running);
      statusInfo.ollamaOk = Boolean(s.ollama?.available);
      statusInfo.modelName = s.model?.ready ? s.model.name : "ollama";
      statusInfo.capabilitiesCount = s.tools?.count || 20;
    }
  } catch {}

  setContent(`
    <div class="workbench-page">
      <div class="workbench-header">
        <div>
          <div class="page-category">WORKBENCH</div>
          <h1 class="page-title">Make something happen.</h1>
          <p class="page-desc">Describe the outcome, review the route, and keep the resulting artifact attached to its run.</p>
        </div>
        <button class="btn btn--black" onclick="openTaskModal()">Create a task</button>
      </div>

      <div class="hero-card">
        <div class="hero-left">
          <div class="icon-box">L</div>
          <div class="hero-subtitle">LOCAL CAPABILITY WORKSPACE</div>
          <h2 class="hero-heading">From intent to<br>usable output.</h2>
          <p class="hero-text">Locaily chooses a qualified local route, keeps the evidence with the execution, and gives you a clear recovery path when work needs attention.</p>
          <div class="hero-actions">
            <button class="btn btn--black" onclick="openTaskModal()">Describe a task</button>
            <button class="btn btn--outline" onclick="navigate('workflows')">Browse recipes</button>
          </div>
        </div>
        <div class="hero-right">
          <div class="ready-tag">WORKSPACE READY</div>
          <div class="ready-title">${statusInfo.brainOk ? "Local Brain online" : "Local Brain offline"}</div>
          <div class="ready-desc">${statusInfo.modelName} · ${statusInfo.capabilitiesCount} capabilities registered</div>
        </div>
      </div>

      <div class="saved-plan-card">
        <div class="plan-info">
          <div class="plan-tag">SAVED PLAN</div>
          <div class="plan-title">Continue the task you started.</div>
          <div class="plan-desc">Audit my website and give me a fix plan</div>
        </div>
        <button class="btn btn--black" onclick="openPlanModal()">Review plan</button>
      </div>

      <div class="routes-section">
        <div class="routes-header">
          <div>
            <div class="page-category">READY ROUTES</div>
            <div class="routes-title">Start from a known outcome</div>
          </div>
          <a href="#workflows" class="see-all-link" onclick="navigate('workflows')">See all workflows →</a>
        </div>
        <div class="routes-grid">
          <div class="route-card" onclick="openTaskModalWithRoute('website_audit.lighthouse_handoff')">
            <div class="route-card__title">Website Accessibility & SEO Audit</div>
            <div class="route-card__desc">Run Lighthouse handoff audit, prioritize WCAG AA contrast, and export agent markdown.</div>
            <div class="route-card__badge">Tested · Local</div>
          </div>
          <div class="route-card" onclick="openTaskModalWithRoute('status-handoff')">
            <div class="route-card__title">Capability Status Handoff</div>
            <div class="route-card__desc">Evaluate project status events and emit structured handoff run records.</div>
            <div class="route-card__badge">Tested · Kernel</div>
          </div>
          <div class="route-card" onclick="openTaskModalWithRoute('repository_inspection')">
            <div class="route-card__title">Repository Code Inspection</div>
            <div class="route-card__desc">Scan code schema integrity, verify contract invariants, and report health metrics.</div>
            <div class="route-card__badge">Tested · Development</div>
          </div>
        </div>
      </div>
    </div>
  `);
}

// ─────────────────────────────────────────────
// CREATE
// ─────────────────────────────────────────────
async function renderCreate() {
  setContent(`
    <div class="workbench-page">
      <div class="page-category">CREATE</div>
      <h1 class="page-title">New Task Run</h1>
      <p class="page-desc">Define a new task or execution request for Local Brain.</p>
      <div class="inspector-card">
        <div class="form-group">
          <label for="createPromptInput">Task Request</label>
          <textarea id="createPromptInput" rows="4" placeholder="e.g. Audit https://example.com for accessibility issues and produce a fix plan..."></textarea>
        </div>
        <div class="form-group">
          <label for="createRouteSelect">Route / Workflow</label>
          <select id="createRouteSelect">
            <option value="website_audit.lighthouse_handoff">Website Accessibility & SEO Audit</option>
            <option value="status-handoff">Capability Status Handoff</option>
            <option value="repository_inspection">Repository Code Inspection</option>
          </select>
        </div>
        <div style="margin-top:12px">
          <button class="btn btn--black" onclick="submitCreateView()">Create & Queue Run</button>
        </div>
        <div id="createResultOutput" style="margin-top:16px"></div>
      </div>
    </div>
  `);
}

window.submitCreateView = async function() {
  const out = qs("createResultOutput");
  if (out) out.innerHTML = `<div class="notice notice--info">Queuing run…</div>`;
  try {
    const route = qs("createRouteSelect")?.value || "website_audit.lighthouse_handoff";
    const res = await fetch("/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ executionType: "workflow", workflowId: route, input: {}, options: {} })
    });
    const body = await res.json();
    if (body.ok && body.jobId) {
      if (out) out.innerHTML = `<div class="notice notice--success">Job queued: <code>${body.jobId}</code></div>`;
    } else {
      if (out) out.innerHTML = `<div class="notice notice--fail">Failed: ${body.message || JSON.stringify(body)}</div>`;
    }
  } catch (e) {
    if (out) out.innerHTML = `<div class="notice notice--fail">Error: ${e.message}</div>`;
  }
};

// ─────────────────────────────────────────────
// ACTIVITY — LIVE RUN INSPECTOR
// ─────────────────────────────────────────────
async function renderActivity() {
  setContent(`
    <div class="workbench-page inspector-layout">
      <div class="inspector-header-bar">
        <div>
          <div class="page-category">ACTIVITY</div>
          <h1 class="page-title" style="font-size:26px;margin-bottom:4px">Run Inspector</h1>
          <p class="page-desc" style="margin-bottom:0">Click a run to inspect its steps, routing, model, and evidence.</p>
        </div>
        <button class="btn btn--outline btn--sm" onclick="refreshActivity()">↻ Refresh</button>
      </div>

      <div class="inspector-split">
        <!-- Left: Run List -->
        <div class="inspector-run-list" id="runListPanel">
          <div class="run-list-toolbar">
            <select id="runStatusFilter" onchange="filterRuns()" class="filter-select">
              <option value="">All statuses</option>
              <option value="success">Success</option>
              <option value="failure">Failure</option>
              <option value="failed">Failed</option>
              <option value="error">Error</option>
              <option value="queued">Queued</option>
              <option value="running">Running</option>
            </select>
          </div>
          <div id="runListItems">
            <div class="loading-placeholder">Loading runs…</div>
          </div>
        </div>

        <!-- Right: Inspector Detail -->
        <div class="inspector-detail-panel" id="inspectorDetailPanel">
          <div class="inspector-empty-state">
            <div class="inspector-empty-icon">🔍</div>
            <div class="inspector-empty-title">Select a run</div>
            <div class="inspector-empty-desc">Choose a run from the list to inspect its steps, routing decisions, and evidence.</div>
          </div>
        </div>
      </div>
    </div>
  `);

  await loadRunList();
}

let allRunsCache = [];

window.loadRunList = async function loadRunList() {
  const panel = qs("runListItems");
  if (!panel) return;
  panel.innerHTML = `<div class="loading-placeholder">Loading…</div>`;

  const [runsRes, jobsRes] = await Promise.all([
    fetchJson("/console/runs?limit=100"),
    fetchJson("/jobs?limit=100")
  ]);

  const runs = Array.isArray(runsRes.runs) ? runsRes.runs : [];
  const jobs = Array.isArray(jobsRes.jobs) ? jobsRes.jobs : [];

  // Merge: console runs + job queue entries
  const jobItems = jobs.map(j => ({
    _type: "job",
    runId: j.jobId,
    workflow: j.workflowId || j.trackId || "unknown",
    status: j.status,
    createdAt: j.timestamps?.createdAt,
    durationMs: null,
    provider: null,
    model: null
  }));

  const runItems = runs.map(r => ({
    _type: "run",
    runId: r.runId,
    workflow: r.workflow || r.workflowId || r.trackId || "unknown",
    status: r.status,
    createdAt: r.createdAt,
    durationMs: r.durationMs,
    provider: r.provider,
    model: r.model
  }));

  // Deduplicate: runs take priority over jobs with same ID
  const seen = new Set(runs.map(r => r.runId));
  const merged = [...runItems, ...jobItems.filter(j => !seen.has(j.runId))];
  merged.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

  allRunsCache = merged;
  renderRunList(merged);
}

window.renderRunList = function renderRunList(items) {
  const panel = qs("runListItems");
  if (!panel) return;
  if (items.length === 0) {
    panel.innerHTML = `<div class="loading-placeholder">No runs found.</div>`;
    return;
  }
  panel.innerHTML = items.map(r => `
    <div class="run-list-item ${inspectorSelectedRunId === r.runId ? 'run-list-item--selected' : ''}"
         onclick="selectRun('${r.runId}', '${r._type}')"
         data-run-id="${r.runId}"
         data-status="${r.status}">
      <div class="run-list-item__top">
        <span class="run-list-item__workflow">${r.workflow}</span>
        ${statusBadge(r.status)}
      </div>
      <div class="run-list-item__meta">
        ${r.durationMs != null ? fmtDuration(r.durationMs) + " · " : ""}${formatRelativeTime(r.createdAt)}
        ${r.provider ? ` · <span class="run-list-item__provider">${r.provider}</span>` : ""}
      </div>
      <div class="run-list-item__id">${r.runId.slice(0, 28)}…</div>
    </div>
  `).join("");
}

window.filterRuns = function filterRuns() {
  const filter = qs("runStatusFilter")?.value || "";
  const filtered = filter ? allRunsCache.filter(r => r.status === filter) : allRunsCache;
  renderRunList(filtered);
};

window.refreshActivity = async function refreshActivity() {
  await loadRunList();
};

window.selectRun = async function selectRun(runId, type) {
  inspectorSelectedRunId = runId;
  // Update selected highlight
  document.querySelectorAll(".run-list-item").forEach(el => {
    el.classList.toggle("run-list-item--selected", el.dataset.runId === runId);
  });

  const panel = qs("inspectorDetailPanel");
  if (!panel) return;
  panel.innerHTML = `<div class="loading-placeholder" style="padding:24px">Loading run detail…</div>`;

  try {
    if (type === "run") {
      const data = await fetchJson(`/console/runs/${encodeURIComponent(runId)}`);
      const run = data.run || data;
      renderRunDetail(panel, run);
    } else {
      const data = await fetchJson(`/jobs`);
      const job = (data.jobs || []).find(j => j.jobId === runId);
      renderJobDetail(panel, job || { jobId: runId });
    }
  } catch (e) {
    panel.innerHTML = `<div class="notice notice--fail">Could not load detail: ${e.message}</div>`;
  }
};

function renderRunDetail(panel, run) {
  const steps = Array.isArray(run.steps) ? run.steps : [];
  const stepsHtml = steps.length > 0 ? steps.map((step, i) => {
    const statusIcon = { passed: "✓", failed: "✗", success: "✓", error: "✗", running: "⟳", skipped: "–", warning: "⚠" }[step.status] || "·";
    const cls = { passed: "step--success", success: "step--success", failed: "step--fail", failure: "step--fail", error: "step--fail", running: "step--running", skipped: "step--neutral" }[step.status] || "step--neutral";
    return `
      <div class="step-row ${cls}">
        <div class="step-row__num">${i + 1}</div>
        <div class="step-row__icon">${statusIcon}</div>
        <div class="step-row__body">
          <div class="step-row__label">${step.label || step.id}</div>
          ${step.message ? `<div class="step-row__msg">${step.message}</div>` : ""}
          ${step.error ? `<div class="step-row__error">${step.error}</div>` : ""}
          ${step.durationMs != null ? `<div class="step-row__meta">${fmtDuration(step.durationMs)}</div>` : ""}
        </div>
        <div class="step-row__badge">${statusBadge(step.status)}</div>
      </div>
    `;
  }).join("") : `<div class="loading-placeholder">No steps recorded.</div>`;

  const evidence = Array.isArray(run.evidence) ? run.evidence : [];
  const evidenceHtml = evidence.length > 0 ? `
    <div class="detail-section">
      <div class="detail-section__title">Evidence</div>
      ${evidence.map(e => `<div class="evidence-row">
        <span class="evidence-row__key">${e.type || e.id || "record"}</span>
        <span class="evidence-row__val">${e.score != null ? `Score: ${e.score}` : ""} ${e.passed != null ? (e.passed ? "✓ passed" : "✗ failed") : ""}</span>
      </div>`).join("")}
    </div>` : "";

  panel.innerHTML = `
    <div class="detail-header">
      <div class="detail-header__top">
        <div class="detail-header__title">${run.workflow || run.workflowId || run.trackId || "Run"}</div>
        ${statusBadge(run.status)}
      </div>
      <div class="detail-header__meta">
        <span>${fmtDate(run.createdAt)}</span>
        ${run.durationMs != null ? `<span>· ${fmtDuration(run.durationMs)}</span>` : ""}
        ${run.provider ? `<span>· ${run.provider}</span>` : ""}
        ${run.model ? `<span>· ${run.model}</span>` : ""}
      </div>
      <div class="detail-header__id">${run.runId}</div>
    </div>

    ${run.url ? `<div class="detail-section"><div class="detail-section__title">Target</div><div class="detail-field">${run.url}</div></div>` : ""}
    ${run.error ? `<div class="detail-section"><div class="detail-section__title notice--fail" style="color:#c0392b">Error</div><div class="detail-field">${run.error?.message || run.error}</div></div>` : ""}

    <div class="detail-section">
      <div class="detail-section__title">Steps (${steps.length})</div>
      <div class="steps-list">${stepsHtml}</div>
    </div>

    ${evidenceHtml}

    ${run.result ? `<div class="detail-section">
      <div class="detail-section__title">Result</div>
      <div class="detail-field detail-field--mono">${JSON.stringify(run.result, null, 2).slice(0, 600)}</div>
    </div>` : ""}
  `;
}

function renderJobDetail(panel, job) {
  panel.innerHTML = `
    <div class="detail-header">
      <div class="detail-header__top">
        <div class="detail-header__title">${job.workflowId || job.trackId || "Job"}</div>
        ${statusBadge(job.status)}
      </div>
      <div class="detail-header__meta">
        <span>${fmtDate(job.timestamps?.createdAt)}</span>
        <span>· Attempt ${job.attempt || 1} of ${job.maxAttempts || 3}</span>
      </div>
      <div class="detail-header__id">${job.jobId}</div>
    </div>

    <div class="detail-section">
      <div class="detail-section__title">Job Type</div>
      <div class="detail-field">${job.executionType || "workflow"}</div>
    </div>

    ${job.timestamps ? `<div class="detail-section">
      <div class="detail-section__title">Timeline</div>
      <div class="detail-field">Created: ${fmtDate(job.timestamps.createdAt)}</div>
      ${job.timestamps.startedAt ? `<div class="detail-field">Started: ${fmtDate(job.timestamps.startedAt)}</div>` : ""}
      ${job.timestamps.completedAt ? `<div class="detail-field">Completed: ${fmtDate(job.timestamps.completedAt)}</div>` : ""}
    </div>` : ""}
  `;
}

function formatRelativeTime(iso) {
  if (!iso) return "unknown";
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = now - then;
  if (diff < 60000) return "just now";
  if (diff < 3600000) return Math.floor(diff / 60000) + "m ago";
  if (diff < 86400000) return Math.floor(diff / 3600000) + "h ago";
  return Math.floor(diff / 86400000) + "d ago";
}

// ─────────────────────────────────────────────
// REVIEW
// ─────────────────────────────────────────────
async function renderReview() {
  const runsRes = await fetchJson("/console/runs?limit=50");
  const runs = (runsRes.runs || []).filter(r => r.status === "failure" || r.status === "failed" || r.status === "error" || r.status === "partial");

  const rowsHtml = runs.length > 0 ? runs.map(r => `
    <div class="run-list-item run-list-item--fail-accent" onclick="navigate('activity'); setTimeout(() => selectRun('${r.runId}', 'run'), 300)">
      <div class="run-list-item__top">
        <span class="run-list-item__workflow">${r.workflow || "unknown"}</span>
        ${statusBadge(r.status)}
      </div>
      <div class="run-list-item__meta">${formatRelativeTime(r.createdAt)} ${r.durationMs ? "· " + fmtDuration(r.durationMs) : ""}</div>
      <div class="run-list-item__id">${r.runId.slice(0, 36)}</div>
    </div>
  `).join("") : `<div class="loading-placeholder">No failed runs. All clear ✓</div>`;

  setContent(`
    <div class="workbench-page">
      <div class="page-category">REVIEW</div>
      <h1 class="page-title">Review Queue</h1>
      <p class="page-desc">Failed and partial runs requiring operator attention. Click to inspect in the Run Inspector.</p>
      <div class="inspector-card" style="padding:0">
        ${rowsHtml}
      </div>
    </div>
  `);
}

// ─────────────────────────────────────────────
// OPERATIONS
// ─────────────────────────────────────────────
async function renderOperations() {
  const jobsRes = await fetchJson("/jobs");
  const jobs = Array.isArray(jobsRes.jobs) ? jobsRes.jobs : [];

  const byStatus = {};
  jobs.forEach(j => { byStatus[j.status] = (byStatus[j.status] || 0) + 1; });

  const statusRows = Object.entries(byStatus).map(([s, c]) => `
    <div class="ops-stat-row">
      <span class="ops-stat-label">${s}</span>
      <span class="ops-stat-count">${c}</span>
      ${statusBadge(s)}
    </div>
  `).join("") || `<div class="loading-placeholder">No jobs in store.</div>`;

  const recentRows = jobs.slice(0, 5).map(j => `
    <div class="run-list-item" onclick="navigate('activity')">
      <div class="run-list-item__top">
        <span class="run-list-item__workflow">${j.workflowId || j.trackId || "job"}</span>
        ${statusBadge(j.status)}
      </div>
      <div class="run-list-item__meta">Attempt ${j.attempt || 1}/${j.maxAttempts || 3} · ${formatRelativeTime(j.timestamps?.createdAt)}</div>
      <div class="run-list-item__id">${j.jobId.slice(0, 36)}</div>
    </div>
  `).join("");

  setContent(`
    <div class="workbench-page">
      <div class="page-category">OPERATIONS</div>
      <h1 class="page-title">Background Operations</h1>
      <p class="page-desc">Durable job queue status, worker health, and recent job history.</p>

      <div class="ops-grid">
        <div class="inspector-card">
          <div class="detail-section__title" style="margin-bottom:12px">Queue Summary</div>
          ${statusRows}
        </div>
        <div class="inspector-card">
          <div class="detail-section__title" style="margin-bottom:12px">Worker Config</div>
          <div class="detail-field">Poll interval: 10s</div>
          <div class="detail-field">Lease duration: 60s</div>
          <div class="detail-field">Max attempts: 3</div>
        </div>
      </div>

      <div class="inspector-card" style="padding:0; margin-top:16px">
        <div class="detail-section__title" style="padding:14px 16px 8px">Recent Jobs</div>
        ${recentRows}
      </div>
    </div>
  `);
}

// ─────────────────────────────────────────────
// SYSTEM
// ─────────────────────────────────────────────
async function renderSystem() {
  const statusRes = await fetchJson("/console/status");
  const health = await fetchJson("/health");

  const engine = statusRes.engine || {};
  const ollama = statusRes.ollama || {};
  const model = statusRes.model || {};

  setContent(`
    <div class="workbench-page">
      <div class="page-category">SYSTEM</div>
      <h1 class="page-title">System Status</h1>
      <p class="page-desc">Local Brain runtime, provider health, and policy boundaries.</p>

      <div class="ops-grid">
        <div class="inspector-card">
          <div class="detail-section__title">Local Brain Engine</div>
          <div class="detail-field">Status: ${statusBadge(health.status || "unknown")}</div>
          <div class="detail-field">Version: ${health.version || "—"}</div>
          <div class="detail-field">Service: ${health.service || "—"}</div>
        </div>
        <div class="inspector-card">
          <div class="detail-section__title">Ollama Provider</div>
          <div class="detail-field">Available: ${ollama.available ? "✓ Yes" : "✗ No"}</div>
          <div class="detail-field">Endpoint: ${ollama.baseUrl || health.runtime?.baseUrl || "—"}</div>
        </div>
        <div class="inspector-card">
          <div class="detail-section__title">Active Model</div>
          <div class="detail-field">Name: ${model.name || "—"}</div>
          <div class="detail-field">Ready: ${model.ready ? "✓ Yes" : "✗ No"}</div>
        </div>
        <div class="inspector-card">
          <div class="detail-section__title">Policy</div>
          <div class="detail-field">Mode: Local Only</div>
          <div class="detail-field">Network: Disallowed</div>
          <div class="detail-field">CORS: localhost, chrome-extension</div>
        </div>
      </div>
    </div>
  `);
}

// ─────────────────────────────────────────────
// WORKFLOWS
// ─────────────────────────────────────────────
async function renderWorkflows() {
  setContent(`
    <div class="workbench-page">
      <div class="page-category">BUILD</div>
      <h1 class="page-title">Workflows & Recipes</h1>
      <p class="page-desc">Registered execution workflows and track pipelines. Click to queue a run.</p>
      <div class="routes-grid">
        <div class="route-card" onclick="openTaskModalWithRoute('website_audit.lighthouse_handoff')">
          <div class="route-card__title">Website Accessibility & SEO Audit</div>
          <div class="route-card__desc">Run Lighthouse handoff audit, prioritize WCAG AA contrast, and export agent markdown.</div>
          <div class="route-card__badge">Tested · Local</div>
        </div>
        <div class="route-card" onclick="openTaskModalWithRoute('lighthouse_handoff.accessibility_deep')">
          <div class="route-card__title">Deep Accessibility Scan</div>
          <div class="route-card__desc">Full WCAG 2.1 AA check including headings, ARIA, keyboard navigation, and color contrast.</div>
          <div class="route-card__badge">Tested · Local</div>
        </div>
        <div class="route-card" onclick="openTaskModalWithRoute('website_audit.seo_audit')">
          <div class="route-card__title">SEO Audit</div>
          <div class="route-card__desc">Structured SEO audit covering title, meta, canonical, structured data, and link health.</div>
          <div class="route-card__badge">Tested · Local</div>
        </div>
        <div class="route-card" onclick="openTaskModalWithRoute('website_audit.performance_budget')">
          <div class="route-card__title">Performance Budget Check</div>
          <div class="route-card__desc">Verify FCP, LCP, CLS, and TBT against a performance budget envelope.</div>
          <div class="route-card__badge">Tested · Local</div>
        </div>
        <div class="route-card" onclick="openTaskModalWithRoute('status-handoff')">
          <div class="route-card__title">Capability Status Handoff</div>
          <div class="route-card__desc">Evaluate project status events and emit structured handoff run records.</div>
          <div class="route-card__badge">Tested · Kernel</div>
        </div>
        <div class="route-card" onclick="openTaskModalWithRoute('operator-log-discovery')">
          <div class="route-card__title">Operator Log Discovery</div>
          <div class="route-card__desc">Scan operator logs for patterns, anomalies, and actionable signals.</div>
          <div class="route-card__badge">Tested · Operator</div>
        </div>
      </div>
    </div>
  `);
}

// ─────────────────────────────────────────────
// CAPABILITIES
// ─────────────────────────────────────────────
// BENCHMARK LAB — INTERACTIVE LOCAL MODEL QUALIFICATION
async function renderBenchmarks() {
  closeBenchmarkStream();
  setContent(`
    <div class="workbench-page benchmark-page">
      <div class="benchmark-header">
        <div>
          <div class="page-category">BENCHMARK LAB / LOCAL ONLY</div>
          <h1 class="page-title">Interactive Model Lab</h1>
          <p class="page-desc">Inspect exact local model identity, load one model deliberately, and run reproducible screening or qualification evidence.</p>
        </div>
        <button class="btn btn--outline btn--sm" onclick="renderBenchmarks()">Refresh inventory</button>
      </div>
      <div id="benchmarkNotice" class="notice notice--info">Discovering Ollama models and benchmark suites…</div>
      <div id="benchmarkRuntime"></div>
      <div class="benchmark-layout">
        <section>
          <div class="benchmark-section-head">
            <div><div class="page-category">MODEL INVENTORY</div><h2>Installed on this machine</h2></div>
            <input id="benchmarkModelFilter" class="benchmark-search" type="search" placeholder="Filter models" oninput="benchmarkFilterModels()">
          </div>
          <div id="benchmarkModels" class="benchmark-model-grid"></div>
        </section>
        <aside id="benchmarkLauncher" class="inspector-card benchmark-launcher"></aside>
      </div>
      <section class="benchmark-run-section">
        <div class="benchmark-section-head"><div><div class="page-category">ACTIVE / RECENT</div><h2>Run evidence</h2></div></div>
        <div id="benchmarkRunDetail" class="inspector-card"><div class="loading-placeholder">Select or start a run.</div></div>
      </section>
      <section class="benchmark-run-section">
        <div class="benchmark-section-head"><div><div class="page-category">DURABLE HISTORY</div><h2>Local benchmark runs</h2></div></div>
        <div id="benchmarkHistory" class="benchmark-history"></div>
      </section>
    </div>
  `);

  try {
    const [modelsResponse, suitesResponse, runsResponse] = await Promise.all([
      requestJson("/benchmark/models"),
      requestJson("/benchmark/suites"),
      requestJson("/benchmark/runs?limit=30")
    ]);
    benchmarkUi.models = modelsResponse.models || [];
    benchmarkUi.suites = (suitesResponse.suites || []).filter((suite) => suite.executable);
    benchmarkUi.runs = runsResponse.runs || [];
    const notice = qs("benchmarkNotice");
    const runtime = modelsResponse.runtime || { state: "offline" };
    if (notice) {
      notice.className = `notice ${runtime.state === "online" ? "notice--success" : "notice--fail"}`;
      notice.textContent = runtime.state === "online"
        ? `Ollama online · ${benchmarkUi.models.length} installed · ${benchmarkUi.models.filter((model) => model.loadState === "loaded").length} loaded`
        : `Ollama offline. ${runtime.error?.message || "Start the local runtime to inspect or test models."}`;
    }
    renderBenchmarkRuntime(runtime);
    renderBenchmarkModels(benchmarkUi.models);
    renderBenchmarkLauncher();
    qs("benchmarkStartButton")?.addEventListener("click", window.benchmarkStartRun);
    renderBenchmarkHistory();
    const active = benchmarkUi.runs.find((run) => !["completed", "failed", "cancelled"].includes(run.status));
    const selected = active || benchmarkUi.runs[0];
    if (selected) await benchmarkOpenRun(selected.runId);
  } catch (error) {
    const notice = qs("benchmarkNotice");
    if (notice) {
      notice.className = "notice notice--fail";
      notice.textContent = `${error.message}${error.nextStep ? ` ${error.nextStep}` : ""}`;
    }
  }
}

function renderBenchmarkRuntime(runtime) {
  const target = qs("benchmarkRuntime");
  if (!target) return;
  target.innerHTML = `<div class="benchmark-state-strip">
    <span>Runtime ${statusBadge(runtime.state || "offline")}</span>
    <span>Installed <strong>${benchmarkUi.models.length}</strong></span>
    <span>Registered <strong>${benchmarkUi.models.filter((model) => model.manifestState === "registered").length}</strong></span>
    <span>Loaded <strong>${benchmarkUi.models.filter((model) => model.loadState === "loaded").length}</strong></span>
    <span>Privacy <strong>raw outputs stay local</strong></span>
  </div>`;
}

function renderBenchmarkModels(models) {
  const target = qs("benchmarkModels");
  if (!target) return;
  if (!models.length) {
    target.innerHTML = `<div class="inspector-card"><div class="loading-placeholder">No installed models discovered.</div></div>`;
    return;
  }
  target.innerHTML = models.map((model) => {
    const safeId = encodeURIComponent(model.id).replace(/'/g, "%27");
    const digest = model.digest ? model.digest.replace(/^sha256:/, "").slice(0, 12) : "unreported";
    const isLoaded = model.loadState === "loaded";
    const action = isLoaded
      ? `<button class="btn btn--outline btn--sm" onclick="benchmarkUnloadModel('${safeId}')">Unload</button>`
      : `<button class="btn btn--black btn--sm" ${model.loadabilityState === "blocked" ? "disabled" : ""} onclick="benchmarkLoadModel('${safeId}')">Load</button>`;
    return `<article class="benchmark-model-card" data-model-search="${escapeHtml(`${model.name} ${model.family} ${model.parameterSize} ${model.manifestState}`.toLowerCase())}">
      <div class="benchmark-model-card__head">
        <div><h3>${escapeHtml(model.name)}</h3><div class="benchmark-model-meta">${escapeHtml(model.family || "unknown family")} · ${escapeHtml(model.parameterSize || "size unknown")} · ${escapeHtml(model.quantizationLevel || "quant unknown")}</div></div>
        ${statusBadge(model.loadState)}
      </div>
      <div class="benchmark-chip-row"><span class="benchmark-chip">${escapeHtml(model.manifestState)}</span><span class="benchmark-chip">${escapeHtml(model.qualificationState)}</span><span class="benchmark-chip">loadability: ${escapeHtml(model.loadabilityState)}</span></div>
      <dl class="benchmark-model-facts">
        <div><dt>Digest</dt><dd title="${escapeHtml(model.digest)}">${escapeHtml(digest)}</dd></div>
        <div><dt>Disk</dt><dd>${formatBytes(model.sizeBytes)}</dd></div>
        <div><dt>VRAM</dt><dd>${formatBytes(model.loaded?.sizeVramBytes)}</dd></div>
        <div><dt>Expires</dt><dd>${model.loaded?.expiresAt ? fmtDate(model.loaded.expiresAt) : "—"}</dd></div>
      </dl>
      ${model.manifest?.digestMatch === false ? `<div class="notice notice--fail">Digest differs from ${escapeHtml(model.manifest.id)}. Qualification is blocked.</div>` : ""}
      <div class="benchmark-card-actions">${action}<button class="btn btn--outline btn--sm" onclick="benchmarkSelectModel('${safeId}')">Select</button></div>
    </article>`;
  }).join("");
}

function renderBenchmarkLauncher(selectedModelId = null) {
  const target = qs("benchmarkLauncher");
  if (!target) return;
  const registered = benchmarkUi.models.filter((model) => model.manifestState === "registered");
  const selected = selectedModelId || registered.find((model) => model.loadState === "loaded")?.id || registered[0]?.id || "";
  const suites = [...benchmarkUi.suites].sort((a, b) => (a.id === "accessibility-deep-v2" ? -1 : b.id === "accessibility-deep-v2" ? 1 : a.name.localeCompare(b.name)));
  target.innerHTML = `
    <div class="page-category">NEW RUN</div><h2>Launch benchmark</h2>
    <p class="benchmark-help">Only catalog suites and registered local manifests are accepted. Running never promotes evidence automatically.</p>
    <div class="form-group"><label for="benchmarkModelSelect">Model</label><select id="benchmarkModelSelect">${registered.map((model) => `<option value="${escapeHtml(model.id)}" ${model.id === selected ? "selected" : ""}>${escapeHtml(model.name)} · ${escapeHtml(model.loadState)}</option>`).join("")}</select></div>
    <div class="form-group"><label for="benchmarkSuiteSelect">Suite</label><select id="benchmarkSuiteSelect">${suites.map((suite) => `<option value="${escapeHtml(suite.id)}">${escapeHtml(suite.name)} · ${suite.caseCount} cases</option>`).join("")}</select></div>
    <div class="form-group"><label for="benchmarkModeSelect">Evidence mode</label><select id="benchmarkModeSelect" onchange="benchmarkModeChanged()"><option value="quick">Quick screening · 1 trial</option><option value="qualification">Qualification · 5 independent trials</option></select></div>
    <div id="benchmarkPreflight" class="benchmark-preflight">Load the selected model explicitly, then run preflight.</div>
    <button id="benchmarkStartButton" class="btn btn--black" ${registered.length && suites.length ? "" : "disabled"}>Preflight & start</button>
  `;
}

function renderBenchmarkHistory() {
  const target = qs("benchmarkHistory");
  if (!target) return;
  target.innerHTML = benchmarkUi.runs.length ? benchmarkUi.runs.map((run) => `<button class="benchmark-history-row" onclick="benchmarkOpenRun('${escapeHtml(run.runId)}')"><span><strong>${escapeHtml(run.suiteName || run.suiteId)}</strong><small>${escapeHtml(run.modelName || run.model?.runtimeModelName || "unknown model")} · ${fmtDate(run.createdAt)}</small></span>${statusBadge(run.status)}</button>`).join("") : `<div class="loading-placeholder">No interactive benchmark runs yet.</div>`;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / (1024 ** exponent)).toFixed(exponent > 2 ? 1 : 0)} ${units[exponent]}`;
}

function formatPercent(value) {
  return typeof value === "number" ? `${(value * 100).toFixed(1)}%` : "—";
}

window.benchmarkFilterModels = function() {
  const query = (qs("benchmarkModelFilter")?.value || "").trim().toLowerCase();
  document.querySelectorAll("[data-model-search]").forEach((card) => { card.hidden = Boolean(query) && !card.dataset.modelSearch.includes(query); });
};

window.benchmarkSelectModel = function(encodedId) {
  const select = qs("benchmarkModelSelect");
  if (select) select.value = decodeURIComponent(encodedId);
  qs("benchmarkLauncher")?.scrollIntoView({ behavior: "smooth", block: "center" });
};

window.benchmarkModeChanged = function() {
  const target = qs("benchmarkPreflight");
  if (!target) return;
  target.textContent = qs("benchmarkModeSelect")?.value === "qualification"
    ? "Qualification runs 5 independent trials and applies M2 evidence gates. It does not promote the result."
    : "Quick mode runs one screening trial and cannot qualify a model.";
};

window.benchmarkLoadModel = async function(encodedId) { await benchmarkModelAction(encodedId, "load"); };
window.benchmarkUnloadModel = async function(encodedId) { await benchmarkModelAction(encodedId, "unload"); };

async function benchmarkModelAction(encodedId, action) {
  const notice = qs("benchmarkNotice");
  const modelId = decodeURIComponent(encodedId);
  try {
    if (notice) notice.textContent = `${action === "load" ? "Loading" : "Unloading"} ${modelId}…`;
    await requestJson(`/benchmark/models/${encodeURIComponent(modelId)}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(action === "load" ? { keepAlive: "10m" } : {})
    });
    await renderBenchmarks();
  } catch (error) {
    if (notice) {
      notice.className = "notice notice--fail";
      notice.textContent = `${error.message}${error.nextStep ? ` ${error.nextStep}` : ""}`;
    }
  }
}

window.benchmarkStartRun = async function() {
  const button = qs("benchmarkStartButton");
  const output = qs("benchmarkPreflight");
  const mode = qs("benchmarkModeSelect")?.value || "quick";
  const payload = {
    modelId: qs("benchmarkModelSelect")?.value,
    suiteId: qs("benchmarkSuiteSelect")?.value,
    mode,
    trialCount: mode === "qualification" ? 5 : 1,
    requestKey: `ui-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
  };
  try {
    if (button) { button.disabled = true; button.textContent = "Checking…"; }
    const preflight = await requestJson("/benchmark/preflight", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (output) {
      output.className = "benchmark-preflight benchmark-preflight--ok";
      output.textContent = `Eligible: exact digest ${preflight.model.runtimeDigest?.slice(-12) || "unreported"}. Starting…`;
    }
    const started = await requestJson("/benchmark/runs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    benchmarkUi.activeRunId = started.runId;
    await benchmarkOpenRun(started.runId);
  } catch (error) {
    if (output) {
      output.className = "benchmark-preflight benchmark-preflight--fail";
      output.textContent = `${error.message}${error.nextStep ? ` ${error.nextStep}` : ""}`;
    }
  } finally {
    if (button) { button.disabled = false; button.textContent = "Preflight & start"; }
  }
};

window.benchmarkOpenRun = async function(runId) {
  benchmarkUi.activeRunId = runId;
  try {
    const response = await requestJson(`/benchmark/runs/${encodeURIComponent(runId)}`);
    renderBenchmarkRun(response.run);
    if (!["completed", "failed", "cancelled"].includes(response.run.status)) openBenchmarkStream(runId);
    else closeBenchmarkStream();
  } catch (error) {
    const target = qs("benchmarkRunDetail");
    if (target) target.innerHTML = `<div class="notice notice--fail">${escapeHtml(error.message)}</div>`;
  }
};

function renderBenchmarkRun(run) {
  const target = qs("benchmarkRunDetail");
  if (!target) return;
  const progress = run.progress || {};
  target.innerHTML = `
    <div class="benchmark-run-head"><div><h3>${escapeHtml(run.suiteName || run.suiteId)}</h3><div class="benchmark-model-meta">${escapeHtml(run.model?.runtimeModelName)} · ${escapeHtml(run.mode)} · ${escapeHtml(run.runId)}</div></div>${statusBadge(run.status)}</div>
    <div class="benchmark-progress"><div style="width:${Math.max(0, Math.min(100, progress.percent || 0))}%"></div></div>
    <div class="benchmark-progress-label">${escapeHtml(run.phase)} · ${progress.completedTrials || 0}/${progress.totalTrials || run.trialCount} trials${progress.totalCases ? ` · ${progress.completedCases || 0}/${progress.totalCases} cases` : ""}</div>
    ${run.error ? `<div class="notice notice--fail"><strong>${escapeHtml(run.error.code)}</strong> ${escapeHtml(run.error.message)}</div>` : ""}
    ${run.result ? renderBenchmarkResult(run.result) : `<div class="benchmark-event-list">${(run.events || []).slice(-8).reverse().map((event) => `<div><time>${fmtDate(event.timestamp)}</time><strong>${escapeHtml(event.type)}</strong></div>`).join("")}</div>`}
    ${!["completed", "failed", "cancelled"].includes(run.status) ? `<button class="btn btn--outline btn--sm" onclick="benchmarkCancelRun('${escapeHtml(run.runId)}')">Cancel run</button>` : ""}
  `;
}

function renderBenchmarkResult(result) {
  const metrics = result.metrics || {};
  const uncertainty = metrics.scoredUncertainty || metrics.uncertainty || {};
  const provenance = result.provenance || {};
  const gate = result.qualificationGate || { eligible: false, reasons: [] };
  const strata = Object.entries(result.strata || {}).map(([name, values]) => `<tr><td>${escapeHtml(name)}</td><td>${values.passed}/${values.trialCount}</td><td>${values.criticalFailureCount}</td></tr>`).join("");
  return `<div class="benchmark-result-grid">
    <div class="benchmark-metric"><span>Pass rate</span><strong>${formatPercent(metrics.scoredPassRate)}</strong></div>
    <div class="benchmark-metric"><span>95% Wilson interval</span><strong>${formatPercent(uncertainty.lower)}–${formatPercent(uncertainty.upper)}</strong></div>
    <div class="benchmark-metric"><span>Scored trials</span><strong>${metrics.scoredTrialCount ?? "—"}</strong></div>
    <div class="benchmark-metric"><span>Critical failures</span><strong>${metrics.criticalFailureCount ?? "—"}</strong></div>
  </div>
  <div class="benchmark-result-columns">
    <div><h4>Difficulty strata</h4><table class="benchmark-table"><thead><tr><th>Stratum</th><th>Passed</th><th>Critical</th></tr></thead><tbody>${strata}</tbody></table></div>
    <div><h4>Evidence gate</h4><div class="notice ${gate.eligible ? "notice--success" : "notice--info"}">${gate.eligible ? "M2 evidence minimums satisfied. Result remains draft-only." : "Screening evidence only."}</div><ul>${(gate.reasons || []).map((reason) => `<li>${escapeHtml(reason)}</li>`).join("") || "<li>No gate rejections.</li>"}</ul></div>
  </div>
  <details class="benchmark-provenance"><summary>Provenance and failure semantics</summary>
    <dl><dt>Runtime model</dt><dd>${escapeHtml(provenance.model?.runtimeModelName || "—")}</dd><dt>Runtime digest</dt><dd>${escapeHtml(provenance.model?.runtimeModelDigest || "—")}</dd><dt>Manifest fingerprint</dt><dd>${escapeHtml(provenance.model?.manifestDigest || "—")}</dd><dt>Suite fingerprint</dt><dd>${escapeHtml(provenance.suite?.configDigest || "—")}</dd><dt>Scorer</dt><dd>${escapeHtml(`${provenance.scorer?.id || "—"} ${provenance.scorer?.version || ""}`)}</dd><dt>Semantic codes</dt><dd>${escapeHtml((result.semanticFailureCodes || []).join(", ") || "none")}</dd><dt>Runtime</dt><dd>${fmtDuration(result.runtimeMetrics?.durationMs)}</dd></dl>
  </details>`;
}

window.benchmarkCancelRun = async function(runId) {
  try {
    const response = await requestJson(`/benchmark/runs/${encodeURIComponent(runId)}/cancel`, { method: "POST" });
    renderBenchmarkRun(response.run);
    closeBenchmarkStream();
  } catch (error) {
    const target = qs("benchmarkRunDetail");
    if (target) target.insertAdjacentHTML("afterbegin", `<div class="notice notice--fail">${escapeHtml(error.message)}</div>`);
  }
};

function openBenchmarkStream(runId) {
  closeBenchmarkStream();
  if (typeof EventSource === "function") {
    const source = new EventSource(`/benchmark/runs/${encodeURIComponent(runId)}/events`);
    benchmarkUi.eventSource = source;
    for (const type of ["queued", "preflight", "started", "phase", "trial-started", "case-completed", "trial-completed", "completed", "failed", "cancelled"]) {
      source.addEventListener(type, () => benchmarkRefreshRun(runId));
    }
    source.onerror = () => {
      source.close();
      benchmarkUi.eventSource = null;
      startBenchmarkPolling(runId);
    };
  } else startBenchmarkPolling(runId);
}

function startBenchmarkPolling(runId) {
  if (benchmarkUi.pollTimer) clearInterval(benchmarkUi.pollTimer);
  benchmarkUi.pollTimer = setInterval(() => benchmarkRefreshRun(runId), 2000);
}

async function benchmarkRefreshRun(runId) {
  try {
    const response = await requestJson(`/benchmark/runs/${encodeURIComponent(runId)}`);
    renderBenchmarkRun(response.run);
    if (["completed", "failed", "cancelled"].includes(response.run.status)) {
      closeBenchmarkStream();
      const runs = await requestJson("/benchmark/runs?limit=30");
      benchmarkUi.runs = runs.runs || [];
      renderBenchmarkHistory();
    }
  } catch {}
}

function closeBenchmarkStream() {
  if (benchmarkUi.eventSource) benchmarkUi.eventSource.close();
  if (benchmarkUi.pollTimer) clearInterval(benchmarkUi.pollTimer);
  benchmarkUi.eventSource = null;
  benchmarkUi.pollTimer = null;
}

async function renderCapabilities() {
  const capsRes = await fetchJson("/qualifications/capabilities");
  const caps = Array.isArray(capsRes.capabilities) ? capsRes.capabilities : [];

  const rows = caps.length > 0 ? caps.map(c => `
    <div class="cap-row">
      <div class="cap-row__left">
        <div class="cap-row__name">${c.modelId || c.capabilityId || "unknown"}</div>
        <div class="cap-row__meta">${c.runtimeModelName || "—"}</div>
      </div>
      <div class="cap-row__right">
        <div class="cap-row__track">${c.trackId || "—"}</div>
        <div class="cap-row__role">${c.role || "—"}</div>
      </div>
    </div>
  `).join("") : `<div class="loading-placeholder">No capabilities registered.</div>`;

  setContent(`
    <div class="workbench-page">
      <div class="page-category">SYSTEM DETAIL</div>
      <h1 class="page-title">Capability Inventory</h1>
      <p class="page-desc">Registered capability capsules and their qualification bindings. ${caps.length} capabilities loaded.</p>
      <div class="inspector-card" style="padding:0">
        ${rows}
      </div>
    </div>
  `);
}

// ─────────────────────────────────────────────
// RUNTIME
// ─────────────────────────────────────────────
async function renderRuntime() {
  const health = await fetchJson("/health");

  setContent(`
    <div class="workbench-page">
      <div class="page-category">SYSTEM DETAIL</div>
      <h1 class="page-title">Runtime & Node Identity</h1>
      <p class="page-desc">Local Brain installation node identity, assigned role, and runtime configuration.</p>

      <div class="ops-grid">
        <div class="inspector-card">
          <div class="detail-section__title">Local Node</div>
          <div class="detail-field">Role: Hybrid (Brain + Worker)</div>
          <div class="detail-field">Platform: ${navigator.platform}</div>
          <div class="detail-field">Status: ${statusBadge(health.status || "running")}</div>
        </div>
        <div class="inspector-card">
          <div class="detail-section__title">Provider</div>
          <div class="detail-field">Type: ${health.runtime?.provider || "ollama"}</div>
          <div class="detail-field">Endpoint: ${health.runtime?.baseUrl || "http://127.0.0.1:11434"}</div>
          <div class="detail-field">Available: ${health.runtime?.available ? "✓ Yes" : "✗ Not detected"}</div>
        </div>
        <div class="inspector-card">
          <div class="detail-section__title">Relay Nodes</div>
          <div class="detail-field">Paired nodes: checking…</div>
          <div class="detail-field">Trust store: data/nodes/node-trust-store.json</div>
        </div>
      </div>
    </div>
  `);
}

// ─────────────────────────────────────────────
// MODAL HANDLERS
// ─────────────────────────────────────────────
window.openTaskModal = function() {
  const el = qs("taskModal");
  if (el) el.classList.remove("is-hidden");
};

window.openTaskModalWithRoute = function(routeId) {
  const select = qs("taskRoute");
  if (select) select.value = routeId;
  const el = qs("taskModal");
  if (el) el.classList.remove("is-hidden");
};

window.closeTaskModal = function() {
  const el = qs("taskModal");
  if (el) el.classList.add("is-hidden");
};

window.submitTaskModal = async function() {
  const prompt = qs("taskPrompt")?.value || "";
  const route = qs("taskRoute")?.value || "website_audit.lighthouse_handoff";
  closeTaskModal();
  try {
    const res = await fetch("/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ executionType: "workflow", workflowId: route, input: { prompt }, options: {} })
    });
    const body = await res.json();
    if (body.ok) {
      alert(`Run queued! Job ID: ${body.jobId || "queued"}\n\nCheck Activity → Run Inspector to track progress.`);
    } else {
      alert(`Job created (server response: ${JSON.stringify(body).slice(0, 100)})`);
    }
  } catch (e) {
    alert(`Queued for route: ${route}. Navigate to Activity to view results.`);
  }
};

window.openPlanModal = function() {
  const el = qs("planModal");
  if (el) el.classList.remove("is-hidden");
};

window.closePlanModal = function() {
  const el = qs("planModal");
  if (el) el.classList.add("is-hidden");
};

window.handleBackdropClick = function(event, modalId) {
  if (event?.target?.id === modalId) {
    const el = qs(modalId);
    if (el) el.classList.add("is-hidden");
  }
};

window.runSavedPlan = function() {
  closePlanModal();
  openTaskModalWithRoute("website_audit.lighthouse_handoff");
};

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { closeTaskModal(); closePlanModal(); }
});

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
window.addEventListener("hashchange", () => navigate(location.hash.replace("#", "")));
window.addEventListener("DOMContentLoaded", () => navigate(location.hash.replace("#", "") || "workbench"));
