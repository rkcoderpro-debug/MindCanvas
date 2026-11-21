import { describe, expect, it } from "vitest";
import { annotationMapsEqual, eraseAnnotationStrokes } from "./documentAnnotations";

describe("PDF annotation helpers", () => {
  it("keeps an untouched stroke and splits the part crossed by the eraser", () => {
    const stroke = { points: [{ x: 0, y: 20 }, { x: 100, y: 20 }], color: "#2563eb", width: 2, tool: "pen" as const };
    const erased = eraseAnnotationStrokes([stroke], { x: 50, y: 20 }, 5);
    expect(erased).toHaveLength(2);
    expect(erased[0].points.at(-1)?.x).toBeLessThan(50);
    expect(erased[1].points[0].x).toBeGreaterThan(50);
    expect(annotationMapsEqual({ 1: [stroke] }, { 1: [stroke] })).toBe(true);
  });

  it("does not remove a stroke outside the eraser radius", () => {
    const stroke = { points: [{ x: 0, y: 40 }, { x: 100, y: 40 }], color: "#facc15", width: 12, tool: "highlight" as const };
    const erased = eraseAnnotationStrokes([stroke], { x: 50, y: 0 }, 4);
    expect(erased).toHaveLength(1);
    expect(erased[0]).toEqual(stroke);
  });
});
