// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { Vec2 } from "@mindcanvas/shared";
import { blankBoard } from "./board";
import { LiveInk } from "./liveInk";

const origin = { left: 0, top: 0 };
function start(p: Vec2, scale = 1) {
  const board = { ...blankBoard(), viewport: { x: 0, y: 0, scale } };
  const ink = new LiveInk({ id: "ink", points: [p], color: "#0284c7", width: 4 / scale, opacity: 1 }, board.viewport);
  const append = (q: Vec2, final = false) => ink.append({ clientX: q.x * scale, clientY: q.y * scale }, origin, final);
  const points = () => ink.snapshot(board).drawings[0].points;
  return { ink, append, points };
}

describe("freehand smoothing", () => {
  it.each([.5, 1, 2])("reduces small zigzags at scale %s and keeps both endpoints", scale => {
    const first = { x: 0, y: 0 }, last = { x: 24 / scale, y: 0 };
    const { append, points } = start(first, scale);
    for (let i = 1; i < 6; i++) append({ x: i * 4 / scale, y: (i % 2 ? .7 : -.7) / scale });
    append(last, true);
    const path = points();
    expect(path[0]).toEqual(first);
    expect(path.at(-1)).toEqual(last);
    expect(Math.max(...path.map(p => Math.abs(p.y) * scale))).toBeLessThan(.46);
  });

  it("curves sparse bends in the preview and keeps the same geometry on release", () => {
    const first = { x: 0, y: 0 }, bend = { x: 16, y: 0 }, last = { x: 28, y: 12 };
    const { ink, append, points } = start(first);
    const layer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    ink.begin(layer);
    append(bend);
    ink.paint(layer);
    expect(layer.querySelector("path")?.getAttribute("d")).toBe("M0,0 L16,0");
    append(last);
    ink.paint(layer);
    const preview = layer.querySelector("path")?.getAttribute("d");
    append(last, true);
    const saved = points();
    expect(saved.length).toBeGreaterThan(3);
    expect(saved).not.toContainEqual(bend);
    expect(saved.some(p => p.x > 14 && p.x < 18 && p.y > 0 && p.y < 3)).toBe(true);
    expect(preview).toBe("M" + saved.map(p => `${p.x},${p.y}`).join(" L"));
    expect(layer.querySelectorAll("path")).toHaveLength(1);
  });

  it("preserves a deliberate corner, short mark and dot", () => {
    const first = { x: 0, y: 0 }, corner = { x: 20, y: 0 }, last = { x: 20, y: 20 };
    const { append, points } = start(first);
    expect(points()).toEqual([first]);
    append(corner);
    const draft = points();
    append(last, true);
    expect(draft).toEqual([first, corner]);
    expect(points()).toEqual([first, corner, last]);
  });

  it("keeps the early preview chunks stable and reserves room for the release point", () => {
    const { ink, append, points } = start({ x: 0, y: 0 });
    const layer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    ink.begin(layer);
    for (let x = 1; x < 150; x++) append({ x, y: 0 });
    ink.paint(layer);
    const first = layer.querySelector("path");
    const d = first?.getAttribute("d");
    expect(layer.querySelectorAll("path")).toHaveLength(2);
    for (let x = 150; x < 20500; x++) append({ x, y: 0 });
    ink.paint(layer);
    expect(layer.querySelector("path")).toBe(first);
    expect(first?.getAttribute("d")).toBe(d);
    append({ x: 20500, y: 0 }, true);
    expect(points()).toHaveLength(20000);
    expect(points().at(-1)).toEqual({ x: 20500, y: 0 });
  });
});
