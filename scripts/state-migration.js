#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const DATA_DIR = path.resolve(__dirname, "..", "data");
const MIGRATIONS_DIR = path.join(DATA_DIR, "migrations");
const MIGRATION_LOG = path.join(MIGRATIONS_DIR, "applied.json");

const MIGRATIONS = [];

async function main() {
  const cmd = process.argv[2] || "status";

  if (cmd === "status") {
    const applied = await getApplied();
    console.log(`Migrations applied: ${applied.length}`);
    console.log(`Migrations registered: ${MIGRATIONS.length}`);
    for (const m of MIGRATIONS) {
      const done = applied.includes(m.id);
      console.log(`  ${done ? "[x]" : "[ ]"} ${m.id}: ${m.description}`);
    }
    return;
  }

  if (cmd === "run") {
    const applied = await getApplied();
    for (const m of MIGRATIONS) {
      if (applied.includes(m.id)) {
        console.log(`Skipping ${m.id} (already applied)`);
        continue;
      }
      console.log(`Applying ${m.id}...`);
      try {
        await m.up();
        await recordApplied(m.id);
        console.log(`  OK`);
      } catch (err) {
        console.error(`  FAILED: ${err.message}`);
        process.exit(1);
      }
    }
    console.log("All migrations complete.");
    return;
  }

  if (cmd === "validate") {
    const schemas = [
      { name: "track-run-record", path: path.join(__dirname, "..", "companion", "evidence", "schemas", "track-run-record.schema.json") },
      { name: "enforcement-policy", path: path.join(__dirname, "..", "companion", "schemas", "internal", "enforcement-policy.schema.json") },
    ];
    for (const s of schemas) {
      try {
        const raw = fs.readFileSync(s.path, "utf8");
        JSON.parse(raw);
        console.log(`  OK  ${s.name} schema valid`);
      } catch (err) {
        console.error(`  FAIL ${s.name}: ${err.message}`);
      }
    }
    return;
  }

  console.log(`Usage: node scripts/state-migration.js <status|run|validate>`);
}

async function getApplied() {
  try {
    const raw = fs.readFileSync(MIGRATION_LOG, "utf8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function recordApplied(id) {
  const applied = await getApplied();
  applied.push(id);
  fs.mkdirSync(MIGRATIONS_DIR, { recursive: true });
  fs.writeFileSync(MIGRATION_LOG, JSON.stringify(applied, null, 2) + "\n");
}

if (require.main === module) {
  main().catch((err) => { console.error(err.message); process.exit(1); });
}

module.exports = { MIGRATIONS, getApplied, recordApplied };
