// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import TakenoteBuilderPage from "./TakenoteBuilderPage";
import { emptyNoteWorkspace, loadNoteWorkspace, persistNoteWorkspace, listNotes } from "../lib/takenoteStore";
import { listDocuments } from "../lib/documentStore";
import { LearningNavigationProvider, LearningToolScope } from "../lib/learningNavigation";
const api = vi.hoisted(() => ({ generate: vi.fn(), usage: vi.fn(), read: vi.fn(), copy: vi.fn() }));
vi.mock("../lib/api", () => ({ generateTakenote: api.generate, consumeAiManualUsage: api.usage, readExamFile: api.read }));
vi.mock("../lib/aiSource", () => ({ writeClipboardText: api.copy }));
let root: Root, host: HTMLDivElement;
beforeEach(() => { (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; globalThis.indexedDB = new IDBFactory(); localStorage.clear(); Object.values(api).forEach(mock => mock.mockReset()); api.usage.mockResolvedValue({ ok: true }); api.copy.mockResolvedValue(undefined); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
async function waitFor(check: () => boolean) { for (let i = 0; i < 70; i++) { if (check()) return; await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); }); } expect(check()).toBe(true); }
async function mount(owner = "alice", navigation = false) { await act(async () => root.render(navigation ? <LearningNavigationProvider owner={owner} initialTab="exams"><LearningToolScope tab="exams" active><TakenoteBuilderPage key={owner} owner={owner} documents={[]} onSaved={() => {}} onDocumentsChanged={() => {}}/></LearningToolScope></LearningNavigationProvider> : <TakenoteBuilderPage key={owner} owner={owner} documents={[]} onSaved={() => {}} onDocumentsChanged={() => {}}/>)); await waitFor(() => !!host.querySelector('textarea[aria-label="Nội dung nguồn Takenote"]')); }
const button = (label: string) => [...host.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent === label || node.getAttribute("aria-label") === label)!;
async function click(label: string) { expect(button(label), label).toBeTruthy(); await act(async () => button(label).click()); }
async function set(label: string, value: string) { const element = host.querySelector<HTMLTextAreaElement>(`[aria-label="${label}"]`)!; await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(element, value); element.dispatchEvent(new Event("input", { bubbles: true })); }); }
const source = "Kinetic energy equals half of mass multiplied by speed squared. Mass is measured in kg, speed in m/s, energy in J.";
const response = { note: { title: "Động năng", content: "## Công thức\n\n$E_k=\\frac12 mv^2$", warnings: [] } };
it("creates a source-grounded Auto note, saves it and returns to the retained setup", async () => {
  api.generate.mockResolvedValue(response); await mount("alice", true); await set("Nội dung nguồn Takenote", source); await click("Tạo Takenote bằng AI");
  await waitFor(() => !!host.querySelector('.note-result:not([hidden]) .takenote-content'));
  expect(api.generate).toHaveBeenCalledTimes(1); expect(api.generate.mock.calls[0][1][0].text).toBe(source); expect((await listNotes("alice"))[0].title).toBe("Động năng");
  await click("Quay lại thiết lập"); expect(host.querySelector('.note-result')?.hasAttribute("hidden")).toBe(true); expect(host.textContent).toContain("Nội dung đã nhập");
  await waitFor(() => !!host.querySelector('[aria-label="Nội dung Nội dung đã nhập"]'));
});
it("keeps source text after AI failure and restores the owner's draft after remount", async () => {
  api.generate.mockRejectedValue(new Error("AI is busy")); await mount(); await set("Nội dung nguồn Takenote", source); await click("Tạo Takenote bằng AI");
  await waitFor(() => host.textContent?.includes("AI is busy") ?? false);
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
  expect((await loadNoteWorkspace("alice")).sources[0].text).toBe(source);
  await mount("bob"); expect((host.querySelector('[aria-label="Nội dung nguồn Takenote"]') as HTMLTextAreaElement).value).toBe("");
  await mount("alice"); expect(host.textContent).toContain("Nội dung đã nhập");
});
it("imports Manual Markdown without embedding Auto source text and charges one request across copy/import", async () => {
  const work = emptyNoteWorkspace(); work.mode = "manual"; work.sourceText = "PRIVATE_SOURCE_NOT_IN_PROMPT"; await persistNoteWorkspace("alice", work);
  await act(async () => root.render(<TakenoteBuilderPage owner="alice" documents={[]} onSaved={() => {}} onDocumentsChanged={() => {}}/>));
  await waitFor(() => !!host.querySelector('[aria-label="Prompt Takenote"]'));
  expect((host.querySelector('[aria-label="Prompt Takenote"]') as HTMLTextAreaElement).value).not.toContain("PRIVATE_SOURCE_NOT_IN_PROMPT");
  await click("Sao chép prompt"); await waitFor(() => api.copy.mock.calls.length === 1);
  await set("Nội dung kết quả Takenote", "# Bài học\n\nKiến thức đã được tổng hợp đầy đủ để học và ôn tập."); await click("Nhập & xem");
  await waitFor(() => !!host.querySelector('.note-result:not([hidden]) .takenote-content'));
  expect(api.usage).toHaveBeenCalledTimes(1); expect((await listNotes("alice"))).toHaveLength(1);
});
it("blocks unreadable sources and refuses empty Manual HTML before charging", async () => {
  await mount(); await set("Nội dung nguồn Takenote", `[UNREADABLE] ${source}`); await click("Tạo Takenote bằng AI"); expect(api.generate).not.toHaveBeenCalled();
  await click("AI Manual"); await act(async () => [...host.querySelectorAll("button")].find(node => node.textContent?.includes("Takenote trực quan HTML"))!.click());
  await set("Nội dung kết quả Takenote", "not HTML"); await click("Nhập & xem"); expect(api.usage).not.toHaveBeenCalled(); expect(host.querySelector('[role="alert"]')?.textContent).toContain("HTML");
});
it("saves interactive HTML in Documents with original bytes and account isolation", async () => {
  api.generate.mockResolvedValue({ note: { title: "Thử động năng", content: '<html><body><h1>Động năng</h1><button id="go">Thử</button><script>document.querySelector("#go").onclick=()=>document.body.dataset.changed="yes"</script></body></html>', warnings: [] } });
  await mount(); await act(async () => [...host.querySelectorAll("button")].find(node => node.textContent?.includes("Takenote trực quan HTML"))!.click());
  await set("Nội dung nguồn Takenote", source); await click("Tạo Takenote bằng AI"); await waitFor(() => !!host.querySelector('.note-result:not([hidden]) iframe'));
  expect(host.querySelector("iframe")?.getAttribute("sandbox")).toBe("allow-scripts");
  await click("Lưu vào Tài liệu"); await waitFor(() => host.textContent?.includes("Bạn có thể mở lại") ?? false);
  const documents = await listDocuments("alice"); expect(documents).toHaveLength(1); expect(documents[0].kind).toBe("html"); expect(documents[0].generatedKind).toBe("takenote"); expect(await listDocuments("bob")).toEqual([]);
  await click("Lưu vào Tài liệu"); await waitFor(() => !host.textContent?.includes("Đang lưu vào Tài liệu")); expect(await listDocuments("alice")).toHaveLength(1);
  await click("Sửa HTML"); await set("Chỉnh sửa nội dung Takenote", "<main><h1>Bản mới</h1><p>Nội dung thay đổi</p></main>"); await click("Lưu thay đổi"); await waitFor(() => !host.querySelector(".note-editor"));
  await click("Lưu vào Tài liệu"); await waitFor(() => !host.textContent?.includes("Đang lưu vào Tài liệu")); expect(await listDocuments("alice")).toHaveLength(2); expect((await listDocuments("alice")).find(item => item.id === documents[0].id)?.dataUrl).toBe(documents[0].dataUrl);
});
