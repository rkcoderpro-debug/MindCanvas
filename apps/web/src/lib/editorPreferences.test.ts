// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { CANVAS_HOVER_FOCUS_STORAGE_KEY, isToolbarPosition, readCanvasHoverFocusPreference, TOOLBAR_POSITIONS } from "./editorPreferences";

describe("editor preferences", () => {
  it("keeps the four supported toolbar positions in display order", () => {
    expect(TOOLBAR_POSITIONS).toEqual(["top", "bottom", "left", "right"]);
  });

  it("rejects invalid values loaded from local storage", () => {
    expect(isToolbarPosition("left")).toBe(true);
    expect(isToolbarPosition("diagonal")).toBe(false);
    expect(isToolbarPosition(null)).toBe(false);
  });

  it("defaults hover focus on and accepts the persisted boolean preference", () => {
    localStorage.removeItem(CANVAS_HOVER_FOCUS_STORAGE_KEY);
    expect(readCanvasHoverFocusPreference()).toBe(true);
    localStorage.setItem(CANVAS_HOVER_FOCUS_STORAGE_KEY, "false");
    expect(readCanvasHoverFocusPreference()).toBe(false);
    localStorage.setItem(CANVAS_HOVER_FOCUS_STORAGE_KEY, "true");
    expect(readCanvasHoverFocusPreference()).toBe(true);
  });
});
