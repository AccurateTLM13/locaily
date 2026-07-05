#!/usr/bin/env node
/**
 * terminology-guard.js
 *
 * Fails when active code or documentation reintroduces legacy "Pit Crew" terms
 * outside of allowed historical notes, archive files, or rename descriptions.
 *
 * Allowed occurrences:
 *   - "formerly AI Pit Crew" / "historically "AI Pit Crew""
 *   - Rename descriptions referencing the migration (e.g., "Pit Crew → The Crew")
 *   - Archive files (docs/99-archive/)
 *   - Historical conversation captures (docs/LocAIly_ and_Second Brain_Alignment_and_Connection.md)
 *   - Historical decision entries (docs/06-decisions/decision-log.md)
 *   - opencode internal state (.opencode/)
 *   - Node modules / .git
 */

const { execSync } = require("child_process");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

const ALLOWED_PATTERNS = [
  /formerly "AI Pit Crew"/,
  /formerly AI Pit Crew/,
  /historically "AI Pit Crew"/,
  /historically AI Pit Crew/,
  /Pit Crew → The Crew/,
  /was `companion\/pit-crew\/`/,
  /was ai-pit-crew\.md/,
  /Local AI Pit Crew Documentation/,
];

const ALLOWED_FILES = [
  "docs/99-archive/",
  "docs/LocAIly_ and_Second Brain_Alignment_and_Connection.md",
  "docs/06-decisions/decision-log.md",
  "docs/00-start-here/glossary.md",
  "docs/07-progress/latest-build-result.json",
  "docs/07-progress/progress-log.md",
  "docs/07-progress/next-agent-brief.md",
  "docs/00-start-here/current-state.md",
  ".opencode/",
  "node_modules",
  ".git",
];

const FORBIDDEN = [
  { pattern: "AI Pit Crew", label: "AI Pit Crew (term)" },
  { pattern: "Pit Crew", label: "Pit Crew (term)" },
  { pattern: "pit-crew", label: "pit-crew (path or kebab)" },
  { pattern: "pitCrew", label: "pitCrew (camelCase)" },
  { pattern: "PitCrew", label: "PitCrew (PascalCase)" },
];

function isAllowed(filePath, lineContent) {
  const normalized = filePath.replace(/\\/g, "/");

  // File-level exclusion
  if (ALLOWED_FILES.some((f) => normalized.includes(f))) {
    return true;
  }

  // Line-level exclusion: known historical notes
  if (ALLOWED_PATTERNS.some((re) => re.test(lineContent))) {
    return true;
  }

  return false;
}

const grepCmd = `git grep -n -E "AI Pit Crew|Pit Crew|pit-crew|pitCrew|PitCrew" -- :/`;

try {
  const output = execSync(grepCmd, { cwd: ROOT, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  const lines = output.split("\n").filter(Boolean);
  const violations = lines.filter((line) => {
    const [filePath, , ...rest] = line.split(":");
    const content = rest.join(":");
    return !isAllowed(filePath, content);
  });

  if (violations.length === 0) {
    console.log("terminology-guard: PASS — no forbidden terms found in active files.");
    process.exit(0);
  }

  console.log("terminology-guard: FAIL — forbidden terms found:\n");
  for (const v of violations) {
    console.log(`  ${v}`);
  }
  console.log("\nThe term 'Pit Crew' / 'AI Pit Crew' / 'pit-crew' / 'pitCrew' / 'PitCrew'");
  console.log("should only appear in:");
  console.log("  - Historical notes (\"formerly AI Pit Crew\")");
  console.log("  - Rename descriptions (\"Pit Crew → The Crew\")");
  console.log("  - Archive files (docs/99-archive/)");
  console.log("  - Historical conversation captures (docs/LocAIly_*.md)");
  console.log("  - Historical decision entries (docs/06-decisions/decision-log.md)");
  console.log("  - Build record of the rename itself (latest-build-result.json)");
  console.log("  - Progress records of the rename (progress-log.md, next-agent-brief.md)");
  process.exit(1);
} catch (e) {
  if (e.status === 1 && e.stdout) {
    const lines = e.stdout.split("\n").filter(Boolean);
    const violations = lines.filter((line) => {
      const [filePath, , ...rest] = line.split(":");
      const content = rest.join(":");
      return !isAllowed(filePath, content);
    });

    if (violations.length === 0) {
      console.log("terminology-guard: PASS — no forbidden terms found in active files.");
      process.exit(0);
    }

    console.log("terminology-guard: FAIL — forbidden terms found:\n");
    for (const v of violations) {
      console.log(`  ${v}`);
    }
    process.exit(1);
  }
  console.error("terminology-guard: ERROR —", e.message);
  process.exit(2);
}
