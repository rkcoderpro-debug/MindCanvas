export const TOOLBAR_POSITIONS = ["top", "bottom", "left", "right"] as const;
export type ToolbarPosition = (typeof TOOLBAR_POSITIONS)[number];

export const CANVAS_HOVER_FOCUS_STORAGE_KEY = "mindcanvas:canvas-hover-focus";

export function readCanvasHoverFocusPreference(): boolean {
  try {
    const saved = localStorage.getItem(CANVAS_HOVER_FOCUS_STORAGE_KEY);
    return saved === null ? true : saved === "true";
  } catch {
    return true;
  }
}

export function isToolbarPosition(value: unknown): value is ToolbarPosition {
  return typeof value === "string" && (TOOLBAR_POSITIONS as readonly string[]).includes(value);
}
