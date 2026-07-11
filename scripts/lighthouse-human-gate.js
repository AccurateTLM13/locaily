#!/usr/bin/env node

const { mkdir, writeFile } = require("node:fs/promises");
const { join } = require("node:path");
const { inspect } = require("node:util");
const { listAllRecords } = require("../companion/evidence/track-run-record-store");
const {
  buildQualitySummary,
  buildReviewRecord,
  upsertReview
} = require("../companion/evidence/human-review-record-store");

const TRACK_ID = "website_audit.lighthouse_handoff";
const ROLE_ID = "priority_helper";
const TASK_WRITER_ROLE_ID = "developer_task_writer";
const GUARDRAIL_WRITER_ROLE_ID = "guardrail_writer";
const TESTING_CHECKLIST_WRITER_ROLE_ID = "testing_checklist_writer";
const EXECUTED_CAPABILITY_ID = "lfm25-1p2b-thinking-local";
const REVIEWER = "lighthouse-human-gate:draft";
const APPROVER = "lighthouse-human-gate:auto-pass";
const REVIEW_DIR = join(__dirname, "..", "benchmark-lab", "evidence", "reviews");
const PACKET_MD = join(REVIEW_DIR, "lighthouse-human-gate-v1.md");
const PACKET_JSON = join(REVIEW_DIR, "lighthouse-human-gate-v1.json");
const PROPOSED_REVIEWS_JSON = join(REVIEW_DIR, "lighthouse-human-gate-proposed-reviews-v1.json");
const DECISION_JSON = join(REVIEW_DIR, "lighthouse-human-gate-decision-v1.json");
const FULL_HANDOFF_PACKET_MD = join(REVIEW_DIR, "lighthouse-human-gate-full-handoff-v1.md");
const FULL_HANDOFF_PACKET_JSON = join(REVIEW_DIR, "lighthouse-human-gate-full-handoff-v1.json");
const FULL_HANDOFF_PROPOSED_REVIEWS_JSON = join(REVIEW_DIR, "lighthouse-human-gate-full-handoff-proposed-reviews-v1.json");
const FULL_HANDOFF_DECISION_JSON = join(REVIEW_DIR, "lighthouse-human-gate-full-handoff-decision-v1.json");

async function main(argv = process.argv.slice(2)) {
  const flags = parseFlags(argv);
  const records = await listAllRecords();
  const selection = selectCandidateRuns(records, flags);
  const candidates = selection.records;
  const now = new Date();

  if (flags.artifact === "full-handoff") {
    return runFullHandoffGate({ candidates, selection, flags, records, now });
  }

  const proposals = candidates.map((record) => proposeReview(record, now));
  const proposedReviews = proposals.map((proposal) => proposal.review);
  const summary = buildGateSummary(proposals);
  summary.selection = selection.summary;
  const decision = buildDecision(summary);
  const artifacts = buildArtifacts({ proposals, summary, decision, now, flags });

  await writeArtifacts(artifacts);

  let approvedCount = 0;
  if (flags.approve_safe && !flags.dry_run) {
    approvedCount = await approveSafePasses(proposals);
  }

  console.log(`Lighthouse human gate packet written: ${PACKET_MD}`);
  console.log(`url_filter=${selection.summary.urlFilter || "-"}`);
  console.log(`include_fixtures=${selection.summary.includeFixtures}`);
  console.log(`matching_runs_before_limit=${selection.summary.matchingRunsBeforeLimit}`);
  if (selection.summary.shortfallMessage) console.log(`selection_warning=${selection.summary.shortfallMessage}`);
  console.log(`candidate_runs=${summary.totalCandidateRuns}`);
  console.log(`recommended_decision=${decision.recommendedDecision}`);
  console.log(`proposed_pass=${summary.proposedPass}`);
  console.log(`proposed_needs_edit=${summary.proposedNeedsEdit}`);
  console.log(`proposed_fail=${summary.proposedFail}`);
  console.log(`safe_reviews_written=${approvedCount}`);
  if (flags.dry_run) console.log("dry_run=true; no review records written");

  return { proposals, proposedReviews, summary, decision, approvedCount };
}

function parseFlags(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const eqIndex = token.indexOf("=");
    const key = token.slice(2, eqIndex === -1 ? undefined : eqIndex).replace(/-/g, "_");
    let value = eqIndex === -1 ? argv[i + 1] : token.slice(eqIndex + 1);

    if (eqIndex === -1 && (value === undefined || value.startsWith("--"))) {
      value = true;
    } else if (eqIndex === -1) {
      i++;
    }

    parsed[key] = value;
  }

  if (parsed.latest_only && parsed.latest_n !== undefined) {
    throw new Error("Use either --latest-only or --latest-n, not both.");
  }

  const artifact = parsed.artifact || "role-level";
  if (artifact !== "role-level" && artifact !== "full-handoff") {
    throw new Error("--artifact must be 'role-level' or 'full-handoff'.");
  }

  return {
    approve_safe: parsed.approve_safe === true,
    dry_run: parsed.dry_run === true,
    include_fixtures: parsed.include_fixtures === true,
    latest_only: parsed.latest_only === true,
    latest_n: parseLatestN(parsed.latest_n),
    url: normalizeUrlFilter(parsed.url),
    artifact
  };
}

function parseLatestN(value) {
  if (value === undefined || value === true) return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    throw new Error("--latest-n must be a positive integer.");
  }
  return number;
}

function normalizeUrlFilter(value) {
  if (value === undefined || value === true) return null;
  try {
    return normalizeUrl(value);
  } catch (error) {
    throw new Error(`Invalid --url value: ${error.message}`);
  }
}

function selectCandidateRuns(records, flags) {
  const allCandidates = findCandidateRuns(records)
    .map((record) => ({ record, url: extractRecordUrl(record) }))
    .filter(({ url }) => flags.include_fixtures || !isFixtureUrl(url))
    .filter(({ url }) => !flags.url || url === flags.url);

  const desiredCount = flags.latest_only ? 1 : flags.latest_n;
  const selected = desiredCount ? allCandidates.slice(0, desiredCount) : allCandidates;
  const shortfall = desiredCount && allCandidates.length < desiredCount;

  return {
    records: selected.map((item) => item.record),
    summary: {
      urlFilter: flags.url,
      includeFixtures: flags.include_fixtures,
      latestOnly: flags.latest_only,
      latestN: flags.latest_n,
      desiredRuns: desiredCount,
      matchingRunsBeforeLimit: allCandidates.length,
      selectedRuns: selected.length,
      excludedFixtures: flags.include_fixtures ? 0 : countExcludedFixtures(records),
      shortfallMessage: shortfall
        ? `Requested ${desiredCount} matching run(s), but only found ${allCandidates.length}.`
        : null
    }
  };
}

function findCandidateRuns(records) {
  return records
    .filter((record) => record.trackId === TRACK_ID)
    .filter((record) => !record.parentRunId)
    .map((record) => ({ record, modelChild: findEnforcedModelChild(record) }))
    .filter(({ record, modelChild }) => {
      const decision = modelChild?.routing?.enforcementDecision;
      return modelChild
        && modelChild.execution?.modelInfo?.role === ROLE_ID
        && decision?.applied === true
        && decision?.executedCapabilityId === EXECUTED_CAPABILITY_ID
        && decision?.fallbackTriggered === false
        && modelChild.execution?.fallbackUsed === false
        && record.execution?.fallbackUsed === false;
    })
    .map(({ record }) => record);
}

function findEnforcedModelChild(record) {
  const children = Array.isArray(record.childRuns) ? record.childRuns : [];
  return children.find((child) => child.routing?.executorType === "model" && child.routing?.enforcementDecision?.applied === true)
    || children.find((child) => child.routing?.enforcementDecision?.applied === true)
    || null;
}

function extractRecordUrl(record) {
  const parseChild = findChild(record, "lighthouse.parse");
  const text = [
    record.request?.inputSummary,
    record.output?.outputSummary,
    parseChild?.output?.outputSummary
  ].filter(Boolean).join(" ");
  const match = text.match(/url="([^"]+)"/) || text.match(/url:string\(([^)]+)\)/);
  return match ? normalizeUrl(match[1]) : null;
}

function normalizeUrl(value) {
  const parsed = new URL(String(value).trim());
  parsed.hash = "";
  parsed.search = "";
  parsed.hostname = parsed.hostname.toLowerCase();
  if (parsed.pathname !== "/" && parsed.pathname.endsWith("/")) {
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  }
  return parsed.toString();
}

function isFixtureUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.hostname === "example.com" || parsed.hostname.endsWith(".example.com");
  } catch {
    return false;
  }
}

function countExcludedFixtures(records) {
  return findCandidateRuns(records)
    .map((record) => extractRecordUrl(record))
    .filter(isFixtureUrl)
    .length;
}

function proposeReview(record, now = new Date()) {
  const modelChild = findEnforcedModelChild(record);
  const taskWriterChild = findTaskWriterChild(record);
  const guardrailWriterChild = findGuardrailWriterChild(record);
  const testingChecklistWriterChild = findTestingChecklistWriterChild(record);
  const composeChild = findChild(record, "lighthouse-handoff");
  const parseChild = findChild(record, "lighthouse.parse");
  const classifyChild = findChild(record, "lighthouse.classify_audits");
  const validateChild = findChild(record, "lighthouse.validate_priority_fixes");
  const verifyChild = findChild(record, "lighthouse.verify_handoff");
  const outputSummary = compact(record.output?.outputSummary);
  const modelOutputSummary = compact(modelChild?.output?.outputSummary);
  const guardrailOutputSummary = compact(guardrailWriterChild?.output?.outputSummary);
  const testingChecklistOutputSummary = compact(testingChecklistWriterChild?.output?.outputSummary);
  const combinedOutput = [
    outputSummary,
    modelOutputSummary,
    guardrailOutputSummary,
    testingChecklistOutputSummary,
    compact(composeChild?.output?.outputSummary),
    compact(validateChild?.output?.outputSummary),
    compact(verifyChild?.output?.outputSummary)
  ].filter(Boolean).join(" | ");

  const signals = evaluateSignals({
    record,
    modelChild,
    taskWriterChild,
    guardrailWriterChild,
    testingChecklistWriterChild,
    parseChild,
    classifyChild,
    validateChild,
    combinedOutput,
    outputSummary,
    modelOutputSummary
  });
  const body = bodyFromSignals(signals);
  const review = buildReviewRecord({ trackRun: record, body, now });

  return {
    record,
    trackRunId: record.recordId,
    trackId: record.trackId,
    createdAt: record.timestamps?.createdAt || null,
    inputSummary: record.request?.inputSummary || parseChild?.output?.outputSummary || "",
    auditSummary: [parseChild?.output?.outputSummary, classifyChild?.output?.outputSummary].filter(Boolean).join(" | "),
    modelOutputSummary,
    taskWriterOutputSummary: compact(taskWriterChild?.output?.outputSummary),
    guardrailWriterOutputSummary: guardrailOutputSummary,
    testingChecklistWriterOutputSummary: testingChecklistOutputSummary,
    finalOutputSummary: outputSummary,
    proposedReview: review,
    review,
    reasoning: signals.reasoning,
    humanAction: humanActionFor(review),
    safeAutoApprovalEligible: isSafeAutoApproval(review),
    evidence: {
      modelStepRecordId: modelChild?.recordId || null,
      taskWriterStepRecordId: taskWriterChild?.recordId || null,
      guardrailWriterStepRecordId: guardrailWriterChild?.recordId || null,
      testingChecklistWriterStepRecordId: testingChecklistWriterChild?.recordId || null,
      parseSummary: parseChild?.output?.outputSummary || "",
      classifySummary: classifyChild?.output?.outputSummary || "",
      validateSummary: validateChild?.output?.outputSummary || "",
      verifySummary: verifyChild?.output?.outputSummary || ""
    }
  };
}

function findTaskWriterChild(record) {
  const children = Array.isArray(record.childRuns) ? record.childRuns : [];
  return children.find((child) => child.execution?.modelInfo?.role === TASK_WRITER_ROLE_ID)
    || null;
}

function findGuardrailWriterChild(record) {
  const children = Array.isArray(record.childRuns) ? record.childRuns : [];
  return children.find((child) => child.execution?.modelInfo?.role === GUARDRAIL_WRITER_ROLE_ID)
    || null;
}

function findTestingChecklistWriterChild(record) {
  const children = Array.isArray(record.childRuns) ? record.childRuns : [];
  return children.find((child) => child.execution?.modelInfo?.role === TESTING_CHECKLIST_WRITER_ROLE_ID)
    || null;
}

function findChild(record, capabilityId) {
  const children = Array.isArray(record.childRuns) ? record.childRuns : [];
  return children.find((child) => child.routing?.capabilityId === capabilityId || child.execution?.toolInfo?.toolId === capabilityId) || null;
}

function evaluateSignals(context) {
  const {
    record,
    modelChild,
    taskWriterChild,
    guardrailWriterChild,
    testingChecklistWriterChild,
    parseChild,
    classifyChild,
    validateChild,
    combinedOutput,
    outputSummary,
    modelOutputSummary
  } = context;
  const riskFlags = [];
  const failureReasons = [];
  const reasoning = [];
  let verdict = "pass";
  let usefulnessScore = 4;
  let accuracyScore = 4;
  let structureScore = 4;
  let clarityScore = 4;
  let riskScore = 1;
  let correctionText = "";

  if (!modelChild || !modelOutputSummary || !outputSummary) {
    verdict = "fail";
    riskScore = 4;
    usefulnessScore = 1;
    accuracyScore = 1;
    structureScore = 1;
    clarityScore = 1;
    riskFlags.push("missing_output", "critical");
    failureReasons.push("missing_model_output");
    reasoning.push("Model or final output summary is missing.");
  }

  if (record.output?.structuredOutputValid === false || record.validation?.status === "failed") {
    verdict = "fail";
    riskScore = Math.max(riskScore, 4);
    riskFlags.push("malformed_output", "critical");
    failureReasons.push("malformed_or_schema_invalid");
    reasoning.push("Track output failed schema or validation checks.");
  }

  const taskWriterSummary = String(taskWriterChild?.output?.outputSummary || "");
  const taskPacketSummary = String(record.output?.outputSummary || "");
  const taskCounts = parseTaskWriterCounts(`${taskWriterSummary}, ${taskPacketSummary}`);

  if (!taskWriterChild || !taskWriterSummary) {
    verdict = "fail";
    riskScore = Math.max(riskScore, 4);
    usefulnessScore = Math.min(usefulnessScore, 1);
    structureScore = Math.min(structureScore, 1);
    riskFlags.push("missing_task_writer_output", "critical");
    failureReasons.push("missing_developer_task_writer_output");
    reasoning.push("Developer task writer output is missing.");
  } else if (taskCounts.developerTasks < 1 || taskCounts.acceptanceCriteria < 1 || taskCounts.guardrails < 1 || taskCounts.testingChecklist < 1) {
    verdict = verdict === "fail" ? "fail" : "needs_edit";
    riskScore = Math.max(riskScore, 3);
    usefulnessScore = Math.min(usefulnessScore, 3);
    structureScore = Math.min(structureScore, 2);
    riskFlags.push("incomplete_task_packet");
    failureReasons.push("missing_tasks_guardrails_or_tests");
    reasoning.push(`Developer task packet is incomplete: tasks=${taskCounts.developerTasks}, acceptanceCriteria=${taskCounts.acceptanceCriteria}, guardrails=${taskCounts.guardrails}, testingChecklist=${taskCounts.testingChecklist}.`);
    correctionText = "Add specific developer tasks, acceptance criteria, guardrails, and actionable testing checklist items grounded in the supplied Lighthouse priorities.";
  } else {
    reasoning.push(`Developer task packet is structurally complete: tasks=${taskCounts.developerTasks}, acceptanceCriteria=${taskCounts.acceptanceCriteria}, guardrails=${taskCounts.guardrails}, testingChecklist=${taskCounts.testingChecklist}.`);
  }

  const guardrailSummary = String(guardrailWriterChild?.output?.outputSummary || "");
  if (!guardrailWriterChild || !guardrailSummary) {
    verdict = verdict === "fail" ? "fail" : "needs_edit";
    riskScore = Math.max(riskScore, 3);
    usefulnessScore = Math.min(usefulnessScore, 3);
    structureScore = Math.min(structureScore, 2);
    riskFlags.push("missing_guardrail_writer_output");
    failureReasons.push("missing_guardrail_writer_output");
    reasoning.push("Guardrail writer output is missing.");
    correctionText = "Add guardrail writer step to produce implementation guardrails, constraints, and verification boundaries.";
  } else {
    const gwCounts = parseGuardrailWriterCounts(guardrailSummary);
    if (gwCounts.implementationGuardrails < 1 || gwCounts.doNotBreakConstraints < 1 || gwCounts.riskNotes < 1 || gwCounts.verificationBoundaries < 1) {
      verdict = verdict === "fail" ? "fail" : "needs_edit";
      riskScore = Math.max(riskScore, 3);
      usefulnessScore = Math.min(usefulnessScore, 3);
      structureScore = Math.min(structureScore, 2);
      riskFlags.push("incomplete_guardrail_packet");
      failureReasons.push("missing_guardrails_constraints_or_verification");
      reasoning.push(`Guardrail packet is incomplete: impl=${gwCounts.implementationGuardrails}, constraints=${gwCounts.doNotBreakConstraints}, triggers=${gwCounts.humanReviewTriggers}, risks=${gwCounts.riskNotes}, verification=${gwCounts.verificationBoundaries}.`);
      correctionText = "Add implementation guardrails, do-not-break constraints, risk notes, and verification boundaries grounded in supplied Lighthouse data.";
    } else {
      reasoning.push(`Guardrail packet is structurally complete: impl=${gwCounts.implementationGuardrails}, constraints=${gwCounts.doNotBreakConstraints}, triggers=${gwCounts.humanReviewTriggers}, risks=${gwCounts.riskNotes}, verification=${gwCounts.verificationBoundaries}.`);
    }
  }

  const testingChecklistSummary = String(testingChecklistWriterChild?.output?.outputSummary || "");
  if (!testingChecklistWriterChild || !testingChecklistSummary) {
    verdict = verdict === "fail" ? "fail" : "needs_edit";
    riskScore = Math.max(riskScore, 3);
    usefulnessScore = Math.min(usefulnessScore, 3);
    structureScore = Math.min(structureScore, 2);
    riskFlags.push("missing_testing_checklist_writer_output");
    failureReasons.push("missing_testing_checklist_writer_output");
    reasoning.push("Testing checklist writer output is missing.");
    correctionText = "Add testing checklist writer step to produce rerun steps, before/after comparisons, regression checks, manual QA notes, coding agent verification, and stop-and-ask triggers.";
  } else {
    const tcCounts = parseTestingChecklistWriterCounts(testingChecklistSummary);
    if (tcCounts.pageSpeedRerunSteps < 1 || tcCounts.beforeAfterComparisons < 1 || tcCounts.regressionChecks < 1 || tcCounts.manualQaNotes < 1 || tcCounts.codingAgentVerification < 1) {
      verdict = verdict === "fail" ? "fail" : "needs_edit";
      riskScore = Math.max(riskScore, 3);
      usefulnessScore = Math.min(usefulnessScore, 3);
      structureScore = Math.min(structureScore, 2);
      riskFlags.push("incomplete_testing_checklist_packet");
      failureReasons.push("missing_testing_checklist_fields");
      reasoning.push(`Testing checklist packet is incomplete: rerunSteps=${tcCounts.pageSpeedRerunSteps}, comparisons=${tcCounts.beforeAfterComparisons}, regression=${tcCounts.regressionChecks}, manualQA=${tcCounts.manualQaNotes}, agentVerification=${tcCounts.codingAgentVerification}, stopTriggers=${tcCounts.stopAndAskTriggers}.`);
      correctionText = "Add specific PageSpeed rerun steps, before/after comparisons, regression checks, manual QA notes, and coding agent verification instructions grounded in supplied Lighthouse data.";
    } else {
      reasoning.push(`Testing checklist packet is structurally complete: rerunSteps=${tcCounts.pageSpeedRerunSteps}, comparisons=${tcCounts.beforeAfterComparisons}, regression=${tcCounts.regressionChecks}, manualQA=${tcCounts.manualQaNotes}, agentVerification=${tcCounts.codingAgentVerification}, stopTriggers=${tcCounts.stopAndAskTriggers}.`);
    }
  }

  const inventedAuditIds = findInventedAuditIds(combinedOutput, allowedAuditText(parseChild, classifyChild, record));
  if (inventedAuditIds.length > 0) {
    verdict = "fail";
    riskScore = Math.max(riskScore, 4);
    accuracyScore = 1;
    riskFlags.push("invented_audit_id", "critical");
    failureReasons.push("invented_audit_ids");
    reasoning.push(`Output references audit ids not present in available input summaries: ${inventedAuditIds.join(", ")}.`);
  }

  const unsupportedClaims = findUnsupportedClaims(combinedOutput);
  if (unsupportedClaims.length > 0) {
    verdict = verdict === "fail" ? "fail" : "needs_edit";
    riskScore = Math.max(riskScore, 3);
    accuracyScore = Math.min(accuracyScore, 2);
    riskFlags.push("unsupported_claim");
    failureReasons.push("unsupported_implementation_claims");
    reasoning.push(`Output includes unsupported implementation claims: ${unsupportedClaims.join(", ")}.`);
    correctionText = "Remove unsupported implementation certainty and limit claims to supplied Lighthouse evidence.";
  }

  if (verdict === "pass" && outputLooksVague(combinedOutput)) {
    verdict = "needs_edit";
    usefulnessScore = 3;
    clarityScore = 3;
    riskScore = Math.max(riskScore, 2);
    failureReasons.push("vague_or_missing_guardrails");
    reasoning.push("Output is usable but too vague or missing explicit guardrails.");
    correctionText = "Add concrete evidence-grounded next steps and state that fixes require implementation verification.";
  }

  if (verdict === "pass") {
    reasoning.push("Output summary is present, structured, grounded in the available Lighthouse summaries, and has no heuristic risk flags.");
  }

  return {
    verdict,
    usefulnessScore,
    accuracyScore,
    structureScore,
    clarityScore,
    riskScore,
    riskFlags: dedupe(riskFlags),
    failureReasons: dedupe(failureReasons),
    reasoning,
    correctionText
  };
}

function allowedAuditText(parseChild, classifyChild, record) {
  return [
    record.request?.inputSummary,
    record.output?.outputSummary,
    parseChild?.output?.outputSummary,
    classifyChild?.output?.outputSummary
  ].filter(Boolean).join(" ");
}

function parseTaskWriterCounts(text) {
  return {
    developerTasks: extractCount(text, "developerTasks"),
    acceptanceCriteria: extractCount(text, "acceptanceCriteria"),
    guardrails: extractCount(text, "guardrails"),
    testingChecklist: extractCount(text, "testingChecklist")
  };
}

function parseTestingChecklistWriterCounts(text) {
  return {
    pageSpeedRerunSteps: extractCount(text, "pageSpeedRerunSteps"),
    beforeAfterComparisons: extractCount(text, "beforeAfterComparisons"),
    regressionChecks: extractCount(text, "regressionChecks"),
    manualQaNotes: extractCount(text, "manualQaNotes"),
    codingAgentVerification: extractCount(text, "codingAgentVerification"),
    stopAndAskTriggers: extractCount(text, "stopAndAskTriggers")
  };
}

function parseGuardrailWriterCounts(text) {
  return {
    implementationGuardrails: extractCount(text, "implementationGuardrails"),
    doNotBreakConstraints: extractCount(text, "doNotBreakConstraints"),
    humanReviewTriggers: extractCount(text, "humanReviewTriggers"),
    riskNotes: extractCount(text, "riskNotes"),
    verificationBoundaries: extractCount(text, "verificationBoundaries")
  };
}

function extractCount(text, key) {
  const match = String(text || "").match(new RegExp(`${key}\\[(\\d+)\\]`));
  return match ? Number(match[1]) : 0;
}

function findInventedAuditIds(outputText, allowedText) {
  const candidates = extractAuditIds(outputText);
  const allowed = new Set(extractAuditIds(allowedText));
  return candidates.filter((id) => !allowed.has(id));
}

function extractAuditIds(text) {
  const matches = String(text || "").match(/\b[a-z][a-z0-9]+(?:-[a-z0-9]+){1,}\b/g) || [];
  const ignore = new Set([
    "example-com",
    "enforced-canary",
    "deterministic-audit",
    "priority-helper",
    "lighthouse-handoff"
  ]);
  return dedupe(matches
    .map((value) => value.toLowerCase())
    .filter((value) => !ignore.has(value))
    .filter(isLikelyLighthouseAuditId));
}

function isLikelyLighthouseAuditId(value) {
  const auditTerms = [
    "aria",
    "blocking",
    "cache",
    "canonical",
    "cls",
    "contentful",
    "contrast",
    "css",
    "dom",
    "font",
    "image",
    "images",
    "javascript",
    "label",
    "lcp",
    "paint",
    "redirect",
    "robots",
    "target",
    "tbt",
    "unused",
    "viewport"
  ];
  return auditTerms.some((term) => value.includes(term));
}

function findUnsupportedClaims(text) {
  const checks = [
    { pattern: /\bguarantee[sd]?\b/i, label: "guarantee" },
    { pattern: /\bwill\s+(?:definitely\s+)?(?:fix|improve|raise|solve)\b/i, label: "certain_outcome" },
    { pattern: /\bproduction[- ]ready\b/i, label: "production_ready_claim" },
    { pattern: /\bno\s+need\s+to\s+(?:test|verify|measure)\b/i, label: "no_verification_needed" },
    { pattern: /\bconfirmed\s+root\s+cause\b/i, label: "confirmed_root_cause" }
  ];
  return checks.filter((check) => check.pattern.test(text || "")).map((check) => check.label);
}

function outputLooksVague(text) {
  const value = String(text || "");
  return value.length < 80
    || /priorityFixes\[0\]/.test(value)
    || /\bmock\b/i.test(value)
    || /\bmaybe\b|\bprobably\b|\bpossibly\b/i.test(value);
}

function bodyFromSignals(signals) {
  return {
    reviewer: REVIEWER,
    usefulnessScore: signals.usefulnessScore,
    accuracyScore: signals.accuracyScore,
    structureScore: signals.structureScore,
    clarityScore: signals.clarityScore,
    riskScore: signals.riskScore,
    riskFlags: signals.riskFlags,
    verdict: signals.verdict,
    correctionRequired: signals.verdict !== "pass",
    correctionText: signals.correctionText,
    reviewerNotes: `Deterministic draft review. ${signals.reasoning.join(" ")}`,
    failureReasons: signals.failureReasons
  };
}

function humanActionFor(review) {
  if (review.verdict === "pass" && isSafeAutoApproval(review)) return "quick approve";
  if (review.verdict === "needs_edit") return "review correction";
  return "human review required";
}

function isSafeAutoApproval(review) {
  return review.verdict === "pass"
    && review.correctionRequired === false
    && review.riskScore <= 1
    && Array.isArray(review.riskFlags)
    && review.riskFlags.length === 0;
}

async function runFullHandoffGate({ candidates, selection, flags, records, now }) {
  const proposals = candidates.map((record) => proposeFullHandoffReview(record, now));
  const proposedReviews = proposals.map((proposal) => proposal.review);
  const summary = buildGateSummary(proposals);
  summary.selection = selection.summary;
  const decision = buildFullHandoffDecision(summary);
  const artifacts = buildFullHandoffArtifacts({ proposals, summary, decision, now, flags });

  await mkdir(REVIEW_DIR, { recursive: true });
  await writeFile(FULL_HANDOFF_PACKET_MD, artifacts.markdown, "utf8");
  await writeFile(FULL_HANDOFF_PACKET_JSON, JSON.stringify(artifacts.packet, null, 2), "utf8");
  await writeFile(FULL_HANDOFF_PROPOSED_REVIEWS_JSON, JSON.stringify(artifacts.proposedReviews, null, 2), "utf8");
  await writeFile(FULL_HANDOFF_DECISION_JSON, JSON.stringify(artifacts.decision, null, 2), "utf8");

  let approvedCount = 0;
  if (flags.approve_safe && !flags.dry_run) {
    approvedCount = await approveSafePasses(proposals);
  }

  console.log(`Lighthouse full handoff gate packet written: ${FULL_HANDOFF_PACKET_MD}`);
  console.log(`url_filter=${selection.summary.urlFilter || "-"}`);
  console.log(`include_fixtures=${selection.summary.includeFixtures}`);
  console.log(`matching_runs_before_limit=${selection.summary.matchingRunsBeforeLimit}`);
  if (selection.summary.shortfallMessage) console.log(`selection_warning=${selection.summary.shortfallMessage}`);
  console.log(`candidate_runs=${summary.totalCandidateRuns}`);
  console.log(`recommended_decision=${decision.recommendedDecision}`);
  console.log(`proposed_pass=${summary.proposedPass}`);
  console.log(`proposed_needs_edit=${summary.proposedNeedsEdit}`);
  console.log(`proposed_fail=${summary.proposedFail}`);
  console.log(`safe_reviews_written=${approvedCount}`);
  if (flags.dry_run) console.log("dry_run=true; no review records written");

  return { proposals, proposedReviews, summary, decision, approvedCount };
}

function findComposeChild(record) {
  const children = Array.isArray(record.childRuns) ? record.childRuns : [];
  return children.find((child) => child.routing?.capabilityId === "lighthouse-handoff" || child.execution?.toolInfo?.toolId === "lighthouse-handoff") || null;
}

function findVerifyChild(record) {
  const children = Array.isArray(record.childRuns) ? record.childRuns : [];
  return children.find((child) => child.routing?.capabilityId === "lighthouse.verify_handoff" || child.execution?.toolInfo?.toolId === "lighthouse.verify_handoff") || null;
}

function proposeFullHandoffReview(record, now = new Date()) {
  const composeChild = findComposeChild(record);
  const verifyChild = findVerifyChild(record);
  const modelChild = findEnforcedModelChild(record);
  const taskWriterChild = findTaskWriterChild(record);
  const guardrailWriterChild = findGuardrailWriterChild(record);
  const testingChecklistWriterChild = findTestingChecklistWriterChild(record);
  const parseChild = findChild(record, "lighthouse.parse");

  const handoffOutput = composeChild?.output?.outputSummary || "";
  const verifyOutput = verifyChild?.output?.outputSummary || "";
  const modelOutputSummary = compact(modelChild?.output?.outputSummary);

  const signals = evaluateFullHandoffSignals({
    handoffOutput,
    verifyOutput,
    modelOutputSummary,
    parseChild,
    composeChild,
    modelChild,
    taskWriterChild,
    guardrailWriterChild,
    testingChecklistWriterChild,
    record
  });

  const body = bodyFromSignals(signals);
  const review = buildReviewRecord({ trackRun: record, body, now });

  return {
    record,
    trackRunId: record.recordId,
    trackId: record.trackId,
    createdAt: record.timestamps?.createdAt || null,
    proposedReview: review,
    review,
    reasoning: signals.reasoning,
    humanAction: humanActionFor(review),
    safeAutoApprovalEligible: isSafeAutoApproval(review),
    evidence: {
      modelStepRecordId: modelChild?.recordId || null,
      composeStepRecordId: composeChild?.recordId || null,
      verifyStepRecordId: verifyChild?.recordId || null
    }
  };
}

function evaluateFullHandoffSignals(context) {
  const {
    handoffOutput,
    verifyOutput,
    modelOutputSummary,
    parseChild,
    composeChild,
    modelChild,
    taskWriterChild,
    guardrailWriterChild,
    testingChecklistWriterChild,
    record
  } = context;

  const riskFlags = [];
  const failureReasons = [];
  const reasoning = [];
  let verdict = "pass";
  let usefulnessScore = 4;
  let accuracyScore = 4;
  let structureScore = 4;
  let clarityScore = 4;
  let riskScore = 1;
  let correctionText = "";

  const fullText = [handoffOutput, verifyOutput, modelOutputSummary].filter(Boolean).join(" ");
  const allowedText = [record.request?.inputSummary, record.output?.outputSummary, parseChild?.output?.outputSummary].filter(Boolean).join(" ");

  if (!composeChild || !handoffOutput) {
    verdict = "fail";
    riskScore = 4;
    usefulnessScore = 1;
    accuracyScore = 1;
    structureScore = 1;
    clarityScore = 1;
    riskFlags.push("missing_handoff_artifact", "critical");
    failureReasons.push("missing_composed_handoff");
    reasoning.push("No composed handoff artifact found for this track run.");
  }

  if (verdict !== "fail" && !handoffOutput.toLowerCase().includes("priority")) {
    verdict = "needs_edit";
    riskScore = Math.max(riskScore, 3);
    usefulnessScore = Math.min(usefulnessScore, 2);
    riskFlags.push("missing_priority_fixes");
    failureReasons.push("handoff_missing_priority_fixes");
    reasoning.push("Full handoff does not mention priority fixes.");
    correctionText = "Ensure the assembled handoff includes a Priority Fixes section referencing real Lighthouse audit IDs.";
  }

  if (verdict !== "fail" && !handoffOutput.toLowerCase().includes("developer task") && !handoffOutput.toLowerCase().includes("developer")) {
    verdict = verdict === "needs_edit" ? "needs_edit" : "needs_edit";
    riskScore = Math.max(riskScore, 3);
    usefulnessScore = Math.min(usefulnessScore, 2);
    riskFlags.push("missing_developer_tasks");
    failureReasons.push("handoff_missing_developer_tasks");
    reasoning.push("Full handoff does not contain developer tasks.");
    correctionText = "Ensure the assembled handoff includes Developer Tasks section grounded in Lighthouse priorities.";
  }

  if (verdict !== "fail" && !handoffOutput.toLowerCase().includes("guardrail")) {
    verdict = verdict === "needs_edit" ? "needs_edit" : "needs_edit";
    riskScore = Math.max(riskScore, 2);
    riskFlags.push("missing_guardrails");
    failureReasons.push("handoff_missing_guardrails");
    reasoning.push("Full handoff does not contain guardrails.");
  }

  if (verdict !== "fail" && !handoffOutput.toLowerCase().includes("rerun") && !handoffOutput.toLowerCase().includes("retest") && !handoffOutput.toLowerCase().includes("regression")) {
    verdict = verdict === "needs_edit" ? "needs_edit" : "needs_edit";
    riskScore = Math.max(riskScore, 2);
    riskFlags.push("missing_testing_checklist");
    failureReasons.push("handoff_missing_testing_checklist");
    reasoning.push("Full handoff does not contain testing/verification instructions.");
  }

  if (verdict !== "fail" && !handoffOutput.toLowerCase().includes("agent instruction") && !handoffOutput.toLowerCase().includes("cursor") && !handoffOutput.toLowerCase().includes("implement")) {
    verdict = verdict === "needs_edit" ? "needs_edit" : "needs_edit";
    riskFlags.push("missing_coding_agent_prompt");
    failureReasons.push("handoff_missing_agent_instructions");
    reasoning.push("Full handoff does not contain coding agent instructions.");
  }

  const inventedAuditIds = findInventedAuditIds(fullText, allowedText);
  if (inventedAuditIds.length > 0) {
    verdict = "fail";
    riskScore = Math.max(riskScore, 4);
    accuracyScore = 1;
    riskFlags.push("invented_audit_id", "critical");
    failureReasons.push("invented_audit_ids");
    reasoning.push(`Full handoff references audit ids not present in available input summaries: ${inventedAuditIds.join(", ")}.`);
  }

  const unsupportedClaims = findUnsupportedClaims(fullText);
  if (unsupportedClaims.length > 0) {
    verdict = verdict === "fail" ? "fail" : "needs_edit";
    riskScore = Math.max(riskScore, 3);
    accuracyScore = Math.min(accuracyScore, 2);
    riskFlags.push("unsupported_claim");
    failureReasons.push("unsupported_implementation_claims");
    reasoning.push(`Full handoff includes unsupported implementation claims: ${unsupportedClaims.join(", ")}.`);
  }

  if (verdict !== "fail" && outputLooksVague(fullText)) {
    verdict = "needs_edit";
    usefulnessScore = 3;
    clarityScore = 3;
    riskScore = Math.max(riskScore, 2);
    failureReasons.push("vague_handoff_content");
    reasoning.push("Full handoff content is too vague or lacks specific Lighthouse references.");
    correctionText = "Add concrete Lighthouse audit IDs, scores, and specific implementation steps to the handoff.";
  }

  if (verdict === "pass") {
    reasoning.push("Full handoff artifact is present, mentions all required sections, has no invented audit IDs or unsupported claims, and is specific enough for a coding agent.");
  }

  return {
    verdict,
    usefulnessScore,
    accuracyScore,
    structureScore,
    clarityScore,
    riskScore,
    riskFlags: dedupe(riskFlags),
    failureReasons: dedupe(failureReasons),
    reasoning,
    correctionText
  };
}

function buildFullHandoffDecision(summary) {
  let recommendedDecision = "continue";
  const reasons = [];

  if (summary.totalCandidateRuns === 0) {
    recommendedDecision = "suspend";
    reasons.push("No full-handoff candidate runs were found.");
  } else if (summary.criticalRiskCount > 0 || summary.proposedFail > 0) {
    recommendedDecision = "suspend";
    reasons.push("One or more full-handoff runs have fail verdicts or critical risk.");
  } else if (summary.proposedNeedsEdit > 0) {
    recommendedDecision = "narrow";
    reasons.push("Some full-handoff runs need correction before broadening.");
  } else if (summary.totalCandidateRuns >= 15 && summary.proposedPass === summary.totalCandidateRuns) {
    recommendedDecision = "broaden";
    reasons.push("All reviewed full-handoff runs are safe passes across a larger sample.");
  } else {
    reasons.push("All full-handoff runs are proposed safe passes; continue the pilot and collect more quality evidence.");
  }

  return {
    schemaVersion: "locaily.lighthouse_human_gate_decision.v1",
    recommendedDecision,
    reasons,
    generatedAt: new Date().toISOString()
  };
}

function buildFullHandoffArtifacts({ proposals, summary, decision, now, flags }) {
  const generatedAt = now.toISOString();
  const packet = {
    schemaVersion: "locaily.lighthouse_human_gate_packet.v1",
    generatedAt,
    trackId: TRACK_ID,
    mode: flags.approve_safe && !flags.dry_run ? "approve-safe" : "packet-only",
    artifact: "full-handoff",
    dryRun: flags.dry_run,
    filters: {
      url: flags.url,
      includeFixtures: flags.include_fixtures,
      latestOnly: flags.latest_only,
      latestN: flags.latest_n
    },
    files: {
      markdown: relativePath(FULL_HANDOFF_PACKET_MD),
      packetJson: relativePath(FULL_HANDOFF_PACKET_JSON),
      proposedReviews: relativePath(FULL_HANDOFF_PROPOSED_REVIEWS_JSON),
      decision: relativePath(FULL_HANDOFF_DECISION_JSON)
    },
    summary,
    decision,
    runs: proposals.map(toFullHandoffPacketRun)
  };

  return {
    markdown: renderFullHandoffMarkdown(packet, proposals),
    packet,
    proposedReviews: {
      schemaVersion: "locaily.lighthouse_human_gate_proposed_reviews.v1",
      generatedAt,
      reviewer: REVIEWER,
      reviews: proposals.map((proposal) => proposal.review)
    },
    decision
  };
}

function toFullHandoffPacketRun(proposal) {
  const review = proposal.review;
  return {
    trackRunId: proposal.trackRunId,
    createdAt: proposal.createdAt,
    proposedVerdict: review.verdict,
    scores: {
      usefulness: review.usefulnessScore,
      accuracy: review.accuracyScore,
      structure: review.structureScore,
      clarity: review.clarityScore,
      risk: review.riskScore
    },
    riskFlags: review.riskFlags,
    failureReasons: review.failureReasons,
    humanAction: proposal.humanAction,
    safeAutoApprovalEligible: proposal.safeAutoApprovalEligible,
    reasoning: proposal.reasoning,
    suggestedCorrection: review.correctionText
  };
}

function renderFullHandoffMarkdown(packet, proposals) {
  const attention = proposals.filter(requiresHumanAttention);
  const safePasses = proposals.filter((proposal) => proposal.safeAutoApprovalEligible);
  const lines = [];

  lines.push("# Lighthouse Full Handoff Gate Review Packet");
  lines.push("");
  lines.push("## Filters");
  lines.push(`- URL filter: ${packet.filters.url || "-"}`);
  lines.push(`- Include fixtures: ${packet.filters.includeFixtures}`);
  lines.push(`- Latest only: ${packet.filters.latestOnly}`);
  lines.push(`- Latest N: ${packet.filters.latestN || "-"}`);
  lines.push(`- Matching runs before limit: ${packet.summary.selection.matchingRunsBeforeLimit}`);
  lines.push(`- Selected runs: ${packet.summary.selection.selectedRuns}`);
  if (packet.summary.selection.shortfallMessage) {
    lines.push(`- Selection warning: ${packet.summary.selection.shortfallMessage}`);
  }
  lines.push("");
  lines.push("## Recommended Decision");
  lines.push(packet.decision.recommendedDecision);
  lines.push("");
  lines.push(packet.decision.reasons.map((reason) => `- ${reason}`).join("\n"));
  lines.push("");
  lines.push("## Summary");
  lines.push(`- Total candidate runs: ${packet.summary.totalCandidateRuns}`);
  lines.push(`- Proposed pass: ${packet.summary.proposedPass}`);
  lines.push(`- Proposed needs_edit: ${packet.summary.proposedNeedsEdit}`);
  lines.push(`- Proposed fail: ${packet.summary.proposedFail}`);
  lines.push(`- Critical risk count: ${packet.summary.criticalRiskCount}`);
  lines.push(`- Correction rate: ${formatMetric(packet.summary.correctionRate)}%`);
  lines.push(`- Average usefulness score: ${formatMetric(packet.summary.averageUsefulnessScore)}`);
  lines.push(`- Average accuracy score: ${formatMetric(packet.summary.averageAccuracyScore)}`);
  lines.push(`- Average structure score: ${formatMetric(packet.summary.averageStructureScore)}`);
  lines.push("");
  lines.push("## Full Handoff Checks");
  const checkReasons = proposals.flatMap((p) => p.reasoning);
  for (const reason of dedupe(checkReasons)) {
    lines.push(`- ${reason}`);
  }
  lines.push("");
  lines.push("## Human Attention Required");
  if (attention.length === 0) {
    lines.push("None. All full-handoff passes are low-risk and eligible for quick approval.");
  } else {
    for (const proposal of attention) {
      lines.push(`- ${proposal.trackRunId}: ${proposal.review.verdict}; ${proposal.reasoning.join(" ")}`);
    }
  }
  lines.push("");
  lines.push("## Proposed Safe Passes");
  if (safePasses.length === 0) {
    lines.push("None.");
  } else {
    for (const proposal of safePasses) {
      lines.push(`- ${proposal.trackRunId}: quick approve`);
    }
  }
  lines.push("");
  lines.push("## Full Review Table");
  lines.push("| Run ID | Proposed Verdict | Scores | Risk Flags | Reason | Human Action |");
  lines.push("|---|---|---|---|---|---|");
  for (const proposal of proposals) {
    const review = proposal.review;
    lines.push(`| ${proposal.trackRunId} | ${review.verdict} | ${scoreText(review)} | ${cell(review.riskFlags.join(", ") || "-")} | ${cell(proposal.reasoning.join(" "))} | ${proposal.humanAction} |`);
  }
  lines.push("");
  lines.push("## Individual Run Details");
  for (const proposal of proposals) {
    const review = proposal.review;
    lines.push("");
    lines.push(`### ${proposal.trackRunId}`);
    lines.push(`- Run ID: ${proposal.trackRunId}`);
    lines.push(`- Proposed review: ${review.verdict}; ${scoreText(review)}; risk flags: ${review.riskFlags.join(", ") || "-"}`);
    lines.push(`- Reasoning: ${proposal.reasoning.join(" ")}`);
    lines.push(`- Suggested correction if needed: ${review.correctionText || "-"}`);
  }
  lines.push("");
  return lines.join("\n");
}

function buildGateSummary(proposals) {
  const reviews = proposals.map((proposal) => proposal.review);
  const quality = buildQualitySummary(reviews);
  return {
    totalCandidateRuns: proposals.length,
    proposedPass: quality.passCount,
    proposedNeedsEdit: quality.needsEditCount,
    proposedFail: quality.failCount,
    criticalRiskCount: quality.criticalRiskCount,
    correctionRate: quality.correctionRate,
    averageUsefulnessScore: quality.averageUsefulnessScore,
    averageAccuracyScore: quality.averageAccuracyScore,
    averageStructureScore: quality.averageStructureScore,
    commonFailureReasons: quality.commonFailureReasons,
    safePassCount: proposals.filter((proposal) => proposal.safeAutoApprovalEligible).length,
    humanAttentionCount: proposals.filter(requiresHumanAttention).length
  };
}

function buildDecision(summary) {
  let recommendedDecision = "continue";
  const reasons = [];

  if (summary.totalCandidateRuns === 0) {
    recommendedDecision = "suspend";
    reasons.push("No enforced Lighthouse pilot candidate runs were found.");
  } else if (summary.criticalRiskCount > 0 || summary.proposedFail > 0) {
    recommendedDecision = "suspend";
    reasons.push("One or more candidate runs have fail verdicts or critical risk.");
  } else if (summary.proposedNeedsEdit > 0) {
    recommendedDecision = "narrow";
    reasons.push("Some candidate runs need correction before broadening.");
  } else if (summary.totalCandidateRuns >= 20 && summary.proposedPass === summary.totalCandidateRuns) {
    recommendedDecision = "broaden";
    reasons.push("All reviewed candidates are proposed safe passes across a larger sample.");
  } else {
    reasons.push("All candidates are proposed safe passes; continue the pilot and collect more quality evidence.");
  }

  return {
    schemaVersion: "locaily.lighthouse_human_gate_decision.v1",
    recommendedDecision,
    reasons,
    generatedAt: new Date().toISOString()
  };
}

function buildArtifacts({ proposals, summary, decision, now, flags }) {
  const generatedAt = now.toISOString();
  const packet = {
    schemaVersion: "locaily.lighthouse_human_gate_packet.v1",
    generatedAt,
    trackId: TRACK_ID,
    roleId: ROLE_ID,
    executedCapabilityId: EXECUTED_CAPABILITY_ID,
    mode: flags.approve_safe && !flags.dry_run ? "approve-safe" : "packet-only",
    dryRun: flags.dry_run,
    filters: {
      url: flags.url,
      includeFixtures: flags.include_fixtures,
      latestOnly: flags.latest_only,
      latestN: flags.latest_n
    },
    files: {
      markdown: relativePath(PACKET_MD),
      packetJson: relativePath(PACKET_JSON),
      proposedReviews: relativePath(PROPOSED_REVIEWS_JSON),
      decision: relativePath(DECISION_JSON)
    },
    summary,
    decision,
    runs: proposals.map(toPacketRun)
  };

  return {
    markdown: renderMarkdown(packet, proposals),
    packet,
    proposedReviews: {
      schemaVersion: "locaily.lighthouse_human_gate_proposed_reviews.v1",
      generatedAt,
      reviewer: REVIEWER,
      reviews: proposals.map((proposal) => proposal.review)
    },
    decision
  };
}

function toPacketRun(proposal) {
  const review = proposal.review;
  return {
    trackRunId: proposal.trackRunId,
    createdAt: proposal.createdAt,
    proposedVerdict: review.verdict,
    scores: {
      usefulness: review.usefulnessScore,
      accuracy: review.accuracyScore,
      structure: review.structureScore,
      clarity: review.clarityScore,
      risk: review.riskScore
    },
    riskFlags: review.riskFlags,
    failureReasons: review.failureReasons,
    humanAction: proposal.humanAction,
    safeAutoApprovalEligible: proposal.safeAutoApprovalEligible,
    inputSummary: proposal.inputSummary,
    auditSummary: proposal.auditSummary,
    modelOutputSummary: proposal.modelOutputSummary,
    finalOutputSummary: proposal.finalOutputSummary,
    taskWriterOutputSummary: proposal.taskWriterOutputSummary,
    testingChecklistWriterOutputSummary: proposal.testingChecklistWriterOutputSummary,
    reasoning: proposal.reasoning,
    suggestedCorrection: review.correctionText
  };
}

function renderMarkdown(packet, proposals) {
  const attention = proposals.filter(requiresHumanAttention);
  const safePasses = proposals.filter((proposal) => proposal.safeAutoApprovalEligible);
  const lines = [];

  lines.push("# Lighthouse Human Gate Review Packet");
  lines.push("");
  lines.push("## Filters");
  lines.push(`- URL filter: ${packet.filters.url || "-"}`);
  lines.push(`- Include fixtures: ${packet.filters.includeFixtures}`);
  lines.push(`- Latest only: ${packet.filters.latestOnly}`);
  lines.push(`- Latest N: ${packet.filters.latestN || "-"}`);
  lines.push(`- Matching runs before limit: ${packet.summary.selection.matchingRunsBeforeLimit}`);
  lines.push(`- Selected runs: ${packet.summary.selection.selectedRuns}`);
  lines.push(`- Excluded fixture runs: ${packet.summary.selection.excludedFixtures}`);
  if (packet.summary.selection.shortfallMessage) {
    lines.push(`- Selection warning: ${packet.summary.selection.shortfallMessage}`);
  }
  lines.push("");
  lines.push("## Recommended Decision");
  lines.push(packet.decision.recommendedDecision);
  lines.push("");
  lines.push(packet.decision.reasons.map((reason) => `- ${reason}`).join("\n"));
  lines.push("");
  lines.push("## Summary");
  lines.push(`- Total candidate runs: ${packet.summary.totalCandidateRuns}`);
  lines.push(`- Proposed pass: ${packet.summary.proposedPass}`);
  lines.push(`- Proposed needs_edit: ${packet.summary.proposedNeedsEdit}`);
  lines.push(`- Proposed fail: ${packet.summary.proposedFail}`);
  lines.push(`- Critical risk count: ${packet.summary.criticalRiskCount}`);
  lines.push(`- Correction rate: ${formatMetric(packet.summary.correctionRate)}%`);
  lines.push(`- Average usefulness score: ${formatMetric(packet.summary.averageUsefulnessScore)}`);
  lines.push(`- Average accuracy score: ${formatMetric(packet.summary.averageAccuracyScore)}`);
  lines.push(`- Average structure score: ${formatMetric(packet.summary.averageStructureScore)}`);
  lines.push("");
  lines.push("## Human Attention Required");
  if (attention.length === 0) {
    lines.push("None. All proposed passes are low-risk and eligible for quick approval.");
  } else {
    for (const proposal of attention) {
      lines.push(`- ${proposal.trackRunId}: ${proposal.review.verdict}; ${proposal.reasoning.join(" ")}`);
    }
  }
  lines.push("");
  lines.push("## Proposed Safe Passes");
  if (safePasses.length === 0) {
    lines.push("None.");
  } else {
    for (const proposal of safePasses) {
      lines.push(`- ${proposal.trackRunId}: quick approve; ${proposal.finalOutputSummary || proposal.modelOutputSummary}`);
    }
  }
  lines.push("");
  lines.push("## Full Review Table");
  lines.push("| Run ID | Proposed Verdict | Scores | Risk Flags | Reason | Human Action |");
  lines.push("|---|---|---|---|---|---|");
  for (const proposal of proposals) {
    const review = proposal.review;
    lines.push(`| ${proposal.trackRunId} | ${review.verdict} | ${scoreText(review)} | ${cell(review.riskFlags.join(", ") || "-")} | ${cell(proposal.reasoning.join(" "))} | ${proposal.humanAction} |`);
  }
  lines.push("");
  lines.push("## Individual Run Details");
  for (const proposal of proposals) {
    const review = proposal.review;
    lines.push("");
    lines.push(`### ${proposal.trackRunId}`);
    lines.push(`- Run ID: ${proposal.trackRunId}`);
    lines.push(`- Input/audit summary: ${proposal.auditSummary || proposal.inputSummary || "-"}`);
    lines.push(`- Model output summary: ${proposal.modelOutputSummary || "-"}`);
    lines.push(`- Developer task writer summary: ${proposal.taskWriterOutputSummary || "-"}`);
    lines.push(`- Testing checklist writer summary: ${proposal.testingChecklistWriterOutputSummary || "-"}`);
    lines.push(`- Proposed review: ${review.verdict}; ${scoreText(review)}; risk flags: ${review.riskFlags.join(", ") || "-"}`);
    lines.push(`- Reasoning: ${proposal.reasoning.join(" ")}`);
    lines.push(`- Suggested correction if needed: ${review.correctionText || "-"}`);
  }
  lines.push("");
  return lines.join("\n");
}

function requiresHumanAttention(proposal) {
  const review = proposal.review;
  return review.verdict !== "pass"
    || review.riskScore > 1
    || review.riskFlags.length > 0
    || proposal.safeAutoApprovalEligible === false;
}

async function writeArtifacts(artifacts) {
  await mkdir(REVIEW_DIR, { recursive: true });
  await writeFile(PACKET_MD, artifacts.markdown, "utf8");
  await writeFile(PACKET_JSON, JSON.stringify(artifacts.packet, null, 2), "utf8");
  await writeFile(PROPOSED_REVIEWS_JSON, JSON.stringify(artifacts.proposedReviews, null, 2), "utf8");
  await writeFile(DECISION_JSON, JSON.stringify(artifacts.decision, null, 2), "utf8");
}

async function approveSafePasses(proposals) {
  let count = 0;
  for (const proposal of proposals) {
    if (!proposal.safeAutoApprovalEligible) continue;
    const body = {
      ...proposal.review,
      reviewer: APPROVER,
      reviewerNotes: `${proposal.review.reviewerNotes} Auto-approved by --approve-safe because verdict=pass, riskScore<=1, no risk flags, and no correction is required.`
    };
    await upsertReview({ trackRun: proposal.record, body });
    count++;
  }
  return count;
}

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function dedupe(values) {
  return [...new Set(values.filter(Boolean))];
}

function scoreText(review) {
  return `U${review.usefulnessScore}/A${review.accuracyScore}/S${review.structureScore}/C${review.clarityScore}/R${review.riskScore}`;
}

function cell(value) {
  return String(value || "-").replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function formatMetric(value) {
  return value === null || value === undefined ? "-" : value;
}

function relativePath(filePath) {
  return filePath.replace(join(__dirname, "..") + "\\", "").replace(/\\/g, "/");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(inspect(error, { depth: 4, colors: false }));
    process.exitCode = 1;
  });
}

module.exports = {
  TRACK_ID,
  ROLE_ID,
  EXECUTED_CAPABILITY_ID,
  findCandidateRuns,
  proposeReview,
  buildGateSummary,
  buildDecision,
  isSafeAutoApproval,
  main
};
