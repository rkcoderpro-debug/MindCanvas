import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, isTheme, THEME_CANVAS_PALETTES, THEME_OPTIONS, themeBrowserColor } from "./theme";

describe("theme configuration", () => {
  it("exposes five light and five dark themes with complete canvas palettes", () => {
    expect(THEME_OPTIONS.map(option => option.id)).toEqual(["light", "ocean", "mint", "sunset", "berry", "dark", "cobalt", "cyber", "forest", "slate"]);
    expect(new Set(THEME_OPTIONS.map(option => option.id)).size).toBe(THEME_OPTIONS.length);
    expect(THEME_OPTIONS.filter(option => option.tone === "light")).toHaveLength(5);
    expect(THEME_OPTIONS.filter(option => option.tone === "dark")).toHaveLength(5);
    for (const option of THEME_OPTIONS) {
      expect(THEME_CANVAS_PALETTES[option.id].ink).toMatch(/^#[\da-f]{6}$/i);
      expect(THEME_CANVAS_PALETTES[option.id].fill).toMatch(/^#[\da-f]{6}$/i);
      expect(themeBrowserColor(option.id)).toBe(option.browserColor);
    }
  });

  it("rejects stale or unknown persisted theme values", () => {
    expect(isTheme("cobalt")).toBe(true);
    expect(isTheme("liquid-glass")).toBe(false);
    expect(isTheme(null)).toBe(false);
    expect(DEFAULT_THEME).toBe("light");
  });
});
