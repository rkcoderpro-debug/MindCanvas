import { MAX_CANVAS_SCALE, MIN_CANVAS_SCALE } from "./canvasViewport";

export type CanvasInputMode = "idle" | "drawing" | "erasing" | "panning" | "pinching" | "selecting" | "transforming";

export type CanvasTouchSettings = {
  drawWithFinger: boolean;
  stylusDrawOnly: boolean;
  zoomSensitivity: number;
  invertZoom: boolean;
};

export const DEFAULT_CANVAS_TOUCH_SETTINGS: CanvasTouchSettings = {
  drawWithFinger: true,
  stylusDrawOnly: true,
  zoomSensitivity: 1,
  invertZoom: false,
};

export const CANVAS_TOUCH_SETTINGS_KEY = "mindcanvas:canvas-touch:v2";
const LEGACY_CANVAS_TOUCH_SETTINGS_KEY = "mindcanvas:canvas-touch:v1";

/**
 * Detect iOS/iPadOS without treating a desktop Mac as an iOS touch device.
 * iPadOS can expose a MacIntel platform when "Request Desktop Website" is
 * enabled, so maxTouchPoints is part of the detection as well.
 */
export function isIOSDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/i.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function normalizeCanvasTouchSettings(value: unknown): CanvasTouchSettings {
  const raw = value && typeof value === "object" ? value as Partial<CanvasTouchSettings> : {};
  const sensitivity = Number(raw.zoomSensitivity);
  return {
    drawWithFinger: raw.drawWithFinger === true,
    stylusDrawOnly: raw.stylusDrawOnly !== false,
    zoomSensitivity: Number.isFinite(sensitivity) ? Math.min(2, Math.max(.5, sensitivity)) : 1,
    invertZoom: raw.invertZoom === true,
  };
}

export function readCanvasTouchSettings(): CanvasTouchSettings {
  try {
    const current = localStorage.getItem(CANVAS_TOUCH_SETTINGS_KEY);
    if (current) return normalizeCanvasTouchSettings(JSON.parse(current));
    const legacy = localStorage.getItem(LEGACY_CANVAS_TOUCH_SETTINGS_KEY);
    if (legacy) {
      const migrated = normalizeCanvasTouchSettings({ ...JSON.parse(legacy), drawWithFinger: true });
      localStorage.setItem(CANVAS_TOUCH_SETTINGS_KEY, JSON.stringify(migrated));
      return migrated;
    }
    return { ...DEFAULT_CANVAS_TOUCH_SETTINGS };
  } catch {
    return { ...DEFAULT_CANVAS_TOUCH_SETTINGS };
  }
}

export function saveCanvasTouchSettings(settings: CanvasTouchSettings) {
  try { localStorage.setItem(CANVAS_TOUCH_SETTINGS_KEY, JSON.stringify(normalizeCanvasTouchSettings(settings))); } catch { /* local persistence is optional */ }
}

export function pinchScale(baseScale: number, distanceRatio: number, sensitivity: number, invert: boolean) {
  const safeRatio = Math.max(.01, distanceRatio);
  const exponent = Math.min(2, Math.max(.5, sensitivity));
  const adjusted = Math.pow(safeRatio, invert ? -exponent : exponent);
  return Math.min(MAX_CANVAS_SCALE, Math.max(MIN_CANVAS_SCALE, baseScale * adjusted));
}
