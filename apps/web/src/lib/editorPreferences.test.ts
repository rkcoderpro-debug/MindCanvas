import { describe, expect, it } from "vitest";
import { isToolbarPosition, TOOLBAR_POSITIONS } from "./editorPreferences";

describe("editor preferences", () => {
  it("keeps the four supported toolbar positions in display order", () => {
    expect(TOOLBAR_POSITIONS).toEqual(["top", "bottom", "left", "right"]);
  });

  it("rejects invalid values loaded from local storage", () => {
    expect(isToolbarPosition("left")).toBe(true);
    expect(isToolbarPosition("diagonal")).toBe(false);
    expect(isToolbarPosition(null)).toBe(false);
  });
});
