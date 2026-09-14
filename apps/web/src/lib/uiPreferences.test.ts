// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { FOCUS_TIMER_VISIBILITY_KEY, readFocusTimerVisibility, saveFocusTimerVisibility } from "./uiPreferences";

describe("focus timer visibility preference", () => {
  beforeEach(() => localStorage.clear());

  it("is hidden by default for a new user", () => {
    expect(readFocusTimerVisibility()).toBe(false);
  });

  it("restores only an explicitly saved visibility choice", () => {
    saveFocusTimerVisibility(true);
    expect(localStorage.getItem(FOCUS_TIMER_VISIBILITY_KEY)).toBe("true");
    expect(readFocusTimerVisibility()).toBe(true);
    saveFocusTimerVisibility(false);
    expect(readFocusTimerVisibility()).toBe(false);
  });
});
