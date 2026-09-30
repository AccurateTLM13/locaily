function getPathValue(source, path) {
  let current = source;

  for (const segment of path.split(".")) {
    if (current === undefined || current === null) {
      return undefined;
    }
    current = current[segment];
  }

  return current;
}

function invalidInput(message, nextStep) {
  return {
    code: "INVALID_INPUT",
    message,
    nextStep
  };
}

function validateInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return invalidInput("rank.items input must be an object.", "Send items and score_fields.");
  }

  if (!Array.isArray(input.items) || input.items.length === 0) {
    return invalidInput("rank.items input requires a non-empty items array.", "Send items to rank.");
  }

  if (!Array.isArray(input.score_fields) || input.score_fields.length === 0) {
    return invalidInput("rank.items input requires a non-empty score_fields array.", "Send score_fields as [{ field, weight? }].");
  }

  for (const fieldSpec of input.score_fields) {
    if (!fieldSpec || typeof fieldSpec.field !== "string" || !fieldSpec.field.trim()) {
      return invalidInput("Each score field needs a non-empty 'field' name.", "Use { field: 'path.to.number', weight?: number }.");
    }
  }

  if (input.limit !== undefined && (!Number.isInteger(input.limit) || input.limit < 1)) {
    return invalidInput("rank.items 'limit' must be a positive integer.", "Send limit >= 1 or omit it.");
  }

  for (let index = 0; index < input.items.length; index += 1) {
    for (const fieldSpec of input.score_fields) {
      const raw = getPathValue(input.items[index], fieldSpec.field);
      if (typeof raw !== "number" || Number.isNaN(raw)) {
        return invalidInput(
          `Item ${index} is missing numeric score field '${fieldSpec.field}'.`,
          "Every item must carry a numeric value for each score field."
        );
      }
    }
  }

  return null;
}

function scoreItem(item, scoreFields) {
  return scoreFields.reduce((total, spec) => {
    const weight = typeof spec.weight === "number" ? spec.weight : 1;
    return total + weight * getPathValue(item, spec.field);
  }, 0);
}

const implementations = {
  "rank.items": {
    validateInput,
    async handle({ input }) {
      const scored = input.items.map((item, index) => ({
        index,
        score: scoreItem(item, input.score_fields),
        item
      }));

      const ascending = input.ascending === true;

      scored.sort((left, right) => {
        if (left.score !== right.score) {
          return ascending ? left.score - right.score : right.score - left.score;
        }

        if (typeof input.tie_break === "string" && input.tie_break.trim()) {
          const leftKey = String(getPathValue(left.item, input.tie_break) ?? "");
          const rightKey = String(getPathValue(right.item, input.tie_break) ?? "");
          if (leftKey !== rightKey) {
            return leftKey.localeCompare(rightKey);
          }
        }

        return left.index - right.index;
      });

      const limited = Number.isInteger(input.limit) ? scored.slice(0, input.limit) : scored;

      return {
        ranked: limited.map((entry) => ({ ...entry.item, score: entry.score })),
        scores: limited.map((entry) => ({ index: entry.index, score: entry.score })),
        strategy: "deterministic_score_sum_v1"
      };
    }
  }
};

module.exports = implementations;
