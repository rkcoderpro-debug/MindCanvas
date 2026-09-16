export const THEME_OPTIONS = [
  { id: "light", tone: "light", access: "free", labelKey: "themeLight", descriptionKey: "themeLightHint", browserColor: "#f8f4ff", gradient: ["#7c3aed", "#f43f5e"] },
  { id: "ocean", tone: "light", access: "free", labelKey: "themeOcean", descriptionKey: "themeOceanHint", browserColor: "#eff9ff", gradient: ["#0369a1", "#06b6d4"] },
  { id: "mint", tone: "light", access: "free", labelKey: "themeMint", descriptionKey: "themeMintHint", browserColor: "#effcf8", gradient: ["#0f766e", "#22c55e"] },
  { id: "sunset", tone: "light", access: "free", labelKey: "themeSunset", descriptionKey: "themeSunsetHint", browserColor: "#fff5e9", gradient: ["#c2410c", "#db2777"] },
  { id: "berry", tone: "light", access: "free", labelKey: "themeBerry", descriptionKey: "themeBerryHint", browserColor: "#fff4f8", gradient: ["#be185d", "#7c3aed"] },
  { id: "sakura", tone: "light", access: "plus", labelKey: "themeSakura", descriptionKey: "themeSakuraHint", browserColor: "#fff0f5", gradient: ["#ec4899", "#f59e0b"] },
  { id: "lavender", tone: "light", access: "plus", labelKey: "themeLavender", descriptionKey: "themeLavenderHint", browserColor: "#f4f0ff", gradient: ["#8b5cf6", "#ec4899"] },
  { id: "auroraDream", tone: "light", access: "plus", labelKey: "themeAuroraDream", descriptionKey: "themeAuroraDreamHint", browserColor: "#eefbf8", gradient: ["#10b981", "#38bdf8"] },
  { id: "sandstone", tone: "light", access: "plus", labelKey: "themeSandstone", descriptionKey: "themeSandstoneHint", browserColor: "#fbf4e8", gradient: ["#f59e0b", "#f97316"] },
  { id: "peachLagoon", tone: "light", access: "plus", labelKey: "themePeachLagoon", descriptionKey: "themePeachLagoonHint", browserColor: "#fff1f2", gradient: ["#fb7185", "#14b8a6"] },
  { id: "roseSky", tone: "light", access: "plus", labelKey: "themeRoseSky", descriptionKey: "themeRoseSkyHint", browserColor: "#fdf2f8", gradient: ["#ec4899", "#38bdf8"] },
  { id: "apricotLilac", tone: "light", access: "plus", labelKey: "themeApricotLilac", descriptionKey: "themeApricotLilacHint", browserColor: "#fff7ed", gradient: ["#f97316", "#a78bfa"] },
  { id: "jadeSand", tone: "light", access: "plus", labelKey: "themeJadeSand", descriptionKey: "themeJadeSandHint", browserColor: "#f7fee7", gradient: ["#0d9488", "#eab308"] },
  { id: "crimsonOcean", tone: "light", access: "plus", labelKey: "themeCrimsonOcean", descriptionKey: "themeCrimsonOceanHint", browserColor: "#eff6ff", gradient: ["#dc2626", "#2563eb"] },
  { id: "dark", tone: "dark", access: "free", labelKey: "themeDark", descriptionKey: "themeDarkHint", browserColor: "#15101f", gradient: ["#d29bff", "#ff6f9c"] },
  { id: "cobalt", tone: "dark", access: "free", labelKey: "themeCobalt", descriptionKey: "themeCobaltHint", browserColor: "#080f2a", gradient: ["#60a5fa", "#22d3ee"] },
  { id: "cyber", tone: "dark", access: "free", labelKey: "themeCyber", descriptionKey: "themeCyberHint", browserColor: "#061d24", gradient: ["#22d3ee", "#a3e635"] },
  { id: "forest", tone: "dark", access: "free", labelKey: "themeForest", descriptionKey: "themeForestHint", browserColor: "#0d211d", gradient: ["#5ee2ae", "#fbbf24"] },
  { id: "slate", tone: "dark", access: "free", labelKey: "themeSlate", descriptionKey: "themeSlateHint", browserColor: "#111827", gradient: ["#a5b4fc", "#38bdf8"] },
  { id: "solarFlare", tone: "dark", access: "plus", labelKey: "themeSolarFlare", descriptionKey: "themeSolarFlareHint", browserColor: "#24150d", gradient: ["#f97316", "#facc15"] },
  { id: "plumNoir", tone: "dark", access: "plus", labelKey: "themePlumNoir", descriptionKey: "themePlumNoirHint", browserColor: "#1e1022", gradient: ["#a855f7", "#ec4899"] },
  { id: "arcticBlue", tone: "dark", access: "plus", labelKey: "themeArcticBlue", descriptionKey: "themeArcticBlueHint", browserColor: "#0b1d31", gradient: ["#38bdf8", "#818cf8"] },
  { id: "emeraldNight", tone: "dark", access: "plus", labelKey: "themeEmeraldNight", descriptionKey: "themeEmeraldNightHint", browserColor: "#071c19", gradient: ["#10b981", "#14b8a6"] },
  { id: "indigoRose", tone: "dark", access: "plus", labelKey: "themeIndigoRose", descriptionKey: "themeIndigoRoseHint", browserColor: "#171b46", gradient: ["#6366f1", "#e11d48"] },
  { id: "oceanEmber", tone: "dark", access: "plus", labelKey: "themeOceanEmber", descriptionKey: "themeOceanEmberHint", browserColor: "#09283e", gradient: ["#0284c7", "#f97316"] },
  { id: "violetMint", tone: "dark", access: "plus", labelKey: "themeVioletMint", descriptionKey: "themeVioletMintHint", browserColor: "#211b40", gradient: ["#8b5cf6", "#2dd4bf"] },
  { id: "midnightGold", tone: "dark", access: "plus", labelKey: "themeMidnightGold", descriptionKey: "themeMidnightGoldHint", browserColor: "#101f46", gradient: ["#2563eb", "#f59e0b"] },
  { id: "crimsonMidnight", tone: "dark", access: "plus", labelKey: "themeCrimsonMidnight", descriptionKey: "themeCrimsonMidnightHint", browserColor: "#171b3b", gradient: ["#f43f5e", "#3b82f6"] },
] as const;

export type Theme = (typeof THEME_OPTIONS)[number]["id"];
export type ThemeAccess = (typeof THEME_OPTIONS)[number]["access"];
export type ThemeGradient = readonly [string, string];

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
  peachLagoon: { ink: "#e11d48", fill: "#ffe4e6", highlighter: "#facc15" },
  roseSky: { ink: "#db2777", fill: "#fce7f3", highlighter: "#f59e0b" },
  apricotLilac: { ink: "#ea580c", fill: "#ffedd5", highlighter: "#facc15" },
  jadeSand: { ink: "#0f766e", fill: "#ccfbf1", highlighter: "#facc15" },
  crimsonOcean: { ink: "#dc2626", fill: "#fee2e2", highlighter: "#fde047" },
  solarFlare: { ink: "#fbbf24", fill: "#5a2c19", highlighter: "#fb7185" },
  plumNoir: { ink: "#e9a8ff", fill: "#4a1d50", highlighter: "#fbbf24" },
  arcticBlue: { ink: "#7dd3fc", fill: "#183b5a", highlighter: "#fde047" },
  emeraldNight: { ink: "#6ee7b7", fill: "#164e43", highlighter: "#facc15" },
  indigoRose: { ink: "#a5b4fc", fill: "#282554", highlighter: "#fda4af" },
  oceanEmber: { ink: "#7dd3fc", fill: "#163b55", highlighter: "#fb923c" },
  violetMint: { ink: "#c4b5fd", fill: "#3b2e62", highlighter: "#5eead4" },
  midnightGold: { ink: "#93c5fd", fill: "#1e315b", highlighter: "#facc15" },
  crimsonMidnight: { ink: "#fb7185", fill: "#4a2038", highlighter: "#60a5fa" },
};

const THEME_IDS = new Set<string>(THEME_OPTIONS.map(option => option.id));

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && THEME_IDS.has(value);
}

export function themeBrowserColor(theme: Theme): string {
  return THEME_OPTIONS.find(option => option.id === theme)?.browserColor ?? THEME_OPTIONS[0].browserColor;
}

export function themeGradient(theme: Theme): ThemeGradient {
  return THEME_OPTIONS.find(option => option.id === theme)?.gradient ?? THEME_OPTIONS[0].gradient;
}

export function themeAccess(theme: Theme): ThemeAccess {
  return THEME_OPTIONS.find(option => option.id === theme)?.access ?? "free";
}

export function canUseTheme(theme: Theme, planId?: string): boolean {
  return themeAccess(theme) === "free" || planId === "plus" || planId === "pro" || planId === "max";
}
