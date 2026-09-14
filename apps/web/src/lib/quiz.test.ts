// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { allowsQuizNavigation, formatQuizPercent, parseQuizResult, prepareQuizQuestions, revealsQuizAnswer, scoreQuiz, shuffleQuizQuestions, type QuizAttempt, type QuizTest } from "./quiz";

const rawQuiz = {
  title: "Sinh học cơ bản",
  description: "Ôn nhanh",
  questions: [
    { id: "q1", prompt: "Đơn vị cơ bản của sự sống là gì?", options: ["Tế bào", "Mô", "Cơ quan", "Hệ cơ quan"], correctIndex: 0, explanation: "Tế bào là đơn vị cơ bản." },
    { id: "q2", prompt: "DNA lưu trữ gì?", options: ["Thông tin di truyền", "Năng lượng", "Nước", "Khoáng chất"], correctIndex: 0, explanation: "DNA mang thông tin di truyền." },
  ],
};

describe("quiz parser and scoring", () => {
  it("accepts exactly four unique options and normalizes missing source pages", () => {
    const parsed = parseQuizResult(JSON.stringify(rawQuiz), 10);
    expect(parsed.title).toBe("Sinh học cơ bản");
    expect(parsed.questions).toHaveLength(2);
    expect(parsed.questions[0].options).toEqual(["Tế bào", "Mô", "Cơ quan", "Hệ cơ quan"]);
    expect(parsed.questions[0].sourcePage).toBeNull();
  });

  it("rejects duplicate choices", () => {
    expect(() => parseQuizResult({ ...rawQuiz, questions: [{ ...rawQuiz.questions[0], options: ["A", "A", "B", "C"] }] }, 10)).toThrow();
  });

  it("keeps question ids unique when an imported file repeats an id", () => {
    const parsed = parseQuizResult({ ...rawQuiz, questions: [{ ...rawQuiz.questions[0], id: "same" }, { ...rawQuiz.questions[1], id: "same" }] }, 10);
    expect(parsed.questions.map(question => question.id)).toEqual(["same", "same-2"]);
  });

  it("distinguishes immediate-feedback modes from free-navigation modes", () => {
    expect(revealsQuizAnswer("learn")).toBe(true);
    expect(revealsQuizAnswer("review")).toBe(true);
    expect(revealsQuizAnswer("practice")).toBe(false);
    expect(allowsQuizNavigation("practice")).toBe(true);
    expect(allowsQuizNavigation("exam")).toBe(true);
    expect(allowsQuizNavigation("learn")).toBe(false);
  });

  it("scores a completed attempt and formats its percentage", () => {
    const parsed = parseQuizResult(rawQuiz, 10);
    const quiz = { questions: parsed.questions } as QuizTest;
    expect(scoreQuiz(quiz, [0, 2])).toBe(1);
    expect(formatQuizPercent(1, 2)).toBe(50);
  });

  it("prepares random order and targets previously missed questions", () => {
    const quiz = { id: "quiz-1", ...rawQuiz, sourceDocumentId: null, createdAt: "", updatedAt: "" } as QuizTest;
    expect(shuffleQuizQuestions(quiz.questions, () => 0)).toEqual([quiz.questions[1], quiz.questions[0]]);
    const attempt: QuizAttempt = { id: "attempt-1", quizId: quiz.id, score: 0, total: 2, answers: [1, 0], questionIds: ["q1", "q2"], mode: "exam", durationSeconds: 20, completedAt: "" };
    expect(prepareQuizQuestions(quiz, "review", "sequential", [attempt]).map(question => question.id)).toEqual(["q1"]);
    expect(prepareQuizQuestions(quiz, "review", "sequential", [])).toEqual([]);
  });
});
