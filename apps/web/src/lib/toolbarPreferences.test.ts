// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { CANVAS_TOOL_IDS, normalizeVisibleToolIds, readToolbarToolVisibility, saveToolbarToolVisibility } from "./toolbarPreferences";

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
});
