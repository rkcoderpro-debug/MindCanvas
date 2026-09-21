import { describe, expect, it } from "vitest";
import { TOOL_HOLD_THRESHOLD_MS, toolAfterRelease, toolPressMode } from "./toolActivation";

describe("tool press activation", () => {
  it("commits a quick click", () => {
    expect(toolPressMode(120)).toBe("persistent");
    expect(toolAfterRelease("select", "pen", 120)).toBe("pen");
  });

  it("restores the previous tool after a hold", () => {
    expect(toolPressMode(TOOL_HOLD_THRESHOLD_MS)).toBe("temporary");
    expect(toolAfterRelease("pen", "eraser", TOOL_HOLD_THRESHOLD_MS + 50)).toBe("pen");
  });

  it("accepts a custom threshold for slower input devices", () => {
    expect(toolPressMode(240, 200)).toBe("temporary");
    expect(toolAfterRelease("select", "hand", 240, 300)).toBe("hand");
  });
});
