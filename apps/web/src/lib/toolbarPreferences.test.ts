// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { CANVAS_TOOL_IDS, LEGACY_TOOLBAR_VISIBILITY_KEY, normalizeVisibleToolIds, readToolbarToolVisibility, saveToolbarToolVisibility, TOOLBAR_VISIBILITY_KEY } from "./toolbarPreferences";

describe("toolbar visibility preferences", () => {
  beforeEach(() => localStorage.clear());

  it("uses every current tool by default", () => {
    expect(readToolbarToolVisibility()).toEqual([...CANVAS_TOOL_IDS]);
  });

  it("filters invalid entries and restores canonical order", () => {
    expect(normalizeVisibleToolIds(["triangle", "unknown", "select", "triangle"])).toEqual(["select", "triangle"]);
  });

  it("persists a hidden-tool configuration", () => {
    saveToolbarToolVisibility(["select", "hand", "text"]);
    expect(readToolbarToolVisibility()).toEqual(["select", "hand", "text"]);
  });

  it("migrates an old toolbar preference so the Eraser becomes visible", () => {
    localStorage.setItem(LEGACY_TOOLBAR_VISIBILITY_KEY, JSON.stringify(["select", "pen", "highlighter", "rect"]));
    expect(readToolbarToolVisibility()).toEqual(["select", "pen", "highlighter", "eraser", "rect", "frame"]);
    expect(localStorage.getItem(TOOLBAR_VISIBILITY_KEY)).toContain("eraser");
  });
});
