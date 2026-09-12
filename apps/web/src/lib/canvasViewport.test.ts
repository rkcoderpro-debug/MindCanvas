import { describe, expect, it } from "vitest";
import { normalizeWheelDelta, panViewport, zoomViewportAtPoint } from "./canvasViewport";

describe("canvas viewport wheel helpers", () => {
  it("normalizes line and page wheel units", () => {
    expect(normalizeWheelDelta(2, -3, 0)).toEqual({ x: 2, y: -3 });
    expect(normalizeWheelDelta(1, -2, 1)).toEqual({ x: 16, y: -32 });
    expect(normalizeWheelDelta(1, -1, 2)).toEqual({ x: 800, y: -800 });
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
});
