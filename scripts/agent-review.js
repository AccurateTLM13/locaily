#!/usr/bin/env node
/**
 * scripts/agent-review.js
 *
 * Deterministic code review gate. Blocks unsafe diffs before push.
 * Checks are rule-based, not model-based.
 *
 * Usage:
 *   node scripts/agent-review.js --slug <id>
 *   node scripts/agent-review.js --slug <id> --json
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const REVIEW_DIR = path.join(PROJECT_ROOT, "development", "reviews");
const MILESTONES_DIR = path.join(PROJECT_ROOT, "development", "milestones");

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return fallback; }
}

function git(args) {
  const r = spawnSync("git", args, { cwd: PROJECT_ROOT, encoding: "utf8", maxBuffer: 1024 * 1024, shell: process.platform === "win32" });
  return r.status === 0 ? (r.stdout || "").trim() : null;
}

function reviewDiff() {
  let diff = git(["diff", "HEAD"]) || "";
  const untracked = (git(["ls-files", "--others", "--exclude-standard"]) || "").split(/\r?\n/).filter(Boolean);
  for (const file of untracked) {
    const absolute = path.join(PROJECT_ROOT, file);
    let content;
    try {
      const bytes = fs.readFileSync(absolute);
      content = bytes.includes(0) ? "Binary files differ" : bytes.toString("utf8").split(/\r?\n/).map(line => `+${line}`).join("\n");
    } catch {
      content = "+<unreadable untracked file>";
    }
    diff += `\ndiff --git a/${file} b/${file}\nnew file mode 100644\n--- /dev/null\n+++ b/${file}\n${content}\n`;
  }
  return diff;
}

function extractArg(args, name) {
  const idx = args.indexOf(name);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1];
}

function hasFlag(args, name) {
  return args.includes(name);
}

function now() {
  return new Date().toISOString();
}

// ---- checks ----

function checkSecrets(diff) {
  const findings = [];
  const secretPatterns = [
    { pattern: /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}/g, name: "GitHub token" },
    { pattern: /sk-[A-Za-z0-9]{32,}/g, name: "OpenAI-style key" },
    { pattern: /(?:api[_-]?key|apikey|secret)[=:]\s*['"][A-Za-z0-9_\-]{16,}/gi, name: "API key literal" },
    { pattern: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/g, name: "Private key" },
    { pattern: /(?:password|passwd|pwd)[=:]\s*['"][^'"]{8,}/gi, name: "Password literal" },
    { pattern: /mongodb(?:\+srv)?:\/\/[^@]+@/g, name: "MongoDB connection string with credentials" },
    { pattern: /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}/g, name: "GitHub token" },
  ];
  for (const sp of secretPatterns) {
    const matches = diff.match(sp.pattern);
    if (matches) {
      for (const m of matches) {
        findings.push({ severity: "error", code: "SECRET_LEAK", message: `Possible ${sp.name} detected`, match: m.slice(0, 20) + "..." });
      }
    }
  }
  return findings;
}

function checkLargeFiles(diff) {
  const findings = [];
  const largePattern = /^diff --git a\/(.+) b\/(.+)/gm;
  let match;
  while ((match = largePattern.exec(diff)) !== null) {
    const file = match[1] || match[2];
    if (file.endsWith(".png") || file.endsWith(".jpg") || file.endsWith(".jpeg") || file.endsWith(".gif") || file.endsWith(".zip") || file.endsWith(".tar.gz") || file.endsWith(".ico") || file.endsWith(".ttf") || file.endsWith(".woff") || file.endsWith(".woff2")) {
      findings.push({ severity: "warning", code: "BINARY_FILE", message: `Binary file added: ${file}`, file });
    }
  }
  return findings;
}

function checkScope(milestone, diff) {
  const findings = [];
  if (!milestone || !milestone.scope) return findings;

  const included = milestone.scope.included || [];
  const excluded = milestone.scope.excluded || [];

  // Files changed
  const filePattern = /^diff --git a\/(.+) b\/(.+)/gm;
  let match;
  while ((match = filePattern.exec(diff)) !== null) {
    const file = match[1] || match[2];
    const isIncluded = included.some(p => file.startsWith(p.replace(/\/$/, "")));
    const isExcluded = excluded.some(p => file.startsWith(p.replace(/\/$/, "")));
    if (isExcluded) {
      findings.push({ severity: "error", code: "OUT_OF_SCOPE_EXCLUDED", message: `File is in excluded scope: ${file}`, file });
    }
    // Warn for unexpected directories
    const topDir = file.split("/")[0];
    const allowedDirs = ["development", "scripts", "docs", "companion", "benchmark-lab", "AGENTS.md", "package.json", "README.md", "policies", ".opencode"];
    if (!allowedDirs.includes(topDir) && !included.some(p => file.startsWith(p))) {
      findings.push({ severity: "warning", code: "UNEXPECTED_DIR", message: `File in unexpected directory: ${file}`, file });
    }
  }
  return findings;
}

function checkMissingTests(diff) {
  const findings = [];
  const filePattern = /^diff --git a\/(.+) b\/(.+)/gm;
  let match;
  const changed = [];
  while ((match = filePattern.exec(diff)) !== null) {
    const file = match[1] || match[2];
    if (!file.startsWith("scripts/") && !file.startsWith("companion/")) continue;
    if (file.startsWith("scripts/test-")) continue;
    changed.push(file);
  }
  for (const f of changed) {
    const testFile = f.replace(/\.js$/, "").replace(/companion\//, "scripts/test-").replace(/\//g, "-");
    const possibleTests = [`test-${path.basename(f)}`, `test-${path.basename(f).replace(/\.(js|cjs)$/, "")}.js`];
    let hasTest = false;
    for (const pt of possibleTests) {
      const fullPath = path.join(PROJECT_ROOT, "scripts", pt);
      if (fs.existsSync(fullPath)) { hasTest = true; break; }
    }
    if (!hasTest) {
      findings.push({ severity: "warning", code: "MISSING_TEST", message: `Source file changed but no matching test found: ${f}`, file: f });
    }
  }
  return findings;
}

function checkPackageChanges(diff) {
  const findings = [];
  if (!diff.includes("package.json")) return findings;
  // Check if scripts or AGENTS.md changed alongside package.json
  const hasAgentsChange = diff.includes("AGENTS.md");
  const hasScriptsChange = diff.includes("scripts/");
  if (diff.includes("package.json") && !hasAgentsChange && !hasScriptsChange) {
    findings.push({ severity: "warning", code: "PACKAGE_CHANGE_NO_DOCS", message: "package.json changed but AGENTS.md or scripts/ not updated" });
  }
  return findings;
}

function checkForbiddenFiles(diff) {
  const findings = [];
  const forbidden = [".env", ".env.local", ".env.production", "credentials.json", "config.local.json"];
  for (const f of forbidden) {
    if (diff.includes(`b/${f}`)) {
      findings.push({ severity: "error", code: "FORBIDDEN_FILE", message: `Forbidden file in diff: ${f}`, file: f });
    }
  }
  return findings;
}

function checkGeneratedFiles(diff) {
  const findings = [];
  const generated = ["development/generated/roadmap.html", "development/generated/roadmap-data.json", "development/generated/status-summary.md", "development/generated/next-agent-handoff.md"];
  const hasGeneratorChange = diff.includes("generate-development-dashboard.js");
  for (const f of generated) {
    if (diff.includes(`b/${f}`) && !hasGeneratorChange) {
      findings.push({ severity: "info", code: "GENERATED_CHANGED", message: `Generated file changed but generator not modified: ${f}`, file: f });
    }
  }
  return findings;
}

// ---- main ----

function main() {
  const args = process.argv.slice(2);
  const slug = extractArg(args, "--slug");
  const isJson = hasFlag(args, "--json");

  if (!slug) {
    console.error("Usage: node scripts/agent-review.js --slug <milestone-id>");
    process.exit(1);
  }

  const milestone = readJson(path.join(MILESTONES_DIR, `${slug}.json`), null);
  if (!milestone) {
    console.error(`Milestone '${slug}' not found.`);
    process.exit(1);
  }

  // Get diff from HEAD
  const diff = reviewDiff();

  // Run checks
  const allFindings = [
    ...checkSecrets(diff),
    ...checkLargeFiles(diff),
    ...checkScope(milestone, diff),
    ...checkMissingTests(diff),
    ...checkPackageChanges(diff),
    ...checkForbiddenFiles(diff),
    ...checkGeneratedFiles(diff),
  ];

  const errors = allFindings.filter(f => f.severity === "error");
  const warnings = allFindings.filter(f => f.severity === "warning");
  const infos = allFindings.filter(f => f.severity === "info");
  const status = errors.length > 0 ? "failed" : (warnings.length > 0 ? "warning" : "passed");

  const reviewId = `review-${slug}-${now().replace(/[-:]/g, "").slice(0, 15)}`;
  const review = {
    id: reviewId,
    milestoneId: slug,
    status,
    branch: git(["rev-parse", "--abbrev-ref", "HEAD"]),
    headCommit: git(["rev-parse", "HEAD"]),
    findings: allFindings,
    summary: { total: allFindings.length, errors: errors.length, warnings: warnings.length, info: infos.length },
    reviewedAt: now(),
  };

  // Write review record
  fs.mkdirSync(REVIEW_DIR, { recursive: true });
  fs.writeFileSync(path.join(REVIEW_DIR, `${reviewId}.json`), JSON.stringify(review, null, 2) + "\n");

  if (isJson) {
    console.log(JSON.stringify(review, null, 2));
  } else {
    console.log(`=== Code Review: ${slug} ===`);
    console.log(`Status: ${status}`);
    console.log(`Findings: ${allFindings.length} (${errors.length} error, ${warnings.length} warning, ${infos.length} info)`);
    console.log("");
    if (errors.length > 0) {
      console.log("Blocking errors:");
      for (const f of errors) {
        console.log(`  [X] ${f.code}: ${f.message}`);
      }
      console.log("");
    }
    if (warnings.length > 0) {
      console.log("Warnings:");
      for (const f of warnings) {
        console.log(`  [!] ${f.code}: ${f.message}`);
      }
      console.log("");
    }
    if (infos.length > 0) {
      console.log("Info:");
      for (const f of infos) {
        console.log(`  [i] ${f.code}: ${f.message}`);
      }
      console.log("");
    }
  }

  process.exit(errors.length > 0 ? 1 : 0);
}

main();
