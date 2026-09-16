// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { blankBoard } from "./board";
import { clampDrawingSize, DEFAULT_DRAWING_SIZES, DRAWING_SIZES_KEY, eraseDrawingPaths, readDrawingSizes, saveDrawingSizes } from "./drawingTools";

describe("drawing tools", () => {
  it("erases the touched middle of a stroke and keeps both remaining pieces styled", () => {
    const board = { ...blankBoard(), shapes: [{ id: "shape", kind: "rect" as const, x: 0, y: 50, width: 20, height: 20, color: "#fff" }], drawings: [{ id: "stroke", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], color: "#123456", width: 4, opacity: .3 }] };
    const next = eraseDrawingPaths(board, [{ x: 50, y: 0 }], 4);
    expect(next.drawings).toHaveLength(2);
    expect(next.drawings[0]).toMatchObject({ id: "stroke", color: "#123456", width: 4, opacity: .3 });
    expect(next.drawings[1]).toMatchObject({ color: "#123456", width: 4, opacity: .3 });
    expect(next.drawings.every(drawing => drawing.points.every(point => point.x < 44 || point.x > 56))).toBe(true);
    expect(next.shapes).toEqual(board.shapes);
  });

  it("does not erase locked or hidden strokes and does not create empty paths", () => {
    const board = { ...blankBoard(), drawings: [
      { id: "locked", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], color: "#111111", width: 4, opacity: 1, locked: true },
      { id: "hidden", points: [{ x: 0, y: 20 }, { x: 100, y: 20 }], color: "#222222", width: 4, opacity: 1, hidden: true },
      { id: "visible", points: [{ x: 0, y: 40 }, { x: 100, y: 40 }], color: "#333333", width: 4, opacity: 1 },
    ] };
    const next = eraseDrawingPaths(board, [{ x: 50, y: 40 }], 10);
    expect(next.drawings.find(drawing => drawing.id === "locked")).toEqual(board.drawings[0]);
    expect(next.drawings.find(drawing => drawing.id === "hidden")).toEqual(board.drawings[1]);
    expect(next.drawings.filter(drawing => drawing.id === "visible" || drawing.color === "#333333")).toHaveLength(2);
    expect(next.drawings.every(drawing => drawing.points.length > 0)).toBe(true);
  });

  it("keeps the visible geometry of a rotated stroke when splitting it", () => {
    const board = { ...blankBoard(), drawings: [{ id: "rotated", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], color: "#123456", width: 4, opacity: 1, rotation: 45 }] };
    const next = eraseDrawingPaths(board, [{ x: 50, y: 0 }], 4);
    expect(next.drawings).toHaveLength(2);
    expect(next.drawings.every(drawing => drawing.rotation === undefined)).toBe(true);
    expect(next.drawings[0].points[0].x).toBeCloseTo(14.6447, 3);
    expect(next.drawings[0].points[0].y).toBeCloseTo(-35.3553, 3);
  });

  it("keeps separate size preferences within their configured ranges", () => {
    expect(clampDrawingSize("pen", -2)).toBe(1);
    expect(clampDrawingSize("highlighter", 1000)).toBe(80);
    expect(clampDrawingSize("eraser", 32.4)).toBe(32);
    saveDrawingSizes({ pen: 8, highlighter: 40, eraser: 96 });
    expect(localStorage.getItem(DRAWING_SIZES_KEY)).toContain('"eraser":96');
    expect(readDrawingSizes()).toEqual({ pen: 8, highlighter: 40, eraser: 96 });
    expect(DEFAULT_DRAWING_SIZES).toEqual({ pen: 3, highlighter: 20, eraser: 32 });
  });
});
