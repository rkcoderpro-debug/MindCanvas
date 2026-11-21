import { describe, expect, it } from "vitest";
import { canvasTextColor, readableTextColor } from "./color";

describe("canvas theme color helpers", () => {
  it("adapts legacy default text to the active canvas token", () => {
    expect(canvasTextColor("#18213b")).toBe("var(--canvas-text)");
    expect(canvasTextColor("#ef4444")).toBe("#ef4444");
  });

  it("keeps node labels readable on light and dark fills", () => {
    expect(readableTextColor("#ffffff")).toBe("#281a35");
    expect(readableTextColor("#20483b")).toBe("#fffafc");
    expect(readableTextColor()).toBe("var(--node-text)");
  });
});
