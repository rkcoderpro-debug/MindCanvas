import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSelectionResult, selectionScopeSchema } from "../src/selection.js";

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

test("parses a structured mind-map organization patch without coordinates", () => {
  const result = parseSelectionResult(JSON.stringify({
    title: "Organize",
    text: "Branch can be grouped by topic.",
    ideas: [],
    operations: [
      { op: "update", id: "child", label: "Grouped child", parentId: "root" },
      { op: "add", id: "new-node", label: "New detail", parentId: "child" },
      { op: "link", source: "new-node", target: "root", label: "supports" },
    ],
  }));
  assert.equal(result.operations.length, 3);
  assert.equal(result.operations[0].op, "update");
  assert.equal((result.operations[1] as { label: string }).label, "New detail");
  assert.throws(() => parseSelectionResult(JSON.stringify({ title: "Bad", text: "x", ideas: [], operations: [{ op: "add", id: "n", label: "n", x: 10 }] })));
});

test("validates selected mind-map scope before sending it to the model", () => {
  const valid = selectionScopeSchema.parse({
    rootId: "root",
    nodeIds: ["root", "child"],
    edges: [{ source: "root", target: "child", kind: "branch" }],
  });
  assert.equal(valid.rootId, "root");
  assert.throws(() => selectionScopeSchema.parse({ rootId: "outside", nodeIds: ["root"], edges: [] }));
  assert.throws(() => selectionScopeSchema.parse({ rootId: "root", nodeIds: ["root", "root"], edges: [] }));
  assert.throws(() => selectionScopeSchema.parse({ rootId: "root", nodeIds: ["root", "child"], edges: [{ source: "root", target: "outside" }] }));
});
