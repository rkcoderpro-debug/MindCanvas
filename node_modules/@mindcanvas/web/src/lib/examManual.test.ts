// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createManualExamSession, emptyManualExam, parseManualExamResult, validateManualAttributes } from "./examManual";
import { examFixture } from "./examTestData";
import { emptyExamWorkspace, loadExamWorkspace, persistExamWorkspace } from "./examWorkspace";
function fixture(format: "quiz" | "paper" = "paper") {
  const exam = examFixture(format), attributes = { questionCount: null, durationMinutes: null, pointsPerQuestion: null, instructions: "" };
  return { exam, session: createManualExamSession(exam.settings, exam.sources, attributes, 50), raw: { blueprint: exam.blueprint, draft: exam.draft } };
}
describe("single-response Manual exam", () => {
  it.each(["quiz", "paper"] as const)("imports %s with blueprint and draft in one pass", format => {
    const { session, raw } = fixture(format); expect(parseManualExamResult(JSON.stringify(raw), session).draft.sections).toHaveLength(format === "quiz" ? 1 : 5);
  });
  it.each(["easy", "medium", "hard"] as const)("includes %s and source identities without calling AI", difficulty => {
    const { exam } = fixture(); exam.settings.difficulty = difficulty;
    const session = createManualExamSession(exam.settings, exam.sources, { questionCount: 5, durationMinutes: 45, pointsPerQuestion: 1, instructions: "Include calculations" }, 10);
    expect(session.prompt).toContain(`"difficulty":"${difficulty}"`); expect(session.prompt).toContain("Include calculations"); expect(session.prompt).toContain(exam.sources[0].id); expect(session.prompt).toContain("no separate structure confirmation");
    exam.sources[0].text = "Changed after creating prompt"; expect(session.sources[0].text).toContain("Water freezes");
  });
  it("accepts an optional JSON code fence", () => { const { session, raw } = fixture(); expect(parseManualExamResult("```json\n" + JSON.stringify(raw) + "\n```", session).blueprint.title).toBe("Practice Exam"); });
  it.each(["options", "answer", "citation", "rubric", "count", "type", "duplicate"])("reports the question location for %s without mutating imported data", issue => {
    const { session, raw } = fixture(), question = raw.draft.sections[0].questions[0];
    if (issue === "options") question.options.pop();
    if (issue === "answer") question.answer = "Wrong";
    if (issue === "citation") question.references[0].sourceId = "missing";
    if (issue === "rubric") raw.draft.sections[1].questions[0].rubric = [];
    if (issue === "count") raw.draft.sections[0].questions = [];
    if (issue === "type") question.type = "essay";
    if (issue === "duplicate") raw.draft.sections[1].questions[0].prompt = question.prompt;
    const text = JSON.stringify(raw); expect(() => parseManualExamResult(text, session)).toThrow(/Phần [12]/); expect(JSON.stringify(raw)).toBe(text);
  });
  it("rejects wrong requested counts, time and points", () => {
    const { session, raw } = fixture(); session.attributes = { questionCount: 6, durationMinutes: 90, pointsPerQuestion: 2, instructions: "" };
    expect(() => parseManualExamResult(JSON.stringify(raw), session)).toThrow(/cần 6 câu/);
    try { parseManualExamResult(JSON.stringify(raw), session); } catch (error) { expect((error as Error).message).toContain("90 phút"); expect((error as Error).message).toContain("2"); }
  });
  it("rejects unreadable sources and over-limit settings before preparing a prompt", () => {
    const { exam } = fixture(); exam.sources[0].text += " [UNREADABLE]";
    expect(() => createManualExamSession(exam.settings, exam.sources, emptyManualExam().attributes, 50)).toThrow(/OCR/);
    expect(() => validateManualAttributes({ ...emptyManualExam().attributes, questionCount: 100 }, 50)).toThrow(/Số câu/);
    expect(() => validateManualAttributes({ questionCount: 50, durationMinutes: 45, pointsPerQuestion: 30, instructions: "" }, 50)).toThrow(/1.000/);
  });
  it("rejects malformed JSON, oversized results, wrong sections and account limits", () => {
    const { session, raw } = fixture(); expect(() => parseManualExamResult("{broken", session)).toThrow(/JSON/); expect(() => parseManualExamResult("x".repeat(2000001), session)).toThrow(/2 MB/);
    expect(() => parseManualExamResult(JSON.stringify(raw), { ...session, maxQuestions: 4 })).toThrow(/giới hạn 4/);
    raw.draft.sections[0].id = "wrong"; expect(() => parseManualExamResult(JSON.stringify(raw), session)).toThrow(/mã phần/);
  });
  it("checks single-question replacement shape and excludes existing prompts", () => {
    const { session, exam, raw } = fixture("quiz"); session.replacement = { examId: exam.id, questionId: "q-0", sectionIndex: 0, questionIndex: 0, blueprint: structuredClone(exam.blueprint), excludedPrompts: [raw.draft.sections[0].questions[0].prompt] };
    expect(() => parseManualExamResult(JSON.stringify(raw), session)).toThrow(/trùng câu/);
    raw.draft.sections[0].questions[0].prompt = "New situation: water is cooled below its freezing temperature, what occurs?";
    expect(parseManualExamResult(JSON.stringify(raw), session).draft.sections[0].questions).toHaveLength(1);
    raw.blueprint.sections[0].points = 2; expect(() => parseManualExamResult(JSON.stringify(raw), session)).toThrow(/câu thay thế/);
  });
  it("restores pending Manual input and snapshots by owner while older workspaces default to Auto", () => {
    const { session } = fixture(), work = { ...emptyExamWorkspace(), aiMode: "manual" as const, manual: { ...emptyManualExam(), session, importText: "{incomplete" } };
    persistExamWorkspace("user-a", work); expect(loadExamWorkspace("user-a").manual?.importText).toBe("{incomplete"); expect(loadExamWorkspace("user-b").manual?.session).toBeFalsy();
    persistExamWorkspace("old-user", emptyExamWorkspace()); expect(loadExamWorkspace("old-user").aiMode).toBe("auto");
    localStorage.clear();
  });
});
