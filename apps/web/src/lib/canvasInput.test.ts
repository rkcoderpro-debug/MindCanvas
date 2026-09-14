// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { CANVAS_TOUCH_SETTINGS_KEY, DEFAULT_CANVAS_TOUCH_SETTINGS, normalizeCanvasTouchSettings, pinchScale, readCanvasTouchSettings, saveCanvasTouchSettings } from "./canvasInput";

describe("canvas touch settings", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to finger drawing off and stylus drawing only", () => {
    expect(readCanvasTouchSettings()).toEqual(DEFAULT_CANVAS_TOUCH_SETTINGS);
  });

  it("normalizes, persists and clamps sensitivity", () => {
    saveCanvasTouchSettings({ drawWithFinger: true, stylusDrawOnly: false, zoomSensitivity: 9, invertZoom: true });
    expect(JSON.parse(localStorage.getItem(CANVAS_TOUCH_SETTINGS_KEY)!)).toMatchObject({ drawWithFinger: true, zoomSensitivity: 2, invertZoom: true });
    expect(normalizeCanvasTouchSettings({ zoomSensitivity: .1 }).zoomSensitivity).toBe(.5);
  });

  it("applies zoom sensitivity and optional inversion", () => {
    expect(pinchScale(1, 2, 1, false)).toBe(2);
    expect(pinchScale(1, 2, 1, true)).toBe(.5);
  });
});
