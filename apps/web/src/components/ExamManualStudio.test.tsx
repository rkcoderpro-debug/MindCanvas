// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import JSZip from "jszip";
import { buildDocxPackage, DEFAULT_PAGE } from "../lib/docxModel";
import ExamManualStudio from "./ExamManualStudio";
import { getStudioOriginal, loadStudioWorkspace, listStudioItems } from "../lib/examStudioStore";
import { readLocalBytes } from "../lib/examManualSource";
import { studioRawExam } from "../lib/examStudioTestData";
const api = vi.hoisted(() => ({ quota: vi.fn(), read: vi.fn(), analyze: vi.fn(), generate: vi.fn() }));
vi.mock("../lib/api", () => ({ consumeAiManualUsage: api.quota, readExamFile: api.read, analyzeExamSources: api.analyze, generateExamDraft: api.generate }));
vi.mock("../lib/examStore", () => ({ listSavedExams: async () => [] }));
vi.mock("./DocxViewer", () => ({ default: ({ dataUrl }: { dataUrl: string }) => <div data-testid="word-preview">{dataUrl}</div> }));
let host: HTMLDivElement, root: Root, owner: string, caseId = 0;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; host = document.createElement("div"); document.body.append(host); root = createRoot(host); owner = `studio-case-${++caseId}`; localStorage.clear();
  Object.values(api).forEach(mock => mock.mockReset()); api.quota.mockResolvedValue({ ok: true });
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); localStorage.clear(); vi.restoreAllMocks(); });
async function waitUntil(check: () => boolean) { for (let n = 0; n < 100; n++) { if (check()) return; await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); }); } expect(check()).toBe(true); }
async function mount(user = owner) { await act(async () => root.render(<ExamManualStudio key={user} owner={user} onAuto={() => {}}/>)); }
function button(text: string) { const found = Array.from(host.querySelectorAll("button")).find(button => button.textContent === text); expect(found, text).toBeTruthy(); return found!; }
async function click(text: string) { await act(async () => button(text).click()); await waitUntil(() => host.querySelector(".exam-manual-studio")?.getAttribute("aria-busy") !== "true"); }
async function input(selector: string, value: string) {
  const field = host.querySelector(selector) as HTMLInputElement; expect(field).toBeTruthy();
  await act(async () => { const prototype = field.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : field.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(field, value); field.dispatchEvent(new Event(field.tagName === "SELECT" ? "change" : "input", { bubbles: true })); });
}
async function upload(selector: string, file: File) {
  const field = host.querySelector(selector) as HTMLInputElement; Object.defineProperty(field, "files", { configurable: true, value: [file] }); await act(async () => field.dispatchEvent(new Event("change", { bubbles: true })));
  await waitUntil(() => host.querySelector(".exam-manual-studio")?.getAttribute("aria-busy") !== "true");
}
async function prepareOnline() { await mount(); await input('[aria-label="Chế độ đề Manual"]', "online"); await input('[aria-label="Số câu đề tương tác"]', "5"); await upload('[aria-label="File tài liệu Manual"]', new File(["UNIQUE ORIGINAL BODY MUST NOT BE IN PROMPT"], "notes.txt")); await click("Lấy prompt"); }
function response() { const raw = studioRawExam(); raw.questions[0].references![0].fileId = loadStudioWorkspace(owner).session!.sources[0].id; return raw; }
function noAuto() { expect(api.read).not.toHaveBeenCalled(); expect(api.analyze).not.toHaveBeenCalled(); expect(api.generate).not.toHaveBeenCalled(); }
it("Word path needs only original template and preferences, without JSON or OCR confirmation", async () => {
  await mount(); expect(host.querySelector('[aria-label="JSON đề tương tác"]')).toBeNull(); expect(host.querySelector('input[type="checkbox"]')).toBeNull();
  await upload('[aria-label="File đề mẫu Manual"]', new File(["SOURCE CONTENT NEVER EMBEDDED"], "Midterm.pdf")); await input('[aria-label="Mức độ Manual"]', "hard"); await click("Lấy prompt");
  const prompt = (host.querySelector('[aria-label="Prompt Studio"]') as HTMLTextAreaElement).value; expect(prompt).toContain("de-thi.docx"); expect(prompt).toContain("hard"); expect(prompt).not.toContain("SOURCE CONTENT NEVER EMBEDDED"); expect(api.quota).toHaveBeenCalledTimes(1); noAuto();
});
it("image and scanned-file sources go directly to external AI with no intermediate OCR step", async () => {
  await mount(); await upload('[aria-label="File đề mẫu Manual"]', new File(["image bytes"], "template.png")); await click("Lấy prompt"); expect(host.querySelector('[aria-label="Prompt Studio"]')).toBeTruthy(); expect(host.textContent).not.toContain("[UNREADABLE]"); expect(host.querySelector('[aria-label="Prompt OCR Manual"]')).toBeNull(); noAuto();
});
it("imports a mixed JSON exam, previews without solutions and enters a dedicated runner", async () => {
  await prepareOnline(); expect(api.quota).not.toHaveBeenCalled(); await input('[aria-label="JSON đề tương tác"]', JSON.stringify(response())); await click("Nhập đề tương tác");
  expect(host.querySelector(".exam-paper")?.textContent).toContain("Mixed practice"); expect(host.querySelector(".exam-paper")?.textContent).not.toContain("SOLUTION"); expect(api.quota).toHaveBeenCalledTimes(1);
  await click("Làm bài trên MindCanvas"); await waitUntil(() => Array.from(host.querySelectorAll("button")).some(button => button.textContent === "Bắt đầu làm bài")); expect(host.querySelector('[aria-label="JSON đề tương tác"]')).toBeNull(); expect(host.textContent).not.toContain("SOLUTION"); noAuto();
});
it("retains invalid JSON and previous preview without spending another quota request", async () => {
  await prepareOnline(); await input('[aria-label="JSON đề tương tác"]', JSON.stringify(response())); await click("Nhập đề tương tác"); const before = host.querySelector(".exam-paper")!.textContent;
  const bad = response(); bad.questions[0].options!.pop(); const text = JSON.stringify(bad); await input('[aria-label="JSON đề tương tác"]', text); await click("Nhập đề tương tác");
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("Câu 1"); expect((host.querySelector('[aria-label="JSON đề tương tác"]') as HTMLTextAreaElement).value).toBe(text); expect(host.querySelector(".exam-paper")?.textContent).toBe(before); expect(api.quota).toHaveBeenCalledTimes(1); noAuto();
});
it("retries quota failures with the same identity and retains valid input", async () => {
  await prepareOnline(); const text = JSON.stringify(response()); api.quota.mockRejectedValueOnce(new Error("Quota exceeded")); await input('[aria-label="JSON đề tương tác"]', text); await click("Nhập đề tương tác"); expect(host.querySelector(".exam-paper")).toBeNull(); expect((host.querySelector('[aria-label="JSON đề tương tác"]') as HTMLTextAreaElement).value).toBe(text);
  await click("Nhập đề tương tác"); expect(api.quota.mock.calls[1][0]).toBe(api.quota.mock.calls[0][0]); noAuto();
});
it("reimports the same result without resetting the stored exam revision or spending quota twice", async () => {
  await prepareOnline(); await input('[aria-label="JSON đề tương tác"]', JSON.stringify(response())); await click("Nhập đề tương tác"); const before = (await listStudioItems(owner))[0]; await click("Nhập đề tương tác"); const after = (await listStudioItems(owner))[0];
  expect(after.id).toBe(before.id); expect(after.kind === "online" && before.kind === "online" && after.exam.revision === before.exam.revision).toBe(true); expect(api.quota).toHaveBeenCalledTimes(1); noAuto();
});
it("restores pending prompt, JSON and original files for the owner but not another account", async () => {
  await prepareOnline(); await input('[aria-label="JSON đề tương tác"]', "{unfinished JSON"); const session = loadStudioWorkspace(owner).session!; await mount("other-studio-account"); expect(host.querySelector('[aria-label="Prompt Studio"]')).toBeNull();
  await mount(owner); expect((host.querySelector('[aria-label="JSON đề tương tác"]') as HTMLTextAreaElement).value).toBe("{unfinished JSON"); expect((host.querySelector('[aria-label="Prompt Studio"]') as HTMLTextAreaElement).value).toBe(session.prompt); expect(await getStudioOriginal(owner, session.sources[0].id)).not.toBeNull(); noAuto();
});
it("imports two real DOCX files, preserves exact bytes and shows answers only through their button", async () => {
  await mount(); const base64 = await buildDocxPackage({ schemaVersion: 1, blocks: [{ type: "paragraph", style: "Normal", runs: [{ text: "Exam layout", fontFamily: "Times New Roman", fontSize: 12 }] }], page: DEFAULT_PAGE, warnings: [] }); const bytes = Uint8Array.from(atob(base64), ch => ch.charCodeAt(0)).buffer;
  await upload('[aria-label="Word đề kết quả"]', new File([bytes], "de-thi.docx")); await upload('[aria-label="Word đáp án kết quả"]', new File([bytes], "dap-an-loi-giai.docx")); await click("Lưu & xem Word"); await waitUntil(() => !!host.querySelector('[data-testid="word-preview"]'));
  expect(button("Đáp án & lời giải Word").getAttribute("aria-expanded")).toBe("false"); await click("Đáp án & lời giải Word"); await waitUntil(() => !host.textContent?.includes("Đang mở Word")); expect(button("Xem đề Word").getAttribute("aria-expanded")).toBe("true");
  const item = (await listStudioItems(owner))[0]; expect(item.kind).toBe("word"); if (item.kind !== "word") throw new Error("wrong item"); const file = await getStudioOriginal(owner, item.examFileId); expect(new Uint8Array(await readLocalBytes(file!))).toEqual(new Uint8Array(bytes)); expect(api.quota).not.toHaveBeenCalled(); noAuto();
});
it("rejects a text file renamed DOCX and leaves the library unchanged", async () => { await mount(); await upload('[aria-label="Word đề kết quả"]', new File(["not a Word file"], "fake.docx")); await click("Lưu & xem Word"); expect(host.querySelector('[role="alert"]')).toBeTruthy(); expect(await listStudioItems(owner)).toHaveLength(0); noAuto(); });
it("reads a returned JSON file without uploading it to Auto endpoints", async () => { await prepareOnline(); await upload('[aria-label="File JSON tương tác"]', new File([JSON.stringify(response())], "result.json")); await click("Nhập đề tương tác"); expect(host.querySelector(".exam-paper")?.textContent).toContain("Mixed practice"); noAuto(); });
it("validates the exact selected types and count before quota", async () => { await prepareOnline(); await input('[aria-label="Số câu đề tương tác"]', "6"); await click("Lấy prompt"); await input('[aria-label="JSON đề tương tác"]', JSON.stringify(response())); await click("Nhập đề tương tác"); expect(host.querySelector('[role="alert"]')?.textContent).toContain("Cần 6 câu"); expect(api.quota).not.toHaveBeenCalled(); noAuto(); });
