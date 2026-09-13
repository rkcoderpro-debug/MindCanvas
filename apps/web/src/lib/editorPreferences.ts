export const TOOLBAR_POSITIONS = ["top", "bottom", "left", "right"] as const;
export type ToolbarPosition = (typeof TOOLBAR_POSITIONS)[number];

export function isToolbarPosition(value: unknown): value is ToolbarPosition {
  return typeof value === "string" && (TOOLBAR_POSITIONS as readonly string[]).includes(value);
}
