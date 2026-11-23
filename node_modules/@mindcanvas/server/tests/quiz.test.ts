import { test } from "node:test";
import assert from "node:assert/strict";
import { parseQuizPreview } from "../src/quiz.js";

const quiz = {
  title: "Biology",
  description: "Basics",
  questions: [
    { id: "q1", prompt: "What is a cell?", options: ["A unit", "A tissue", "An organ", "A system"], correctIndex: 0, explanation: "A cell is the basic unit." },
  ],
};

test("rejects a quiz preview that exceeds the selected limit instead of dropping questions", () => {
  assert.throws(() => parseQuizPreview(JSON.stringify({ ...quiz, questions: [...quiz.questions, { ...quiz.questions[0], id: "q2", prompt: "What stores genetic information?" }] }), 1), /exceeding/);
});

test("parses a four-choice quiz preview at the selected limit", () => {
  const result = parseQuizPreview(JSON.stringify(quiz), 1);
  assert.equal(result.title, "Biology");
  assert.equal(result.questions.length, 1);
  assert.deepEqual(result.questions[0].options, ["A unit", "A tissue", "An organ", "A system"]);
});

test("rejects duplicate quiz options", () => {
  assert.throws(() => parseQuizPreview(JSON.stringify({ ...quiz, questions: [{ ...quiz.questions[0], options: ["A", "A", "B", "C"] }] }), 10));
});

test("the requested language reaches the Auto quiz prompt for an opposite-language source", async () => {
  const { config } = await import("../src/config.js");
  const { generateQuizWithGemini } = await import("../src/quiz.js");
  config.GEMINI_API_KEY = "test-placeholder-key"; config.GEMINI_MODELS = "gemini-quiz-language-test";
  for (const [language, requested, text] of [
    ["en", "English", "Nước có công thức hóa học H₂O."],
    ["vi", "Vietnamese", "Water has the chemical formula H₂O."],
  ] as const) {
    await generateQuizWithGemini({ text, language, maxQuestions: 3 }, async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      assert.match(body.contents[0].parts[0].text, new RegExp(`in ${requested}, regardless of the source language`));
      assert.ok(body.contents[0].parts[0].text.includes(text));
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(quiz) }] } }] }));
    });
  }
});
