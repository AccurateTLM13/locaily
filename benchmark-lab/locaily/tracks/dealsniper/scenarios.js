const SCENARIO_REGISTRY = [];

function defineScenario(def) { SCENARIO_REGISTRY.push(def); return def; }

function buildDealSniperPrompt(caseData) {
  return [
    "You are a marketplace deal analyst. Analyze the listing below and determine if it's a good deal.",
    "Consider: market price, item condition, seller reputation, shipping costs, and demand.",
    "Be specific. Do not give vague advice.",
    "Return JSON only matching the schema.",
    "",
    `Title: ${caseData.title}`,
    `Price: ${caseData.price}`,
    `Description: ${caseData.description || "N/A"}`,
    `Location: ${caseData.location || "N/A"}`,
    `Seller info: ${caseData.sellerInfo || "N/A"}`,
    `Source: ${caseData.source || "N/A"}`
  ].join("\n");
}

defineScenario({
  id: "ds-001",
  title: "Good deal on vintage camera",
  category: "marketplace",
  role: "default_worker",
  difficulty: "easy",
  prompt: buildDealSniperPrompt({
    title: "Vintage Canon AE-1 Film Camera with 50mm Lens - Excellent Condition",
    price: "$175",
    description: "Fully functional Canon AE-1 with 50mm f/1.8 lens. No scratches on lens. Light seals replaced 2024. Includes original strap and case.",
    location: "Austin, TX",
    sellerInfo: "5-star seller, 250+ reviews, 98% positive",
    source: "eBay"
  }),
  evaluate(output, caseData) {
    const errors = [];
    if (!output || typeof output !== "object") return { pass: false, errors: ["No valid output object"] };
    if (typeof output.isDeal !== "boolean") errors.push("isDeal must be boolean");
    if (typeof output.dealScore !== "number" || output.dealScore < 0 || output.dealScore > 10) errors.push("dealScore must be number 0-10");
    if (!output.analysis || output.analysis.length < 10) errors.push("Missing or too short analysis");
    return { pass: errors.length === 0, errors };
  }
});

defineScenario({
  id: "ds-002",
  title: "Overpriced used smartphone",
  category: "marketplace",
  role: "default_worker",
  difficulty: "easy",
  prompt: buildDealSniperPrompt({
    title: "iPhone 14 Pro Max 256GB - Space Black",
    price: "$1,099",
    description: "Used for 6 months. Minor scratch on screen. No original box. Battery health 87%.",
    location: "Ship nationwide",
    sellerInfo: "New seller, 3 reviews, 67% positive",
    source: "Facebook Marketplace"
  }),
  evaluate(output, caseData) {
    const errors = [];
    if (!output || typeof output !== "object") return { pass: false, errors: ["No valid output object"] };
    if (typeof output.isDeal !== "boolean") errors.push("isDeal must be boolean");
    if (typeof output.dealScore !== "number" || output.dealScore < 0 || output.dealScore > 10) errors.push("dealScore must be number 0-10");
    if (output.dealScore > 3 && output.isDeal === true) errors.push("High price used phone should not be a good deal");
    return { pass: errors.length === 0, errors };
  }
});

defineScenario({
  id: "ds-003",
  title: "Furniture with high shipping risk",
  category: "marketplace",
  role: "default_worker",
  difficulty: "medium",
  prompt: buildDealSniperPrompt({
    title: "Mid-Century Modern Dining Table - Solid Walnut - 6ft",
    price: "$400",
    description: "Beautiful solid walnut dining table. Some water marks on top but can be refinished. Needs pickup.",
    location: "Portland, OR (local pickup only)",
    sellerInfo: "4.8-star seller, 120 reviews, no negative feedback in 6 months",
    source: "Craigslist"
  }),
  evaluate(output, caseData) {
    const errors = [];
    if (!output || typeof output !== "object") return { pass: false, errors: ["No valid output object"] };
    if (typeof output.isDeal !== "boolean") errors.push("isDeal must be boolean");
    if (!Array.isArray(output.risks)) errors.push("risks should be an array");
    if (output.risks && !output.risks.some(r => r.toLowerCase().includes("pickup") || r.toLowerCase().includes("shipping") || r.toLowerCase().includes("transport"))) {
      // Local pickup only is a key risk factor - not a hard error, but notable
    }
    return { pass: errors.length === 0, errors };
  }
});

module.exports = { scenarios: SCENARIO_REGISTRY, defineScenario };
