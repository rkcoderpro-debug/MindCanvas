export const SIDEBAR_DEFAULT_WIDTH = 280;
export const SIDEBAR_MIN_WIDTH = 154;
export const SIDEBAR_MAX_WIDTH = 380;
export const SIDEBAR_COMPACT_WIDTH = 220;
export const SIDEBAR_NARROW_WIDTH = 180;

export type SidebarDensity = "comfortable" | "compact" | "narrow" | "rail";

export function clampSidebarWidth(value: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, value));
}

export function sidebarDensityFor(width: number, collapsed: boolean): SidebarDensity {
  if (collapsed) return "rail";
  if (width <= SIDEBAR_NARROW_WIDTH) return "narrow";
  if (width <= SIDEBAR_COMPACT_WIDTH) return "compact";
  return "comfortable";
}
