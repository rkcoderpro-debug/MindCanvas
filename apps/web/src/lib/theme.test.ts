import { describe, expect, it } from "vitest";
import { canUseTheme, DEFAULT_THEME, isTheme, THEME_CANVAS_PALETTES, THEME_OPTIONS, themeAccess, themeBrowserColor, themeGradient } from "./theme";

describe("theme configuration", () => {
  it("exposes free and Plus themes with complete canvas palettes", () => {
    expect(THEME_OPTIONS.map(option => option.id)).toEqual(["light", "ocean", "mint", "sunset", "berry", "sakura", "lavender", "auroraDream", "sandstone", "peachLagoon", "roseSky", "apricotLilac", "jadeSand", "crimsonOcean", "dark", "cobalt", "cyber", "forest", "slate", "solarFlare", "plumNoir", "arcticBlue", "emeraldNight", "indigoRose", "oceanEmber", "violetMint", "midnightGold", "crimsonMidnight"]);
    expect(new Set(THEME_OPTIONS.map(option => option.id)).size).toBe(THEME_OPTIONS.length);
    expect(THEME_OPTIONS.filter(option => option.tone === "light")).toHaveLength(14);
    expect(THEME_OPTIONS.filter(option => option.tone === "dark")).toHaveLength(14);
    expect(THEME_OPTIONS.filter(option => option.access === "free")).toHaveLength(10);
    expect(THEME_OPTIONS.filter(option => option.access === "plus")).toHaveLength(18);
    for (const option of THEME_OPTIONS) {
      expect(THEME_CANVAS_PALETTES[option.id].ink).toMatch(/^#[\da-f]{6}$/i);
      expect(THEME_CANVAS_PALETTES[option.id].fill).toMatch(/^#[\da-f]{6}$/i);
      expect(THEME_CANVAS_PALETTES[option.id].highlighter).toMatch(/^#[\da-f]{6}$/i);
      expect(themeBrowserColor(option.id)).toBe(option.browserColor);
      expect(themeGradient(option.id)).toHaveLength(2);
      expect(themeGradient(option.id)[0]).toMatch(/^#[\da-f]{6}$/i);
      expect(themeGradient(option.id)[1]).toMatch(/^#[\da-f]{6}$/i);
      expect(themeGradient(option.id)[0]).not.toBe(themeGradient(option.id)[1]);
    }
  });

  it("gives every Plus theme a visibly distinct two-color gradient", () => {
    const plus = THEME_OPTIONS.filter(option => option.access === "plus");
    expect(plus.every(option => themeGradient(option.id)[0] !== themeGradient(option.id)[1])).toBe(true);
    expect(themeGradient("lavender")).toEqual(["#8b5cf6", "#ec4899"]);
    expect(themeGradient("emeraldNight")).toEqual(["#10b981", "#14b8a6"]);
    expect(themeGradient("crimsonOcean")).toEqual(["#dc2626", "#2563eb"]);
    expect(themeGradient("crimsonMidnight")).toEqual(["#f43f5e", "#3b82f6"]);
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
