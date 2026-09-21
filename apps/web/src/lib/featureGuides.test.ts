// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GUIDE_ACTION_EVENT, GUIDE_CONTENT_VERSION, GUIDE_DEFINITIONS, emitGuideAction, finishGuide, guideForTrigger, markGuideStarted, practiceActionsForGuide, readGuideProgress, resetGuideProgress } from "./featureGuides";

const storage = new Map<string, string>();
beforeEach(() => {
  storage.clear();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key), clear: () => storage.clear() } });
});
afterEach(() => storage.clear());

describe("feature guides", () => {
  it("keeps a stable guide registry with first-use triggers and GIF demos", () => {
    expect(GUIDE_CONTENT_VERSION).toBe("v3");
    expect(GUIDE_DEFINITIONS.length).toBeGreaterThanOrEqual(7);
    expect(guideForTrigger("canvas")?.id).toBe("canvas-controls");
    expect(GUIDE_DEFINITIONS.every(guide => guide.gifSrc?.endsWith(".gif"))).toBe(true);
    expect(GUIDE_DEFINITIONS.every(guide => guide.steps.length >= 3)).toBe(true);
    expect(GUIDE_DEFINITIONS.every(guide => guide.steps.at(-1)?.kind === "practice")).toBe(true);
    expect(GUIDE_DEFINITIONS.every(guide => practiceActionsForGuide(guide.id).length > 0)).toBe(true);
    expect(GUIDE_DEFINITIONS.find(guide => guide.id === "lab-simulation")?.steps[0].target).toBe(".nav-learning");
  });

  it("publishes explicit action events for practice verification", () => {
    const listener = vi.fn();
    window.addEventListener(GUIDE_ACTION_EVENT, listener);
    emitGuideAction("lab:run", { source: "test" });
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ detail: expect.objectContaining({ name: "lab:run" }) }));
    window.removeEventListener(GUIDE_ACTION_EVENT, listener);
  });

  it("persists activated state per owner and can reset one guide", () => {
    markGuideStarted("user-a", "canvas-controls");
    expect(readGuideProgress("user-a")["canvas-controls"]?.status).toBe("active");
    expect(readGuideProgress("user-b")["canvas-controls"]).toBeUndefined();
    finishGuide("user-a", "canvas-controls", "completed");
    expect(readGuideProgress("user-a")["canvas-controls"]?.status).toBe("completed");
    resetGuideProgress("user-a", "canvas-controls");
    expect(readGuideProgress("user-a")["canvas-controls"]?.status).toBe("unseen");
  });
});
