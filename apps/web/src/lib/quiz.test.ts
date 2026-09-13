// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { formatQuizPercent, parseQuizResult, scoreQuiz, type QuizTest } from "./quiz";

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

  it("scores a completed attempt and formats its percentage", () => {
    const parsed = parseQuizResult(rawQuiz, 10);
    const quiz = { questions: parsed.questions } as QuizTest;
    expect(scoreQuiz(quiz, [0, 2])).toBe(1);
    expect(formatQuizPercent(1, 2)).toBe(50);
  });
});
