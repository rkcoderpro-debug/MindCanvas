// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BoardState } from "@mindcanvas/shared";
import CanvasBoard from "./CanvasBoard";
import { blankBoard } from "../lib/board";
let root: Root, host: HTMLDivElement, current: BoardState;
const commit = vi.fn();
function Harness({ initial }: { initial: BoardState }) {
  const [board, setBoard] = useState(initial); current = board;
  return <CanvasBoard board={board} onChange={b => { commit(b); setBoard(b); }} onUndo={() => {}} onRedo={() => {}} onSave={() => {}}/>;
}
function pointer(target: Element, type: string, x: number, y: number) {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperty(e, "pointerId", { value: 1 }); target.dispatchEvent(e);
}
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  SVGElement.prototype.setPointerCapture = () => {}; SVGElement.prototype.hasPointerCapture = () => false;
  SVGElement.prototype.releasePointerCapture = () => {};
  host = document.createElement("div"); document.body.append(host); root = createRoot(host); commit.mockClear();
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
describe("Canvas interactions", () => {
  it("adds the first editable mind-map node to an empty board", async () => {
    await act(async () => root.render(<Harness initial={blankBoard()}/>));
    await act(async () => (host.querySelector('[aria-label="Node sơ đồ tư duy"]') as HTMLButtonElement).click());
    expect(current.nodes).toHaveLength(1); expect(current.edges).toHaveLength(0);
    await act(async () => host.querySelector("[data-element]")!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
    expect(host.querySelector("textarea")).not.toBeNull();
  });
  it("moves text in one undoable commit per gesture", async () => {
    const b = { ...blankBoard(), texts: [{ id: "txt", text: "Hello", x: 20, y: 40, width: 200 }] };
    await act(async () => root.render(<Harness initial={b}/>));
    const svg = host.querySelector("svg.canvas-svg")!;
    await act(async () => pointer(host.querySelector('[data-element="txt"]')!, "pointerdown", 20, 40));
    await act(async () => pointer(svg, "pointermove", 100, 120));
    await act(async () => pointer(svg, "pointermove", 120, 140));
    expect(commit).not.toHaveBeenCalled();
    await act(async () => pointer(svg, "pointerup", 120, 140));
    expect(commit).toHaveBeenCalledTimes(1); expect(current.texts[0]).toMatchObject({ x: 120, y: 140 });
  });
  it("draws over text without changing or selecting the text, and cancels interrupted strokes", async () => {
    const b = { ...blankBoard(), texts: [{ id: "txt", text: "Hello", x: 20, y: 40, width: 200 }] };
    await act(async () => root.render(<Harness initial={b}/>));
    await act(async () => (host.querySelector('[aria-label="Bút"]') as HTMLButtonElement).click());
    const svg = host.querySelector("svg.canvas-svg")!;
    await act(async () => pointer(svg, "pointerdown", 20, 40));
    await act(async () => pointer(svg, "pointermove", 100, 120));
    await act(async () => pointer(svg, "pointerup", 100, 120));
    expect(current.drawings).toHaveLength(1); expect(current.texts).toEqual(b.texts);
    await act(async () => pointer(svg, "pointerdown", 20, 40));
    await act(async () => pointer(svg, "pointercancel", 20, 40));
    expect(current.drawings).toHaveLength(1);
  });
  it("creates an inline text editor, escapes without inserting an element", async () => {
    await act(async () => root.render(<Harness initial={blankBoard()}/>));
    await act(async () => (host.querySelector('[aria-label="Chữ"]') as HTMLButtonElement).click());
    await act(async () => pointer(host.querySelector("svg.canvas-svg")!, "pointerdown", 120, 140));
    expect(host.querySelector("textarea")).not.toBeNull();
    await act(async () => host.querySelector("textarea")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(current.texts).toHaveLength(0); expect(host.querySelector("textarea")).toBeNull();
  });
});
