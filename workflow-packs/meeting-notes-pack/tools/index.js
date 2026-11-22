function extractSpeaker(line) {
  const match = line.match(/^([A-Z][a-zA-Z0-9_-]{1,24}):\s+/);
  return match ? match[1] : null;
}

function extractOwner(line) {
  const handle = line.match(/@([a-zA-Z0-9_-]{2,30})/);
  if (handle) return `@${handle[1]}`;
  const speaker = extractSpeaker(line);
  if (speaker) return speaker;
  return "unassigned";
}

function parseMeetingNotes(input) {
  const rawNotes = String(input.notes_text || "").trim();
  const meetingTitle = (typeof input.meeting_title === "string" && input.meeting_title.trim())
    ? input.meeting_title.trim()
    : "Team Sync Notes";
  const meetingDate = (typeof input.meeting_date === "string" && input.meeting_date.trim())
    ? input.meeting_date.trim()
    : "unspecified";

  const lines = rawNotes.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const attendees = new Set();
  const decisions = [];
  const blockers = [];
  const openQuestions = [];
  const actionItems = [];

  let actionCounter = 0;
  for (const line of lines) {
    const speaker = extractSpeaker(line);
    if (speaker && !/^(ACTION|TODO|DECISION|BLOCKER|NOTE|QUESTION)$/i.test(speaker)) {
      attendees.add(speaker);
    }

    if (/\b(decision:|decided|agreed|approved|greenlit)\b/i.test(line)) {
      decisions.push(line.slice(0, 180));
    }

    if (/\b(blocked|blocker:|waiting on|cannot proceed)\b/i.test(line)) {
      blockers.push(line.slice(0, 180));
    }

    if (line.endsWith("?") || /^QUESTION:/i.test(line)) {
      openQuestions.push(line.slice(0, 180));
    }

    if (/^(ACTION|TODO):/i.test(line) || /\b(will|need to|needs to|follow up|assign(?:ed)? to|@\w+)\b/i.test(line)) {
      actionCounter += 1;
      const dueMatch = line.match(/\b(by\s+(?:today|tomorrow|friday|monday|tuesday|wednesday|thursday|eod|eow|\d{4}-\d{2}-\d{2}))\b/i);
      const urgent = /\b(today|urgent|asap|p0|p1|blocker|eod)\b/i.test(line);
      const highImpact = /\b(security|release|ship|deploy|migration|schema|policy|gate)\b/i.test(line);
      actionItems.push({
        id: `act-${String(actionCounter).padStart(2, "0")}`,
        owner: extractOwner(line),
        task: line.replace(/^(ACTION|TODO):\s*/i, "").slice(0, 180),
        due: dueMatch ? dueMatch[1] : "unspecified",
        urgency: urgent ? 8 : 5,
        impact: highImpact ? 8 : 5
      });
    }
  }

  if (actionItems.length === 0) {
    actionItems.push({
      id: "act-01",
      owner: "team",
      task: "Review parsed meeting notes and confirm owners for next steps.",
      due: "unspecified",
      urgency: 3,
      impact: 3
    });
  }

  const attendeeList = attendees.size > 0 ? [...attendees] : ["unspecified"];
  const summaryText = [
    `Meeting '${meetingTitle}' (${meetingDate}), attendees: ${attendeeList.join(", ")}.`,
    `Captured ${decisions.length} decision(s), ${actionItems.length} action item(s), ${blockers.length} blocker(s), and ${openQuestions.length} open question(s).`,
    `Notes excerpt: ${rawNotes.slice(0, 550)}`
  ].join(" ");

  return {
    meeting_title: meetingTitle,
    meeting_date: meetingDate,
    attendees: attendeeList,
    decisions,
    blockers,
    open_questions: openQuestions,
    action_items: actionItems,
    summary_text: summaryText
  };
}

function assembleBrief(input) {
  const parsed = input.parsed || {};
  const classification = input.classification || null;
  const prioritized = input.prioritized || null;
  const summary = input.summary || {};

  const meetingTitle = parsed.meeting_title || "Team Sync Notes";
  const meetingDate = parsed.meeting_date || "unspecified";
  const category = (classification && classification.category) ? classification.category : "planning";
  const attendees = Array.isArray(parsed.attendees) && parsed.attendees.length > 0 ? parsed.attendees : ["unspecified"];
  const decisions = Array.isArray(parsed.decisions) ? parsed.decisions : [];
  const blockers = Array.isArray(parsed.blockers) ? parsed.blockers : [];
  const openQuestions = Array.isArray(parsed.open_questions) ? parsed.open_questions : [];

  const rawActions = (prioritized && Array.isArray(prioritized.ranked) && prioritized.ranked.length > 0)
    ? prioritized.ranked
    : (Array.isArray(parsed.action_items) && parsed.action_items.length > 0
      ? parsed.action_items
      : [{ id: "act-01", owner: "team", task: "Follow up on meeting notes.", due: "unspecified", urgency: 3, impact: 3 }]);

  const actionItems = rawActions.map((item) => ({
    id: String(item.id || "act-01"),
    owner: String(item.owner || "unassigned"),
    task: String(item.task || "Follow up"),
    due: String(item.due || "unspecified"),
    score: Number(item.score ?? ((item.urgency || 3) * 3 + (item.impact || 3) * 2))
  }));

  const summaryText = typeof summary.summary === "string" && summary.summary.trim()
    ? summary.summary.trim()
    : (parsed.summary_text || "Meeting notes parsed cleanly.");
  const keyPoints = Array.isArray(summary.key_points) ? summary.key_points : [];

  const title = `[Action Plan] ${meetingTitle} (${category})`;
  const markdown = [
    `# ${title}`,
    "",
    `- **Date:** ${meetingDate}`,
    `- **Category:** ${category}`,
    `- **Attendees:** ${attendees.join(", ")}`,
    "",
    "## Summary",
    summaryText,
    "",
    ...(keyPoints.length > 0 ? ["## Highlights", ...keyPoints.map((kp) => `- ${kp}`), ""] : []),
    "## Decisions",
    ...(decisions.length > 0 ? decisions.map((d) => `- ${d}`) : ["- No explicit decisions captured."]),
    "",
    "## Prioritized Action Items",
    ...actionItems.map((a, idx) => `${idx + 1}. **${a.owner}** (${a.id}, score=${a.score}, due=${a.due}): ${a.task}`),
    "",
    "## Blockers",
    ...(blockers.length > 0 ? blockers.map((b) => `- ${b}`) : ["- None reported."]),
    "",
    "## Open Questions",
    ...(openQuestions.length > 0 ? openQuestions.map((q) => `- ${q}`) : ["- None open."])
  ].join("\n");

  return {
    title,
    meeting_title: meetingTitle,
    meeting_date: meetingDate,
    category,
    attendees,
    decisions,
    action_items: actionItems,
    blockers,
    open_questions: openQuestions,
    summary: summaryText,
    markdown
  };
}

module.exports = {
  "meeting-notes-parser": {
    validateInput(input) {
      if (!input || typeof input !== "object" || Array.isArray(input)) {
        return {
          code: "INVALID_INPUT",
          message: "Meeting notes parser input must be an object.",
          nextStep: "Pass notes_text or parsed meeting data."
        };
      }
      if (Object.prototype.hasOwnProperty.call(input, "parsed")) {
        if (!input.parsed || typeof input.parsed !== "object") {
          return {
            code: "INVALID_INPUT",
            message: "assemble_brief requires a 'parsed' object.",
            nextStep: "Pass parsed meeting signals from meeting_notes.parse."
          };
        }
        return null;
      }
      if (typeof input.notes_text !== "string" || !input.notes_text.trim()) {
        return {
          code: "INVALID_INPUT",
          message: "Meeting notes parser requires non-empty notes_text.",
          nextStep: "Provide raw meeting transcript or notes in notes_text."
        };
      }
      return null;
    },
    async handle({ task, input }) {
      if (task === "parse") {
        return parseMeetingNotes(input);
      }
      if (task === "assemble_brief") {
        return assembleBrief(input);
      }
      const err = new Error(`Unsupported meeting-notes-parser task '${task}'.`);
      err.code = "UNKNOWN_TASK";
      throw err;
    }
  }
};
