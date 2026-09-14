// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BoardState } from "@mindcanvas/shared";
import CanvasBoard from "./CanvasBoard";
import { blankBoard } from "../lib/board";
let root: Root, host: HTMLDivElement, current: BoardState;
const commit = vi.fn();
const navigateCommit = vi.fn();
function Harness({ initial }: { initial: BoardState }) {
  const [board, setBoard] = useState(initial); current = board;
  return <CanvasBoard board={board} onChange={b => { commit(b); setBoard(b); }} onUndo={() => {}} onRedo={() => {}} onSave={() => {}}/>;
}
function ViewportHarness({ initial }: { initial: BoardState }) {
  const [board, setBoard] = useState(initial); current = board;
  return <CanvasBoard board={board} onChange={b => { commit(b); setBoard(b); }} onViewportChange={b => { navigateCommit(b); setBoard(b); }} onUndo={() => {}} onRedo={() => {}} onSave={() => {}}/>;
}
function pointer(target: Element, type: string, x: number, y: number, modifiers: MouseEventInit & { pointerType?: string; pointerId?: number } = {}) {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, ...modifiers });
  Object.defineProperty(e, "pointerId", { value: modifiers.pointerId ?? 1 }); Object.defineProperty(e, "pointerType", { value: modifiers.pointerType ?? "mouse" }); target.dispatchEvent(e);
}
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  SVGElement.prototype.setPointerCapture = () => {}; SVGElement.prototype.hasPointerCapture = () => false;
  SVGElement.prototype.releasePointerCapture = () => {};
  host = document.createElement("div"); document.body.append(host); root = createRoot(host); commit.mockClear(); navigateCommit.mockClear(); localStorage.clear();
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
describe("Canvas interactions", () => {
  it("does not focus the canvas when the pointer only hovers it", async () => {
    await act(async () => root.render(<Harness initial={blankBoard()}/>));
    const svg = host.querySelector("svg.canvas-svg")!;
    const enter = new MouseEvent("pointerover", { bubbles: true, cancelable: true });
    Object.defineProperty(enter, "pointerType", { value: "mouse" });
    await act(async () => svg.dispatchEvent(enter));
    expect(document.activeElement).not.toBe(svg);
    expect(host.querySelector(".canvas-hover-focus-active")).toBeNull();
  });

  it("selects a marquee, moves multiple elements once, and groups/ungroups them", async () => {
    const b = { ...blankBoard(), shapes: ["a","b"].map((id,i) => ({id,kind:"rect" as const,x:20+i*80,y:20,width:50,height:50,color:"#ffffff"})) };
    await act(async () => root.render(<Harness initial={b}/>)); const svg=host.querySelector("svg.canvas-svg")!;
    await act(async () => { pointer(svg,"pointerdown",0,0); pointer(svg,"pointermove",200,100); pointer(svg,"pointerup",200,100); });
    expect(commit).not.toHaveBeenCalled(); expect(host.querySelectorAll(".selection-box")).toHaveLength(1);
    await act(async () => pointer(host.querySelector('[data-element="a"]')!,"pointerdown",30,30));
    await act(async () => { pointer(svg,"pointermove",60,60); pointer(svg,"pointerup",60,60); });
    expect(commit).toHaveBeenCalledTimes(1); expect(current.shapes.map(n=>n.x)).toEqual([50,130]);
    await act(async () => [...host.querySelectorAll("button")].find(b=>b.textContent==="Gộp nhóm")!.click());
    expect(current.groups?.[0].elementIds).toEqual(["a","b"]);
    await act(async () => [...host.querySelectorAll("button")].find(b=>b.textContent==="Tách nhóm")!.click()); expect(current.groups).toEqual([]);
  });
  it("renders cross-type layers in the requested order", async () => {
    const b={...blankBoard(),texts:[{id:"text",text:"Text",x:0,y:20,width:200}],shapes:[{id:"shape",kind:"rect" as const,x:0,y:0,width:200,height:100,color:"#ffffff"}],layerOrder:["shape","text"]};
    await act(async()=>root.render(<Harness initial={b}/>));
    const order=()=>[...host.querySelectorAll('[data-layer-stack] > [data-element]')].map(n=>n.getAttribute("data-element")); expect(order()).toEqual(["shape","text"]);
    await act(async()=>pointer(host.querySelector('[data-element="shape"]')!,"pointerdown",10,10));
    await act(async()=>pointer(host.querySelector("svg.canvas-svg")!,"pointerup",10,10));
    await act(async()=>[...host.querySelectorAll("button")].find(b=>b.textContent==="Đưa lên trên cùng")!.click());
    expect(order()).toEqual(["text","shape"]);
  });
  it("renders image, video and audio media as selectable canvas elements", async () => {
    const b = { ...blankBoard(), media: [
      { id: "image", kind: "image" as const, src: "data:image/png;base64,AA==", name: "image.png", x: 0, y: 0, width: 180, height: 120 },
      { id: "video", kind: "video" as const, src: "data:video/mp4;base64,AA==", name: "video.mp4", x: 220, y: 0, width: 180, height: 120 },
      { id: "audio", kind: "audio" as const, src: "data:audio/webm;base64,AA==", name: "voice.webm", x: 440, y: 0, width: 180, height: 120 },
    ] };
    await act(async () => root.render(<Harness initial={b}/>));
    expect(host.querySelectorAll(".canvas-media")).toHaveLength(3);
    await act(async () => pointer(host.querySelector('[data-element="image"]')!, "pointerdown", 20, 20));
    await act(async () => pointer(host.querySelector("svg.canvas-svg")!, "pointerup", 20, 20));
    expect(host.querySelector(".selection-box")).not.toBeNull();
    expect(host.textContent).toContain("image.png");
  });
  it("renders a playable YouTube/web embed and exposes rotation reset", async () => {
    const b = { ...blankBoard(), embeds: [{ id: "yt", kind: "youtube" as const, url: "https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0", title: "Lesson", x: 0, y: 0, width: 480, height: 340, rotation: 24 }] };
    await act(async () => root.render(<Harness initial={b}/>));
    const frame = host.querySelector('[data-element="yt"]')!;
    expect(frame.querySelector("iframe")?.getAttribute("src")).toContain("youtube.com/embed/dQw4w9WgXcQ");
    await act(async () => pointer(frame.querySelector(".canvas-embed-header")!, "pointerdown", 20, 20));
    await act(async () => pointer(host.querySelector("svg.canvas-svg")!, "pointerup", 20, 20));
    expect(host.querySelector<HTMLInputElement>('input[aria-label="Góc xoay (độ)"]')?.value).toBe("24");
    await act(async () => [...host.querySelectorAll("button")].find(button => button.textContent === "Đặt về 0°")?.click());
    expect(current.embeds[0].rotation).toBe(0);
  });
  it("shows Figma-style handles on every edge and resizes from the dragged edge", async () => {
    const b = { ...blankBoard(), shapes: [{ id: "shape", kind: "rect" as const, x: 40, y: 40, width: 120, height: 80, color: "#ffffff" }] };
    await act(async () => root.render(<Harness initial={b}/>));
    const element = host.querySelector('[data-element="shape"]')!, svg = host.querySelector("svg.canvas-svg")!;
    await act(async () => { pointer(element, "pointerdown", 50, 50); pointer(svg, "pointerup", 50, 50); });
    expect(host.querySelectorAll("[data-resize-handle]")).toHaveLength(8);
    expect(host.querySelector('[data-resize-handle="n"]')).not.toBeNull();
    await act(async () => pointer(host.querySelector('[data-resize-handle="w"]')!, "pointerdown", 40, 80));
    await act(async () => { pointer(svg, "pointermove", 20, 80); pointer(svg, "pointerup", 20, 80); });
    expect(current.shapes[0]).toMatchObject({ x: 20, width: 140 });
  });
  it("renders and edits alpha for canvas elements", async () => {
    const b = { ...blankBoard(), shapes: [{ id: "shape", kind: "ellipse" as const, x: 40, y: 40, width: 120, height: 80, color: "#ffffff", opacity: .4 }], texts: [{ id: "text", text: "Alpha", x: 240, y: 40, width: 120, opacity: .7 }] };
    await act(async () => root.render(<Harness initial={b}/>));
    expect(host.querySelector('[data-element="shape"]')?.getAttribute("opacity")).toBe("0.4");
    await act(async () => { pointer(host.querySelector('[data-element="shape"]')!, "pointerdown", 50, 50); pointer(host.querySelector("svg.canvas-svg")!, "pointerup", 50, 50); });
    expect(host.querySelector<HTMLInputElement>('input[aria-label="Độ trong suốt"]')?.value).toBe("0.4");
    await act(async () => [...host.querySelectorAll("button")].find(button => button.textContent === "Đặt lại độ trong suốt")?.click());
    expect(current.shapes[0].opacity).toBe(1);
  });
  it("Tab creates an editable child and Escape cancels it", async()=>{
    const b={...blankBoard(),nodes:[{id:"root",label:"Root",x:0,y:0,width:190,height:76}]};
    await act(async()=>root.render(<Harness initial={b}/>)); const svg=host.querySelector("svg.canvas-svg")!;
    await act(async()=>{pointer(host.querySelector('[data-element="root"]')!,"pointerdown",10,10);pointer(svg,"pointerup",10,10);});
    await act(async()=>svg.dispatchEvent(new KeyboardEvent("keydown",{key:"Tab",bubbles:true,cancelable:true})));
    expect(host.querySelector("textarea")).not.toBeNull(); expect(commit).not.toHaveBeenCalled();
    await act(async()=>host.querySelector("textarea")!.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true})));
    expect(current.nodes).toHaveLength(1);
  });
  it("fit canvas changes only viewport", async()=>{
    const b={...blankBoard(),nodes:[{id:"root",label:"Root",x:2000,y:2000,width:190,height:76}]};
    await act(async()=>root.render(<Harness initial={b}/>));
    await act(async()=>[...host.querySelectorAll("button")].find(b=>b.textContent==="Vừa màn hình")!.click());
    expect(current.nodes).toEqual(b.nodes); expect(current.viewport.x).toBeLessThan(0);
  });
  it("arranges an existing map with one commit while preserving its labels and edges", async () => {
    const b = { ...blankBoard(), nodes: ["a", "b"].map(id => ({ id, label: id, x: 0, y: 0, width: 190, height: 76 })), edges: [{ id: "e", source: "a", target: "b" }] };
    await act(async () => root.render(<Harness initial={b}/>));
    await act(async () => (host.querySelector('[aria-label="Sắp xếp mind map"]') as HTMLButtonElement).click());
    expect(commit).toHaveBeenCalledTimes(1); expect(current.nodes[1].x).toBeGreaterThan(current.nodes[0].x);
    expect(current.edges).toEqual(b.edges); expect(current.nodes.map(n => n.label)).toEqual(["a", "b"]);
  });
  it("arranges branches on both sides and shows the node membership report", async () => {
    const b = { ...blankBoard(), nodes: ["root", "left", "right"].map(id => ({ id, label: id, x: 0, y: 0, width: 190, height: 76 })), edges: [{ id: "e1", source: "root", target: "left" }, { id: "e2", source: "root", target: "right" }] };
    await act(async () => root.render(<Harness initial={b}/>));
    await act(async () => (host.querySelector('[aria-label="Sắp xếp mind map hai phía"]') as HTMLButtonElement).click());
    expect(commit).toHaveBeenCalledTimes(1);
    expect(host.querySelector(".mind-map-layout-report")).not.toBeNull();
    expect(host.querySelector(".mind-map-layout-report")?.textContent).toContain("Nhánh trái");
    expect(host.querySelector(".mind-map-layout-report")?.textContent).toContain("Nhánh phải");
    expect(current.nodes.find(node => node.id === "left")!.x).toBeLessThan(current.nodes.find(node => node.id === "root")!.x);
    expect(current.nodes.find(node => node.id === "right")!.x).toBeGreaterThan(current.nodes.find(node => node.id === "root")!.x);
    await act(async () => (host.querySelector('[aria-label="Đóng danh sách nhánh"]') as HTMLButtonElement).click());
    expect(host.querySelector(".mind-map-layout-report")).toBeNull();
  });
  it("adds the first editable mind-map node to an empty board", async () => {
    await act(async () => root.render(<Harness initial={blankBoard()}/>));
    await act(async () => (host.querySelector('[aria-label="Node sơ đồ tư duy"]') as HTMLButtonElement).click());
    expect(current.nodes).toHaveLength(1); expect(current.edges).toHaveLength(0);
    await act(async () => host.querySelector("[data-element]")!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
    expect(host.querySelector("textarea")).not.toBeNull();
  });
  it("opens the inline editor when a text block is double-clicked", async () => {
    const b = { ...blankBoard(), texts: [{ id: "txt", text: "Editable text", x: 20, y: 40, width: 200 }] };
    await act(async () => root.render(<Harness initial={b}/>));
    await act(async () => host.querySelector(".canvas-copy")!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
    expect(host.querySelector<HTMLTextAreaElement>('textarea[aria-label="Sửa nội dung"]')?.value).toBe("Editable text");
  });
  it("keeps the properties panel toggle available after closing it", async () => {
    await act(async () => root.render(<Harness initial={blankBoard()}/>));
    const inspector = host.querySelector("aside.inspector")!;
    expect(inspector.classList.contains("is-open")).toBe(true);
    await act(async () => (host.querySelector('[aria-label="Đóng thanh thuộc tính"]') as HTMLButtonElement).click());
    expect(inspector.classList.contains("is-closed")).toBe(true);
    await act(async () => (host.querySelector('[aria-label="Mở thanh thuộc tính"]') as HTMLButtonElement).click());
    expect(inspector.classList.contains("is-open")).toBe(true);
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
  it("pans the empty canvas with one touch instead of drawing a marquee", async () => {
    await act(async () => root.render(<Harness initial={blankBoard()}/>));
    const svg = host.querySelector("svg.canvas-svg")!;
    await act(async () => { pointer(svg, "pointerdown", 40, 60, { pointerType: "touch" }); pointer(svg, "pointermove", 100, 150, { pointerType: "touch" }); pointer(svg, "pointerup", 100, 150, { pointerType: "touch" }); });
    expect(current.viewport).toMatchObject({ x: 60, y: 90 }); expect(host.querySelector(".selection-box")).toBeNull();
  });
  it("pans the paper pattern with the viewport while preserving world coordinates", async () => {
    const b = { ...blankBoard(), nodes: [{ id: "root", label: "Fixed on paper", x: 120, y: 90, width: 190, height: 76 }] };
    await act(async () => root.render(<Harness initial={b}/>));
    const svg = host.querySelector("svg.canvas-svg")!, pattern = () => host.querySelector("#canvas-bg-dots")?.getAttribute("x");
    const before = pattern();
    await act(async () => { pointer(svg, "pointerdown", 20, 30, { pointerType: "touch" }); pointer(svg, "pointermove", 77, 101, { pointerType: "touch" }); pointer(svg, "pointerup", 77, 101, { pointerType: "touch" }); });
    expect(pattern()).not.toBe(before); expect(current.viewport).toMatchObject({ x: 57, y: 71 }); expect(current.nodes).toEqual(b.nodes);
  });
  it("batches a high-frequency wheel gesture into one vertical viewport commit", async () => {
    vi.useFakeTimers();
    try {
      await act(async () => root.render(<Harness initial={blankBoard()}/>));
      const frame = host.querySelector(".editor-frame")!;
      await act(async () => {
        frame.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaX: 4, deltaY: 0, deltaMode: 0 }));
        frame.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaX: 0, deltaY: 6, deltaMode: 0 }));
        frame.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaX: 5, deltaY: 7, deltaMode: 0 }));
        frame.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaX: 3, deltaY: 2, deltaMode: 0 }));
      });
      expect(commit).not.toHaveBeenCalled();
      await act(async () => { vi.advanceTimersByTime(140); });
      expect(commit).toHaveBeenCalledTimes(1);
      expect(current.viewport).toMatchObject({ x: 0, y: -15 });
    } finally { vi.useRealTimers(); }
  });
  it("maps Alt plus wheel to horizontal panning", async () => {
    vi.useFakeTimers();
    try {
      await act(async () => root.render(<Harness initial={blankBoard()}/>));
      const frame = host.querySelector(".editor-frame")!;
      await act(async () => frame.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaX: 0, deltaY: 10, deltaMode: 0, altKey: true })));
      await act(async () => { vi.advanceTimersByTime(140); });
      expect(commit).toHaveBeenCalledTimes(1);
      expect(current.viewport).toMatchObject({ x: -10, y: 0 });
    } finally { vi.useRealTimers(); }
  });
  it("shows the connector source and pulses both endpoints after a connection", async () => {
    const b = { ...blankBoard(), nodes: [
      { id: "source", label: "Source", x: 20, y: 40, width: 190, height: 76 },
      { id: "target", label: "Target", x: 320, y: 40, width: 190, height: 76 },
    ] };
    await act(async () => root.render(<Harness initial={b}/>));
    await act(async () => (host.querySelector('[aria-label="Đường nối"]') as HTMLButtonElement).click());
    expect(host.querySelector('[role="status"]')?.textContent).toContain("Bấm node hoặc hình đầu tiên");
    await act(async () => pointer(host.querySelector('[data-element="source"]')!, "pointerdown", 30, 50));
    expect(host.querySelector('[data-element="source"]')?.classList.contains("connector-source")).toBe(true);
    expect(host.querySelector('[role="status"]')?.textContent).toContain("Bây giờ bấm node hoặc hình thứ hai");
    await act(async () => pointer(host.querySelector('[data-element="target"]')!, "pointerdown", 330, 50));
    expect(current.edges).toHaveLength(1);
    expect(host.querySelector(".connector-edge-pulse")).not.toBeNull();
    expect(host.querySelector('[data-element="source"]')?.classList.contains("connector-pulse")).toBe(true);
    expect(host.querySelector('[data-element="target"]')?.classList.contains("connector-pulse")).toBe(true);
  });
  it("keeps the desktop navigator actions while also rendering the mobile launcher", async () => {
    await act(async () => root.render(<Harness initial={blankBoard()}/>));
    const navigator = host.querySelector(".canvas-navigator")!;
    expect(navigator.firstElementChild?.classList.contains("minimap")).toBe(true);
    expect(navigator.querySelector(".navigator-actions")).not.toBeNull();
    expect(navigator.querySelector(".mobile-navigator-controls")).not.toBeNull();
  });
  it("expands the mobile navigator into three actions and collapses after an action", async () => {
    const b = { ...blankBoard(), nodes: [{ id: "root", label: "Root", x: 1000, y: 1000, width: 190, height: 76 }] };
    await act(async () => root.render(<Harness initial={b}/>));
    const trigger = host.querySelector<HTMLButtonElement>(".mobile-navigator-trigger")!;
    await act(async () => trigger.click());
    expect(host.querySelectorAll(".mobile-navigator-actions button")).toHaveLength(3);
    const fitButton = [...host.querySelectorAll<HTMLButtonElement>(".mobile-navigator-actions button")].find(button => button.textContent?.includes("Vừa màn hình"))!;
    await act(async () => fitButton.click());
    expect(host.querySelector(".mobile-navigator-actions")).toBeNull();
    expect(current.viewport.x).toBeLessThan(0);
  });
  it("pinch-zooms around the two-finger center in one viewport commit", async () => {
    await act(async () => root.render(<Harness initial={blankBoard()}/>));
    const svg = host.querySelector("svg.canvas-svg")!;
    await act(async () => {
      pointer(svg, "pointerdown", 40, 50, { pointerType: "touch", pointerId: 1 });
      pointer(svg, "pointerdown", 140, 50, { pointerType: "touch", pointerId: 2 });
      pointer(svg, "pointermove", 240, 50, { pointerType: "touch", pointerId: 2 });
      pointer(svg, "pointerup", 240, 50, { pointerType: "touch", pointerId: 2 });
      pointer(svg, "pointerup", 40, 50, { pointerType: "touch", pointerId: 1 });
    });
    expect(commit).toHaveBeenCalledTimes(1); expect(current.viewport).toMatchObject({ x: -40, y: -50, scale: 2 });
  });

  it("routes touch pan through viewport navigation without content autosave", async () => {
    await act(async () => root.render(<ViewportHarness initial={blankBoard()}/>));
    const svg = host.querySelector("svg.canvas-svg")!;
    await act(async () => {
      pointer(svg, "pointerdown", 20, 30, { pointerType: "touch", pointerId: 11 });
      pointer(svg, "pointermove", 80, 90, { pointerType: "touch", pointerId: 11 });
      pointer(svg, "pointerup", 80, 90, { pointerType: "touch", pointerId: 11 });
    });
    expect(commit).not.toHaveBeenCalled();
    expect(navigateCommit).toHaveBeenCalledTimes(1);
    expect(current.viewport).toMatchObject({ x: 60, y: 60 });
  });

  it("releases pointer capture after pen pointerup and pointercancel", async () => {
    const captured = new Set<number>();
    const release = vi.fn((id: number) => captured.delete(id));
    SVGElement.prototype.setPointerCapture = (id: number) => { captured.add(id); };
    SVGElement.prototype.hasPointerCapture = (id: number) => captured.has(id);
    SVGElement.prototype.releasePointerCapture = release;
    await act(async () => root.render(<Harness initial={blankBoard()}/>));
    const svg = host.querySelector("svg.canvas-svg")!;
    await act(async () => { pointer(svg, "pointerdown", 20, 20, { pointerType: "pen", pointerId: 31 }); pointer(svg, "pointermove", 40, 40, { pointerType: "pen", pointerId: 31 }); pointer(svg, "pointerup", 40, 40, { pointerType: "pen", pointerId: 31 }); });
    expect(release).toHaveBeenCalledWith(31);
    await act(async () => { pointer(svg, "pointerdown", 50, 50, { pointerType: "pen", pointerId: 32 }); pointer(svg, "pointercancel", 50, 50, { pointerType: "pen", pointerId: 32 }); });
    expect(release).toHaveBeenCalledWith(32);
    expect(current.drawings).toHaveLength(1);
  });

  it("draws with one finger when Pen is selected by default instead of panning the canvas", async () => {
    await act(async () => root.render(<ViewportHarness initial={blankBoard()}/>));
    await act(async () => (host.querySelector('[aria-label="Bút"]') as HTMLButtonElement).click());
    const svg = host.querySelector("svg.canvas-svg")!;
    await act(async () => {
      pointer(svg, "pointerdown", 30, 30, { pointerType: "touch", pointerId: 71 });
      pointer(svg, "pointermove", 70, 70, { pointerType: "touch", pointerId: 71 });
      pointer(svg, "pointerup", 70, 70, { pointerType: "touch", pointerId: 71 });
    });
    expect(current.drawings).toHaveLength(1);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(navigateCommit).not.toHaveBeenCalled();
    expect(host.querySelector('[aria-label="Bút"]')?.getAttribute("aria-pressed")).toBe("true");
  });

  it("finishes finger drawing safely when a second finger starts pinch, then draws again", async () => {
    localStorage.setItem("mindcanvas:canvas-touch:v1", JSON.stringify({ drawWithFinger: true, stylusDrawOnly: true, zoomSensitivity: 1, invertZoom: false }));
    await act(async () => root.render(<ViewportHarness initial={blankBoard()}/>));
    await act(async () => (host.querySelector('[aria-label="Bút"]') as HTMLButtonElement).click());
    const svg = host.querySelector("svg.canvas-svg")!;
    await act(async () => {
      pointer(svg, "pointerdown", 40, 50, { pointerType: "touch", pointerId: 1 });
      pointer(svg, "pointermove", 70, 70, { pointerType: "touch", pointerId: 1 });
      pointer(svg, "pointerdown", 140, 50, { pointerType: "touch", pointerId: 2 });
      pointer(svg, "pointermove", 240, 50, { pointerType: "touch", pointerId: 2 });
      pointer(svg, "pointerup", 240, 50, { pointerType: "touch", pointerId: 2 });
      pointer(svg, "pointerup", 70, 70, { pointerType: "touch", pointerId: 1 });
    });
    expect(commit).toHaveBeenCalledTimes(1);
    expect(navigateCommit).toHaveBeenCalledTimes(1);
    expect(current.drawings).toHaveLength(1);
    expect(current.viewport.scale).toBeGreaterThan(1);
    await act(async () => {
      pointer(svg, "pointerdown", 90, 90, { pointerType: "touch", pointerId: 3 });
      pointer(svg, "pointermove", 110, 110, { pointerType: "touch", pointerId: 3 });
      pointer(svg, "pointerup", 110, 110, { pointerType: "touch", pointerId: 3 });
    });
    expect(current.drawings).toHaveLength(2);
    expect(commit).toHaveBeenCalledTimes(2);
  });

  it("keeps pinch available after repeated stylus strokes without creating pinch strokes", async () => {
    await act(async () => root.render(<ViewportHarness initial={blankBoard()}/>));
    await act(async () => (host.querySelector('[aria-label="Bút"]') as HTMLButtonElement).click());
    const svg = host.querySelector("svg.canvas-svg")!;
    for (let i = 0; i < 5; i++) {
      await act(async () => {
        pointer(svg, "pointerdown", 20 + i * 5, 20 + i * 5, { pointerType: "pen", pointerId: 100 + i });
        pointer(svg, "pointermove", 50 + i * 5, 50 + i * 5, { pointerType: "pen", pointerId: 100 + i });
        pointer(svg, "pointerup", 50 + i * 5, 50 + i * 5, { pointerType: "pen", pointerId: 100 + i });
      });
    }
    expect(current.drawings).toHaveLength(5);
    expect(commit).toHaveBeenCalledTimes(5);
    await act(async () => {
      pointer(svg, "pointerdown", 50, 80, { pointerType: "touch", pointerId: 201 });
      pointer(svg, "pointerdown", 150, 80, { pointerType: "touch", pointerId: 202 });
      pointer(svg, "pointermove", 250, 80, { pointerType: "touch", pointerId: 202 });
      pointer(svg, "pointerup", 250, 80, { pointerType: "touch", pointerId: 202 });
      pointer(svg, "pointerup", 50, 80, { pointerType: "touch", pointerId: 201 });
    });
    expect(current.drawings).toHaveLength(5);
    expect(commit).toHaveBeenCalledTimes(5);
    expect(navigateCommit).toHaveBeenCalledTimes(1);
  });

  it("switches paper styles and formats text without an alert", async () => {
    const b = { ...blankBoard(), texts: [{ id: "txt", text: "Editable", x: 20, y: 40, width: 200 }] };
    await act(async () => root.render(<Harness initial={b}/>));
    await act(async () => [...host.querySelectorAll("button")].find(button => button.textContent === "Giấy kẻ ngang")!.click());
    expect(current.background).toBe("ruled"); expect(host.querySelector('[data-canvas-background="ruled"]')).not.toBeNull();
    const svg = host.querySelector("svg.canvas-svg")!;
    await act(async () => pointer(host.querySelector('[data-element="txt"]')!, "pointerdown", 25, 40));
    await act(async () => pointer(svg, "pointerup", 25, 40));
    await act(async () => (host.querySelector('[aria-label="In đậm"]') as HTMLButtonElement).click());
    expect(current.texts[0].bold).toBe(true); expect(host.querySelector(".canvas-copy")?.getAttribute("style")).toContain("font-weight: 700");
  });
});
