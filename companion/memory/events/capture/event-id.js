const crypto = require("node:crypto");

function buildStableEventId(parts) {
  const normalized = parts
    .filter((part) => part !== undefined && part !== null && String(part).length > 0)
    .map((part) => String(part))
    .join("|");

  const hash = crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 20);
  return `evt_${hash}`;
}

module.exports = {
  buildStableEventId
};
