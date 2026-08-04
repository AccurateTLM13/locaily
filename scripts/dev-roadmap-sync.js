#!/usr/bin/env node
/**
 * scripts/dev-roadmap-sync.js
 *
 * Synchronizes the roadmap.json file with the actual milestone records on disk.
 * 1. Removes missing milestone IDs from roadmap areas and dependencies.
 * 2. Optionally adds unreferenced milestone records to a default 'uncategorized' area.
 *
 * Usage:
 *   node scripts/dev-roadmap-sync.js
 */

const fs = require("node:fs");
const path = require("node:path");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const DEVELOPMENT_DIR = path.join(PROJECT_ROOT, "development");
const ROADMAP_PATH = path.join(DEVELOPMENT_DIR, "roadmap.json");
const MILESTONES_DIR = path.join(DEVELOPMENT_DIR, "milestones");

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return fallback; }
}

function writeJson(p, data) {
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + "\n");
}

function listJson(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith(".json"));
}

function main() {
  const roadmap = readJson(ROADMAP_PATH, null);
  if (!roadmap) {
    console.error("No roadmap.json found.");
    process.exit(1);
  }

  const allMilestoneIds = new Set();
  for (const file of listJson(MILESTONES_DIR)) {
    const m = readJson(path.join(MILESTONES_DIR, file), null);
    if (m && m.id) allMilestoneIds.add(m.id);
  }

  let removedCount = 0;
  const roadmapMilestoneIds = new Set();

  // 1. Remove dangling references from areas
  for (const area of (roadmap.areas || [])) {
    for (const init of (area.initiatives || [])) {
      if (init.milestoneIds) {
        const originalLength = init.milestoneIds.length;
        init.milestoneIds = init.milestoneIds.filter(mid => allMilestoneIds.has(mid));
        removedCount += (originalLength - init.milestoneIds.length);

        for (const mid of init.milestoneIds) {
          roadmapMilestoneIds.add(mid);
        }
      }
    }
  }

  // 2. Remove dangling references from dependencies
  if (roadmap.milestoneDependencies) {
    for (const [mid, deps] of Object.entries(roadmap.milestoneDependencies)) {
      if (!allMilestoneIds.has(mid)) {
        delete roadmap.milestoneDependencies[mid];
        continue;
      }
      roadmap.milestoneDependencies[mid] = deps.filter(dep => allMilestoneIds.has(dep));
    }
  }

  // 3. Add unreferenced records to an 'Uncategorized' area (optional safe-routing)
  const unreferenced = [...allMilestoneIds].filter(mid => !roadmapMilestoneIds.has(mid) && !mid.startsWith("dcp-"));
  if (unreferenced.length > 0) {
    let uncategorizedArea = roadmap.areas.find(a => a.id === "uncategorized");
    if (!uncategorizedArea) {
      uncategorizedArea = {
        id: "uncategorized",
        title: "Uncategorized",
        description: "Auto-generated area for unmapped milestones",
        maturity: "planned",
        initiatives: [{
          id: "unmapped-milestones",
          title: "Unmapped Milestones",
          description: "Milestones found on disk but not in roadmap",
          maturity: "planned",
          milestoneIds: []
        }]
      };
      roadmap.areas.push(uncategorizedArea);
    }

    const init = uncategorizedArea.initiatives[0];
    for (const mid of unreferenced) {
      if (!init.milestoneIds.includes(mid)) {
        init.milestoneIds.push(mid);
      }
    }
    console.log(`Added ${unreferenced.length} unreferenced milestone(s) to 'Uncategorized' area.`);
  }

  roadmap.updatedAt = new Date().toISOString();
  writeJson(ROADMAP_PATH, roadmap);

  console.log(`Roadmap synchronized successfully. Removed ${removedCount} dangling references.`);
}

main();
