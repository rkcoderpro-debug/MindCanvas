// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ExamSettings, ExamSource, ExamBlueprint } from "@mindcanvas/shared";
import type { QuizStore } from "../hooks/useQuizzes";
import { examFixture } from "../lib/examTestData";
import { persistExamWorkspace, emptyExamWorkspace } from "../lib/examWorkspace";
import ExamBuilderPage from "./ExamBuilderPage";
const api = vi.hoisted(() => ({ read: vi.fn(), analyze: vi.fn(), generate: vi.fn(), pdf: vi.fn(), save: vi.fn(), quiz: vi.fn() }));
vi.mock("../lib/api", () => ({ readExamFile: api.read, analyzeExamSources: api.analyze, generateExamDraft: api.generate }));
vi.mock("../lib/examPdf", () => ({ exportExamPdf: api.pdf }));
vi.mock("../lib/examStore", () => ({ listSavedExams: async () => [], saveExam: api.save, deleteExam: async () => {} }));
let host: HTMLDivElement, root: Root;
const quizzes = { quizzes: [], busy: false, loading: false, saveQuiz: api.quiz } as unknown as QuizStore;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear(); host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  Object.values(api).forEach(mock => mock.mockReset());
  api.analyze.mockImplementation(async (settings: ExamSettings) => ({ blueprint: examFixture(settings.format).blueprint }));
  api.generate.mockImplementation(async (settings: ExamSettings, sources: ExamSource[], blueprint: ExamBlueprint) => {
    const example = examFixture(settings.format);
    return { draft: { ...example.draft, sections: blueprint.sections.map((section, index) => ({ id: section.id, title: section.title, instructions: section.instructions, questions: Array.from({ length: section.count }, (_, n) => ({ ...structuredClone(example.draft.sections[index]?.questions[0] ?? example.draft.sections[0].questions[0]), id: `new-${index}-${n}`, type: section.type, points: section.points, prompt: `New concept ${index}-${n}: explain the effect of cooling water at standard pressure.`, references: [{ sourceId: sources[0].id, page: 1, excerpt: "Water freezes at 0°C" }] })) })) } };
  });
  api.save.mockImplementation(async (_owner, exam) => exam); api.quiz.mockImplementation(async quiz => quiz); api.pdf.mockResolvedValue(undefined);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); localStorage.clear(); });
async function mount(owner = "user-a") { await act(async () => root.render(<ExamBuilderPage key={owner} owner={owner} quizzes={quizzes} onOpenQuiz={() => {}}/>)); }
function button(label: string) { const found = Array.from(host.querySelectorAll("button")).find(button => button.textContent === label); expect(found, label).toBeTruthy(); return found!; }
async function click(label: string) { await act(async () => button(label).click()); }
async function set(selector: string, value: string) {
  const element = host.querySelector(selector) as HTMLInputElement;
  await act(async () => {
    const prototype = element.tagName === "SELECT" ? HTMLSelectElement.prototype : element.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event(element.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
  });
}
async function prepare(paper = false) {
  await mount();
  if (paper) { await set('[aria-label="Hình thức đề"]', "paper"); await set('[aria-label="Vai trò nguồn"]', "template"); }
  await set('[aria-label="Văn bản nguồn"]', examFixture().sources[0].text); await click("Thêm văn bản");
  await act(async () => (host.querySelector('input[type="checkbox"]') as HTMLInputElement).click());
  await click("Phân tích cấu trúc");
  await act(async () => (host.querySelectorAll('input[type="checkbox"]')[1] as HTMLInputElement).click());
}
it("requires source/plan confirmation and saves ordinary Quiz once under rapid taps", async () => {
  await mount(); expect(button("Phân tích cấu trúc").disabled).toBe(true);
  await prepare(); await click("Tạo đề thi");
  expect(host.querySelector(".exam-paper")?.textContent).not.toContain("WORKED EXPLANATION ONLY");
  await click("Đáp án & lời giải"); expect(host.querySelector(".exam-paper")?.textContent).toContain("WORKED EXPLANATION ONLY");
  const save = button("Lưu vào Quiz"); await act(async () => { save.click(); save.click(); });
  expect(api.quiz).toHaveBeenCalledTimes(1); expect(api.quiz.mock.calls[0][0].questions[0].options).toHaveLength(4);
  const id = api.quiz.mock.calls[0][0].id; await click("Lưu vào Quiz"); expect(api.quiz.mock.calls[1][0].id).toBe(id);
  expect(Array.from(host.querySelectorAll("button")).some(button => button.textContent === "Xuất PDF")).toBe(false);
});
it("offers PDF only for the mixed paper and puts model answers in a separate web view", async () => {
  await prepare(true); await click("Tạo đề thi");
  expect(Array.from(host.querySelectorAll("button")).some(button => button.textContent === "Lưu vào Quiz")).toBe(false);
  expect(host.querySelector(".exam-paper")?.textContent).not.toContain("MODEL ANSWER ONLY");
  await click("Đáp án & lời giải"); expect(host.querySelector(".exam-paper")?.textContent).toContain("MODEL ANSWER ONLY");
  await click("Xuất PDF"); expect(api.pdf).toHaveBeenCalledTimes(1); expect(api.pdf.mock.calls[0][0].draft.sections).toHaveLength(5);
});
it("preserves the previous draft and source text when generation fails", async () => {
  await prepare(); await click("Tạo đề thi"); const before = host.querySelector(".exam-paper")!.textContent;
  api.generate.mockRejectedValue(new Error("Network offline")); await click("Tạo đề thi");
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("Network offline");
  expect(host.querySelector(".exam-paper")!.textContent).toBe(before);
  expect((host.querySelector('[aria-label="Nội dung Văn bản"]') as HTMLTextAreaElement).value).toContain("Water freezes");
});
it("sends the selected difficulty and supports the source-reference button", async () => {
  await mount(); await set('[aria-label="Độ khó"]', "hard");
  await set('[aria-label="Văn bản nguồn"]', examFixture().sources[0].text); await click("Thêm văn bản");
  await act(async () => (host.querySelector('input[type="checkbox"]') as HTMLInputElement).click()); await click("Phân tích cấu trúc");
  expect(api.analyze.mock.calls[0][0].difficulty).toBe("hard");
  await act(async () => (host.querySelectorAll('input[type="checkbox"]')[1] as HTMLInputElement).click()); await click("Tạo đề thi"); await click("Đáp án & lời giải");
  await act(async () => (host.querySelector(".exam-references button") as HTMLButtonElement).click()); expect(host.querySelector(".exam-reference-panel")?.textContent).toContain("Water freezes");
});
it("regenerates just one question and keeps all other sections", async () => {
  await prepare(true); await click("Tạo đề thi"); await click("Chỉnh sửa đề");
  const before = host.querySelector(".exam-paper")!.textContent;
  api.generate.mockImplementationOnce(async (_settings: ExamSettings, sources: ExamSource[], blueprint: ExamBlueprint) => {
    const example = examFixture(); const question = { ...example.draft.sections[0].questions[0], prompt: "A replacement question about freezing water under pressure.", references: [{ sourceId: sources[0].id, page: 1, excerpt: "Water freezes at 0°C" }] };
    return { draft: { title: example.draft.title, description: "", warnings: [], sections: [{ id: blueprint.sections[0].id, questions: [question] }] } };
  });
  await click("Tạo lại câu này");
  expect(api.generate.mock.calls[1][2].sections[0].count).toBe(1); expect(api.generate.mock.calls[1][3]).toHaveLength(5);
  expect(host.querySelector(".exam-paper")?.textContent).toContain("A replacement question");
  expect(before).toContain("New concept 1-0"); expect(host.querySelector(".exam-paper")?.textContent).toContain("New concept 1-0");
});
it("blocks unreadable source content before spending a generation request", async () => {
  await mount(); await set('[aria-label="Văn bản nguồn"]', "[UNREADABLE] This source still has missing equations and enough other words."); await click("Thêm văn bản");
  await act(async () => (host.querySelector('input[type="checkbox"]') as HTMLInputElement).click()); await click("Phân tích cấu trúc");
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("[UNREADABLE]"); expect(api.analyze).not.toHaveBeenCalled();
});
it("does not expose another account's cached draft", async () => {
  const work = emptyExamWorkspace(); work.result = examFixture(); persistExamWorkspace("user-a", work);
  await mount("user-b"); expect(host.querySelector(".exam-paper")).toBeNull();
  await mount("user-a"); expect(host.querySelector(".exam-paper")?.textContent).toContain("Practice Exam");
});
