#!/usr/bin/env node
const { listAllRecords } = require("../companion/evidence/track-run-record-store");
const { validateResult } = require("../companion/core/result-validator");

const TRACKS = {
  "website_audit.accessibility_deep": {
    name: "Accessibility Deep Audit",
    schemas: ["companion/crew/schemas/a11y-analyzer.schema.json", "companion/crew/schemas/a11y-recommender.schema.json"],
    roles: ["a11y_analyzer", "a11y_recommender"]
  },
  "website_audit.performance_budget": {
    name: "Performance Budget Audit",
    schemas: ["companion/crew/schemas/budget-analyzer.schema.json", "companion/crew/schemas/budget-recommender.schema.json"],
    roles: ["budget_analyzer", "budget_recommender"]
  },
  "website_audit.seo_audit": {
    name: "SEO Audit",
    schemas: ["companion/crew/schemas/seo-analyzer.schema.json", "companion/crew/schemas/seo-recommender.schema.json"],
    roles: ["seo_analyzer", "seo_recommender"]
  },
  "marketplace.dealsniper": {
    name: "DealSniper",
    schemas: ["companion/schemas/deal-sniper.schema.json"],
    roles: ["default_worker"]
  }
};

async function main(argv = process.argv.slice(2)) {
  const flags = parseFlags(argv);
  const records = await listAllRecords();
  const trackIds = flags.track ? [flags.track] : Object.keys(TRACKS);

  for (const trackId of trackIds) {
    const config = TRACKS[trackId];
    if (!config) { console.log(`UNKNOWN_TRACK: ${trackId}`); continue; }

    const trackRecords = records.filter(r => r.trackId === trackId && r.metadata?.stepId);
    const uniqueSteps = [...new Set(trackRecords.map(r => r.metadata.stepId))];

    console.log(`\n=== ${config.name} (${trackId}) ===`);
    console.log(`Total records: ${trackRecords.length}, Unique steps: ${uniqueSteps.length}`);

    const schemaValidations = config.schemas.map(schemaPath => {
      try {
        const schema = JSON.parse(require("fs").readFileSync(require("path").resolve(__dirname, "..", schemaPath), "utf8"));
        return { schemaPath, schema, ok: true };
      } catch (e) {
        return { schemaPath, ok: false, error: e.message };
      }
    });

    const schemaErrors = schemaValidations.filter(v => !v.ok);
    if (schemaErrors.length > 0) {
      console.log(`SCHEMA_LOAD_ERRORS: ${schemaErrors.map(e => e.schemaPath).join(", ")}`);
    }

    const recentRecords = trackRecords.slice(-5);
    let passCount = 0, failCount = 0;
    for (const record of recentRecords) {
      const output = record.output || record.result;
      if (!output) { failCount++; continue; }
      const result = validateResult(output, schemaValidations[0]?.schema);
      if (result.ok !== false) { passCount++; }
      else { failCount++; }
    }

    if (recentRecords.length > 0) {
      const passRate = (passCount / recentRecords.length * 100).toFixed(0);
      console.log(`Recent schema compliance: ${passCount}/${recentRecords.length} (${passRate}%)`);
    } else {
      console.log(`No recent records for ${trackId} — try running: npm run audit:a11y -- --url <url>`);
    }
  }
}

function parseFlags(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t.startsWith("--")) {
      const k = t.slice(2).replace(/-/g, "_");
      const v = argv[i + 1];
      if (v && !v.startsWith("--")) { flags[k] = v; i++; }
      else { flags[k] = true; }
    }
  }
  return flags;
}

main().catch(e => { console.error(e.message); process.exitCode = 1; });
