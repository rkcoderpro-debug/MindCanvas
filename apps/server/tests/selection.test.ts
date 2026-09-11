import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSelectionResult } from "../src/selection.js";

test("parses and deduplicates contextual AI ideas", () => {
  const result = parseSelectionResult(`\`\`\`json\n${JSON.stringify({ title: " Logic ", text: " Clear explanation ", ideas: ["Gate", "gate", "Truth table"] })}\n\`\`\``);
  assert.equal(result.title, "Logic");
  assert.equal(result.text, "Clear explanation");
  assert.deepEqual(result.ideas, ["Gate", "Truth table"]);
});

test("rejects empty contextual AI output", () => {
  assert.throws(() => parseSelectionResult(JSON.stringify({ title: "", text: "", ideas: [] })));
});
