import { describe, expect, it } from "vitest";
import { SIDEBAR_AUTO_COLLAPSE_WIDTH, SIDEBAR_COMPACT_WIDTH, SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH, SIDEBAR_NARROW_WIDTH, clampSidebarWidth, sidebarDensityFor } from "./sidebarLayout";

describe("sidebar layout", () => {
  it("clamps draggable widths to the desktop range", () => {
    expect(clampSidebarWidth(SIDEBAR_MIN_WIDTH - 10)).toBe(SIDEBAR_MIN_WIDTH);
    expect(clampSidebarWidth(SIDEBAR_MAX_WIDTH + 10)).toBe(SIDEBAR_MAX_WIDTH);
    expect(SIDEBAR_AUTO_COLLAPSE_WIDTH).toBeGreaterThan(SIDEBAR_MIN_WIDTH);
  });

  it("progresses from full labels to compact labels and then the rail", () => {
    expect(sidebarDensityFor(SIDEBAR_COMPACT_WIDTH + 1, false)).toBe("comfortable");
    expect(sidebarDensityFor(SIDEBAR_COMPACT_WIDTH, false)).toBe("compact");
    expect(sidebarDensityFor(SIDEBAR_NARROW_WIDTH, false)).toBe("narrow");
    expect(sidebarDensityFor(999, true)).toBe("rail");
  });
});
