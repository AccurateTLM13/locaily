const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function dayIndex(name) {
  const idx = DAY_NAMES.indexOf(name.toLowerCase());
  if (idx === -1) throw new Error("Unknown day: " + name);
  return idx;
}

function parseISODate(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (isNaN(d.getTime())) return null;
  return d;
}

function formatISODate(d) {
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const da = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

function resolveRelativeDate(referenceDate, expression, timezone) {
  const ref = parseISODate(referenceDate);
  if (!ref) {
    return { error: "Invalid reference date format. Use YYYY-MM-DD.", referenceDate, expression, timezone: timezone || "UTC" };
  }

  const refDay = ref.getUTCDay();
  const expr = expression.toLowerCase().trim();
  let resolved = null;
  let interpretation = "";

  if (expr === "today") {
    resolved = new Date(ref);
    interpretation = "the reference date itself";
  } else if (expr === "tomorrow") {
    resolved = new Date(ref);
    resolved.setUTCDate(resolved.getUTCDate() + 1);
    interpretation = "one day after the reference date";
  } else if (expr === "yesterday") {
    resolved = new Date(ref);
    resolved.setUTCDate(resolved.getUTCDate() - 1);
    interpretation = "one day before the reference date";
  } else if (/^next (monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/.test(expr)) {
    const target = dayIndex(expr.split(" ")[1]);
    let diff = target - refDay;
    if (diff <= 0) diff += 7;
    resolved = new Date(ref);
    resolved.setUTCDate(resolved.getUTCDate() + diff);
    interpretation = `first ${expr.split(" ")[1]} strictly after the reference date`;
  } else if (/^this (monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/.test(expr)) {
    const target = dayIndex(expr.split(" ")[1]);
    let diff = target - refDay;
    if (diff < 0) diff += 7;
    resolved = new Date(ref);
    resolved.setUTCDate(resolved.getUTCDate() + diff);
    interpretation = `the upcoming or current ${expr.split(" ")[1]}`;
  } else if (/^(last|previous) (monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/.test(expr)) {
    const target = dayIndex(expr.split(" ")[1]);
    let diff = target - refDay;
    if (diff >= 0) diff -= 7;
    resolved = new Date(ref);
    resolved.setUTCDate(resolved.getUTCDate() + diff);
    interpretation = `most recent ${expr.split(" ")[1]} before the reference date`;
  } else {
    return { error: "Unsupported expression: " + expression, referenceDate, expression, timezone: timezone || "UTC" };
  }

  return {
    resolvedDate: formatISODate(resolved),
    referenceDate,
    expression,
    timezone: timezone || "UTC",
    interpretation
  };
}

module.exports = { resolveRelativeDate, parseISODate, formatISODate, dayIndex };
