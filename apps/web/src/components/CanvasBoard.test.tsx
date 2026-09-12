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
function pointer(target: Element, type: string, x: number, y: number, modifiers: MouseEventInit & { pointerType?: string; pointerId?: number } = {}) {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, ...modifiers });
  Object.defineProperty(e, "pointerId", { value: modifiers.pointerId ?? 1 }); Object.defineProperty(e, "pointerType", { value: modifiers.pointerType ?? "mouse" }); target.dispatchEvent(e);
}
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  SVGElement.prototype.setPointerCapture = () => {}; SVGElement.prototype.hasPointerCapture = () => false;
  SVGElement.prototype.releasePointerCapture = () => {};
  host = document.createElement("div"); document.body.append(host); root = createRoot(host); commit.mockClear();
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
describe("Canvas interactions", () => {
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
  it("batches a high-frequency touchpad wheel gesture into one viewport commit", async () => {
    vi.useFakeTimers();
    try {
      await act(async () => root.render(<Harness initial={blankBoard()}/>));
      const svg = host.querySelector("svg.canvas-svg")!;
      await act(async () => {
        svg.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaX: 4, deltaY: 6, deltaMode: 0 }));
        svg.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaX: 5, deltaY: 7, deltaMode: 0 }));
        svg.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaX: 3, deltaY: 2, deltaMode: 0 }));
      });
      expect(commit).not.toHaveBeenCalled();
      await act(async () => { vi.advanceTimersByTime(140); });
      expect(commit).toHaveBeenCalledTimes(1);
      expect(current.viewport).toMatchObject({ x: -12, y: -15 });
    } finally { vi.useRealTimers(); }
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
