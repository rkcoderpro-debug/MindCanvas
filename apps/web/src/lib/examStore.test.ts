// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, expect, it, vi } from "vitest";
import { saveExam, listSavedExams, deleteExam } from "./examStore";
import { emptyExamWorkspace, loadExamWorkspace, persistExamWorkspace } from "./examWorkspace";
import { examFixture } from "./examTestData";
afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });
it("persists a mixed paper atomically and updates without creating another entry", async () => {
  const exam = examFixture(); exam.id = "store-update";
  await saveExam("user-a", exam); exam.draft.title = "Updated title"; await saveExam("user-a", exam);
  const rows = await listSavedExams("user-a"); const matching = rows.filter(row => row.id === exam.id);
  expect(matching).toHaveLength(1); expect(matching[0].draft.title).toBe("Updated title"); expect(matching[0].draft.sections).toHaveLength(5);
});
it("isolates owners and does not delete another account's exam", async () => {
  const exam = examFixture(); exam.id = "store-isolation"; await saveExam("user-a", exam);
  expect((await listSavedExams("user-b")).some(row => row.id === exam.id)).toBe(false);
  await deleteExam("user-b", exam.id); expect((await listSavedExams("user-a")).some(row => row.id === exam.id)).toBe(true);
  await expect(saveExam("user-b", exam)).rejects.toThrow();
  await deleteExam("user-a", exam.id); expect((await listSavedExams("user-a")).some(row => row.id === exam.id)).toBe(false);
});
it("rejects an invalid edited answer without overwriting the saved paper", async () => {
  const exam = examFixture(); exam.id = "store-invalid"; await saveExam("user-a", exam);
  exam.draft.sections[0].questions[0].answer = "Wrong option";
  await expect(saveExam("user-a", exam)).rejects.toThrow();
  expect((await listSavedExams("user-a")).find(row => row.id === exam.id)?.draft.sections[0].questions[0].answer).toBe("It freezes");
});
it("restores unfinished workspace and keeps account drafts separate", () => {
  const work = emptyExamWorkspace(); work.sources = examFixture("quiz").sources; work.result = examFixture("quiz");
  persistExamWorkspace("user-a", work);
  expect(loadExamWorkspace("user-a").result?.id).toBe("exam-1"); expect(loadExamWorkspace("user-b").result).toBeNull();
});
it("reports unavailable browser storage rather than pretending to save", () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Quota exceeded", "QuotaExceededError"); });
  expect(() => persistExamWorkspace("user-a", emptyExamWorkspace())).toThrow();
});
