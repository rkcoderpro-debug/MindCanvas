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
function pointer(target: Element, type: string, x: number, y: number, modifiers: MouseEventInit & { pointerType?: string } = {}) {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, ...modifiers });
  Object.defineProperty(e, "pointerId", { value: 1 }); Object.defineProperty(e, "pointerType", { value: modifiers.pointerType ?? "mouse" }); target.dispatchEvent(e);
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
});
