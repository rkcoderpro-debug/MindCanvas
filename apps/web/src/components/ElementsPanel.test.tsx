// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { blankBoard } from "../lib/board";
import ElementsPanel from "./ElementsPanel";

let host: HTMLDivElement, root: Root;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

describe("Elements panel", () => {
  it("keeps every large-list row available and filters by its full text", async () => {
    const board = { ...blankBoard(), texts: Array.from({ length: 40 }, (_, index) => ({ id: `text-${index}`, text: `Element ${index} — full editable label`, x: index * 5, y: index * 8 + 20, width: 200 })) };
    await act(async () => root.render(<ElementsPanel board={board} selections={[]} hiddenElements={new Set()} onSelect={vi.fn()} onMove={vi.fn()} onToggleHidden={vi.fn()} onToggleLocked={vi.fn()}/>));
    expect(host.querySelectorAll("[data-element-row]")).toHaveLength(40);
    expect(host.querySelector(".elements-panel-heading span")?.textContent).toBe("40");
    const input = host.querySelector<HTMLInputElement>('input[aria-label="Tìm phần tử…"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Element 39");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(host.querySelectorAll("[data-element-row]")).toHaveLength(1);
    expect(host.querySelector("[data-element-row]")?.getAttribute("data-element-row")).toBe("text-39");
    expect(host.querySelector(".element-select")?.getAttribute("title")).toContain("full editable label");
  });
});
