// @vitest-environment jsdom
import { LearningNavigationProvider, LearningToolScope } from "../lib/learningNavigation";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ExamSettings, ExamSource, ExamBlueprint } from "@mindcanvas/shared";
import type { QuizStore } from "../hooks/useQuizzes";
import { examFixture } from "../lib/examTestData";
import { persistExamWorkspace, emptyExamWorkspace, loadExamWorkspace } from "../lib/examWorkspace";
import ExamBuilderPage from "./ExamBuilderPage";
const api = vi.hoisted(() => ({ read: vi.fn(), analyze: vi.fn(), generate: vi.fn(), pdf: vi.fn(), save: vi.fn(), quiz: vi.fn(), usage: vi.fn() }));
vi.mock("../lib/api", () => ({ readExamFile: api.read, analyzeExamSources: api.analyze, generateExamDraft: api.generate, consumeAiManualUsage: api.usage }));
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
  api.usage.mockResolvedValue({ ok: true });
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
it("routes Manual to Word and interactive Studio without the legacy source confirmation UI", async () => {
  await mount(); await act(async () => (host.querySelector('button[aria-label="AI Manual"]') as HTMLButtonElement).click());
  expect(host.querySelector('[aria-label="Chế độ đề Manual"]')).toBeTruthy();
  expect(host.querySelector('[aria-label="Word đề kết quả"]')).toBeTruthy();
  expect(host.querySelector('[aria-label="Kết quả AI Manual"]')).toBeNull();
  expect(host.querySelector('input[type="checkbox"]')).toBeNull();
  await act(async () => (host.querySelector('button[aria-label="AI Auto"]') as HTMLButtonElement).click()); expect(button("Phân tích cấu trúc")).toBeTruthy();
});
it("creates from direct text in one action and opens a separate full-width result", async () => {
  await mount(); expect(host.querySelector(".exam-result-view")).toBeNull(); expect(host.querySelector(".exam-result-empty")).toBeNull();
  await set('[aria-label="Văn bản nguồn"]', examFixture().sources[0].text); await click("Tạo đề bằng AI");
  expect(api.analyze).toHaveBeenCalledTimes(1); expect(api.generate).toHaveBeenCalledTimes(1);
  expect(host.querySelector(".exam-builder-controls")?.hasAttribute("hidden")).toBe(true); expect(host.querySelector(".exam-result-view")?.hasAttribute("hidden")).toBe(false);
  await click("Quay lại thiết lập"); expect(host.querySelector(".exam-builder-controls")?.hasAttribute("hidden")).toBe(false); expect(host.querySelector(".exam-result-view")?.hasAttribute("hidden")).toBe(true);
  expect((host.querySelector('[aria-label="Nội dung Văn bản"]') as HTMLTextAreaElement).value).toContain("Water freezes");
});
it("accepts an uploaded template in the one-action flow", async () => {
  await mount(); await set('[aria-label="Hình thức đề"]', "paper"); api.read.mockResolvedValueOnce({ ...examFixture().sources[0], name: "sample.pdf" });
  const field = host.querySelector('[aria-label="Chọn đề mẫu"]') as HTMLInputElement; Object.defineProperty(field, "files", { configurable: true, value: [new File(["template"], "sample.pdf")] });
  await act(async () => field.dispatchEvent(new Event("change", { bubbles: true }))); await click("Tạo đề bằng AI");
  expect(api.generate.mock.calls[0][1][0].role).toBe("template"); expect(host.querySelector(".exam-paper")).toBeTruthy();
});
it("preserves independent settings and pending Auto text across mode switches", async () => {
  const switchMode = async (name: string) => act(async () => (host.querySelector(`button[aria-label="${name}"]`) as HTMLButtonElement).click());
  await mount(); await set('[aria-label="Độ khó"]', "hard"); await set('[aria-label="Văn bản nguồn"]', "Pending Auto information not yet submitted.");
  await switchMode("AI Manual"); await set('[aria-label="Mức độ Manual"]', "easy"); await switchMode("AI Auto");
  expect((host.querySelector('[aria-label="Độ khó"]') as HTMLSelectElement).value).toBe("hard"); expect((host.querySelector('[aria-label="Văn bản nguồn"]') as HTMLTextAreaElement).value).toContain("Pending Auto");
  await switchMode("AI Manual"); expect((host.querySelector('[aria-label="Mức độ Manual"]') as HTMLSelectElement).value).toBe("easy");
});
it("blocks unreadable direct input and preserves it for correction", async () => {
  await mount(); const text = "[UNREADABLE] Some formula is missing in the source."; await set('[aria-label="Văn bản nguồn"]', text); await click("Tạo đề bằng AI");
  expect(api.analyze).not.toHaveBeenCalled(); expect(api.generate).not.toHaveBeenCalled(); expect((host.querySelector('[aria-label="Văn bản nguồn"]') as HTMLTextAreaElement).value).toBe(text);
});
it("keeps direct-input sources after generation failure and retries without parallel requests", async () => {
  await mount(); await set('[aria-label="Văn bản nguồn"]', examFixture().sources[0].text); api.generate.mockRejectedValueOnce(new Error("Offline"));
  await click("Tạo đề bằng AI"); expect(host.querySelector('[role="alert"]')?.textContent).toContain("Offline");
  expect((host.querySelector('[aria-label="Nội dung Văn bản"]') as HTMLTextAreaElement).value).toContain("Water freezes");
  const generate = button("Tạo đề bằng AI"); await act(async () => { generate.click(); generate.click(); });
  expect(api.analyze).toHaveBeenCalledTimes(1); expect(api.generate).toHaveBeenCalledTimes(2); expect(host.querySelector(".exam-paper")).toBeTruthy();
});

it("returns to setup from a restored result even without an inner browser history entry", async () => {
  const work = emptyExamWorkspace(); work.result = examFixture(); persistExamWorkspace("user-a", work);
  await act(async () => root.render(<LearningNavigationProvider owner="user-a" initialTab="exams"><LearningToolScope tab="exams" active={true}><ExamBuilderPage owner="user-a" quizzes={quizzes} onOpenQuiz={() => {}}/></LearningToolScope></LearningNavigationProvider>));
  expect(host.querySelector(".exam-result-view")?.hasAttribute("hidden")).toBe(false);
  await click("Quay lại thiết lập"); expect(host.querySelector(".exam-builder-controls")?.hasAttribute("hidden")).toBe(false);
});
