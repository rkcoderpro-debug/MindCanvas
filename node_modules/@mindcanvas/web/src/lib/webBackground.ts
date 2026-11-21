import type { CanvasBackgroundMedia } from "@mindcanvas/shared";

export type WebBackground = CanvasBackgroundMedia;
const STORAGE_KEY = "mindcanvas:web-background:v1";

export function isWebBackground(value: unknown): value is WebBackground {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<WebBackground>;
  return (item.kind === "image" || item.kind === "video")
    && typeof item.src === "string" && item.src.length > 0 && item.src.length <= 20 * 1024 * 1024
    && (/^data:(image|video)\//i.test(item.src) || /^https?:\/\//i.test(item.src));
}

export function readWebBackground(): WebBackground | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isWebBackground(parsed) ? parsed : null;
  } catch { return null; }
}

export function saveWebBackground(background: WebBackground | null) {
  try {
    if (background) localStorage.setItem(STORAGE_KEY, JSON.stringify(background));
    else localStorage.removeItem(STORAGE_KEY);
  } catch { /* The UI remains usable if browser storage is full or unavailable. */ }
}
