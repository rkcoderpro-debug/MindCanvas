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
  expect(latest.a4?.paper).toBe("ruled");
  expect(host.querySelector(".a4-page-text")).toBeTruthy();
  expect(host.querySelector('[data-tool="frame"]')).toBeNull();
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


it("scrolls the paper in both directions even over the writing area and leaves zoom gestures alone", async () => {
  await act(async () => root.render(<Harness/>));
  const scroller = host.querySelector<HTMLElement>(".a4-scroll")!;
  const dispatch = (target: Element, deltaY: number, ctrlKey = false) => {
    const wheel = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY, ctrlKey });
    target.dispatchEvent(wheel);
    return wheel.defaultPrevented;
  };
  const field = host.querySelector<HTMLElement>(".a4-page-text")!;
  await act(async () => { field.focus(); expect(dispatch(field, 240)).toBe(true); });
  expect(scroller.scrollTop).toBe(240);
  await act(async () => { expect(dispatch(host.querySelector("svg.canvas-svg")!, -90)).toBe(true); });
  expect(scroller.scrollTop).toBe(150);
  await act(async () => { dispatch(field, 200, true); });
  expect(scroller.scrollTop).toBe(150);
  expect(save).not.toHaveBeenCalled();
});

it("hides the properties trigger and moves keyboard focus to Close until the panel is closed", async () => {
  await act(async () => root.render(<Harness/>));
  const editor = host.querySelector(".paper-canvas")!;
  expect(editor.getAttribute("data-inspector-open")).toBe("false");
  await click("Mở thanh thuộc tính");
  expect(editor.querySelector(".inspector-toggle")).toBeNull();
  expect(editor.getAttribute("data-inspector-open")).toBe("true");
  expect(document.activeElement).toBe(editor.querySelector(".inspector-close"));
  await click("Đóng thanh thuộc tính");
  expect(editor.getAttribute("data-inspector-open")).toBe("false");
  expect(document.activeElement).toBe(editor.querySelector(".inspector-toggle"));
});

it("switches from line typing to free text and commits that text with Enter", async () => {
  SVGElement.prototype.setPointerCapture = () => {};
  SVGElement.prototype.hasPointerCapture = () => false;
  await act(async () => root.render(<Harness/>));
  await act(async () => host.querySelector<HTMLButtonElement>('[data-tool="text"]')!.click());
  expect(host.querySelector(".a4-page-text")).toBeNull();
  const svg = host.querySelector("svg.canvas-svg")!;
  const pointer = new MouseEvent("pointerdown", { bubbles: true, cancelable: true, clientX: 90, clientY: 100 });
  Object.defineProperties(pointer, { pointerType: { value: "mouse" }, pointerId: { value: 1 } });
  await act(async () => svg.dispatchEvent(pointer));
  const field = host.querySelector<HTMLTextAreaElement>(".inline-editor")!;
  expect(field).toBeTruthy();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field, "Ghi chú");
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, shiftKey: true }));
  });
  expect(host.querySelector(".inline-editor")).toBeTruthy();
  await act(async () => field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
  expect(host.querySelector(".inline-editor")).toBeNull();
  expect(latest.texts[0]).toMatchObject({ text: "Ghi chú", color: "#18213b" });
});
