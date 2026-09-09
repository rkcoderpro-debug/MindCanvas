// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { cacheProject } from "./lib/projectStore";
import { blankBoard } from "./lib/board";
let root: Root, host: HTMLDivElement;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; localStorage.clear();
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });
describe("Workspace UI", () => {
  it("renders real projects as home cards and opens a selected project", async () => {
    const board = blankBoard("My notes"); cacheProject(null, { board, id: board.id, title: board.title, updatedAt: board.updatedAt, folderId: null, pending: false });
    await act(async () => root.render(<App/>));
    expect(host.querySelector(".project-card")?.textContent).toContain("My notes");
    expect(host.querySelector("svg.canvas-svg")).toBeNull();
    await act(async () => (host.querySelector(".project-card") as HTMLButtonElement).click());
    expect(host.querySelector("svg.canvas-svg")).not.toBeNull();
    await act(async () => (host.querySelector(".brand") as HTMLButtonElement).click());
    expect(host.querySelector(".project-card")).not.toBeNull();
  });
  it("uses an in-app form for a new project, never window.prompt", async () => {
    const prompt = vi.spyOn(window, "prompt");
    await act(async () => root.render(<App/>));
    const create = [...host.querySelectorAll("button")].find(b => b.textContent?.includes("Project mới"))!;
    await act(async () => create.click());
    expect(host.querySelector("dialog[open] input")).not.toBeNull();
    await act(async () => host.querySelector("dialog form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(host.querySelector("svg.canvas-svg")).not.toBeNull();
    expect(prompt).not.toHaveBeenCalled();
  });
  it("switches the complete UI to English and persists preference without changing content", async () => {
    const board = blankBoard("Ghi chú của tôi"); cacheProject(null, { board, id: board.id, title: board.title, updatedAt: board.updatedAt, folderId: null, pending: false });
    await act(async () => root.render(<App/>));
    const select = host.querySelector('select[aria-label="Ngôn ngữ"]') as HTMLSelectElement;
    await act(async () => { select.value = "en"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(document.documentElement.lang).toBe("en"); expect(localStorage.getItem("mindcanvas:language")).toBe("en");
    expect(host.textContent).toContain("Recent files"); expect(host.textContent).toContain("Ghi chú của tôi");
  });
});
