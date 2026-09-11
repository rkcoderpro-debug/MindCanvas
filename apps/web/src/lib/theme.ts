export const THEME_OPTIONS = [
  { id: "light", tone: "light", labelKey: "themeLight", descriptionKey: "themeLightHint", browserColor: "#f8f4ff" },
  { id: "ocean", tone: "light", labelKey: "themeOcean", descriptionKey: "themeOceanHint", browserColor: "#eff9ff" },
  { id: "mint", tone: "light", labelKey: "themeMint", descriptionKey: "themeMintHint", browserColor: "#effcf8" },
  { id: "sunset", tone: "light", labelKey: "themeSunset", descriptionKey: "themeSunsetHint", browserColor: "#fff5e9" },
  { id: "berry", tone: "light", labelKey: "themeBerry", descriptionKey: "themeBerryHint", browserColor: "#fff4f8" },
  { id: "dark", tone: "dark", labelKey: "themeDark", descriptionKey: "themeDarkHint", browserColor: "#15101f" },
  { id: "cobalt", tone: "dark", labelKey: "themeCobalt", descriptionKey: "themeCobaltHint", browserColor: "#080f2a" },
  { id: "cyber", tone: "dark", labelKey: "themeCyber", descriptionKey: "themeCyberHint", browserColor: "#061d24" },
  { id: "forest", tone: "dark", labelKey: "themeForest", descriptionKey: "themeForestHint", browserColor: "#0d211d" },
  { id: "slate", tone: "dark", labelKey: "themeSlate", descriptionKey: "themeSlateHint", browserColor: "#111827" },
] as const;

export type Theme = (typeof THEME_OPTIONS)[number]["id"];

export const DEFAULT_THEME: Theme = "light";

export const THEME_CANVAS_PALETTES: Record<Theme, { ink: string; fill: string; highlighter: string }> = {
  light: { ink: "#7c3aed", fill: "#f1e7ff", highlighter: "#fbbe24" },
  ocean: { ink: "#0369a1", fill: "#dbeafe", highlighter: "#fde047" },
  mint: { ink: "#0f766e", fill: "#ccfbf1", highlighter: "#fde047" },
  sunset: { ink: "#c2410c", fill: "#ffe5cf", highlighter: "#f9c74f" },
  berry: { ink: "#be185d", fill: "#fbdbea", highlighter: "#f9c74f" },
  dark: { ink: "#d29bff", fill: "#352442", highlighter: "#facc15" },
  cobalt: { ink: "#60a5fa", fill: "#172554", highlighter: "#facc15" },
  cyber: { ink: "#22d3ee", fill: "#164e63", highlighter: "#facc15" },
  forest: { ink: "#5ee2ae", fill: "#20483b", highlighter: "#fbbf24" },
  slate: { ink: "#a5b4fc", fill: "#273449", highlighter: "#fbbf24" },
};

const THEME_IDS = new Set<string>(THEME_OPTIONS.map(option => option.id));

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && THEME_IDS.has(value);
}

export function themeBrowserColor(theme: Theme): string {
  return THEME_OPTIONS.find(option => option.id === theme)?.browserColor ?? THEME_OPTIONS[0].browserColor;
}
