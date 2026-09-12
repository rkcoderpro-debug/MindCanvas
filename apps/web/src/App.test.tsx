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
  it("favorites, duplicates, trashes and restores real projects from cards", async()=>{
    const board=blankBoard("Keep me");cacheProject(null,{id:board.id,title:board.title,board,folderId:null,updatedAt:board.updatedAt,pending:false});
    await act(async()=>root.render(<App/>));
    await act(async()=>(host.querySelector('[aria-label="Thêm yêu thích"]') as HTMLButtonElement).click());
    expect(host.querySelector('[aria-label="Bỏ yêu thích"]')).not.toBeNull();
    const menu=()=>host.querySelector('[aria-label="Thao tác project: Keep me"]') as HTMLButtonElement;
    await act(async()=>menu().click());
    await act(async()=>[...host.querySelectorAll(".project-menu button")].find(b=>b.textContent==="Nhân đôi")?.dispatchEvent(new MouseEvent("click",{bubbles:true})));
    expect(host.querySelectorAll(".project-card")).toHaveLength(2);
    await act(async()=>menu().click());await act(async()=>[...host.querySelectorAll(".project-menu button")].find(b=>b.textContent==="Đưa vào thùng rác")!.dispatchEvent(new MouseEvent("click",{bubbles:true})));
    expect(host.querySelectorAll(".project-card")).toHaveLength(1);
    await act(async()=>[...host.querySelectorAll("nav button")].find(b=>b.textContent==="Thùng rác")!.dispatchEvent(new MouseEvent("click",{bubbles:true})));
    expect(host.querySelector(".project-card")?.textContent).toContain("Keep me");
    await act(async()=>menu().click());await act(async()=>[...host.querySelectorAll(".project-menu button")].find(b=>b.textContent==="Khôi phục")!.dispatchEvent(new MouseEvent("click",{bubbles:true})));
    expect(host.querySelectorAll(".project-card")).toHaveLength(0);
  });
  it("renders real projects as home cards and opens a selected project", async () => {
    const board = blankBoard("My notes"); cacheProject(null, { board, id: board.id, title: board.title, updatedAt: board.updatedAt, folderId: null, pending: false });
    await act(async () => root.render(<App/>));
    expect(host.querySelector(".project-card")?.textContent).toContain("My notes");
    expect(host.querySelector("svg.canvas-svg")).toBeNull();
    await act(async () => (host.querySelector(".project-open") as HTMLButtonElement).click());
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
  it("offers ten grouped visual themes and applies a cool dark palette immediately", async () => {
    await act(async () => root.render(<App/>));
    const settings = [...host.querySelectorAll("button")].find(button => button.textContent?.includes("Cài đặt")) as HTMLButtonElement;
    await act(async () => settings.click());
    const options = [...host.querySelectorAll<HTMLButtonElement>(".theme-option")];
    expect(options).toHaveLength(10);
    expect(host.textContent).toContain("Theme sáng");
    expect(host.textContent).toContain("Theme tối");
    const cobalt = options.find(button => button.textContent?.includes("Đêm Cobalt"))!;
    await act(async () => cobalt.click());
    expect(cobalt.getAttribute("aria-pressed")).toBe("true");
    expect(document.documentElement.dataset.theme).toBe("cobalt");
    expect(localStorage.getItem("mindcanvas:theme")).toBe("cobalt");
  });
  it("opens the flashcards workspace without injecting demo decks or cards", async () => {
    await act(async () => root.render(<App/>));
    const button = [...host.querySelectorAll("nav button")].find(item => item.textContent === "Flashcard") as HTMLButtonElement;
    await act(async () => button.click());
    expect(host.textContent).toContain("Bộ thẻ");
    expect(host.textContent).toContain("Chưa có bộ thẻ");
    expect(host.querySelector(".flashcard-row")).toBeNull();
  });
  it("opens V3.8.0 quick search and finds text stored inside a canvas", async () => {
    const board = { ...blankBoard("Biology"), texts: [{ id: "fact", text: "Mitochondria produces ATP", x: 20, y: 40, width: 240 }] };
    cacheProject(null, { board, id: board.id, title: board.title, updatedAt: board.updatedAt, folderId: null, pending: false });
    await act(async () => root.render(<App/>));
    expect(host.querySelector(".beta")?.textContent).toBe("V3.8.0");
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true, cancelable: true })));
    const input = host.querySelector('dialog[open] input[aria-label="Tìm project và thao tác…"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    await act(async () => { input.value = "mitochondria"; input.dispatchEvent(new Event("input", { bubbles: true })); });
    expect(host.querySelector("dialog[open]")?.textContent).toContain("Biology");
  });
  it("collapses the desktop navigation to an icon rail and persists the preference", async () => {
    await act(async () => root.render(<App/>));
    const toggle = host.querySelector('[aria-label="Thu gọn thanh điều hướng"]') as HTMLButtonElement;
    await act(async () => toggle.click());
    expect(host.querySelector(".sidebar")?.classList.contains("sidebar-collapsed")).toBe(true);
    expect(localStorage.getItem("mindcanvas:sidebar-collapsed")).toBe("true");
    expect(host.querySelector('[aria-label="Mở rộng thanh điều hướng"]')).not.toBeNull();
  });
});
