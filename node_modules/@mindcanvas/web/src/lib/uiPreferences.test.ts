// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { FOCUS_TIMER_VISIBILITY_KEY, MOBILE_ZOOM_CONTROLS_KEY, readFocusTimerVisibility, readMobileZoomControlsVisibility, saveFocusTimerVisibility, saveMobileZoomControlsVisibility } from "./uiPreferences";

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

  it("hides phone zoom buttons by default and restores an explicit opt-in", () => {
    expect(readMobileZoomControlsVisibility()).toBe(false);
    saveMobileZoomControlsVisibility(true);
    expect(localStorage.getItem(MOBILE_ZOOM_CONTROLS_KEY)).toBe("true");
    expect(readMobileZoomControlsVisibility()).toBe(true);
  });
});
