const fs = require('fs');
const path = require('path');

const RAW_DIR = path.join(__dirname, '..', 'results', 'raw');
const OUT_FILE = path.join(__dirname, '..', 'reports', 'benchmark-report.html');

function readAllRuns(dir) {
  const items = fs.readdirSync(dir, { withFileTypes: true });
  const runs = [];
  for (const item of items) {
    if (item.isDirectory()) {
      const runPath = path.join(dir, item.name, 'run.json');
      if (fs.existsSync(runPath)) {
        try {
          const data = JSON.parse(fs.readFileSync(runPath, 'utf-8'));
          data._folder = item.name;
          runs.push(data);
        } catch (e) {
          console.error(`Failed to parse ${runPath}: ${e.message}`);
        }
      }
    }
  }
  return runs;
}

function classifyRun(run) {
  if (run.schemaVersion === 'benchmark.tool_eval_raw_run.v1') return 'tool-eval';
  if (run.modeResults) return 'mode-comparison';
  if (run.suite?.trackId === 'intent-classification' || run.suite?.contractId?.includes('intent')) return 'intent-classification';
  if (run.suite?.suiteId?.includes('intent') || run.suite?.name?.includes('Intent')) return 'intent-classification';
  return 'other';
}

function isMockRun(run) {
  if (run.suite?.runtime?.provider === 'mock') return true;
  if (run.modelManifest?.runtime === 'mock') return true;
  if (run.suite?.runtime?.responsesPath) return true;
  if (run._folder?.includes('matrix') || run._folder?.startsWith('run-test-intent')) return true;
  return false;
}

function isLiveOllamaOk(run) {
  if (run.suite?.runtime?.provider === 'ollama' && run.suite?.runtime?.baseUrl) return true;
  if (run.modelManifest?.runtime === 'ollama') return true;
  return false;
}

function getModelName(run) {
  return run.modelManifest?.displayName || run.modelManifest?.modelId || run.suite?.runtime?.modelManifest || 'unknown';
}

function getModelId(run) {
  return run.modelManifest?.modelId || run.suite?.runtime?.modelManifest || 'unknown';
}

function getModelProvider(run) {
  return run.modelManifest?.provider || 'unknown';
}

function fmtDuration(ms) {
  if (!ms) return '-';
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function aggVerdictColor(v) {
  switch (v) {
    case 'PASS': return '#166534';
    case 'PARTIAL': return '#9a3412';
    case 'FAIL': return '#991b1b';
    case 'TIMEOUT': case 'RUNTIME_ERROR': return '#7f1d1d';
    case 'MALFORMED_OUTPUT': return '#854d0e';
    default: return '#1e3a5f';
  }
}

function verdictBadge(v) {
  const colors = {
    PASS: { bg: '#dcfce7', text: '#166534' },
    PARTIAL: { bg: '#ffedd5', text: '#9a3412' },
    FAIL: { bg: '#fee2e2', text: '#991b1b' },
    TIMEOUT: { bg: '#fce7f3', text: '#9d174d' },
    RUNTIME_ERROR: { bg: '#fce7f3', text: '#9d174d' },
    MALFORMED_OUTPUT: { bg: '#fef9c3', text: '#854d0e' },
  };
  const c = colors[v] || { bg: '#e2e8f0', text: '#1e293b' };
  return `<span style="display:inline-block;padding:1px 8px;border-radius:4px;font-size:11px;font-weight:600;background:${c.bg};color:${c.text}">${v}</span>`;
}

// ---- Main logic ----
const allRuns = readAllRuns(RAW_DIR);
console.log(`Found ${allRuns.length} runs`);

const intentRuns = allRuns.filter(r => classifyRun(r) === 'intent-classification');
const toolRuns = allRuns.filter(r => classifyRun(r) === 'tool-eval');
const modeRuns = allRuns.filter(r => classifyRun(r) === 'mode-comparison');

const liveIntentRuns = intentRuns.filter(r => isLiveOllamaOk(r) && !isMockRun(r));
const mockIntentRuns = intentRuns.filter(r => isMockRun(r));
const allModels = [...new Set(allRuns.map(getModelName))].sort();

// ---- Build HTML ----
const sections = [];

sections.push(`
<div class="hero">
  <div class="hero-title">Benchmark Lab Report</div>
  <div class="hero-sub">Generated ${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC &middot; ${allRuns.length} runs &middot; ${allModels.length} models</div>
</div>`);

// ========== 1. EXECUTIVE SUMMARY ==========
const totalCases = intentRuns.reduce((s, r) => s + (r.caseResults?.length || 0), 0);
const totalTrials = toolRuns.reduce((s, r) => s + (r.caseResults?.reduce((a, c) => a + (c.trialResults?.length || 0), 0) || 0), 0);
const modeTrials = modeRuns.reduce((s, r) => s + (r.modeResults?.reduce((a, m) => a + (m.trials?.length || 0), 0) || 0), 0);
const allToolTrials = totalTrials + modeTrials;

let intentPass = 0, intentFail = 0, intentOther = 0;
for (const r of intentRuns) {
  for (const cr of (r.caseResults || [])) {
    if (cr.verdict === 'PASS') intentPass++;
    else if (cr.verdict === 'FAIL') intentFail++;
    else intentOther++;
  }
}

sections.push(`
<h2>Executive Summary</h2>
<div class="cards">
  <div class="card"><div class="card-num">${allRuns.length}</div><div class="card-label">Total Benchmark Runs</div></div>
  <div class="card"><div class="card-num">${allModels.length}</div><div class="card-label">Models Tested</div></div>
  <div class="card"><div class="card-num">${totalCases}</div><div class="card-label">Intent Classification Cases</div></div>
  <div class="card"><div class="card-num">${allToolTrials}</div><div class="card-label">Tool Evaluation Trials</div></div>
  <div class="card ${intentPass > intentFail ? 'good' : 'bad'}"><div class="card-num">${intentPass}/${totalCases}</div><div class="card-label">Intent Cases Passed</div></div>
  <div class="card"><div class="card-num">${liveIntentRuns.length}</div><div class="card-label">Live Ollama Intent Runs</div></div>
</div>`);

// ========== 2. MODELS OVERVIEW ==========
const modelInfo = {};
for (const r of allRuns) {
  const id = getModelId(r);
  if (!modelInfo[id]) {
    modelInfo[id] = {
      name: getModelName(r),
      id,
      provider: getModelProvider(r),
      runtime: r.modelManifest?.runtime || r.suite?.runtime?.provider || 'unknown',
      capabilities: r.modelManifest?.capabilities || [],
      runs: [],
    };
  }
  if (!modelInfo[id].runs.some(x => x._folder === r._folder)) {
    modelInfo[id].runs.push(r);
  }
}

const modelRows = Object.values(modelInfo).map(m => {
  const caps = m.capabilities.join(', ') || '-';
  const runTypes = [...new Set(m.runs.map(r => classifyRun(r)))].join(', ');
  return `<tr><td>${m.name}</td><td>${m.provider}</td><td>${m.runtime}</td><td>${caps}</td><td>${m.runs.length}</td><td>${runTypes}</td></tr>`;
}).join('\n');

sections.push(`
<h2>Models Tested</h2>
<table>
  <tr><th>Model</th><th>Provider</th><th>Runtime</th><th>Capabilities</th><th>Runs</th><th>Test Types</th></tr>
  ${modelRows}
</table>`);

// ========== 3. INTENT CLASSIFICATION DASHBOARD ==========
if (liveIntentRuns.length > 0) {
  sections.push(`
<h2>Intent Classification &mdash; Live Ollama Runs</h2>
<p class="desc">${liveIntentRuns.length} live runs against llama3.2, tracking improvement over time.</p>
<table>
  <tr><th>Run</th><th>Model</th><th>Date</th><th>PASS</th><th>FAIL</th><th>MALFORMED</th><th>TIMEOUT</th><th>ERROR</th><th>Verdict</th><th>Avg Latency</th></tr>`);
  for (const r of liveIntentRuns) {
    const results = r.caseResults || [];
    const counts = { PASS: 0, FAIL: 0, MALFORMED_OUTPUT: 0, TIMEOUT: 0, RUNTIME_ERROR: 0 };
    let totalMs = 0;
    for (const cr of results) {
      counts[cr.verdict] = (counts[cr.verdict] || 0) + 1;
      totalMs += cr.durationMs || 0;
    }
    const allPass = counts.FAIL + counts.MALFORMED_OUTPUT + counts.TIMEOUT + counts.RUNTIME_ERROR === 0;
    const avgMs = results.length > 0 ? totalMs / results.length : 0;
    sections.push(`<tr>
      <td title="${r.suite?.name || r.runId}">${r._folder}</td>
      <td>${getModelName(r)}</td>
      <td>${(r.startedAt || '').slice(0, 10)}</td>
      <td class="num pass">${counts.PASS}</td>
      <td class="num fail">${counts.FAIL}</td>
      <td class="num warn">${counts.MALFORMED_OUTPUT}</td>
      <td class="num err">${counts.TIMEOUT}</td>
      <td class="num err">${counts.RUNTIME_ERROR}</td>
      <td>${allPass ? verdictBadge('PASS') : verdictBadge('FAIL')}</td>
      <td class="num">${fmtDuration(avgMs)}</td>
    </tr>`);
  }
  sections.push(`</table>`);

  // Trend chart data
  const trendData = liveIntentRuns.map(r => {
    const results = r.caseResults || [];
    const pass = results.filter(c => c.verdict === 'PASS').length;
    const total = results.length;
    return {
      label: (r.startedAt || r._folder).slice(0, 16).replace('T', ' '),
      pass,
      total,
      pct: total > 0 ? (pass / total * 100).toFixed(0) : 0,
    };
  });
  sections.push(`
<h3>Pass Rate Trend</h3>
<div class="chart-container">
  <div class="bar-chart" style="grid-template-columns: repeat(${trendData.length}, 1fr);">`);
  for (const t of trendData) {
    const h = Math.max(4, parseInt(t.pct) * 0.6);
    sections.push(`
    <div class="bar-col">
      <div class="bar" style="height:${h}px;background:${parseInt(t.pct) >= 80 ? '#22c55e' : parseInt(t.pct) >= 50 ? '#f59e0b' : '#ef4444'}"><span class="bar-label">${t.pct}%</span></div>
      <div class="bar-xt">${t.label}<br>${t.pass}/${t.total}</div>
    </div>`);
  }
  sections.push(`</div></div>`);
}

// Full intent table with mock included
sections.push(`
<h2>All Intent Classification Runs</h2>
<table>
  <tr><th>Run</th><th>Model</th><th>Suite</th><th>Type</th><th>Cases</th><th>PASS</th><th>FAIL</th><th>Other</th><th>Verdict</th></tr>`);
for (const r of intentRuns) {
  const results = r.caseResults || [];
  const counts = { PASS: 0, FAIL: 0, OTHER: 0 };
  for (const cr of results) {
    if (cr.verdict === 'PASS') counts.PASS++;
    else if (cr.verdict === 'FAIL') counts.FAIL++;
    else counts.OTHER++;
  }
  const type = isMockRun(r) ? 'Mock' : 'Live';
  const allPass = counts.FAIL + counts.OTHER === 0;
  sections.push(`<tr>
    <td title="${r.suite?.name || ''}">${r._folder}</td>
    <td>${getModelName(r)}</td>
    <td>${r.suite?.name || r.suite?.suiteId || '-'}</td>
    <td>${type}</td>
    <td class="num">${results.length}</td>
    <td class="num pass">${counts.PASS}</td>
    <td class="num fail">${counts.FAIL}</td>
    <td class="num warn">${counts.OTHER}</td>
    <td>${allPass ? verdictBadge('PASS') : verdictBadge('FAIL')}</td>
  </tr>`);
}
sections.push(`</table>`);

// ========== 4. TOOL EVALUATION ==========
if (toolRuns.length > 0) {
  sections.push(`
<h2>Tool Evaluation Results</h2>
<p class="desc">${toolRuns.length} tool-eval runs, each with multiple scenarios and 3 trials per scenario.</p>`);

  for (const r of toolRuns) {
    const cases = r.caseResults || [];
    const modelName = getModelName(r);
    const dateStr = (r.startedAt || '').slice(0, 16).replace('T', ' ');
    sections.push(`
<h3>${r._folder} <span class="subtitle">${modelName} &middot; ${dateStr}</span></h3>
<table>
  <tr><th>Scenario</th><th>Category</th><th>Difficulty</th><th>Expected Tool</th><th>PASS</th><th>PARTIAL</th><th>FAIL</th><th>Timeout/Err</th><th>Verdict</th><th>Reliability</th></tr>`);
    for (const c of cases) {
      const agg = c.aggregate || {};
      const v = agg.verdict || 'N/A';
      const rel = agg.reliability != null ? `${agg.reliability}%` : '-';
      sections.push(`<tr>
        <td title="${c.title || ''}">${c.scenarioId}</td>
        <td>${c.category || '-'}</td>
        <td>${c.difficulty != null ? c.difficulty : '-'}</td>
        <td>${c.expectedTool || '-'}</td>
        <td class="num pass">${agg.passCount ?? '-'}</td>
        <td class="num warn">${agg.partialCount ?? '-'}</td>
        <td class="num fail">${agg.failCount ?? '-'}</td>
        <td class="num err">${(agg.timeoutCount || 0) + (agg.errorCount || 0) || '-'}</td>
        <td>${verdictBadge(v)}</td>
        <td class="num">${rel}</td>
      </tr>`);
    }
    sections.push(`</table>`);
  }
}

// ========== 5. MODE COMPARISON ==========
if (modeRuns.length > 0) {
  sections.push(`
<h2>Mode Comparison</h2>
<p class="desc">Side-by-side comparison of execution strategies across models.</p>
<table>
  <tr><th>Model</th><th>Mode</th><th>Scenario</th><th>Trial 1</th><th>Trial 2</th><th>Trial 3</th><th>Avg Latency</th></tr>`);
  for (const r of modeRuns) {
    const modelName = getModelName(r);
    const modes = r.modeResults || [];
    for (const mode of modes) {
      const trials = mode.trials || [];
      const seen = new Set();
      for (const t of trials) {
        const sid = t.scenarioId;
        if (seen.has(sid)) continue;
        seen.add(sid);
        const same = trials.filter(x => x.scenarioId === sid);
        const t1 = same.find(x => x.trial === 1) || same[0];
        const t2 = same.find(x => x.trial === 2);
        const t3 = same.find(x => x.trial === 3);
        const avgMs = same.reduce((s, x) => s + (x.durationMs || 0), 0) / same.length;
        sections.push(`<tr>
          <td>${modelName}</td>
          <td>${mode.executionMode}</td>
          <td title="${t.scenarioTitle || ''}">${sid}</td>
          <td>${t1 ? verdictBadge(t1.verdict) : '-'}</td>
          <td>${t2 ? verdictBadge(t2.verdict) : '-'}</td>
          <td>${t3 ? verdictBadge(t3.verdict) : '-'}</td>
          <td class="num">${fmtDuration(avgMs)}</td>
        </tr>`);
      }
    }
  }
  sections.push(`</table>`);

  // Mode comparison summary
  sections.push(`
<h3>Model Head-to-Head Summary</h3>
<table>
  <tr><th>Scenario</th><th>Llama 3.2 (Native)</th><th>LFM2.5 (Native)</th><th>Delta</th></tr>`);
  const l32 = modeRuns.find(r => getModelId(r).includes('llama3.2'));
  const lfm = modeRuns.find(r => getModelId(r).includes('lfm25'));
  const scenarioIds = [...new Set([
    ...((l32?.modeResults || []).flatMap(m => (m.trials || []).map(t => t.scenarioId))),
    ...((lfm?.modeResults || []).flatMap(m => (m.trials || []).map(t => t.scenarioId))),
  ])];
  for (const sid of scenarioIds) {
    const l32Trials = (l32?.modeResults || []).flatMap(m => (m.trials || []).filter(t => t.scenarioId === sid));
    const lfmTrials = (lfm?.modeResults || []).flatMap(m => (m.trials || []).filter(t => t.scenarioId === sid));
    const l32AllPass = l32Trials.length > 0 && l32Trials.every(t => t.verdict === 'PASS');
    const lfmAllPass = lfmTrials.length > 0 && lfmTrials.every(t => t.verdict === 'PASS');
    const delta = l32AllPass === lfmAllPass ? 'Draw' : (lfmAllPass ? 'LFM2.5 wins' : 'Llama 3.2 wins');
    sections.push(`<tr>
      <td>${sid}</td>
      <td>${l32Trials.length > 0 ? l32Trials.map(t => verdictBadge(t.verdict)).join(' ') : '-'}</td>
      <td>${lfmTrials.length > 0 ? lfmTrials.map(t => verdictBadge(t.verdict)).join(' ') : '-'}</td>
      <td style="font-weight:600;color:${delta === 'LFM2.5 wins' ? '#16a34a' : delta === 'Llama 3.2 wins' ? '#dc2626' : '#64748b'}">${delta}</td>
    </tr>`);
  }
  sections.push(`</table>`);
}

// ========== 6. ERROR ANALYSIS ==========
const errorEntries = [];
for (const r of allRuns) {
  if (r.caseResults) {
    for (const cr of r.caseResults) {
      if (cr.verdict && cr.verdict !== 'PASS') {
        const errorMsg = cr.checks?.find(c => c.status === 'fail')?.summary || cr.checks?.find(c => c.status === 'fail')?.message || cr.errorMessage || cr.rawText?.slice(0, 100);
        errorEntries.push({ run: r._folder, model: getModelName(r), caseId: cr.caseId || cr.scenarioId, verdict: cr.verdict, error: errorMsg || '-' });
      }
    }
  }
  // Tool eval checks
  if (r.caseResults) {
    for (const cr of r.caseResults) {
      if (cr.trialResults) {
        for (const t of cr.trialResults) {
          if (t.verdict && t.verdict !== 'PASS') {
            errorEntries.push({ run: r._folder, model: getModelName(r), caseId: `${cr.scenarioId || cr.caseId} t${t.trial}`, verdict: t.verdict, error: t.summary || t.errorMessage || '-' });
          }
        }
      }
    }
  }
  // Mode comparison errors
  if (r.modeResults) {
    for (const m of r.modeResults) {
      for (const t of (m.trials || [])) {
        if (t.verdict && t.verdict !== 'PASS') {
          errorEntries.push({ run: r._folder, model: getModelName(r), caseId: `${t.scenarioId} t${t.trial}`, verdict: t.verdict, error: t.summary || t.errorMessage || '-' });
        }
      }
    }
  }
}

if (errorEntries.length > 0) {
  const errCounts = {};
  for (const e of errorEntries) {
    errCounts[e.verdict] = (errCounts[e.verdict] || 0) + 1;
  }
  sections.push(`
<h2>Error Analysis</h2>
<div class="cards">`);
  for (const [k, v] of Object.entries(errCounts).sort((a, b) => b[1] - a[1])) {
    sections.push(`<div class="card bad"><div class="card-num">${v}</div><div class="card-label">${k}</div></div>`);
  }
  sections.push(`</div>
<table>
  <tr><th>Run</th><th>Model</th><th>Case/Scenario</th><th>Verdict</th><th>Error Detail</th></tr>`);
  for (const e of errorEntries.slice(0, 50)) {
    sections.push(`<tr><td>${e.run}</td><td>${e.model}</td><td>${e.caseId}</td><td>${verdictBadge(e.verdict)}</td><td style="font-size:12px;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${e.error}">${e.error}</td></tr>`);
  }
  if (errorEntries.length > 50) {
    sections.push(`<tr><td colspan="5" style="text-align:center;color:#64748b">... and ${errorEntries.length - 50} more errors</td></tr>`);
  }
  sections.push(`</table>`);
}

// ========== 7. LATENCY ANALYSIS ==========
const latencyEntries = [];
for (const r of intentRuns) {
  if (isMockRun(r)) continue;
  for (const cr of (r.caseResults || [])) {
    if (cr.durationMs) {
      latencyEntries.push({ model: getModelName(r), run: r._folder, type: 'intent', durationMs: cr.durationMs, verdict: cr.verdict });
    }
  }
}
for (const r of toolRuns) {
  for (const cr of (r.caseResults || [])) {
    for (const t of (cr.trialResults || [])) {
      if (t.durationMs) {
        latencyEntries.push({ model: getModelName(r), run: r._folder, type: `tool-${cr.scenarioId}`, durationMs: t.durationMs, verdict: t.verdict });
      }
    }
  }
}
for (const r of modeRuns) {
  for (const m of (r.modeResults || [])) {
    for (const t of (m.trials || [])) {
      if (t.durationMs) {
        latencyEntries.push({ model: getModelName(r), run: r._folder, type: `mode-${t.scenarioId}`, durationMs: t.durationMs, verdict: t.verdict });
      }
    }
  }
}

if (latencyEntries.length > 0) {
  const byModel = {};
  for (const e of latencyEntries) {
    if (!byModel[e.model]) byModel[e.model] = [];
    byModel[e.model].push(e.durationMs);
  }
  sections.push(`
<h2>Latency Analysis</h2>
<div class="chart-container">
  <div class="bar-chart" style="grid-template-columns: repeat(${Object.keys(byModel).length}, 1fr);">`);
  for (const [model, durs] of Object.entries(byModel)) {
    const avg = durs.reduce((s, d) => s + d, 0) / durs.length;
    const max = Math.max(...durs);
    const h = Math.max(4, Math.min(300, avg / 100));
    sections.push(`
    <div class="bar-col">
      <div class="bar" style="height:${h}px;background:#3b82f6"><span class="bar-label">${fmtDuration(avg)}</span></div>
      <div class="bar-xt">${model.replace(' Local', '')}<br>${durs.length} samples</div>
    </div>`);
  }
  sections.push(`</div></div>

<table>
  <tr><th>Model</th><th>Avg Latency</th><th>Min</th><th>Max</th><th>Median</th><th>Samples</th></tr>`);
  for (const [model, durs] of Object.entries(byModel)) {
    durs.sort((a, b) => a - b);
    const avg = durs.reduce((s, d) => s + d, 0) / durs.length;
    const median = durs.length % 2 === 0 ? (durs[durs.length / 2 - 1] + durs[durs.length / 2]) / 2 : durs[Math.floor(durs.length / 2)];
    sections.push(`<tr>
      <td>${model}</td>
      <td class="num">${fmtDuration(avg)}</td>
      <td class="num">${fmtDuration(durs[0])}</td>
      <td class="num">${fmtDuration(durs[durs.length - 1])}</td>
      <td class="num">${fmtDuration(median)}</td>
      <td class="num">${durs.length}</td>
    </tr>`);
  }
  sections.push(`</table>`);
}

// ========== 8. ALL RUNS REFERENCE ==========
sections.push(`
<h2>All Runs Reference</h2>
<table>
  <tr><th>Folder</th><th>Type</th><th>Model</th><th>Date</th><th>Schema</th></tr>`);
for (const r of allRuns) {
  const type = classifyRun(r);
  const date = (r.startedAt || '').slice(0, 19).replace('T', ' ') || '-';
  sections.push(`<tr>
    <td>${r._folder}</td>
    <td>${type}</td>
    <td>${getModelName(r)}</td>
    <td>${date}</td>
    <td style="font-size:12px;color:#64748b">${r.schemaVersion || '-'}</td>
  </tr>`);
}
sections.push(`</table>`);

// ========== ASSEMBLE ==========
const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Benchmark Lab Report</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #e2e8f0; padding: 20px; }
  .container { max-width: 1200px; margin: 0 auto; }
  .hero { text-align: center; padding: 40px 20px; background: linear-gradient(135deg, #1e293b, #0f172a); border-radius: 12px; margin-bottom: 30px; border: 1px solid #334155; }
  .hero-title { font-size: 32px; font-weight: 800; color: #f8fafc; letter-spacing: -0.5px; }
  .hero-sub { color: #94a3b8; margin-top: 8px; font-size: 14px; }
  h2 { font-size: 22px; font-weight: 700; color: #f1f5f9; margin: 30px 0 16px; padding-bottom: 8px; border-bottom: 2px solid #334155; }
  h3 { font-size: 17px; font-weight: 600; color: #e2e8f0; margin: 24px 0 12px; }
  .subtitle { font-weight: 400; font-size: 14px; color: #94a3b8; }
  .desc { color: #94a3b8; font-size: 14px; margin-bottom: 12px; }
  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; margin-bottom: 20px; }
  .card { background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 16px; text-align: center; }
  .card.good { border-color: #166534; background: #052e16; }
  .card.bad { border-color: #7f1d1d; background: #2d0a0a; }
  .card-num { font-size: 28px; font-weight: 800; color: #f8fafc; }
  .card-label { font-size: 12px; color: #94a3b8; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px; }
  th { background: #1e293b; color: #94a3b8; font-weight: 600; text-align: left; padding: 10px 12px; border-bottom: 2px solid #334155; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
  td { padding: 8px 12px; border-bottom: 1px solid #1e293b; }
  tr:hover td { background: #1e293b; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .pass { color: #4ade80; font-weight: 600; }
  .fail { color: #f87171; font-weight: 600; }
  .warn { color: #fbbf24; font-weight: 600; }
  .err { color: #f472b6; font-weight: 600; }
  .chart-container { background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
  .bar-chart { display: grid; align-items: end; gap: 8px; min-height: 240px; }
  .bar-col { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 240px; }
  .bar { width: 100%; max-width: 80px; border-radius: 4px 4px 0 0; display: flex; align-items: flex-start; justify-content: center; padding-top: 4px; transition: height 0.3s; position: relative; margin-top: auto; }
  .bar-label { font-size: 11px; font-weight: 700; color: #f8fafc; }
  .bar-xt { font-size: 10px; color: #94a3b8; margin-top: 6px; text-align: center; line-height: 1.3; }
  @media (max-width: 600px) {
    body { padding: 10px; }
    .cards { grid-template-columns: repeat(2, 1fr); }
    table { font-size: 12px; }
    td, th { padding: 6px 8px; }
  }
</style>
</head>
<body>
<div class="container">
${sections.join('\n')}
</div>
</body>
</html>`;

const outDir = path.dirname(OUT_FILE);
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(OUT_FILE, html, 'utf-8');
console.log(`Report written to ${OUT_FILE}`);
