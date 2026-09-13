import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_FLASHCARDS, parseFlashcardPreview } from "../src/flashcards.js";

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

test("accepts the 500-card generation limit", () => {
  const cards = Array.from({ length: MAX_FLASHCARDS }, (_, index) => ({ front: `Question ${index}`, back: `Answer ${index}`, sourcePage: null }));
  const result = parseFlashcardPreview(JSON.stringify({ title: "Large set", cards }), MAX_FLASHCARDS);
  assert.equal(result.cards.length, MAX_FLASHCARDS);
});

test("repairs common Gemini JSON mistakes inside flashcard strings", () => {
  const raw = '{"title":"Bài 2","cards":[{"front":"Từ ghép với 迷: "音乐迷" có nghĩa là gì?","back":"Dòng một\nDòng hai","sourcePage":null,}],}';
  const result = parseFlashcardPreview(raw, 20);
  assert.equal(result.cards[0].front, 'Từ ghép với 迷: "音乐迷" có nghĩa là gì?');
  assert.equal(result.cards[0].back, "Dòng một\nDòng hai");
});
