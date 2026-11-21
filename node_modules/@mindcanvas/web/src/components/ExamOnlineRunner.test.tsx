// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { studioExam } from "../lib/examStudioTestData";
import type { OnlineAttempt } from "../lib/examOnline";
import ExamOnlineRunner from "./ExamOnlineRunner";
const storage = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), back: vi.fn() }));
vi.mock("../lib/examStudioStore", () => ({ loadOnlineAttempt: storage.load, saveOnlineAttempt: storage.save }));
let host: HTMLDivElement, root: Root;
beforeEach(() => { (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; host = document.createElement("div"); document.body.append(host); root = createRoot(host); storage.load.mockReset().mockResolvedValue(null); storage.save.mockReset().mockResolvedValue(undefined); storage.back.mockReset(); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); vi.restoreAllMocks(); });
async function mount(exam = studioExam()) { await act(async () => root.render(<ExamOnlineRunner owner="runner-user" exam={exam} onBack={storage.back} onReference={() => {}}/>)); }
function button(text: string) { return Array.from(host.querySelectorAll("button")).find(button => button.textContent === text)!; }
async function click(text: string) { await act(async () => button(text).click()); }
async function input(label: string, value: string) {
  const field = host.querySelector(`[aria-label="${label}"]`) as HTMLInputElement;
  await act(async () => { Object.getOwnPropertyDescriptor(field.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(field, value); field.dispatchEvent(new Event("input", { bubbles: true })); });
}
it("hides all model answers and explanations until submission, then grades and locks responses", async () => {
  await mount(); expect(host.textContent).not.toContain("SOLUTION"); expect(host.textContent).not.toContain("MODEL ESSAY ANSWER ONLY"); await click("Bắt đầu làm bài");
  await act(async () => (host.querySelector('[aria-label="Câu 1, lựa chọn A"]') as HTMLInputElement).click());
  await input("Câu 2, State", "solid"); await input("Câu 2, Next state", "liquid"); await input("Kết quả câu 3", "2,5"); await input("Đơn vị câu 3", "m/s"); await input("Bài làm câu 4", "solid"); await input("Bài làm câu 5", "My essay.");
  expect(host.textContent).not.toContain("SOLUTION"); await act(async () => { button("Nộp bài").click(); button("Nộp bài").click(); });
  expect(host.textContent).toContain("SOLUTION NUMERIC ONLY"); expect(host.textContent).toContain("MODEL ESSAY ANSWER ONLY"); expect(host.textContent).toContain("Điểm tự động: 6 / 6"); expect(host.textContent).toContain("Còn 1 câu cần tự chấm");
  expect(host.querySelector("fieldset:disabled")).toBeTruthy(); await input("Tự chấm câu 5", "3"); expect(host.textContent).toContain("Tổng điểm: 9 / 10");
  expect(storage.save.mock.calls.filter(call => (call[2] as OnlineAttempt).submittedAt !== null)).toHaveLength(2);
});
it("restores an unfinished attempt without revealing answers", async () => {
  const exam = studioExam(); storage.load.mockResolvedValue({ examId: exam.id, revision: exam.revision, startedAt: Date.now() - 1000, endsAt: null, submittedAt: null, responses: { "numeric-1": { text: "2.5", unit: "m/s" }, "mcq-1": { choice: 0 } }, selfScores: {} });
  await mount(exam); expect((host.querySelector('[aria-label="Kết quả câu 3"]') as HTMLInputElement).value).toBe("2.5"); expect((host.querySelector('[aria-label="Câu 1, lựa chọn A"]') as HTMLInputElement).checked).toBe(true); expect(host.textContent).not.toContain("SOLUTION");
});
it("restores submitted results and self-assessment", async () => {
  const exam = studioExam(), startedAt = Date.now() - 1000; storage.load.mockResolvedValue({ examId: exam.id, revision: exam.revision, startedAt, endsAt: null, submittedAt: startedAt + 500, responses: { "mcq-1": { choice: 0 } }, selfScores: { "essay-1": 4 } });
  await mount(exam); expect(host.textContent).toContain("Tổng điểm: 5 / 10"); expect(host.textContent).toContain("SOLUTION");
});
it("submits an expired resumed attempt immediately and only once", async () => {
  const exam = studioExam(); exam.durationMinutes = 1; const startedAt = Date.now() - 120000;
  storage.load.mockResolvedValue({ examId: exam.id, revision: exam.revision, startedAt, endsAt: startedAt + 60000, submittedAt: null, responses: { "mcq-1": { choice: 0 } }, selfScores: {} });
  await mount(exam); expect(host.textContent).toContain("Kết quả bài làm"); expect(storage.save).toHaveBeenCalledTimes(1);
});
it("submits when the live countdown expires", async () => {
  vi.useFakeTimers(); const exam = studioExam(); exam.durationMinutes = 1; await mount(exam); await click("Bắt đầu làm bài");
  await act(async () => vi.advanceTimersByTimeAsync(60000)); expect(host.textContent).toContain("Kết quả bài làm");
});
it("keeps unsaved responses and reports save errors instead of claiming persistence", async () => {
  storage.save.mockRejectedValue(new Error("quota")); await mount(); await click("Bắt đầu làm bài"); await input("Kết quả câu 3", "2.5");
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("Chưa lưu được"); expect((host.querySelector('[aria-label="Kết quả câu 3"]') as HTMLInputElement).value).toBe("2.5");
  await click("Quay lại thư viện đề"); expect(storage.back).not.toHaveBeenCalled(); storage.save.mockResolvedValue(undefined); await click("Thử lưu lại bài làm"); await click("Quay lại thư viện đề"); expect(storage.back).toHaveBeenCalledTimes(1);
});
it("waits for the latest save before leaving the attempt", async () => {
  let complete!: () => void; storage.save.mockImplementation(() => new Promise<void>(resolve => { complete = resolve; }));
  await mount(); await click("Bắt đầu làm bài"); await click("Quay lại thư viện đề"); expect(storage.back).not.toHaveBeenCalled(); await act(async () => complete()); expect(storage.back).toHaveBeenCalledTimes(1);
});
it("a new attempt clears prior responses and hides solutions again", async () => { await mount(); await click("Bắt đầu làm bài"); await click("Nộp bài"); expect(host.textContent).toContain("SOLUTION"); await click("Làm lượt mới"); expect(host.textContent).not.toContain("SOLUTION"); expect((host.querySelector('[aria-label="Kết quả câu 3"]') as HTMLInputElement).value).toBe(""); });
