const scenarios = [
  {
    id: "semantic-fixture-001",
    evaluate(output) {
      return output && output.answer === "correct"
        ? { pass: true, errors: [] }
        : { pass: false, errors: ["answer must be correct for semantic-fixture-001"] };
    }
  },
  {
    id: "semantic-fixture-002",
    evaluate(output) {
      return output && output.answer === "correct"
        ? { pass: true, errors: [] }
        : { pass: false, errors: ["answer must be correct for semantic-fixture-002"] };
    }
  }
];

module.exports = { scenarios };
