import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFlashcardPreview } from "../src/flashcards.js";

test("parses, trims, deduplicates and bounds an AI flashcard preview", () => {
  const result = parseFlashcardPreview(`\n\`\`\`json\n${JSON.stringify({ title: "  Biology  ", cards: [
    { front: "  What is a cell? ", back: " The basic unit of life. ", sourcePage: 2 },
    { front: "what is a cell?", back: "the basic unit of life.", sourcePage: 2 },
    { front: "What is DNA?", back: "Genetic material.", sourcePage: null },
  ]})}\n\`\`\`` , 2);
  assert.equal(result.title, "Biology");
  assert.equal(result.cards.length, 2);
  assert.deepEqual(result.cards[0], { front: "What is a cell?", back: "The basic unit of life.", sourcePage: 2 });
  assert.equal(result.cards[1].sourcePage, undefined);
});

test("rejects an empty or malformed AI preview", () => {
  assert.throws(() => parseFlashcardPreview(JSON.stringify({ title: "Empty", cards: [] }), 20));
  assert.throws(() => parseFlashcardPreview("not json", 20));
});
