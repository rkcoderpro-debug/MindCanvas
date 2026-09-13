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

test("repairs quoted terms and raw line breaks in contextual AI output", () => {
  const raw = '{"title":"Giải thích "光"","text":"Dòng một\nDòng hai","ideas":["Ví dụ "光 + V""]}';
  const result = parseSelectionResult(raw);
  assert.equal(result.title, 'Giải thích "光"');
  assert.equal(result.text, "Dòng một\nDòng hai");
  assert.deepEqual(result.ideas, ['Ví dụ "光 + V"']);
});
