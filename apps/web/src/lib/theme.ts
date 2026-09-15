export const THEME_OPTIONS = [
  { id: "light", tone: "light", access: "free", labelKey: "themeLight", descriptionKey: "themeLightHint", browserColor: "#f8f4ff" },
  { id: "ocean", tone: "light", access: "free", labelKey: "themeOcean", descriptionKey: "themeOceanHint", browserColor: "#eff9ff" },
  { id: "mint", tone: "light", access: "free", labelKey: "themeMint", descriptionKey: "themeMintHint", browserColor: "#effcf8" },
  { id: "sunset", tone: "light", access: "free", labelKey: "themeSunset", descriptionKey: "themeSunsetHint", browserColor: "#fff5e9" },
  { id: "berry", tone: "light", access: "free", labelKey: "themeBerry", descriptionKey: "themeBerryHint", browserColor: "#fff4f8" },
  { id: "sakura", tone: "light", access: "plus", labelKey: "themeSakura", descriptionKey: "themeSakuraHint", browserColor: "#fff0f5" },
  { id: "lavender", tone: "light", access: "plus", labelKey: "themeLavender", descriptionKey: "themeLavenderHint", browserColor: "#f4f0ff" },
  { id: "auroraDream", tone: "light", access: "plus", labelKey: "themeAuroraDream", descriptionKey: "themeAuroraDreamHint", browserColor: "#eefbf8" },
  { id: "sandstone", tone: "light", access: "plus", labelKey: "themeSandstone", descriptionKey: "themeSandstoneHint", browserColor: "#fbf4e8" },
  { id: "dark", tone: "dark", access: "free", labelKey: "themeDark", descriptionKey: "themeDarkHint", browserColor: "#15101f" },
  { id: "cobalt", tone: "dark", access: "free", labelKey: "themeCobalt", descriptionKey: "themeCobaltHint", browserColor: "#080f2a" },
  { id: "cyber", tone: "dark", access: "free", labelKey: "themeCyber", descriptionKey: "themeCyberHint", browserColor: "#061d24" },
  { id: "forest", tone: "dark", access: "free", labelKey: "themeForest", descriptionKey: "themeForestHint", browserColor: "#0d211d" },
  { id: "slate", tone: "dark", access: "free", labelKey: "themeSlate", descriptionKey: "themeSlateHint", browserColor: "#111827" },
  { id: "solarFlare", tone: "dark", access: "plus", labelKey: "themeSolarFlare", descriptionKey: "themeSolarFlareHint", browserColor: "#24150d" },
  { id: "plumNoir", tone: "dark", access: "plus", labelKey: "themePlumNoir", descriptionKey: "themePlumNoirHint", browserColor: "#1e1022" },
  { id: "arcticBlue", tone: "dark", access: "plus", labelKey: "themeArcticBlue", descriptionKey: "themeArcticBlueHint", browserColor: "#0b1d31" },
  { id: "emeraldNight", tone: "dark", access: "plus", labelKey: "themeEmeraldNight", descriptionKey: "themeEmeraldNightHint", browserColor: "#071c19" },
] as const;

export type Theme = (typeof THEME_OPTIONS)[number]["id"];
export type ThemeAccess = (typeof THEME_OPTIONS)[number]["access"];

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
  sakura: { ink: "#be185d", fill: "#fce0ea", highlighter: "#f59e0b" },
  lavender: { ink: "#6d28d9", fill: "#e9ddff", highlighter: "#f59e0b" },
  auroraDream: { ink: "#047857", fill: "#d7f5e9", highlighter: "#f59e0b" },
  sandstone: { ink: "#9a3412", fill: "#f6e4c9", highlighter: "#ca8a04" },
  solarFlare: { ink: "#fbbf24", fill: "#5a2c19", highlighter: "#fb7185" },
  plumNoir: { ink: "#e9a8ff", fill: "#4a1d50", highlighter: "#fbbf24" },
  arcticBlue: { ink: "#7dd3fc", fill: "#183b5a", highlighter: "#fde047" },
  emeraldNight: { ink: "#6ee7b7", fill: "#164e43", highlighter: "#facc15" },
};

const THEME_IDS = new Set<string>(THEME_OPTIONS.map(option => option.id));

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && THEME_IDS.has(value);
}

export function themeBrowserColor(theme: Theme): string {
  return THEME_OPTIONS.find(option => option.id === theme)?.browserColor ?? THEME_OPTIONS[0].browserColor;
}

export function themeAccess(theme: Theme): ThemeAccess {
  return THEME_OPTIONS.find(option => option.id === theme)?.access ?? "free";
}

export function canUseTheme(theme: Theme, planId?: string): boolean {
  return themeAccess(theme) === "free" || planId === "plus" || planId === "pro" || planId === "max";
}
