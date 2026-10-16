// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import DocumentCreatorPage from "./DocumentCreatorPage";
import { saveNote, type SavedNote } from "../lib/takenoteStore";
import { emptyNoteSettings } from "../../../../packages/shared/src/takenotes.js";
import type { QuizStore } from "../hooks/useQuizzes";
import { LanguageProvider } from "../lib/i18n";
import { examFixture } from "../lib/examTestData";
const api = vi.hoisted(() => ({ exams: vi.fn() }));
vi.mock("../lib/examStore", () => ({ listSavedExams: api.exams }));
vi.mock("./ExamBuilderPage", () => ({ default: () => <div>Existing exam editor</div> }));
let root: Root, host: HTMLDivElement;
beforeEach(() => { (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; globalThis.indexedDB = new IDBFactory(); localStorage.clear(); api.exams.mockReset(); api.exams.mockResolvedValue([]); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
async function waitFor(check: () => boolean) { for (let i = 0; i < 60; i++) { if (check()) return; await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); }); } expect(check()).toBe(true); }
async function mount() { await act(async () => root.render(<LanguageProvider><DocumentCreatorPage owner="alice" documents={[]} quizzes={{} as QuizStore} onOpenQuiz={() => {}} onDocumentsChanged={() => {}}/></LanguageProvider>)); await waitFor(() => !!host.querySelector(".document-type-cards")); }
const button = (name: string) => [...host.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent?.includes(name))!;
async function click(name: string) { expect(button(name), name).toBeTruthy(); await act(async () => button(name).click()); }
it("starts with document types and retains note configuration when changing type", async () => {
  await mount(); expect(host.querySelector("h1")?.textContent).toBe("Tạo tài liệu"); expect(host.querySelector('[aria-label="Prompt Takenote"]')).toBeNull();
  await click("Tạo Takenote"); await waitFor(() => !!host.querySelector('[aria-label="Nội dung nguồn Takenote"]'));
  await click("Takenote trực quan HTML"); await click("AI Manual");
  expect((host.querySelector('[aria-label="Prompt Takenote"]') as HTMLTextAreaElement).value).toContain("HTML5");
  await click("Đổi loại tài liệu"); await click("Tạo đề thi"); expect(host.textContent).toContain("Existing exam editor");
  await click("Đổi loại tài liệu"); await click("Tạo Takenote");
  expect(button("Takenote trực quan HTML").getAttribute("aria-pressed")).toBe("true"); expect(button("AI Manual").getAttribute("aria-pressed")).toBe("true");
});
it("combines legacy exams and notes, filters and opens HTML notes in the real viewer", async () => {
  const fixture = examFixture(), exam = { ...fixture, id: crypto.randomUUID(), owner: "alice", updatedAt: new Date().toISOString(), generationMode: "auto" };
  api.exams.mockResolvedValue([exam]);
  const note: SavedNote = { id: crypto.randomUUID(), owner: "alice", format: "html", settings: { ...emptyNoteSettings(), format: "html" }, title: "Energy lesson", content: "<main><h1>Energy lesson</h1><p>Learning content</p></main>", warnings: [], updatedAt: new Date().toISOString(), generationMode: "manual" };
  await saveNote("alice", note); await mount(); await waitFor(() => host.querySelectorAll(".created-document-open").length === 2);
  await act(async () => [...host.querySelectorAll<HTMLButtonElement>('[aria-label="Lọc tài liệu đã tạo"] button')].find(node => node.textContent === "Takenote")!.click()); expect(host.querySelectorAll(".created-document-open")).toHaveLength(1);
  await click("Energy lesson"); await waitFor(() => !!host.querySelector('.note-result:not([hidden]) iframe'));
  expect(host.querySelector("iframe")?.getAttribute("sandbox")).toBe("allow-scripts"); expect(host.querySelector("iframe")?.getAttribute("srcdoc")).toContain("Energy lesson");
  await click("Quay lại thiết lập"); await click("Đổi loại tài liệu"); await click("Energy lesson");
  await waitFor(() => !!host.querySelector('.note-result:not([hidden]) iframe'));
});
