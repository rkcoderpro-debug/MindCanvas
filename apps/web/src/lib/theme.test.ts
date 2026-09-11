import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, isTheme, THEME_CANVAS_PALETTES, THEME_OPTIONS, themeBrowserColor } from "./theme";

describe("theme configuration", () => {
  it("exposes five unique themes with complete canvas palettes", () => {
    expect(THEME_OPTIONS.map(option => option.id)).toEqual(["light", "dark", "sunset", "forest", "berry"]);
    expect(new Set(THEME_OPTIONS.map(option => option.id)).size).toBe(THEME_OPTIONS.length);
    for (const option of THEME_OPTIONS) {
      expect(THEME_CANVAS_PALETTES[option.id].ink).toMatch(/^#[\da-f]{6}$/i);
      expect(THEME_CANVAS_PALETTES[option.id].fill).toMatch(/^#[\da-f]{6}$/i);
      expect(themeBrowserColor(option.id)).toBe(option.browserColor);
    }
  });

  it("rejects stale or unknown persisted theme values", () => {
    expect(isTheme("forest")).toBe(true);
    expect(isTheme("liquid-glass")).toBe(false);
    expect(isTheme(null)).toBe(false);
    expect(DEFAULT_THEME).toBe("light");
  });
});
