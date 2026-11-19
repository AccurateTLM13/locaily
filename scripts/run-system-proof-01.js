#!/usr/bin/env node
/**
 * SYSTEM-PROOF-01 Experiment Runner
 * Fixture: expressjs/express@7ef98448f8b38099ab1ded55e458538ad47a51e7
 *
 * Three conditions executed against identical underlying fixture:
 * - Condition A: Single-model monolithic baseline (llama3.2) without track decomposition
 * - Condition B: Decomposed same-model baseline (llama3.2 across Locaily tracks without routing)
 * - Condition C: Locaily multi-model orchestration (LFM2.5-1.2B qualified capabilities)
 * - Condition C-fail: Controlled capability failure to evaluate fallback and isolation
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');

const ROOT = path.resolve(__dirname, '..');
const cfg = require('../companion/config.json');
const { buildRunPlan, executeRunPlan } = require('../companion/orchestration');
const { createToolRegistry } = require('../companion/tools/registry');
const { createOllamaRuntime } = require('../companion/runtime/ollama');
const { validateResult } = require('../companion/core/result-validator');

const FIXTURE_PATH = path.join(ROOT, 'data', 'fixtures', 'sp01-express');
const OUT_DIR = path.join(ROOT, 'data', 'experiments', 'system-proof-01');
fs.mkdirSync(OUT_DIR, { recursive: true });

const HANDOFF_SCHEMA = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'companion', 'schemas', 'repo-review-handoff.schema.json'), 'utf8')
);

const BASELINE_MODEL = cfg.runtime.model || 'llama3.2';
const LOCAILY_PRIMARY_MODEL = cfg.modelRoles?.roles?.default_worker || 'hf.co/LiquidAI/LFM2.5-1.2B-Instruct-GGUF';
const LOCAILY_FALLBACK_MODEL = cfg.modelRoles?.roles?.fallback_worker || 'hf.co/LiquidAI/LFM2.5-350M-GGUF';

const KNOWN_GROUND_TRUTH = {
  totalFiles: 214,
  totalLines: 26984,
  keyOversizedFiles: [
    'History.md',
    'test/app.router.js',
    'lib/response.js',
    'test/res.sendFile.js',
    'test/express.urlencoded.js',
    'test/express.static.js'
  ]
};

function createRuntime(model) {
  return createOllamaRuntime({
    baseUrl: cfg.runtime.baseUrl || 'http://127.0.0.1:11434',
    model
  });
}

function loadQualificationRecords() {
  const qualDir = path.join(ROOT, 'benchmark-lab', 'qualifications', 'models');
  const records = {};
  if (!fs.existsSync(qualDir)) return records;
  for (const file of fs.readdirSync(qualDir)) {
    if (!file.endsWith('.json') || file === 'README.md') continue;
    try {
      const rec = JSON.parse(fs.readFileSync(path.join(qualDir, file), 'utf8'));
      if (rec.recordId) {
        records[rec.recordId] = rec;
      }
      if (rec.subject && rec.subject.runtimeModelName) {
        for (const q of (rec.qualifiedFor || [])) {
          records[`${rec.subject.runtimeModelName}:${q.role}`] = rec;
          records[`${rec.subject.id}:${q.role}`] = rec;
          records[`${rec.subject.runtimeModelName}:${q.trackId}`] = rec;
          records[`${rec.subject.id}:${q.trackId}`] = rec;
        }
      }
    } catch {}
  }
  return records;
}

function scoreOutput(handoff, rawText = '') {
  if (!handoff || typeof handoff !== 'object') {
    return {
      structuredOutputCompliance: false,
      validationErrors: ['Output is not an object or null'],
      factualAccuracy: 0,
      usefulFindingsCount: 0,
      unsupportedFindingsCount: 0,
      completenessScore: 0,
      verifiedFacts: []
    };
  }

  // Schema validation
  const validation = validateResult(handoff, HANDOFF_SCHEMA);
  const structuredOutputCompliance = validation.ok;
  const validationErrors = validation.errors || [];

  // Factual checks
  const serialized = JSON.stringify(handoff).toLowerCase() + ' ' + (handoff.markdown || '').toLowerCase() + ' ' + rawText.toLowerCase();
  const verifiedFacts = [];
  let factScore = 0;

  if (serialized.includes('214') || serialized.includes('214 files')) {
    verifiedFacts.push('Preserved total file count (214)');
    factScore += 20;
  }
  if (serialized.includes('26984') || serialized.includes('26,984') || serialized.includes('27000') || serialized.includes('~27k')) {
    verifiedFacts.push('Preserved line count (~26984)');
    factScore += 20;
  }

  let recognizedFiles = 0;
  for (const f of KNOWN_GROUND_TRUTH.keyOversizedFiles) {
    if (serialized.includes(f.toLowerCase())) {
      recognizedFiles++;
    }
  }
  factScore += Math.round((recognizedFiles / KNOWN_GROUND_TRUTH.keyOversizedFiles.length) * 40);
  if (recognizedFiles > 0) {
    verifiedFacts.push(`Recognized ${recognizedFiles}/${KNOWN_GROUND_TRUTH.keyOversizedFiles.length} key ground-truth files`);
  }

  // Useful findings count
  let usefulCount = 0;
  let unsupportedCount = 0;
  const priorities = Array.isArray(handoff.priorities) ? handoff.priorities : [];
  for (const p of priorities) {
    const title = (p.title || '').toLowerCase();
    const id = (p.id || '').toLowerCase();
    const matchedKnown = KNOWN_GROUND_TRUTH.keyOversizedFiles.some(kf => 
      title.includes(kf.toLowerCase()) || id.includes(kf.toLowerCase())
    );
    if (matchedKnown || title.includes('oversized') || title.includes('maintainability') || title.includes('test')) {
      usefulCount++;
    } else {
      unsupportedCount++;
    }
  }

  // If no priorities array, count from markdown sections
  if (priorities.length === 0 && Array.isArray(handoff.sections)) {
    for (const sec of handoff.sections) {
      usefulCount += (sec.items || []).length;
    }
  }

  // Completeness score
  let completenessScore = 0;
  if (handoff.headline || handoff.title) completenessScore += 25;
  if (priorities.length > 0) completenessScore += 25;
  if (Array.isArray(handoff.sections) && handoff.sections.length > 0) completenessScore += 25;
  if (handoff.markdown && handoff.markdown.length > 100) completenessScore += 25;

  if (completenessScore >= 75) factScore += 20;

  return {
    structuredOutputCompliance,
    validationErrors,
    factualAccuracy: Math.min(100, factScore),
    usefulFindingsCount: usefulCount,
    unsupportedFindingsCount: unsupportedCount,
    completenessScore,
    verifiedFacts
  };
}

/**
 * CONDITION A: Single-model monolithic baseline
 * Sends the complete review task directly to llama3.2 without track decomposition.
 */
async function runConditionA(toolRegistry, qualRecords) {
  console.log('\n============================================================');
  console.log('CONDITION A: Single-Model Monolithic Baseline (llama3.2)');
  console.log('Task: Complete repo review in a single un-decomposed model call');
  console.log('============================================================');

  // Obtain deterministic scan to supply identical input
  const scanTool = toolRegistry.get('repo-scan');
  const scanResult = await scanTool.handle({ task: 'scan', input: { path: FIXTURE_PATH } });

  const prompt = [
    'You are a senior software reviewer. Perform a complete repository review for this repository based on the scan summary below.',
    'Produce a developer handoff report conforming to the required JSON schema.',
    '',
    'Repository Scan:',
    scanResult.summary_text,
    '',
    'Findings:',
    JSON.stringify(scanResult.findings, null, 2),
    '',
    'Required schema:',
    JSON.stringify(HANDOFF_SCHEMA, null, 2),
    '',
    'Respond with JSON only adhering strictly to the schema above.'
  ].join('\n');

  const runtime = createRuntime(BASELINE_MODEL);
  const t0 = performance.now();
  let rawResponse = null;
  let parsedJson = null;
  let error = null;

  try {
    parsedJson = await runtime.generateJson(prompt, HANDOFF_SCHEMA, {
      temperature: 0.2
    });
  } catch (err) {
    error = err.message;
    console.error('Condition A generateJson error:', err.message);
  }
  const wallMs = Math.round(performance.now() - t0);

  const scores = scoreOutput(parsedJson, JSON.stringify(parsedJson || {}));

  console.log('Condition A Completed in:', wallMs, 'ms');
  console.log('Structured Compliance:', scores.structuredOutputCompliance);
  console.log('Factual Accuracy Score:', scores.factualAccuracy + '%');
  console.log('Useful Findings:', scores.usefulFindingsCount);
  console.log('Unsupported Findings:', scores.unsupportedFindingsCount);

  return {
    id: 'A',
    label: 'Single-model monolithic baseline (llama3.2)',
    model: BASELINE_MODEL,
    wallMs,
    error,
    retries: 0,
    steps: [
      { step: 'monolithic_repo_review', model: BASELINE_MODEL, role: 'monolithic_reviewer', status: error ? 'failed' : 'completed' }
    ],
    scores,
    output: parsedJson
  };
}

/**
 * CONDITION B: Decomposed same-model baseline
 * Executes Locaily tracks in sequence, but forcing all model steps to llama3.2 (no multi-model routing).
 */
async function runConditionB(toolRegistry, qualRecords) {
  console.log('\n============================================================');
  console.log('CONDITION B: Decomposed Same-Model Baseline (llama3.2)');
  console.log('Task: Locaily repo_review workflow tracks with llama3.2 everywhere');
  console.log('============================================================');

  const plan = buildRunPlan({ workflowId: 'repo_review', input: { path: FIXTURE_PATH } });
  const runtime = createRuntime(BASELINE_MODEL);

  const options = {
    model: BASELINE_MODEL,
    resolveModelForRole: () => ({ ok: true, model: BASELINE_MODEL }),
    getModelQualificationEvidence: () => null
  };

  const t0 = performance.now();
  let execResult = null;
  let error = null;

  try {
    execResult = await executeRunPlan({
      plan,
      runtime,
      toolRegistry,
      options,
      meta: { source: 'sp01-condition-b' }
    });
  } catch (err) {
    error = err.message;
    console.error('Condition B executeRunPlan error:', err.message);
  }
  const wallMs = Math.round(performance.now() - t0);

  const finalOutput = execResult?.result?.final || execResult?.result?.handoff || null;
  const scores = scoreOutput(finalOutput);

  const steps = [];
  let retries = 0;
  for (const track of (execResult?.plan?.tracks || [])) {
    for (const step of (track.steps || [])) {
      const wu = step.worker_used || {};
      steps.push({
        track: track.as,
        step: step.id,
        status: step.status,
        model: wu.model || 'deterministic_tool',
        role: wu.role || null,
        fallback: wu.fallback || false
      });
      if (wu.fallback) retries++;
    }
  }

  console.log('Condition B Completed in:', wallMs, 'ms');
  console.log('Plan Status:', execResult?.plan?.status || 'failed');
  console.log('Structured Compliance:', scores.structuredOutputCompliance);
  console.log('Factual Accuracy Score:', scores.factualAccuracy + '%');
  console.log('Useful Findings:', scores.usefulFindingsCount);

  return {
    id: 'B',
    label: 'Decomposed same-model baseline (llama3.2)',
    model: BASELINE_MODEL,
    wallMs,
    error,
    retries,
    planStatus: execResult?.plan?.status || 'failed',
    steps,
    scores,
    output: finalOutput
  };
}

/**
 * CONDITION C: Locaily Multi-Model Qualification & Routing
 * Locaily orchestrated execution with qualification and routing selecting qualified capabilities.
 */
async function runConditionC(toolRegistry, qualRecords) {
  console.log('\n============================================================');
  console.log('CONDITION C: Locaily Multi-Model Qualification & Routing');
  console.log('Task: Qualified capability routing with LFM2.5-1.2B-Instruct');
  console.log('============================================================');

  const plan = buildRunPlan({ workflowId: 'repo_review', input: { path: FIXTURE_PATH } });
  const runtime = createRuntime(LOCAILY_PRIMARY_MODEL);

  const options = {
    model: LOCAILY_PRIMARY_MODEL,
    fallbackModel: LOCAILY_FALLBACK_MODEL,
    resolveModelForRole: (role) => {
      const model = cfg.modelRoles?.roles?.[role] || LOCAILY_PRIMARY_MODEL;
      return { ok: true, model };
    },
    getModelQualificationEvidence: ({ model, role, trackId }) => {
      return qualRecords[`${model}:${role}`] || qualRecords[`${model}:${trackId}`] || null;
    }
  };

  const t0 = performance.now();
  let execResult = null;
  let error = null;

  try {
    execResult = await executeRunPlan({
      plan,
      runtime,
      toolRegistry,
      options,
      recordOpts: { enabled: true },
      meta: { source: 'sp01-condition-c' }
    });
  } catch (err) {
    error = err.message;
    console.error('Condition C executeRunPlan error:', err.message);
  }
  const wallMs = Math.round(performance.now() - t0);

  const finalOutput = execResult?.result?.final || execResult?.result?.handoff || null;
  const scores = scoreOutput(finalOutput);

  const steps = [];
  let retries = 0;
  for (const track of (execResult?.plan?.tracks || [])) {
    for (const step of (track.steps || [])) {
      const wu = step.worker_used || {};
      steps.push({
        track: track.as,
        step: step.id,
        status: step.status,
        model: wu.model || 'deterministic_tool',
        role: wu.role || null,
        fallback: wu.fallback || false,
        qualRecordId: wu.qualification?.recordId || null
      });
      if (wu.fallback) retries++;
    }
  }

  console.log('Condition C Completed in:', wallMs, 'ms');
  console.log('Plan Status:', execResult?.plan?.status || 'failed');
  console.log('Structured Compliance:', scores.structuredOutputCompliance);
  console.log('Factual Accuracy Score:', scores.factualAccuracy + '%');
  console.log('Useful Findings:', scores.usefulFindingsCount);

  return {
    id: 'C',
    label: 'Locaily multi-model orchestration (LFM2.5-1.2B qualified)',
    model: LOCAILY_PRIMARY_MODEL,
    wallMs,
    error,
    retries,
    planStatus: execResult?.plan?.status || 'failed',
    steps,
    scores,
    output: finalOutput,
    evidenceRecorded: !!execResult?.evidence
  };
}

/**
 * CONDITION C-FAIL: Controlled Capability Failure Test
 * Evaluates fallback behavior and track failure isolation under injected error.
 */
async function runConditionCFail(toolRegistry, qualRecords) {
  console.log('\n============================================================');
  console.log('CONDITION C-FAIL: Controlled Capability Failure & Isolation');
  console.log('Task: Simulate MODEL_TIMEOUT on primary model step');
  console.log('============================================================');

  const baseRuntime = createRuntime(LOCAILY_PRIMARY_MODEL);

  // Fault-injected runtime: fail the first model generation call
  let failInjected = false;
  const faultRuntime = {
    ...baseRuntime,
    generateJson: async (prompt, schema, opts) => {
      if (!failInjected) {
        failInjected = true;
        console.log('[Fault Injection] Injected MODEL_TIMEOUT on primary model call.');
        const timeoutError = new Error('Simulated MODEL_TIMEOUT: primary worker failed to respond within 3000ms');
        timeoutError.code = 'MODEL_TIMEOUT';
        throw timeoutError;
      }
      return baseRuntime.generateJson(prompt, schema, opts);
    }
  };

  const plan = buildRunPlan({ workflowId: 'repo_review', input: { path: FIXTURE_PATH } });

  const options = {
    model: LOCAILY_PRIMARY_MODEL,
    fallbackModel: LOCAILY_FALLBACK_MODEL,
    resolveModelForRole: (role) => ({ ok: true, model: LOCAILY_PRIMARY_MODEL }),
    getModelQualificationEvidence: ({ model, role, trackId }) => {
      return qualRecords[`${model}:${role}`] || qualRecords[`${model}:${trackId}`] || null;
    }
  };

  const t0 = performance.now();
  let execResult = null;
  let threwUnhandled = false;
  let unhandledError = null;

  try {
    execResult = await executeRunPlan({
      plan,
      runtime: faultRuntime,
      toolRegistry,
      options,
      recordOpts: { enabled: true },
      meta: { source: 'sp01-c-fail' }
    });
  } catch (err) {
    threwUnhandled = true;
    unhandledError = err.message;
    console.log('Plan execution threw:', err.message);
  }
  const wallMs = Math.round(performance.now() - t0);

  const finalOutput = execResult?.result?.final || execResult?.result?.handoff || null;
  const failureIsolated = !threwUnhandled && execResult?.plan?.status !== 'unrecoverable-failure';
  const recoveryUsable = !!finalOutput && !!finalOutput.markdown;
  const scores = scoreOutput(finalOutput);

  console.log('Condition C-fail Completed in:', wallMs, 'ms');
  console.log('Failure Isolated (Contained):', failureIsolated);
  console.log('Recovery Usable (Partial Result):', recoveryUsable);
  console.log('Structured Compliance:', scores.structuredOutputCompliance);

  return {
    id: 'C-fail',
    label: 'Condition C with Controlled Capability Failure',
    wallMs,
    failureIsolated,
    recoveryUsable,
    threwUnhandled,
    unhandledError,
    planStatus: execResult?.plan?.status || 'failed',
    scores,
    output: finalOutput
  };
}

async function main() {
  console.log('############################################################');
  console.log('# Locaily SYSTEM-PROOF-01 Multi-Condition Proof Experiment');
  console.log('# Fixture: expressjs/express @ 7ef98448f8b38099ab1ded55e458538ad47a51e7');
  console.log('# Started:', new Date().toISOString());
  console.log('############################################################\n');

  const toolRegistry = createToolRegistry();
  const qualRecords = loadQualificationRecords();
  console.log(`Loaded ${Object.keys(qualRecords).length} qualification keys.`);

  const results = {};

  try {
    results.A = await runConditionA(toolRegistry, qualRecords);
  } catch (e) {
    console.error('Condition A Fatal:', e);
    results.A = { id: 'A', error: e.message };
  }

  try {
    results.B = await runConditionB(toolRegistry, qualRecords);
  } catch (e) {
    console.error('Condition B Fatal:', e);
    results.B = { id: 'B', error: e.message };
  }

  try {
    results.C = await runConditionC(toolRegistry, qualRecords);
  } catch (e) {
    console.error('Condition C Fatal:', e);
    results.C = { id: 'C', error: e.message };
  }

  try {
    results.CFail = await runConditionCFail(toolRegistry, qualRecords);
  } catch (e) {
    console.error('Condition C-fail Fatal:', e);
    results.CFail = { id: 'C-fail', error: e.message };
  }

  // Save raw results
  const rawResultsPath = path.join(OUT_DIR, 'raw-results.json');
  fs.writeFileSync(rawResultsPath, JSON.stringify(results, null, 2), 'utf8');
  console.log('\n>>> All experimental conditions finished.');
  console.log(`>>> Raw results saved to: ${rawResultsPath}`);

  // Summary Table
  console.log('\n============================================================');
  console.log('EXPERIMENT COMPARISON SUMMARY:');
  console.log('============================================================');
  console.table({
    'Condition A (Monolithic 3.2B)': {
      Model: results.A?.model || 'llama3.2',
      DurationMs: results.A?.wallMs,
      SchemaCompliant: results.A?.scores?.structuredOutputCompliance,
      FactualAccuracy: results.A?.scores?.factualAccuracy + '%',
      UsefulFindings: results.A?.scores?.usefulFindingsCount,
      UnsupportedFindings: results.A?.scores?.unsupportedFindingsCount
    },
    'Condition B (Decomposed 3.2B)': {
      Model: results.B?.model || 'llama3.2',
      DurationMs: results.B?.wallMs,
      SchemaCompliant: results.B?.scores?.structuredOutputCompliance,
      FactualAccuracy: results.B?.scores?.factualAccuracy + '%',
      UsefulFindings: results.B?.scores?.usefulFindingsCount,
      UnsupportedFindings: results.B?.scores?.unsupportedFindingsCount
    },
    'Condition C (Orchestrated 1.2B)': {
      Model: results.C?.model || 'LFM2.5-1.2B',
      DurationMs: results.C?.wallMs,
      SchemaCompliant: results.C?.scores?.structuredOutputCompliance,
      FactualAccuracy: results.C?.scores?.factualAccuracy + '%',
      UsefulFindings: results.C?.scores?.usefulFindingsCount,
      UnsupportedFindings: results.C?.scores?.unsupportedFindingsCount
    },
    'Condition C-Fail (Fault Injected)': {
      Model: 'LFM2.5-1.2B + Fail',
      DurationMs: results.CFail?.wallMs,
      SchemaCompliant: results.CFail?.scores?.structuredOutputCompliance,
      FactualAccuracy: results.CFail?.scores?.factualAccuracy + '%',
      UsefulFindings: results.CFail?.scores?.usefulFindingsCount,
      UnsupportedFindings: 'Isolated: ' + results.CFail?.failureIsolated
    }
  });

  return results;
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Fatal experiment error:', err);
    process.exit(1);
  });
}

module.exports = { main };
