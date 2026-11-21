import { describe, expect, it } from "vitest";
import { gradeOnlineQuestion, normalizeAnswer, onlineAttemptResult, parseOnlineExam, validateOnlineExam, type OnlineAttempt } from "./examOnline";
import { studioExam, studioRawExam, studioSource } from "./examStudioTestData";
describe("interactive exam model and scoring", () => {
  it("accepts all five types and source citations without a text extraction", () => { expect(parseOnlineExam(JSON.stringify(studioRawExam()), [studioSource()], 50).questions.map(q => q.type)).toEqual(["mcq", "blank", "numeric", "short", "essay"]); });
  it.each(["json", "version", "limit", "options", "correct", "duplicate", "blank", "unknownblank", "numeric", "unit", "rubric", "source", "reserved"])("rejects %s errors", issue => {
    const raw: any = studioRawExam();
    if (issue === "json") { expect(() => parseOnlineExam("{broken", [], 50)).toThrow(/JSON/); return; }
    if (issue === "version") raw.schemaVersion = 2;
    if (issue === "limit") { expect(() => validateOnlineExam(raw, [studioSource()], 4)).toThrow(); return; }
    if (issue === "options") raw.questions[0].options.push("Extra");
    if (issue === "correct") raw.questions[0].answer = "Iron";
    if (issue === "duplicate") raw.questions[1].prompt = raw.questions[0].prompt;
    if (issue === "blank") raw.questions[1].blanks[0].acceptedAnswers = [];
    if (issue === "unknownblank") raw.questions[1].prompt += " {{missing}}";
    if (issue === "numeric") raw.questions[2].numeric.relativeTolerance = 2;
    if (issue === "unit") raw.questions[2].numeric.units = [];
    if (issue === "rubric") raw.questions[4].rubric[0].points = 3;
    if (issue === "source") raw.questions[0].references[0].fileId = "missing";
    if (issue === "reserved") raw.questions[1].blanks[0].id = "__proto__";
    expect(() => validateOnlineExam(raw, [studioSource()])).toThrow();
  });
  it("reports the erroneous question and retains the raw JSON", () => { const raw = studioRawExam(); raw.questions[0].options!.pop(); const text = JSON.stringify(raw); expect(() => parseOnlineExam(text, [studioSource()], 50)).toThrow(/Câu 1/); expect(JSON.stringify(raw)).toBe(text); });
  it("grades MCQ and unanswered questions", () => { const q = studioExam().questions[0]; expect(gradeOnlineQuestion(q, { choice: 0 }).score).toBe(1); expect(gradeOnlineQuestion(q, { choice: 1 }).score).toBe(0); expect(gradeOnlineQuestion(q).score).toBe(0); });
  it("supports accepted variants, Unicode and partial blank credit", () => {
    const q = studioExam().questions[1]; expect(gradeOnlineQuestion(q, { blanks: { state: "  SOLID  state ", next: "LIQUID" } }).score).toBe(2);
    expect(gradeOnlineQuestion(q, { blanks: { state: "solid", next: "gas" } }).score).toBe(1); expect(normalizeAnswer("ＡＢＣ")).toBe("abc");
    q.blanks[0].caseSensitive = true; expect(gradeOnlineQuestion(q, { blanks: { state: "SOLID" } }).score).toBe(0);
  });
  it.each([ ["2,50", "m/s", 2], ["2.51", "m/s", 2], ["2.52", "m/s", 0], ["2.5e0", "m s^-1", 2], ["2.5", "M/S", 0], ["2.5", "", 0], ["", "m/s", 0], ["5/2", "m/s", 0], ["Infinity", "m/s", 0] ])("grades numeric %s %s accurately", (text, unit, score) => { expect(gradeOnlineQuestion(studioExam().questions[2], { text: String(text), unit: String(unit) }).score).toBe(score); });
  it("applies relative tolerances without treating tiny numbers as zero", () => { const q = studioExam().questions[2]; q.numeric = { value: 100, absoluteTolerance: 0, relativeTolerance: .01, units: [], unitRequired: false }; expect(gradeOnlineQuestion(q, { text: "101" }).score).toBe(2); expect(gradeOnlineQuestion(q, { text: "101.01" }).score).toBe(0); q.numeric.value = 1e-20; q.numeric.relativeTolerance = 0; expect(gradeOnlineQuestion(q, { text: "0" }).score).toBe(0); });
  it("defers essay and subjective short scoring until a valid self score", () => { const q = studioExam().questions[4]; expect(gradeOnlineQuestion(q, { text: "an essay" }).pending).toBe(true); expect(gradeOnlineQuestion(q, {}, 3)).toMatchObject({ manual: true, pending: false, score: 3 }); expect(gradeOnlineQuestion(q, {}, 5).pending).toBe(true); });
  it("keeps pending manual scores separate from automatic and total results", () => { const exam = studioExam(), attempt: OnlineAttempt = { examId: exam.id, revision: exam.revision, startedAt: 1, endsAt: null, submittedAt: 2, responses: { "mcq-1": { choice: 0 }, "short-1": { text: "SOLID STATE" } }, selfScores: {} }; expect(onlineAttemptResult(exam, attempt)).toMatchObject({ score: 2, total: 10, pending: 1, autoScore: 2, autoTotal: 6 }); attempt.selfScores["essay-1"] = 4; expect(onlineAttemptResult(exam, attempt)).toMatchObject({ score: 6, pending: 0 }); });
});
