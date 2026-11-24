// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { BoardState } from "@mindcanvas/shared";
import { blankBoard } from "../lib/board";
import { A4_LINES, newA4Layout } from "../lib/a4Canvas";
import A4CanvasEditor from "./A4CanvasEditor";
import { LanguageProvider } from "../lib/i18n";

let host: HTMLDivElement, root: Root, latest: BoardState;
const save = vi.fn();
function Harness({ readOnly = false }: { readOnly?: boolean }) {
  const [board, setBoard] = useState<BoardState>(() => ({ ...blankBoard("Sổ A4"), a4: newA4Layout() }));
  latest = board;
  return <LanguageProvider><A4CanvasEditor board={board} readOnly={readOnly} onChange={next => { save(next); setBoard(next); }} onUndo={() => {}} onRedo={() => {}} onSave={() => {}}/></LanguageProvider>;
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  HTMLDialogElement.prototype.showModal ??= function () { this.open = true; };
  HTMLDialogElement.prototype.close ??= function () { this.open = false; };
  localStorage.setItem("mindcanvas:language", "vi");
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  save.mockClear();
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); localStorage.clear(); });
async function click(label: string) {
  const button = [...host.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent?.trim() === label || b.getAttribute("aria-label") === label)!;
  await act(async () => button.click());
}
async function enter(text: string) {
  const input = host.querySelector<HTMLTextAreaElement>(".a4-page-text")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, text);
    input.setSelectionRange(text.length, text.length);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
it("offers the existing drawing tools without mind maps and paginates written text", async () => {
  await act(async () => root.render(<Harness/>));
  expect(host.querySelector('[data-tool="pen"]')).not.toBeNull();
  expect(host.querySelector('[aria-label="Node sơ đồ tư duy"]')).toBeNull();
  await click("Gõ theo dòng");
  const content = Array.from({ length: A4_LINES + 4 }, (_, i) => "Nội dung " + (i + 1)).join("\n");
  await enter(content);
  expect(latest.a4!.pages.map(page => page.text).join("")).toBe(content);
  expect(latest.a4!.pages).toHaveLength(2);
  await click("Gõ theo dòng");
  await click("Tải PDF");
  expect(host.querySelector(".a4-pdf-preview img")?.getAttribute("src")).toContain("data:image/svg+xml");
});
it("shows a temporary page in continuous mode without storing it and saves an explicit blank page", async () => {
  await act(async () => root.render(<Harness/>));
  const layout = host.querySelector<HTMLSelectElement>(".a4-command select")!;
  await act(async () => { layout.value = "continuous"; layout.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(latest.a4!.pages).toHaveLength(1);
  expect(host.querySelectorAll("[data-a4-sheet]")).toHaveLength(2);
  await click("Thêm trang");
  expect(latest.a4!.pages).toHaveLength(2);
  expect(latest.a4!.pages[1].text).toBe("");
});
it("keeps the paper viewer and PDF available to read-only collaborators", async () => {
  await act(async () => root.render(<Harness readOnly/>));
  expect(host.querySelector('[data-tool="pen"]')).toBeNull();
  expect(host.querySelector(".a4-command select:disabled")).toBeTruthy();
  await click("Tải PDF");
  expect(host.querySelector(".a4-pdf-preview img")).toBeTruthy();
  expect(save).not.toHaveBeenCalled();
});
