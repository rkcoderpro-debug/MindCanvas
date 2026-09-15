import { describe, expect, it } from "vitest";
import { canUseTheme, DEFAULT_THEME, isTheme, THEME_CANVAS_PALETTES, THEME_OPTIONS, themeAccess, themeBrowserColor } from "./theme";

describe("theme configuration", () => {
  it("exposes free and Plus themes with complete canvas palettes", () => {
    expect(THEME_OPTIONS.map(option => option.id)).toEqual(["light", "ocean", "mint", "sunset", "berry", "sakura", "lavender", "auroraDream", "sandstone", "dark", "cobalt", "cyber", "forest", "slate", "solarFlare", "plumNoir", "arcticBlue", "emeraldNight"]);
    expect(new Set(THEME_OPTIONS.map(option => option.id)).size).toBe(THEME_OPTIONS.length);
    expect(THEME_OPTIONS.filter(option => option.tone === "light")).toHaveLength(9);
    expect(THEME_OPTIONS.filter(option => option.tone === "dark")).toHaveLength(9);
    expect(THEME_OPTIONS.filter(option => option.access === "free")).toHaveLength(10);
    expect(THEME_OPTIONS.filter(option => option.access === "plus")).toHaveLength(8);
    for (const option of THEME_OPTIONS) {
      expect(THEME_CANVAS_PALETTES[option.id].ink).toMatch(/^#[\da-f]{6}$/i);
      expect(THEME_CANVAS_PALETTES[option.id].fill).toMatch(/^#[\da-f]{6}$/i);
      expect(THEME_CANVAS_PALETTES[option.id].highlighter).toMatch(/^#[\da-f]{6}$/i);
      expect(themeBrowserColor(option.id)).toBe(option.browserColor);
    }
  });

  it("rejects stale or unknown persisted theme values", () => {
    expect(isTheme("cobalt")).toBe(true);
    expect(isTheme("liquid-glass")).toBe(false);
    expect(isTheme(null)).toBe(false);
    expect(DEFAULT_THEME).toBe("light");
    expect(themeAccess("sakura")).toBe("plus");
    expect(canUseTheme("sakura", "free")).toBe(false);
    expect(canUseTheme("sakura", "plus")).toBe(true);
    expect(canUseTheme("light", "free")).toBe(true);
  });
});
