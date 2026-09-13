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

test("parses a four-choice quiz preview and bounds its questions", () => {
  const result = parseQuizPreview(JSON.stringify({ ...quiz, questions: [...quiz.questions, { ...quiz.questions[0], id: "q2", prompt: "What stores genetic information?" }] }), 1);
  assert.equal(result.title, "Biology");
  assert.equal(result.questions.length, 1);
  assert.deepEqual(result.questions[0].options, ["A unit", "A tissue", "An organ", "A system"]);
});

test("rejects duplicate quiz options", () => {
  assert.throws(() => parseQuizPreview(JSON.stringify({ ...quiz, questions: [{ ...quiz.questions[0], options: ["A", "A", "B", "C"] }] }), 10));
});
