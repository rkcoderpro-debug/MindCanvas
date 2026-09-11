export const THEME_OPTIONS = [
  { id: "light", labelKey: "themeLight", descriptionKey: "themeLightHint", browserColor: "#f8f4ff" },
  { id: "dark", labelKey: "themeDark", descriptionKey: "themeDarkHint", browserColor: "#15101f" },
  { id: "sunset", labelKey: "themeSunset", descriptionKey: "themeSunsetHint", browserColor: "#fff5e9" },
  { id: "forest", labelKey: "themeForest", descriptionKey: "themeForestHint", browserColor: "#0d211d" },
  { id: "berry", labelKey: "themeBerry", descriptionKey: "themeBerryHint", browserColor: "#fff4f8" },
] as const;

export type Theme = (typeof THEME_OPTIONS)[number]["id"];

export const DEFAULT_THEME: Theme = "light";

export const THEME_CANVAS_PALETTES: Record<Theme, { ink: string; fill: string; highlighter: string }> = {
  light: { ink: "#7c3aed", fill: "#f1e7ff", highlighter: "#fbbe24" },
  dark: { ink: "#d29bff", fill: "#352442", highlighter: "#facc15" },
  sunset: { ink: "#c2410c", fill: "#ffe5cf", highlighter: "#f9c74f" },
  forest: { ink: "#5ee2ae", fill: "#20483b", highlighter: "#fbbf24" },
  berry: { ink: "#be185d", fill: "#fbdbea", highlighter: "#f9c74f" },
};

const THEME_IDS = new Set<string>(THEME_OPTIONS.map(option => option.id));

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && THEME_IDS.has(value);
}

export function themeBrowserColor(theme: Theme): string {
  return THEME_OPTIONS.find(option => option.id === theme)?.browserColor ?? THEME_OPTIONS[0].browserColor;
}
