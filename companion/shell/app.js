const SECTIONS = {
  home: { title: "Home", render: renderHome },
  runs: { title: "Runs", render: renderRuns },
  workflows: { title: "Workflows", render: renderWorkflows },
  capabilities: { title: "Capabilities", render: renderCapabilities },
  models: { title: "Models", render: renderModels },
  nodes: { title: "Nodes", render: renderNodes },
  evidence: { title: "Evidence", render: renderEvidence },
  reviews: { title: "Reviews", render: renderReviews },
  memory: { title: "Memory", render: renderMemory },
  jobs: { title: "Jobs", render: renderJobs },
  settings: { title: "Settings", render: renderSettings }
};

let currentSection = null;
let healthCache = null;

function qs(id) { return document.getElementById(id); }

function showLoading(show) {
  qs("shellLoading").style.display = show ? "block" : "none";
}

function getContent() { return qs("shellSection"); }

function setContent(html) {
  getContent().innerHTML = html;
  showLoading(false);
}

async function fetchJson(path) {
  const res = await fetch(path);
  const body = await res.json();
  if (!res.ok || !body.ok) throw new Error(body.message || body.error?.message || `HTTP ${res.status}`);
  return body;
}

async function navigate(section) {
  if (section === currentSection) return;
  currentSection = section;
  history.replaceState(null, "", `#${section}`);
  document.querySelectorAll(".shell-nav__link").forEach(el => {
    el.classList.toggle("shell-nav__link--active", el.dataset.section === section);
  });
  showLoading(true);
  const renderer = SECTIONS[section];
  if (renderer) {
    document.title = `${renderer.title} — Locaily`;
    await renderer.render();
  }
}

// --- Home ---
async function renderHome() {
  try {
    const demo = await fetchJson("/console/demo");
    let statusHtml = "";
    try {
      const s = await fetchJson("/console/status");
      const brainOk = s.engine?.running;
      statusHtml = `
        <div class="status-grid">
          <div class="status-card ${brainOk ? 'status-card--ok' : 'status-card--fail'}">
            <div class="status-card__label">Local Brain</div>
            <div class="status-card__value">${brainOk ? 'Online' : 'Offline'}</div>
          </div>
          <div class="status-card ${s.ollama?.available ? 'status-card--ok' : 'status-card--warn'}">
            <div class="status-card__label">Ollama</div>
            <div class="status-card__value">${s.ollama?.available ? 'Available' : 'Not running'}</div>
          </div>
          <div class="status-card ${s.model?.ready ? 'status-card--ok' : 'status-card--warn'}">
            <div class="status-card__label">Model</div>
            <div class="status-card__value">${s.model?.ready ? s.model.name : 'Not ready'}</div>
          </div>
          <div class="status-card status-card--info">
            <div class="status-card__label">Tools</div>
            <div class="status-card__value">${s.tools?.count || 0} registered</div>
          </div>
        </div>
      `;
    } catch {}
    setContent(`
      <h2>Welcome to Locaily</h2>
      <p class="shell-subtitle">Local-first AI coordination stack.</p>
      ${statusHtml}
      <div class="shell-cta">
        <p>Try a built-in example to see capability routing, validation, and evidence in action.</p>
        <button class="btn btn--primary" onclick="runDemo()">Run Example Workflow</button>
      </div>
      <div id="demoResult" class="shell-demo-result" style="display:none"></div>
    `);
  } catch (e) {
    setContent(`<h2>Welcome</h2><p>Could not load status: ${e.message}</p>`);
  }
}

window.runDemo = async function() {
  const resultDiv = qs("demoResult");
  resultDiv.style.display = "block";
  resultDiv.innerHTML = "<p>Starting demo…</p>";
  try {
    const demo = await fetchJson("/console/demo", { method: "POST" });
    resultDiv.innerHTML = "<p>Demo started. Polling for completion…</p>";
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const res = await fetch(`/console/runs/${encodeURIComponent(demo.runId)}`);
      const body = await res.json();
      if (body.run?.status === "success" || body.run?.status === "failed") {
        const run = body.run;
        const status = run.status === "success" ? "Passed" : "Failed";
        const stepsHtml = (run.steps || []).map(s => `
          <div class="inspector-step inspector-step--${s.status}">
            <div class="inspector-step__header">
              <span class="inspector-step__label">${s.label || s.step_id || s.id}</span>
              <span class="inspector-step__status inspector-step__status--${s.status}">${formatStepStatus(s.status)}</span>
            </div>
            ${s.routingReason ? `<div class="inspector-step__routing">→ ${escapeHtml(s.routingReason)}</div>` : ""}
            ${s.message ? `<div class="inspector-step__detail">${escapeHtml(s.message)}</div>` : ""}
          </div>
        `).join("");

        const evidenceScores = run.result ? Object.entries(run.result).filter(([k]) => k !== "markdown").map(([k, v]) =>
          `<div class="evidence-item"><span class="evidence-item__key">${escapeHtml(k)}</span><span class="evidence-item__value">${escapeHtml(String(v))}</span></div>`
        ).join("") : "";

        const hasMarkdown = run.result?.markdown;
        resultDiv.innerHTML = `
          <div class="result-card result-card--${run.status}">
            <h3>Demo ${status}</h3>
            <p>${run.durationMs ? `Completed in ${(run.durationMs / 1000).toFixed(1)}s` : ""}</p>
            <p class="shell-meta">Run ID: ${demo.runId}</p>
            <details class="shell-detail-group" ${run.status === "success" ? "open" : ""}>
              <summary>Steps (${(run.steps || []).length})</summary>
              <div class="inspector-steps">${stepsHtml}</div>
            </details>
            ${evidenceScores ? `
            <details class="shell-detail-group">
              <summary>Evidence & Scores</summary>
              <div class="evidence-grid">${evidenceScores}</div>
            </details>` : ""}
            ${hasMarkdown ? `
            <details class="shell-detail-group">
              <summary>Markdown Preview</summary>
              <pre class="code-block">${escapeHtml(run.result.markdown.slice(0, 1000))}${run.result.markdown.length > 1000 ? "..." : ""}</pre>
            </details>` : ""}
          </div>
          <div class="shell-cta" style="margin-top:12px">
            <button class="btn btn--secondary" onclick="exportRun('${demo.runId}')">Export Artifact</button>
            <a href="#runs" class="btn btn--secondary">View All Runs</a>
          </div>`;
        return;
      }
    }
    resultDiv.innerHTML = "<p>Demo timed out.</p>";
  } catch (e) {
    resultDiv.innerHTML = `<p>Demo failed: ${e.message}</p>`;
  }
};

window.exportRun = async function(runId) {
  try {
    const res = await fetch(`/console/runs/${encodeURIComponent(runId)}`);
    const body = await res.json();
    const run = body.run;
    const artifact = {
      workflow: "lighthouse_handoff_validation",
      runId: run.runId,
      url: run.url,
      mode: run.mode,
      status: run.status,
      durationMs: run.durationMs,
      steps: (run.steps || []).map(s => ({ label: s.label, status: s.status, message: s.message, routingReason: s.routingReason })),
      result: run.result || {},
      evidence: run.evidence || {},
      completedAt: run.completedAt,
      createdAt: run.createdAt
    };
    const blob = new Blob([JSON.stringify(artifact, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `locaily-run-${runId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    alert(`Export failed: ${e.message}`);
  }
};

// --- Runs (with Run Inspector drill-down) ---
let selectedRunId = null;

async function renderRuns() {
  selectedRunId = null;
  try {
    const data = await fetchJson("/console/runs");
    const runs = data.runs || [];
    let html = `<h2>Runs</h2>`;
    if (runs.length === 0) {
      html += `<p>No runs yet. <a href="#" onclick="navigate('home');return false">Run a demo</a> to get started.</p>`;
      setContent(html);
      return;
    }
    html += `<div class="shell-runs-layout"><div class="run-list">`;
    for (const r of runs) {
      const statusClass = r.status === "success" ? "passed" : r.status === "failed" ? "failed" : "pending";
      const isSelected = selectedRunId === r.runId;
      html += `<div class="run-item ${isSelected ? 'run-item--selected' : ''}" onclick="selectRun('${r.runId}')" tabindex="0" role="button" onkeydown="if(event.key==='Enter'||event.key===' ')selectRun('${r.runId}')">
        <div class="run-item__status run-item__status--${statusClass}">${statusClass}</div>
        <div class="run-item__info">
          <div class="run-item__url">${r.url || "—"}</div>
          <div class="run-item__meta">${r.mode || "standard"} · ${r.createdAt ? new Date(r.createdAt).toLocaleString() : "—"}</div>
        </div>
        <div class="run-item__duration">${r.durationMs ? (r.durationMs / 1000).toFixed(1) + "s" : "—"}</div>
      </div>`;
    }
    html += `</div><div id="runInspectorPanel" class="run-inspector-panel"><p class="text-muted">Select a run to inspect details.</p></div></div>`;
    html += `<div class="shell-cta"><a href="/console" class="btn btn--secondary" target="_blank">Open Full Console</a></div>`;
    setContent(html);
  } catch (e) {
    setContent(`<h2>Runs</h2><p>Could not load runs: ${e.message}</p>`);
  }
}

window.selectRun = async function(runId) {
  selectedRunId = runId;
  document.querySelectorAll(".run-item").forEach(el => el.classList.remove("run-item--selected"));
  const items = document.querySelectorAll(".run-item");
  for (const el of items) {
    if (el.getAttribute("onclick")?.includes(runId)) {
      el.classList.add("run-item--selected");
    }
  }
  const panel = qs("runInspectorPanel");
  if (!panel) return;
  panel.innerHTML = "<p>Loading run details…</p>";
  try {
    const res = await fetch(`/console/runs/${encodeURIComponent(runId)}`);
    const body = await res.json();
    const run = body.run;
    if (!run) { panel.innerHTML = "<p>Run not found.</p>"; return; }

    const stepsHtml = (run.steps || []).map((s, idx) => {
      const label = s.label || s.step_id || s.id || `Step ${idx + 1}`;
      return `<div class="inspector-step inspector-step--${s.status}">
        <div class="inspector-step__header">
          <span class="inspector-step__num">${idx + 1}</span>
          <span class="inspector-step__label">${escapeHtml(label)}</span>
          <span class="inspector-step__status inspector-step__status--${s.status}">${formatStepStatus(s.status)}</span>
        </div>
        ${s.routingReason ? `<div class="inspector-step__routing">→ ${escapeHtml(s.routingReason)}</div>` : ""}
        ${s.executor || s.role || s.model || s.tool ? `<div class="inspector-step__meta">${[s.executor ? 'executor: '+s.executor : '', s.role ? 'worker: '+s.role : '', s.model ? 'model: '+s.model : '', s.tool ? 'tool: '+s.tool : ''].filter(Boolean).join(' · ')}</div>` : ""}
        ${s.message ? `<div class="inspector-step__detail">${escapeHtml(s.message)}</div>` : ""}
        ${s.error ? `<div class="inspector-step__next">${escapeHtml(s.error)}</div>` : ""}
      </div>`;
    }).join("");

    const evidenceHtml = run.evidence ? Object.entries(run.evidence).map(([k, v]) =>
      `<div class="evidence-item"><span class="evidence-item__key">${escapeHtml(k)}</span><span class="evidence-item__value">${escapeHtml(typeof v === 'object' ? JSON.stringify(v) : String(v))}</span></div>`
    ).join("") : "";

    const resultHtml = run.result ? Object.entries(run.result).filter(([k]) => k !== "markdown").map(([k, v]) =>
      `<div class="evidence-item"><span class="evidence-item__key">${escapeHtml(k)}</span><span class="evidence-item__value">${escapeHtml(String(v))}</span></div>`
    ).join("") : "";

    panel.innerHTML = `
      <div class="inspector-header">
        <h3>${escapeHtml(run.url || "Run")}</h3>
        <span class="status-pill status-pill--${run.status === "success" ? "passed" : run.status === "failed" ? "failed" : "pending"}">
          <span class="status-pill__dot"></span>
          <span class="status-pill__label">${run.status || "unknown"}</span>
        </span>
      </div>
      <p class="inspector-meta">${run.mode || "standard"} · ${run.createdAt ? new Date(run.createdAt).toLocaleString() : "—"} · ${run.durationMs ? (run.durationMs / 1000).toFixed(1) + "s" : "—"}</p>
      <details class="shell-detail-group" open>
        <summary>Steps (${(run.steps || []).length})</summary>
        <div class="inspector-steps">${stepsHtml}</div>
      </details>
      ${resultHtml ? `<details class="shell-detail-group"><summary>Results</summary><div class="evidence-grid">${resultHtml}</div></details>` : ""}
      ${evidenceHtml ? `<details class="shell-detail-group"><summary>Evidence</summary><div class="evidence-grid">${evidenceHtml}</div></details>` : ""}
      <div style="margin-top:12px">
        <button class="btn btn--secondary" onclick="exportRun('${runId}')">Export Artifact</button>
        <a href="/console" class="btn btn--secondary" target="_blank">Open in Console</a>
      </div>`;
  } catch (e) {
    panel.innerHTML = `<p>Could not load run: ${e.message}</p>`;
  }
};

// --- Workflows ---
async function renderWorkflows() {
  try {
    const [workflows, tracks] = await Promise.all([
      fetchJson("/orchestration/workflows").then(d => d.workflows || []).catch(() => []),
      fetchJson("/tracks").then(d => d.tracks || []).catch(() => [])
    ]);
    let html = `<h2>Workflows</h2>`;
    html += `<div class="section-grid">`;
    if (tracks.length > 0) {
      html += `<div class="section-card">
        <div class="section-card__header">Tracks</div>
        <div class="section-card__body">`;
      for (const t of tracks) {
        const name = t.name || t.id || t.trackId || "—";
        const status = t.status || "active";
        html += `<div class="inline-item"><span class="inline-item__label">${escapeHtml(name)}</span><span class="status-dot status-dot--${status === "active" ? "ok" : "warn"}"></span></div>`;
      }
      html += `</div></div>`;
    }
    if (workflows.length > 0) {
      html += `<div class="section-card">
        <div class="section-card__header">Workflows</div>
        <div class="section-card__body">`;
      for (const w of workflows) {
        html += `<div class="inline-item"><span class="inline-item__label">${escapeHtml(w.name || w.id || w.workflowId || "—")}</span><span class="inline-item__meta">${w.steps || w.stepCount || ""}</span></div>`;
      }
      html += `</div></div>`;
    }
    if (tracks.length === 0 && workflows.length === 0) {
      html += `<p class="text-muted">No workflows registered.</p>`;
    }
    html += `</div>`;
    html += `<div class="shell-cta"><a href="/orchestration/workflows" class="btn btn--secondary" target="_blank">View Raw API</a></div>`;
    setContent(html);
  } catch (e) {
    setContent(`<h2>Workflows</h2><p>Could not load workflows: ${e.message}</p>`);
  }
}

// --- Capabilities ---
async function renderCapabilities() {
  try {
    const [caps, dashboard] = await Promise.all([
      fetchJson("/capabilities").then(d => d.capabilities || []).catch(() => []),
      fetchJson("/qualifications/dashboard").catch(() => null)
    ]);
    let html = `<h2>Capabilities</h2>`;
    if (caps.length > 0) {
      html += `<div class="section-grid">`;
      for (const c of caps) {
        const name = c.name || c.id || c.capabilityId || "—";
        const status = c.qualified ? "ok" : c.status === "testing" ? "warn" : "fail";
        html += `<div class="section-card">
          <div class="section-card__header">
            <span>${escapeHtml(name)}</span>
            <span class="status-dot status-dot--${status}"></span>
          </div>
          <div class="section-card__body">
            <span class="inline-item__meta">${c.model || c.provider || ""} ${c.role ? "· " + c.role : ""}</span>
          </div>
        </div>`;
      }
      html += `</div>`;
    } else {
      html += `<p class="text-muted">No capabilities loaded.</p>`;
    }
    if (dashboard) {
      html += `<details class="shell-detail-group"><summary>Qualification Dashboard</summary><pre class="code-block">${escapeHtml(JSON.stringify(dashboard, null, 2))}</pre></details>`;
    }
    setContent(html);
  } catch (e) {
    setContent(`<h2>Capabilities</h2><p>Could not load capabilities: ${e.message}</p>`);
  }
}

// --- Models ---
async function renderModels() {
  try {
    const [roles, provStatus] = await Promise.all([
      fetchJson("/models/roles").then(d => d.roles || d.models || []).catch(() => []),
      fetchJson("/providers/status").catch(() => null)
    ]);
    let html = `<h2>Models</h2>`;
    if (roles.length > 0) {
      html += `<div class="section-grid">`;
      for (const r of roles) {
        const name = r.name || r.id || r.role || r.model || "—";
        html += `<div class="section-card">
          <div class="section-card__header">${escapeHtml(name)}</div>
          <div class="section-card__body">
            <span class="inline-item__meta">${r.provider || r.source || ""}</span>
          </div>
        </div>`;
      }
      html += `</div>`;
    } else {
      html += `<p class="text-muted">No model roles loaded.</p>`;
    }
    if (provStatus) {
      html += `<details class="shell-detail-group"><summary>Provider Status</summary><pre class="code-block">${escapeHtml(JSON.stringify(provStatus, null, 2))}</pre></details>`;
    }
    setContent(html);
  } catch (e) {
    setContent(`<h2>Models</h2><p>Could not load models: ${e.message}</p>`);
  }
}

// --- Nodes ---
async function renderNodes() {
  try {
    const [nodes, protocol] = await Promise.all([
      fetchJson("/relay/nodes").then(d => d.nodes || []).catch(() => []),
      fetchJson("/relay/protocol").catch(() => null)
    ]);
    let html = `<h2>Relay Nodes</h2>`;
    if (nodes.length > 0) {
      html += `<div class="node-grid">`;
      for (const n of nodes) {
        const name = n.name || n.id || n.nodeId || "Unknown";
        const status = n.status || n.health || "unknown";
        const statusOk = status === "online" || status === "healthy" || status === "ok";
        html += `<div class="section-card">
          <div class="section-card__header">
            <span>${escapeHtml(name)}</span>
            <span class="status-pill status-pill--${statusOk ? "online" : "offline"}"><span class="status-pill__dot"></span><span class="status-pill__label">${escapeHtml(status)}</span></span>
          </div>
          <div class="section-card__body">
            <div class="inline-item"><span class="inline-item__meta">Host: ${escapeHtml(n.host || n.url || "—")}</span></div>
            <div class="inline-item"><span class="inline-item__meta">Capabilities: ${(n.capabilities || n.caps || []).join(", ") || "—"}</span></div>
            ${n.lastHeartbeat ? `<div class="inline-item"><span class="inline-item__meta">Last heartbeat: ${new Date(n.lastHeartbeat).toLocaleString()}</span></div>` : ""}
          </div>
        </div>`;
      }
      html += `</div>`;
    } else {
      html += `<p class="text-muted">No relay nodes registered. Use POST /relay/register to add nodes.</p>`;
    }
    if (protocol) {
      html += `<details class="shell-detail-group"><summary>Protocol Info</summary><pre class="code-block">${escapeHtml(JSON.stringify(protocol, null, 2))}</pre></details>`;
    }
    setContent(html);
  } catch (e) {
    setContent(`<h2>Nodes</h2><p>Could not load nodes: ${e.message}</p>`);
  }
}

// --- Evidence ---
async function renderEvidence() {
  try {
    const [learning, enforcementReview, enforcementStatus] = await Promise.all([
      fetchJson("/evidence/learning").catch(() => null),
      fetchJson("/enforcement/review").catch(() => null),
      fetchJson("/enforcement/status").catch(() => null)
    ]);
    let html = `<h2>Evidence</h2>`;
    html += `<div class="section-grid">`;
    if (enforcementStatus) {
      const tracked = enforcementStatus.trackedCount || enforcementStatus.total || 0;
      const enforced = enforcementStatus.enforcedCount || 0;
      html += `<div class="section-card">
        <div class="section-card__header">Enforcement Status</div>
        <div class="section-card__body">
          <div class="inline-item"><span class="inline-item__label">Tracked</span><span class="inline-item__value">${tracked}</span></div>
          <div class="inline-item"><span class="inline-item__label">Enforced</span><span class="inline-item__value">${enforced}</span></div>
        </div>
      </div>`;
    }
    if (enforcementReview) {
      const agreeRate = enforcementReview.agreementRate != null ? (enforcementReview.agreementRate * 100).toFixed(1) + "%" : "—";
      html += `<div class="section-card">
        <div class="section-card__header">Shadow Review</div>
        <div class="section-card__body">
          <div class="inline-item"><span class="inline-item__label">Agreement</span><span class="inline-item__value">${agreeRate}</span></div>
          <div class="inline-item"><span class="inline-item__label">Coverage</span><span class="inline-item__value">${enforcementReview.coverageCount || "—"}</span></div>
        </div>
      </div>`;
    }
    if (learning) {
      html += `<details class="shell-detail-group"><summary>Learning Evidence</summary><pre class="code-block">${escapeHtml(JSON.stringify(learning, null, 2).slice(0, 500))}</pre></details>`;
    }
    html += `</div>`;
    html += `<div class="shell-cta"><a href="/enforcement/status" class="btn btn--secondary" target="_blank">Full Enforcement Dashboard</a></div>`;
    setContent(html);
  } catch (e) {
    setContent(`<h2>Evidence</h2><p>Could not load evidence: ${e.message}</p>`);
  }
}

// --- Reviews ---
async function renderReviews() {
  try {
    const [qualitySummary, pilot] = await Promise.all([
      fetchJson("/enforcement/quality-summary").catch(() => null),
      fetchJson("/enforcement/pilot").catch(() => null)
    ]);
    let html = `<h2>Reviews</h2>`;
    html += `<div class="section-grid">`;
    if (qualitySummary) {
      const total = qualitySummary.totalReviewed || qualitySummary.total || 0;
      html += `<div class="section-card">
        <div class="section-card__header">Quality Summary</div>
        <div class="section-card__body">
          <div class="inline-item"><span class="inline-item__label">Reviewed</span><span class="inline-item__value">${total}</span></div>
          <div class="inline-item"><span class="inline-item__label">Avg Score</span><span class="inline-item__value">${qualitySummary.averageScore != null ? qualitySummary.averageScore.toFixed(2) : "—"}</span></div>
          <div class="inline-item"><span class="inline-item__label">Correction Rate</span><span class="inline-item__value">${qualitySummary.correctionRate != null ? (qualitySummary.correctionRate * 100).toFixed(1) + "%" : "—"}</span></div>
        </div>
      </div>`;
    }
    if (pilot) {
      html += `<details class="shell-detail-group"><summary>Pilot Details</summary><pre class="code-block">${escapeHtml(JSON.stringify(pilot, null, 2))}</pre></details>`;
    }
    if (!qualitySummary && !pilot) {
      html += `<p class="text-muted">No review data available.</p>`;
    }
    html += `</div>`;
    setContent(html);
  } catch (e) {
    setContent(`<h2>Reviews</h2><p>Could not load reviews: ${e.message}</p>`);
  }
}

// --- Memory ---
async function renderMemory() {
  try {
    const [status, captureStatus] = await Promise.all([
      fetchJson("/memory/status").catch(() => null),
      fetchJson("/memory/capture/status").catch(() => null)
    ]);
    let html = `<h2>Memory</h2>`;
    html += `<div class="section-grid">`;
    if (status) {
      const memOk = status.ok || status.ready;
      html += `<div class="section-card">
        <div class="section-card__header">Memory Bridge ${memOk ? "" : "(off)"}</div>
        <div class="section-card__body">
          <div class="inline-item"><span class="inline-item__label">Status</span><span class="inline-item__value">${memOk ? "Ready" : "Not ready"}</span></div>
          ${status.projects ? `<div class="inline-item"><span class="inline-item__label">Projects</span><span class="inline-item__value">${status.projects}</span></div>` : ""}
          ${status.sessions ? `<div class="inline-item"><span class="inline-item__label">Sessions</span><span class="inline-item__value">${status.sessions}</span></div>` : ""}
          ${status.candidates ? `<div class="inline-item"><span class="inline-item__label">Candidates</span><span class="inline-item__value">${status.candidates}</span></div>` : ""}
        </div>
      </div>`;
    }
    if (captureStatus) {
      html += `<div class="section-card">
        <div class="section-card__header">Capture</div>
        <div class="section-card__body">
          <div class="inline-item"><span class="inline-item__label">Running</span><span class="inline-item__value">${captureStatus.running ? "Yes" : "No"}</span></div>
          ${captureStatus.paused ? `<div class="inline-item"><span class="inline-item__label">Paused</span><span class="inline-item__value">Yes</span></div>` : ""}
        </div>
      </div>`;
    }
    if (!status && !captureStatus) {
      html += `<p class="text-muted">Memory system not available.</p>`;
    }
    html += `</div>`;
    setContent(html);
  } catch (e) {
    setContent(`<h2>Memory</h2><p>Could not load memory: ${e.message}</p>`);
  }
}

// --- Jobs ---
async function renderJobs() {
  try {
    const jobsData = await fetchJson("/jobs").catch(() => null);
    let html = `<h2>Jobs</h2>`;
    if (jobsData && (jobsData.jobs || jobsData.items || []).length > 0) {
      const jobs = jobsData.jobs || jobsData.items || [];
      html += `<div class="section-grid">`;
      for (const j of jobs) {
        const name = j.name || j.id || j.jobId || "—";
        const status = j.status || "unknown";
        html += `<div class="section-card">
          <div class="section-card__header">${escapeHtml(name)}</div>
          <div class="section-card__body">
            <span class="status-pill status-pill--${status === "completed" || status === "success" ? "passed" : status === "failed" ? "failed" : "pending"}"><span class="status-pill__dot"></span><span class="status-pill__label">${escapeHtml(status)}</span></span>
            <div class="inline-item"><span class="inline-item__meta">${j.type || j.executionType || ""}</span></div>
          </div>
        </div>`;
      }
      html += `</div>`;
    } else {
      html += `<p class="text-muted">No jobs queued.</p>`;
    }
    html += `<div class="shell-cta"><a href="/operator" class="btn btn--secondary" target="_blank">Operator Console</a></div>`;
    setContent(html);
  } catch (e) {
    setContent(`<h2>Jobs</h2><p>Could not load jobs: ${e.message}</p>`);
  }
}

// --- Settings ---
async function renderSettings() {
  try {
    const status = await fetchJson("/console/status").catch(() => null);
    const health = await fetch("/health").then(r => r.json()).catch(() => null);
    let html = `<h2>Settings</h2>`;
    html += `<div class="section-grid">`;
    if (status) {
      html += `<div class="section-card">
        <div class="section-card__header">System</div>
        <div class="section-card__body">
          <div class="inline-item"><span class="inline-item__label">Local Brain</span><span class="inline-item__value">${status.engine?.running ? "Online" : "Offline"}</span></div>
          <div class="inline-item"><span class="inline-item__label">Ollama</span><span class="inline-item__value">${status.ollama?.available ? "Available" : "Not running"}</span></div>
          <div class="inline-item"><span class="inline-item__label">Model</span><span class="inline-item__value">${status.model?.ready ? status.model.name : "Not ready"}</span></div>
          <div class="inline-item"><span class="inline-item__label">Tools</span><span class="inline-item__value">${status.tools?.count || 0}</span></div>
        </div>
      </div>`;
    }
    if (health) {
      html += `<div class="section-card">
        <div class="section-card__header">Health</div>
        <div class="section-card__body">
          <div class="inline-item"><span class="inline-item__label">Uptime</span><span class="inline-item__value">${health.uptime ? Math.floor(health.uptime / 60) + "m" : "—"}</span></div>
          <div class="inline-item"><span class="inline-item__label">Version</span><span class="inline-item__value">${health.version || health.platformVersion || "—"}</span></div>
          ${health.mode ? `<div class="inline-item"><span class="inline-item__label">Mode</span><span class="inline-item__value">${health.mode}</span></div>` : ""}
        </div>
      </div>`;
    }
    html += `<div class="section-card">
      <div class="section-card__header">About</div>
      <div class="section-card__body">
        <div class="inline-item"><span class="inline-item__label">Version</span><span class="inline-item__value">0.1.0</span></div>
        <div class="inline-item"><span class="inline-item__label">Console</span><span class="inline-item__value"><a href="/console" target="_blank">/console</a></span></div>
        <div class="inline-item"><span class="inline-item__label">Operator</span><span class="inline-item__value"><a href="/operator" target="_blank">/operator</a></span></div>
      </div>
    </div>`;
    html += `</div>`;
    setContent(html);
  } catch (e) {
    setContent(`<h2>Settings</h2><p>Could not load settings: ${e.message}</p>`);
  }
}

// --- Helpers ---
function formatStepStatus(status) {
  const map = { passed: "Passed", success: "Passed", failed: "Failed", warning: "Warning", running: "Running", pending: "Pending", skipped: "Skipped" };
  return map[status] || status || "Unknown";
}

function escapeHtml(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// --- Nav (keyboard + click) ---
document.addEventListener("click", e => {
  const link = e.target.closest(".shell-nav__link");
  if (link) { e.preventDefault(); navigate(link.dataset.section); }
});

document.addEventListener("keydown", e => {
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
  const links = Array.from(document.querySelectorAll(".shell-nav__link"));
  const currentIdx = links.findIndex(l => l.classList.contains("shell-nav__link--active"));
  if (currentIdx === -1) return;
  e.preventDefault();
  const nextIdx = e.key === "ArrowDown"
    ? (currentIdx + 1) % links.length
    : (currentIdx - 1 + links.length) % links.length;
  links[nextIdx].focus();
  navigate(links[nextIdx].dataset.section);
});

// --- Init ---
(async function init() {
  const hash = location.hash.replace("#", "") || "home";
  if (SECTIONS[hash]) await navigate(hash);
  else await navigate("home");
  try {
    const s = await fetchJson("/console/status");
    const dot = qs("shellStatusDot");
    const label = qs("shellStatusLabel");
    if (s.engine?.running) {
      dot.className = "status-dot status-dot--ok";
      label.textContent = "Online";
    } else {
      dot.className = "status-dot status-dot--fail";
      label.textContent = "Offline";
    }
  } catch {}
})();
