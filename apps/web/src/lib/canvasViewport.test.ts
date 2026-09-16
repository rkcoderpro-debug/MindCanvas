import { describe, expect, it } from "vitest";
import { MIN_CANVAS_SCALE, autoPanViewportDelta, normalizeWheelDelta, panViewport, wheelPanDelta, zoomViewportAtPoint } from "./canvasViewport";

describe("canvas viewport wheel helpers", () => {
  it("normalizes line and page wheel units", () => {
    expect(normalizeWheelDelta(2, -3, 0)).toEqual({ x: 2, y: -3 });
    expect(normalizeWheelDelta(1, -2, 1)).toEqual({ x: 16, y: -32 });
    expect(normalizeWheelDelta(1, -1, 2)).toEqual({ x: 800, y: -800 });
  });

  it("keeps both touchpad axes and maps Alt wheel input horizontally", () => {
    expect(wheelPanDelta({ x: 4, y: -12 })).toEqual({ x: 4, y: -12 });
    expect(wheelPanDelta({ x: 4, y: -12 }, true)).toEqual({ x: 4, y: 0 });
    expect(wheelPanDelta({ x: 0, y: -12 }, true)).toEqual({ x: -12, y: 0 });
  });

  it("keeps a diagonal touchpad gesture available for free canvas panning", () => {
    expect(wheelPanDelta({ x: 18.5, y: -7.25 })).toEqual({ x: 18.5, y: -7.25 });
  });

  it("pans only the viewport", () => {
    expect(panViewport({ x: 10, y: 20, scale: 1 }, -12, 8)).toEqual({ x: -2, y: 28, scale: 1 });
  });

  it("keeps the cursor anchor fixed while zooming", () => {
    const before = { x: 20, y: 30, scale: 1 };
    const anchor = { x: 120, y: 90 };
    const after = zoomViewportAtPoint(before, -120, anchor);
    const worldBefore = { x: (anchor.x - before.x) / before.scale, y: (anchor.y - before.y) / before.scale };
    const worldAfter = { x: (anchor.x - after.x) / after.scale, y: (anchor.y - after.y) / after.scale };
    expect(after.scale).toBeGreaterThan(1);
    expect(worldAfter.x).toBeCloseTo(worldBefore.x);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y);
  });

  it("allows overview zoom down to one percent", () => {
    expect(MIN_CANVAS_SCALE).toBe(0.01);
    expect(zoomViewportAtPoint({ x: 0, y: 0, scale: 1 }, 10_000, { x: 0, y: 0 }).scale).toBe(0.01);
  });

  it("auto-pans in the reveal direction when a marquee reaches an edge", () => {
    const rect = { left: 0, right: 400, top: 0, bottom: 300 };
    expect(autoPanViewportDelta(200, 299, rect, 16.67).y).toBeLessThan(0);
    expect(autoPanViewportDelta(200, 1, rect, 16.67).y).toBeGreaterThan(0);
    expect(autoPanViewportDelta(200, 150, rect, 16.67)).toEqual({ x: 0, y: 0 });
  });
});
