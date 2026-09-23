import type { ToolMode } from "@mindcanvas/shared";

export const CANVAS_TOOL_IDS = [
  "select", "hand", "text", "pen", "highlighter", "eraser", "line", "rect", "ellipse", "triangle", "connector", "frame",
] as const satisfies readonly ToolMode[];

export const TOOLBAR_VISIBILITY_KEY = "mindcanvas:toolbar-tools:v2";
export const LEGACY_TOOLBAR_VISIBILITY_KEY = "mindcanvas:toolbar-tools:v1";

function isToolMode(value: unknown): value is ToolMode {
  return typeof value === "string" && (CANVAS_TOOL_IDS as readonly string[]).includes(value);
}

/** Normalize old or hand-edited preferences into the current tool order. */
export function normalizeVisibleToolIds(value: unknown): ToolMode[] {
  const selected = new Set(Array.isArray(value) ? value.filter(isToolMode) : CANVAS_TOOL_IDS);
  return CANVAS_TOOL_IDS.filter(id => selected.has(id));
}

export function readToolbarToolVisibility(): ToolMode[] {
  try {
    const raw = localStorage.getItem(TOOLBAR_VISIBILITY_KEY);
    if (raw) return normalizeVisibleToolIds(JSON.parse(raw));
    const legacyRaw = localStorage.getItem(LEGACY_TOOLBAR_VISIBILITY_KEY);
    if (!legacyRaw) return [...CANVAS_TOOL_IDS];
    // Older saved toolbars predate the visible Eraser. Migrate them once so
    // existing users see the tool without changing the canonical ordering.
    const legacy = normalizeVisibleToolIds(JSON.parse(legacyRaw));
    const migrated = normalizeVisibleToolIds([...legacy, "eraser", "frame"]);
    localStorage.setItem(TOOLBAR_VISIBILITY_KEY, JSON.stringify(migrated));
    return migrated;
  } catch {
    return [...CANVAS_TOOL_IDS];
  }
}

export function saveToolbarToolVisibility(value: ToolMode[]) {
  try { localStorage.setItem(TOOLBAR_VISIBILITY_KEY, JSON.stringify(normalizeVisibleToolIds(value))); } catch { /* local UI persistence is optional */ }
}
