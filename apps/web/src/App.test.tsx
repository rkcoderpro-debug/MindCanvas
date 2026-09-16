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
    await import("./components/CanvasBoard");
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
    await import("./components/CanvasBoard");
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
    const languageButton = host.querySelector('button[aria-label="Ngôn ngữ"]') as HTMLButtonElement;
    await act(async () => languageButton.click());
    const english = [...host.querySelectorAll<HTMLButtonElement>(".language-popover button")].find(button => button.textContent === "English")!;
    await act(async () => english.click());
    expect(document.documentElement.lang).toBe("en"); expect(localStorage.getItem("mindcanvas:language")).toBe("en");
    expect(host.textContent).toContain("Recent files"); expect(host.textContent).toContain("Ghi chú của tôi");
  });
  it("offers free and Plus grouped themes and applies a cool dark palette immediately", async () => {
    await act(async () => root.render(<App/>));
    const settings = [...host.querySelectorAll("button")].find(button => button.textContent?.includes("Cài đặt")) as HTMLButtonElement;
    await act(async () => settings.click());
    const options = [...host.querySelectorAll<HTMLButtonElement>(".theme-option")];
    expect(options).toHaveLength(28);
    expect(host.textContent).toContain("Theme sáng");
    expect(host.textContent).toContain("Theme tối");
    const cobalt = options.find(button => button.textContent?.includes("Đêm Cobalt"))!;
    await act(async () => cobalt.click());
    expect(cobalt.getAttribute("aria-pressed")).toBe("true");
    expect(document.documentElement.dataset.theme).toBe("cobalt");
    expect(document.documentElement.style.getPropertyValue("--theme-gradient-start")).toBe("#60a5fa");
    expect(document.documentElement.style.getPropertyValue("--theme-gradient-end")).toBe("#22d3ee");
    expect(localStorage.getItem("mindcanvas:theme")).toBe("cobalt");
  });
  it("previews a theme on hover or focus without persisting until it is selected", async () => {
    await act(async () => root.render(<App/>));
    const settings = [...host.querySelectorAll("button")].find(button => button.textContent?.includes("Cài đặt")) as HTMLButtonElement;
    await act(async () => settings.click());
    const cobalt = [...host.querySelectorAll<HTMLButtonElement>(".theme-option")].find(button => button.textContent?.includes("Đêm Cobalt"))!;
    expect(document.documentElement.dataset.theme).toBe("light");
    await act(async () => cobalt.dispatchEvent(new Event("pointerover", { bubbles: true })));
    expect(document.documentElement.dataset.theme).toBe("cobalt");
    const roseSky = [...host.querySelectorAll<HTMLButtonElement>(".theme-option")].find(button => button.textContent?.includes("Rose Sky"))!;
    await act(async () => roseSky.dispatchEvent(new MouseEvent("pointerover", { bubbles: true })));
    expect(document.documentElement.dataset.theme).toBe("roseSky");
    await act(async () => cobalt.dispatchEvent(new MouseEvent("pointerout", { bubbles: true, relatedTarget: document.body })));
    expect(document.documentElement.dataset.theme).toBe("light");
    await act(async () => cobalt.focus());
    expect(document.documentElement.dataset.theme).toBe("cobalt");
    expect(localStorage.getItem("mindcanvas:theme")).toBe("light");
    await act(async () => cobalt.blur());
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("mindcanvas:theme")).toBe("light");
    await act(async () => cobalt.click());
    expect(document.documentElement.dataset.theme).toBe("cobalt");
    expect(localStorage.getItem("mindcanvas:theme")).toBe("cobalt");
  });
  it("keeps sidebar theme preview alive while crossing adjacent choices", async () => {
    await act(async () => root.render(<App/>));
    await act(async () => (host.querySelector('button[aria-label="Giao diện"]') as HTMLButtonElement).click());
    const cobalt = [...host.querySelectorAll<HTMLButtonElement>(".sidebar-theme-list button")].find(button => button.textContent?.includes("Đêm Cobalt"))!;
    const roseSky = [...host.querySelectorAll<HTMLButtonElement>(".sidebar-theme-list button")].find(button => button.textContent?.includes("Rose Sky"))!;
    await act(async () => cobalt.dispatchEvent(new MouseEvent("pointerover", { bubbles: true })));
    expect(document.documentElement.dataset.theme).toBe("cobalt");
    await act(async () => { roseSky.dispatchEvent(new MouseEvent("pointerover", { bubbles: true })); cobalt.dispatchEvent(new MouseEvent("pointerout", { bubbles: true, relatedTarget: roseSky })); });
    expect(document.documentElement.dataset.theme).toBe("roseSky");
    await act(async () => roseSky.dispatchEvent(new MouseEvent("pointerout", { bubbles: true, relatedTarget: document.body })));
    expect(document.documentElement.dataset.theme).toBe("light");
  });
  it("opens the Learning Hub without injecting demo decks or cards", async () => {
    await import("./components/LearningHubPage");
    await act(async () => root.render(<App/>));
    const button = [...host.querySelectorAll("nav button")].find(item => item.textContent === "Trung tâm học tập") as HTMLButtonElement;
    await act(async () => button.click());
    expect(host.querySelector(".learning-hub-page")).not.toBeNull();
    expect(host.textContent).toContain("Tổng quan");
    const flashcardTab = [...host.querySelectorAll<HTMLButtonElement>(".learning-hub-nav button")].find(item => item.textContent === "Flashcard")!;
    await act(async () => flashcardTab.click());
    expect(host.textContent).toContain("Bộ thẻ");
    expect(host.textContent).toContain("Chưa có bộ thẻ");
    expect(host.querySelector(".flashcard-row")).toBeNull();
  });
  it("opens V4.7.2 quick search and finds text stored inside a canvas", async () => {
    const board = { ...blankBoard("Biology"), texts: [{ id: "fact", text: "Mitochondria produces ATP", x: 20, y: 40, width: 240 }] };
    cacheProject(null, { board, id: board.id, title: board.title, updatedAt: board.updatedAt, folderId: null, pending: false });
    await act(async () => root.render(<App/>));
    expect(host.querySelector(".beta")?.textContent).toBe("V4.7.2");
    expect(host.querySelector(".brand-copy .brand-name")?.textContent).toBe("MindCanvas");
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
  it("keeps the sidebar expanded until the hamburger is clicked", async () => {
    await act(async () => root.render(<App/>));
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "b", ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true })));
    expect(host.querySelector(".sidebar")?.classList.contains("sidebar-collapsed")).toBe(false);
  });
  it("keeps the sidebar expanded when dragged to its narrowest width", async () => {
    await act(async () => root.render(<App/>));
    const handle = host.querySelector(".sidebar-resize-handle") as HTMLDivElement;
    await act(async () => handle.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 280 })));
    await act(async () => window.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 0 })));
    expect(host.querySelector(".sidebar")?.classList.contains("sidebar-collapsed")).toBe(false);
    expect(host.querySelector(".sidebar")?.getAttribute("data-sidebar-density")).toBe("narrow");
    expect(localStorage.getItem("mindcanvas:sidebar-width")).toBe("154");
    await act(async () => window.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: 0 })));
  });
  it("keeps one navigation toggle and exposes account actions in the topbar", async () => {
    await act(async () => root.render(<App/>));
    expect(host.querySelectorAll(".sidebar-toggle-button")).toHaveLength(1);
    expect(host.querySelector(".sidebar .profile-card")).toBeNull();
    const profile = host.querySelector(".topbar-profile-button") as HTMLButtonElement;
    expect(profile).not.toBeNull();
    await act(async () => profile.click());
    expect(host.querySelector(".topbar-profile-menu")?.textContent).toContain("Đăng nhập Google");
  });
  it("toggles and persists the V4.7.2 focus mode without losing the topbar exit control", async () => {
    await act(async () => root.render(<App/>));
    const toggle = host.querySelector('[aria-label="Chế độ tập trung"]') as HTMLButtonElement;
    await act(async () => toggle.click());
    expect(host.querySelector(".app-shell")?.classList.contains("focus-mode")).toBe(true);
    expect(localStorage.getItem("mindcanvas:focus-mode")).toBe("true");
    expect(host.querySelector('[aria-label="Thoát chế độ tập trung"]')).not.toBeNull();
    await act(async () => (host.querySelector('[aria-label="Thoát chế độ tập trung"]') as HTMLButtonElement).click());
    expect(host.querySelector(".app-shell")?.classList.contains("focus-mode")).toBe(false);
  });
  it("opens the plan cards and separate AI Manual add-on from the topbar", async () => {
    await import("./components/PlanUpgradeDialog");
    await act(async () => root.render(<App/>));
    await act(async () => (host.querySelector(".topbar-plan-button") as HTMLButtonElement).click());
    expect(host.querySelectorAll(".pricing-card")).toHaveLength(5);
    expect(host.querySelector(".pricing-card.current")?.textContent).toContain("Free");
    expect(host.querySelector(".pricing-card.current")?.textContent).toContain("AI Auto còn lại hôm nay");
    expect(host.querySelector(".pricing-card.current")?.textContent).toContain("AI Manual còn lại hôm nay");
    expect(host.querySelector(".pricing-card.current")?.textContent).toContain("1/1");
    expect(host.querySelector(".pricing-card.current")?.textContent).toContain("3/3");
    expect(host.textContent).toContain("0385287824");
    expect(host.querySelector('a[href="https://zalo.me/0385287824"]')).not.toBeNull();
  });
  it("shows toolbar position controls in settings and persists the choice", async () => {
    await act(async () => root.render(<App/>));
    const settings = [...host.querySelectorAll("button")].find(button => button.textContent?.includes("Cài đặt")) as HTMLButtonElement;
    await act(async () => settings.click());
    expect(host.querySelectorAll(".toolbar-position-options button")).toHaveLength(4);
    const left = [...host.querySelectorAll<HTMLButtonElement>(".toolbar-position-options button")].find(button => button.textContent === "Trái")!;
    await act(async () => left.click());
    expect(localStorage.getItem("mindcanvas:toolbar-position")).toBe("left");
  });
  it("does not expose the removed canvas hover-focus setting", async () => {
    await act(async () => root.render(<App/>));
    const settings = [...host.querySelectorAll("button")].find(button => button.textContent?.includes("Cài đặt")) as HTMLButtonElement;
    await act(async () => settings.click());
    expect(host.querySelector('input[type="checkbox"][aria-label="Tự focus canvas khi rê chuột"]')).toBeNull();
    expect(localStorage.getItem("mindcanvas:canvas-hover-focus")).toBeNull();
  });
  it("keeps Share reachable from the iOS project menu for a local project", async () => {
    const originalUserAgent = navigator.userAgent;
    const originalPlatform = navigator.platform;
    const originalMaxTouchPoints = navigator.maxTouchPoints;
    try {
      Object.defineProperty(navigator, "userAgent", { configurable: true, value: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" });
      Object.defineProperty(navigator, "platform", { configurable: true, value: "iPhone" });
      Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, value: 5 });
      const board = blankBoard("iOS share");
      cacheProject(null, { board, id: board.id, title: board.title, updatedAt: board.updatedAt, folderId: null, pending: false });
      await import("./components/CanvasBoard");
      await act(async () => root.render(<App />));
      await act(async () => (host.querySelector(".project-open") as HTMLButtonElement).click());
      await act(async () => (host.querySelector(".mobile-project-menu-trigger") as HTMLButtonElement).click());
      expect([...host.querySelectorAll<HTMLButtonElement>(".mobile-project-sheet-grid button")].some(button => button.textContent?.includes("Chia sẻ project"))).toBe(true);
    } finally {
      Object.defineProperty(navigator, "userAgent", { configurable: true, value: originalUserAgent });
      Object.defineProperty(navigator, "platform", { configurable: true, value: originalPlatform });
      Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, value: originalMaxTouchPoints });
    }
  });
  it("keeps the floating timer available across the workspace and supports minimize/hide", async () => {
    localStorage.setItem("mindcanvas:show-focus-timer:v1", "true");
    await act(async () => root.render(<App/>));
    expect(host.querySelector(".floating-timer")).not.toBeNull();
    await act(async () => (host.querySelector('[aria-label="Thu nhỏ"]') as HTMLButtonElement).click());
    expect(host.querySelector(".floating-timer")?.classList.contains("minimized")).toBe(true);
    await act(async () => (host.querySelector('[aria-label="Phóng to"]') as HTMLButtonElement).click());
    await act(async () => (host.querySelector('[aria-label="Ẩn"]') as HTMLButtonElement).click());
    expect(host.querySelector(".floating-timer")).toBeNull();
    await act(async () => (host.querySelector('[aria-label="Hiện bộ đếm"]') as HTMLButtonElement).click());
    expect(host.querySelector(".floating-timer")).not.toBeNull();
  });
});
