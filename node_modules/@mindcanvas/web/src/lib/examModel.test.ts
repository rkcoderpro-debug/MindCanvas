import { describe, expect, it } from "vitest";
import { validateExamSettings, validateExamSources, validateExamBlueprint, validateExamDraft, examQuestionCount, examTotalPoints } from "@mindcanvas/shared";
import { examFixture } from "./examTestData";
import { examAsQuiz } from "./examWorkspace";
const parse = (exam = examFixture()) => validateExamDraft(exam.draft, exam.blueprint, exam.sources, exam.settings.format);
describe("exam consistency", () => {
  it("accepts a mixed paper and computes exact totals", () => { const exam = examFixture(); expect(parse().sections).toHaveLength(5); expect(examQuestionCount(exam.blueprint)).toBe(5); expect(examTotalPoints(exam.blueprint)).toBe(5); });
  it("converts only four-choice exams to ordinary Quiz", () => { expect(examAsQuiz(examFixture("quiz"))[0]).toMatchObject({ options: expect.any(Array), correctIndex: 0, sourcePage: 1 }); expect(() => examAsQuiz(examFixture())).toThrow(); });
  it("requires the template for a mixed paper and caps sources", () => { const exam = examFixture(); expect(() => validateExamSettings({ ...exam.settings, mode: "materials" })).toThrow(); expect(() => validateExamSources([{ ...exam.sources[0], role: "material" }], "template")).toThrow(); expect(() => validateExamSources(Array.from({ length: 7 }, (_, index) => ({ ...exam.sources[0], id: `s${index}` })), "template")).toThrow(); });
  it("rejects a quiz blueprint containing essay questions", () => { expect(() => validateExamBlueprint(examFixture().blueprint, "quiz")).toThrow(); });
  it("preserves a paper template's choice count while Quiz remains four-choice", () => {
    const exam = examFixture(); exam.blueprint.sections[0].optionsCount = 5;
    exam.draft.sections[0].questions[0].options.push("An additional distractor");
    expect(parse(exam).sections[0].questions[0].options).toHaveLength(5);
    expect(() => validateExamBlueprint({ ...examFixture("quiz").blueprint, sections: [{ ...examFixture("quiz").blueprint.sections[0], optionsCount: 5 }] }, "quiz")).toThrow();
  });
  it.each(["count", "points", "type", "duplicate", "options", "answer", "rubric", "source", "page", "excerpt", "copied"])("rejects %s inconsistencies", issue => {
    const exam = examFixture(), question = exam.draft.sections[0].questions[0];
    if (issue === "count") exam.draft.sections[0].questions.push({ ...question, id: "new" });
    if (issue === "points") question.points = 2;
    if (issue === "type") question.type = "short";
    if (issue === "duplicate") exam.draft.sections[1].questions[0].prompt = question.prompt;
    if (issue === "options") question.options[1] = question.options[0];
    if (issue === "answer") question.answer = "Wrong answer";
    if (issue === "rubric") exam.draft.sections[1].questions[0].rubric[0].points = .5;
    if (issue === "source") question.references[0].sourceId = "not-in-source";
    if (issue === "page") question.references[0].page = 2;
    if (issue === "excerpt") question.references[0].excerpt = "Made-up source quote";
    if (issue === "copied") question.prompt = "Water freezes at 0°C under standard atmospheric pressure.";
    expect(() => parse(exam)).toThrow();
  });
  it("checks excerpt against the cited page, not another page", () => {
    const exam = examFixture(); exam.sources[0].pageCount = 2; exam.sources[0].text += "\n[PAGE 2]\nOnly this page contains the second-page phrase.";
    exam.draft.sections[0].questions[0].references[0].excerpt = "second-page phrase"; expect(() => parse(exam)).toThrow();
  });
});
