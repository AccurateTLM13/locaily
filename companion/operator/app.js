/* Operator Console — client-side logic */
(function () {
  "use strict";

  const BASE_URL = window.location.origin;
  const REFRESH_INTERVAL_MS = 10000;

  let autoRefreshTimer = null;
  let currentPanel = "dashboard";
  let refreshCallbacks = {};

  /* ===== Fetch wrappers ===== */
  async function apiGet(path) {
    const res = await fetch(BASE_URL + path);
    const body = res.ok ? await res.json().catch(() => null) : null;
    return { ok: res.ok, status: res.status, body };
  }

  async function apiPost(path, data) {
    const res = await fetch(BASE_URL + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    const body = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, body };
  }

  /* ===== Utilities ===== */
  function truncate(str, len) {
    if (!str) return "";
    return str.length > len ? str.slice(0, len) + "..." : str;
  }

  function isoToLocal(iso) {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  }

  function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function jsonPreview(val) {
    if (val == null) return "<em>null</em>";
    try {
      return '<pre class="code-block">' + escapeHtml(JSON.stringify(val, null, 2)) + "</pre>";
    } catch {
      return escapeHtml(String(val));
    }
  }

  function announce(message) {
    const el = document.getElementById("status-announcer");
    if (el) {
      el.textContent = "";
      requestAnimationFrame(() => { el.textContent = message; });
    }
  }

  function statusBadge(status) {
    return '<span class="status-badge status-badge--' + escapeHtml(status) + '">' + escapeHtml(status) + "</span>";
  }

  function outcomeLayers(job) {
    const layers = [];
    layers.push("transport"); // always transported via API
    if (job.status === "completed" || job.status === "failed") layers.push("execution");
    if (job.routing && job.routing.enforcementDecision && job.routing.enforcementDecision.applied) {
      layers.push("enforcement");
    }
    if (job.review && job.review.reviewAction) layers.push("human");
    return layers.map((l) => '<span class="outcome-layer outcome-layer--' + l + '">' + l + "</span>").join("");
  }

  /* ===== Panel: Dashboard ===== */
  refreshCallbacks.dashboard = async function refreshDashboard() {
    const statsEl = document.getElementById("job-stats");
    const nodeSumEl = document.getElementById("node-summary");
    const serverInfo = document.getElementById("server-info");

    try {
      const health = await apiGet("/health");
      if (!health.ok || !health.body) {
        statsEl.innerHTML = '<div class="message message--error">Failed to load health data (status ' + health.status + ")</div>";
        nodeSumEl.innerHTML = "";
        serverInfo.textContent = "Error loading server info";
        return;
      }

      const h = health.body;
      serverInfo.textContent = "v" + (h.version || "?") + " | " + (h.runtime ? h.runtime.provider : "?") + " | " + (h.model ? h.model.name : "?") + " | " + (h.status || "?");

      // Job totals
      const totals = h.jobTotals || {};
      const statusOrder = ["queued", "claimed", "running", "completed", "failed", "cancelled", "paused_review"];
      const statusLabels = { queued: "Queued", claimed: "Claimed", running: "Running", completed: "Completed", failed: "Failed", cancelled: "Cancelled", paused_review: "Review" };
      let statsHtml = '<div class="stats-grid">';
      let hasJobs = false;
      for (const s of statusOrder) {
        const count = totals[s] || 0;
        if (count > 0) hasJobs = true;
        statsHtml +=
          '<div class="stat-card stat-card--' + s + '">' +
          '<div class="stat-card__value">' + count + '</div>' +
          '<div class="stat-card__label">' + (statusLabels[s] || s) + "</div>" +
          "</div>";
      }
      statsHtml += "</div>";
      if (!hasJobs) statsHtml += '<p style="font-size: var(--text-sm); color: var(--muted); margin-top: 8px;">No jobs yet. Use the Enqueue panel to create one.</p>';
      statsEl.innerHTML = statsHtml;

      // Relay nodes summary
      const relay = h.relay || {};
      nodeSumEl.innerHTML =
        '<div class="stats-grid">' +
        '<div class="stat-card"><div class="stat-card__value">' + (relay.nodes || 0) + '</div><div class="stat-card__label">Total Nodes</div></div>' +
        '<div class="stat-card"><div class="stat-card__value" style="color: var(--green);">' + (relay.healthy || 0) + '</div><div class="stat-card__label">Healthy</div></div>' +
        "</div>" +
        '<p style="font-size: var(--text-xs); color: var(--muted-soft); margin-top: 6px;">See Relay Nodes panel for details.</p>';
    } catch (err) {
      statsEl.innerHTML = '<div class="message message--error">Network error: ' + escapeHtml(err.message) + "</div>";
      nodeSumEl.innerHTML = "";
      serverInfo.textContent = "Offline";
    }
  };

  /* ===== Panel: Jobs ===== */
  refreshCallbacks.jobs = async function refreshJobs() {
    const tbody = document.getElementById("jobs-list");
    const filter = document.getElementById("status-filter").value;

    try {
      const url = "/jobs" + (filter ? "?status=" + encodeURIComponent(filter) : "");
      const res = await apiGet(url);
      if (!res.ok || !res.body) {
        tbody.innerHTML = '<tr><td colspan="7"><div class="message message--error">Failed to load jobs (status ' + res.status + ")</div></td></tr>";
        return;
      }

      const jobs = res.body.jobs || [];
      if (jobs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7"><div class="message message--info">No jobs found' + (filter ? " with status '" + escapeHtml(filter) + "'" : "") + ".</div></td></tr>";
        return;
      }

      let html = "";
      for (const job of jobs) {
        const trackOrWf = job.trackId || job.workflowId || "-";
        html +=
          '<tr class="clickable" tabindex="0" role="button" data-job-id="' + escapeHtml(job.jobId) + '" aria-label="View job ' + escapeHtml(job.jobId) + '">' +
          "<td>" + escapeHtml(truncate(job.jobId, 16)) + "</td>" +
          "<td>" + escapeHtml(job.type || "-") + "</td>" +
          "<td>" + escapeHtml(truncate(trackOrWf, 24)) + "</td>" +
          "<td>" + statusBadge(job.status) + "</td>" +
          "<td>" + escapeHtml(isoToLocal(job.createdAt)) + "</td>" +
          "<td>" + (job.attempts || 0) + "</td>" +
          "<td>" + (job.lease ? escapeHtml(truncate(job.lease.holder, 12)) : "-") + "</td>" +
          "</tr>";
      }
      tbody.innerHTML = html;

      // Click handlers
      tbody.querySelectorAll("tr.clickable").forEach(function (row) {
        var jobId = row.getAttribute("data-job-id");
        row.addEventListener("click", function () { showJobDetail(jobId); });
        row.addEventListener("keydown", function (e) {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); showJobDetail(jobId); }
        });
      });
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="7"><div class="message message--error">Network error: ' + escapeHtml(err.message) + "</div></td></tr>";
    }
  };

  /* ===== Job Detail ===== */
  async function showJobDetail(jobId) {
    const overlay = document.getElementById("job-detail-overlay");
    const title = document.getElementById("detail-title");
    const body = document.getElementById("detail-body");

    overlay.hidden = false;
    title.textContent = "Job: " + truncate(jobId, 24);
    body.innerHTML = '<div class="loading">Loading job detail</div>';
    document.body.style.overflow = "hidden";

    try {
      const res = await apiGet("/jobs/" + encodeURIComponent(jobId));
      if (!res.ok || !res.body || !res.body.job) {
        body.innerHTML = '<div class="message message--error">Job not found or error (status ' + res.status + ")</div>";
        return;
      }

      const job = res.body.job;
      let html = "";

      // Job metadata
      html += '<div class="detail-section">';
      html += '<h3 class="detail-section__title">Metadata</h3>';
      html += field("Job ID", escapeHtml(job.jobId));
      html += field("Type", escapeHtml(job.executionType || job.type || "-"));
      html += field("Track ID", escapeHtml(job.trackId || "-"));
      html += field("Workflow ID", escapeHtml(job.workflowId || "-"));
      html += field("Status", statusBadge(job.status));
      html += field("Correlation ID", escapeHtml(job.correlationId || "-"));
      html += '</div>';

      // Attempts & Timestamps
      html += '<div class="detail-section">';
      html += '<h3 class="detail-section__title">Attempts &amp; Timestamps</h3>';
      html += field("Attempt", String(job.attempt || 0));
      html += field("Max Attempts", String(job.maxAttempts || 3));
      html += field("Created", escapeHtml(isoToLocal(job.timestamps && job.timestamps.createdAt)));
      html += field("Started", escapeHtml(isoToLocal(job.timestamps && job.timestamps.startedAt)));
      html += field("Completed", escapeHtml(isoToLocal(job.timestamps && job.timestamps.completedAt)));
      html += '</div>';

      // Lease
      if (job.lease) {
        html += '<div class="detail-section">';
        html += '<h3 class="detail-section__title">Lease</h3>';
        html += field("Holder", escapeHtml(job.lease.holder));
        html += field("Expires", escapeHtml(isoToLocal(job.lease.expiresAt)));
        html += '</div>';
      }

      // Result / Error
      if (job.result != null) {
        html += '<div class="detail-section">';
        html += '<h3 class="detail-section__title">Result</h3>';
        html += '<div>' + jsonPreview(job.result) + '</div>';
        html += '</div>';
      }
      if (job.error) {
        html += '<div class="detail-section">';
        html += '<h3 class="detail-section__title">Error</h3>';
        html += field("Code", escapeHtml(job.error.code || "-"));
        html += field("Message", escapeHtml(job.error.message || "-"));
        if (job.error.nextStep) html += field("Next Step", escapeHtml(job.error.nextStep));
        html += '</div>';
      }

      // Review metadata
      if (job.review) {
        html += '<div class="detail-section">';
        html += '<h3 class="detail-section__title">Review</h3>';
        html += field("Action", escapeHtml(job.review.reviewAction || "-"));
        html += field("Reviewer", escapeHtml(job.review.reviewedBy || "-"));
        html += field("Reviewed At", escapeHtml(isoToLocal(job.review.reviewedAt)));
        html += field("Reason", escapeHtml(job.review.reviewReason || "-"));
        html += '</div>';
      }

      // Routing / Placement metadata
      if (job.routing) {
        html += '<div class="detail-section">';
        html += '<h3 class="detail-section__title">Routing</h3>';
        if (job.routing.enforcementDecision) {
          html += field("Enforcement Applied", String(job.routing.enforcementDecision.applied));
          html += field("Capability ID", escapeHtml(job.routing.enforcementDecision.executedCapabilityId || "-"));
        }
        if (job.routing.executionMode) html += field("Execution Mode", escapeHtml(job.routing.executionMode));
        if (job.routing.plannedNode) html += field("Planned Node", escapeHtml(job.routing.plannedNode));
        if (job.routing.actualNode) html += field("Actual Node", escapeHtml(job.routing.actualNode));
        if (job.routing.fallbackMetadata) {
          html += field("Fallback Reason", escapeHtml(job.routing.fallbackMetadata.reason || "-"));
        }
        html += '</div>';
      }
      if (job.plannedNode) {
        html += '<div class="detail-section">';
        html += '<h3 class="detail-section__title">Placement</h3>';
        html += field("Planned Node", escapeHtml(job.plannedNode));
        if (job.actualNode) html += field("Actual Node", escapeHtml(job.actualNode));
        if (job.executionMode) html += field("Execution Mode", escapeHtml(job.executionMode));
        if (job.fallbackMetadata) html += field("Fallback Reason", escapeHtml(job.fallbackMetadata.reason || "-"));
        html += '</div>';
      }

      // Evidence refs
      if (job.evidenceRefs || job.evidence) {
        html += '<div class="detail-section">';
        html += '<h3 class="detail-section__title">Evidence</h3>';
        html += '<div>' + jsonPreview(job.evidenceRefs || job.evidence) + '</div>';
        html += '</div>';
      }

      // Outcome layers
      html += '<div class="detail-section">';
      html += '<h3 class="detail-section__title">Outcome Layers</h3>';
      html += '<div class="outcome-layers">' + outcomeLayers(job) + "</div>";
      html += "</div>";

      // Error history
      if (job.errors && job.errors.length > 0) {
        html += '<div class="detail-section">';
        html += '<h3 class="detail-section__title">Error History</h3>';
        html += '<div>' + jsonPreview(job.errors) + '</div>';
        html += '</div>';
      }

      // Action buttons based on status
      html += '<div class="detail-actions" id="detail-actions">';
      var actions = getJobActions(job);
      for (var i = 0; i < actions.length; i++) {
        var a = actions[i];
        html += '<button class="btn ' + a.cls + ' job-action" data-job-id="' + escapeHtml(job.jobId) + '" data-action="' + escapeHtml(a.action) + '" aria-label="' + escapeHtml(a.label) + '">' + escapeHtml(a.label) + "</button>";
      }
      html += "</div>";

      body.innerHTML = html;

      // Wire action buttons
      body.querySelectorAll(".job-action").forEach(function (btn) {
        btn.addEventListener("click", function () {
          handleJobAction(btn.getAttribute("data-job-id"), btn.getAttribute("data-action"));
        });
      });

    } catch (err) {
      body.innerHTML = '<div class="message message--error">Network error: ' + escapeHtml(err.message) + "</div>";
    }
  }

  function field(label, value) {
    return '<div class="detail-field"><span class="detail-field__label">' + escapeHtml(label) + '</span><span class="detail-field__value">' + value + "</span></div>";
  }

  function getJobActions(job) {
    var actions = [];
    var status = job.status;
    if (status === "queued" || status === "claimed") {
      actions.push({ label: "Cancel", action: "cancel", cls: "btn--danger" });
    }
    if (status === "failed") {
      var remaining = (job.maxAttempts || 3) - (job.attempt || 0);
      if (remaining > 0) {
        actions.push({ label: "Retry (" + remaining + " left)", action: "retry", cls: "btn--primary" });
      }
    }
    if (status === "running") {
      actions.push({ label: "Request Review", action: "request_review", cls: "btn--secondary" });
    }
    if (status === "paused_review") {
      actions.push({ label: "Approve", action: "approve", cls: "btn--primary" });
      actions.push({ label: "Reject", action: "reject", cls: "btn--danger" });
      actions.push({ label: "Request Correction", action: "request_correction", cls: "btn--secondary" });
      actions.push({ label: "Stop", action: "stop", cls: "btn--ghost" });
    }
    return actions;
  }

  async function handleJobAction(jobId, action) {
    var confirmMessages = {
      cancel: "Cancel this job? It will not be executed.",
      retry: "Retry this job? It will be re-queued for execution.",
      request_review: "Request human review? The job will pause pending review.",
      approve: "Approve this job? It will be re-queued to continue.",
      reject: "Reject this job? It will be marked as failed.",
      request_correction: "Request correction? The job will be re-queued with a correction note.",
      stop: "Stop this review? The job will be cancelled."
    };

    var msg = confirmMessages[action];
    if (!msg) return;

    var confirmResult = await showConfirm(msg, action !== "cancel" && action !== "retry");
    if (!confirmResult.confirmed) return;

    var payload = { action: action, reviewedBy: "operator-console", reason: confirmResult.reason || null };

    try {
      var res = await apiPost("/jobs/" + encodeURIComponent(jobId) + "/" + actionEndpoint(action), payload);
      if (res.ok) {
        announce("Job " + action + " successful");
        closeJobDetail();
        refreshCallbacks.jobs();
        refreshCallbacks.dashboard();
      } else {
        var errMsg = (res.body && res.body.message) || ("Action failed (status " + res.status + ")");
        announce("Job action failed: " + errMsg);
        showMessage(document.getElementById("detail-body"), errMsg, "error");
      }
    } catch (err) {
      announce("Network error: " + err.message);
      showMessage(document.getElementById("detail-body"), "Network error: " + err.message, "error");
    }
  }

  function actionEndpoint(action) {
    if (action === "cancel") return "cancel";
    if (action === "retry") return "retry";
    return "review";
  }

  function showMessage(target, msg, type) {
    if (!target) return;
    var el = document.createElement("div");
    el.className = "message message--" + type;
    el.textContent = msg;
    target.prepend(el);
    setTimeout(function () { if (el.parentNode) el.remove(); }, 5000);
  }

  /* ===== Confirmation dialog ===== */
  function showConfirm(message, showReason) {
    return new Promise(function (resolve) {
      var dialog = document.getElementById("confirm-dialog");
      var msgEl = document.getElementById("confirm-message");
      var reasonEl = document.getElementById("confirm-reason");
      var okBtn = document.getElementById("confirm-ok");
      var cancelBtn = document.getElementById("confirm-cancel");

      msgEl.textContent = message;
      reasonEl.value = "";
      reasonEl.style.display = showReason ? "block" : "none";
      dialog.hidden = false;
      if (showReason) reasonEl.focus();
      else okBtn.focus();

      var cleanup = function () {
        dialog.hidden = true;
        okBtn.removeEventListener("click", onOk);
        cancelBtn.removeEventListener("click", onCancel);
        document.removeEventListener("keydown", onKey);
      };

      var onOk = function () {
        cleanup();
        resolve({ confirmed: true, reason: reasonEl.value.trim() || null });
      };
      var onCancel = function () {
        cleanup();
        resolve({ confirmed: false });
      };
      var onKey = function (e) {
        if (e.key === "Escape") onCancel();
        if (e.key === "Enter" && e.ctrlKey) onOk();
      };

      okBtn.addEventListener("click", onOk);
      cancelBtn.addEventListener("click", onCancel);
      document.addEventListener("keydown", onKey);
    });
  }

  /* ===== Panel: Relay Nodes ===== */
  refreshCallbacks.nodes = async function refreshNodes() {
    var container = document.getElementById("nodes-list");

    try {
      var res = await apiGet("/relay/nodes");
      if (!res.ok || !res.body) {
        container.innerHTML = '<div class="message message--error">Failed to load nodes (status ' + res.status + ")</div>";
        return;
      }

      var data = res.body;
      var nodes = data.nodes || [];
      var stats = data.stats || {};

      var html = '<div class="stats-grid" style="margin-bottom: 12px;">';
      html += '<div class="stat-card"><div class="stat-card__value">' + (stats.total || nodes.length) + '</div><div class="stat-card__label">Total</div></div>';
      html += '<div class="stat-card"><div class="stat-card__value" style="color: var(--green);">' + (stats.healthy || 0) + '</div><div class="stat-card__label">Healthy</div></div>';
      html += '<div class="stat-card"><div class="stat-card__value" style="color: var(--red);">' + (stats.unhealthy || 0) + '</div><div class="stat-card__label">Unhealthy</div></div>';
      html += "</div>";

      if (nodes.length === 0) {
        html += '<div class="message message--info">No relay nodes registered.</div>';
        container.innerHTML = html;
        return;
      }

      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        var isHealthy = n.healthy !== false;
        var isStale = n.stale || false;
        var rowClass = "node-row";
        if (!isHealthy) rowClass += " node-row--unhealthy";
        if (isStale) rowClass += " node-row--stale";

        var healthDotClass = isStale ? "stale" : (isHealthy ? "healthy" : "unhealthy");
        var heartText = n.lastHeartbeat ? isoToLocal(n.lastHeartbeat) : "never";
        var caps = Array.isArray(n.capabilities) ? n.capabilities.join(", ") : (n.capabilities || "-");
        var statusText = isStale ? "stale" : (isHealthy ? "healthy" : "unhealthy");

        html += '<div class="' + rowClass + '">';
        html += '<div class="node-row__info">';
        html += '<span class="node-row__name"><span class="health-dot health-dot--' + healthDotClass + '"></span>' + escapeHtml(n.label || n.nodeId) + "</span>";
        html += '<span class="node-row__meta">' + escapeHtml(n.nodeId || "") + " | v" + escapeHtml(String(n.protocolVersion || "?")) + " | " + escapeHtml(n.baseUrl || "") + "</span>";
        html += '<span class="node-row__meta">Last heartbeat: ' + heartText + "</span>";
        html += "</div>";
        html += '<div class="node-row__status">' + escapeHtml(statusText) + "</div>";
        html += '<div class="node-row__caps">' + escapeHtml(truncate(caps, 40)) + "</div>";
        html += "</div>";
      }

      container.innerHTML = html;
    } catch (err) {
      container.innerHTML = '<div class="message message--error">Network error: ' + escapeHtml(err.message) + "</div>";
    }
  };

  /* ===== Panel: Enqueue ===== */
  refreshCallbacks.enqueue = function () { /* no auto-refresh needed */ };

  /* ===== Enqueue form handler ===== */
  document.addEventListener("DOMContentLoaded", function () {
    var form = document.getElementById("enqueue-form");
    var typeSelect = document.getElementById("job-type");
    var idInput = document.getElementById("job-id-input");
    var inputArea = document.getElementById("job-input");
    var submitBtn = document.getElementById("enqueue-submit");
    var resultEl = document.getElementById("enqueue-result");

    form.addEventListener("submit", async function (e) {
      e.preventDefault();

      var type = typeSelect.value;
      var id = idInput.value.trim();
      var inputRaw = inputArea.value.trim();

      if (!type) {
        resultEl.innerHTML = '<div class="message message--error">Please select a job type.</div>';
        return;
      }
      if (!id) {
        resultEl.innerHTML = '<div class="message message--error">Please enter a track or workflow ID.</div>';
        return;
      }

      var input = {};
      if (inputRaw) {
        try { input = JSON.parse(inputRaw); }
        catch (err) {
          resultEl.innerHTML = '<div class="message message--error">Invalid JSON in input: ' + escapeHtml(err.message) + "</div>";
          return;
        }
      }

      var payload = { executionType: type, input: input };
      if (type === "track") payload.trackId = id;
      else payload.workflowId = id;

      submitBtn.disabled = true;
      submitBtn.textContent = "Creating...";
      resultEl.innerHTML = "";

      try {
        var res = await apiPost("/jobs", payload);
        if (res.ok && res.body && res.body.job) {
          resultEl.innerHTML = '<div class="message message--success">Job created: ' + escapeHtml(truncate(res.body.job.jobId, 24)) + " (" + statusBadge(res.body.job.status) + ")</div>";
          form.reset();
          refreshCallbacks.jobs();
          refreshCallbacks.dashboard();
          announce("Job created: " + res.body.job.jobId);
        } else {
          var msg = (res.body && res.body.message) || "Failed to create job (status " + res.status + ")";
          resultEl.innerHTML = '<div class="message message--error">' + escapeHtml(msg) + "</div>";
        }
      } catch (err) {
        resultEl.innerHTML = '<div class="message message--error">Network error: ' + escapeHtml(err.message) + "</div>";
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Create Job";
      }
    });
  });

  /* ===== Panel switching ===== */
  function switchPanel(panelId) {
    if (panelId === currentPanel) return;

    // Deactivate current
    var oldTab = document.getElementById("tab-" + currentPanel);
    var oldPanel = document.getElementById("panel-" + currentPanel);
    if (oldTab) { oldTab.classList.remove("panel-tab--active"); oldTab.setAttribute("aria-selected", "false"); }
    if (oldPanel) oldPanel.classList.remove("panel--active");

    // Activate new
    currentPanel = panelId;
    var newTab = document.getElementById("tab-" + panelId);
    var newPanel = document.getElementById("panel-" + panelId);
    if (newTab) { newTab.classList.add("panel-tab--active"); newTab.setAttribute("aria-selected", "true"); newTab.focus(); }
    if (newPanel) newPanel.classList.add("panel--active");

    closeJobDetail();
    refreshCurrentPanel();
    announce("Switched to " + panelId + " panel");
  }

  function refreshCurrentPanel() {
    var cb = refreshCallbacks[currentPanel];
    if (cb) cb();
  }

  /* ===== Job detail close ===== */
  function closeJobDetail() {
    var overlay = document.getElementById("job-detail-overlay");
    overlay.hidden = true;
    document.body.style.overflow = "";
  }

  /* ===== Keyboard Shortcuts ===== */
  document.addEventListener("keydown", function (e) {
    // Don't intercept when typing in inputs/textareas
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;

    switch (e.key) {
      case "1": switchPanel("dashboard"); e.preventDefault(); break;
      case "2": switchPanel("jobs"); e.preventDefault(); break;
      case "3": switchPanel("nodes"); e.preventDefault(); break;
      case "4": switchPanel("enqueue"); e.preventDefault(); break;
      case "r":
      case "R": refreshCurrentPanel(); announce("Panel refreshed"); e.preventDefault(); break;
      case "Escape":
        if (!document.getElementById("confirm-dialog").hidden) {
          // Handled by confirm dialog listener
          return;
        }
        if (!document.getElementById("job-detail-overlay").hidden) {
          closeJobDetail(); e.preventDefault();
        }
        break;
    }
  });

  /* ===== Tab click handlers ===== */
  document.querySelectorAll(".panel-tab").forEach(function (tab) {
    tab.addEventListener("click", function () {
      switchPanel(tab.getAttribute("data-panel"));
    });
  });

  /* ===== Close button for detail ===== */
  document.getElementById("detail-close").addEventListener("click", closeJobDetail);
  document.getElementById("job-detail-overlay").addEventListener("click", function (e) {
    if (e.target === this) closeJobDetail();
  });

  /* ===== Refresh button ===== */
  document.getElementById("refresh-btn").addEventListener("click", function () {
    refreshCurrentPanel();
    announce("Panel refreshed");
  });

  /* ===== Status filter ===== */
  document.getElementById("status-filter").addEventListener("change", function () {
    refreshCallbacks.jobs();
  });

  /* ===== Auto-refresh ===== */
  function startAutoRefresh() {
    if (autoRefreshTimer) clearInterval(autoRefreshTimer);
    autoRefreshTimer = setInterval(function () {
      if (currentPanel === "dashboard") refreshCallbacks.dashboard();
    }, REFRESH_INTERVAL_MS);
  }

  /* ===== Init ===== */
  function init() {
    refreshCallbacks.dashboard();
    startAutoRefresh();
  }

  document.addEventListener("DOMContentLoaded", init);
  if (document.readyState === "complete" || document.readyState === "interactive") {
    init();
  }
})();
