import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GUIDE_DEFINITIONS, finishGuide, guideForTrigger, markGuideStarted, readGuideProgress, resetGuideProgress } from "./featureGuides";

const storage = new Map<string, string>();
beforeEach(() => {
  storage.clear();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key), clear: () => storage.clear() } });
});
afterEach(() => storage.clear());

describe("feature guides", () => {
  it("keeps a stable guide registry with first-use triggers and GIF demos", () => {
    expect(GUIDE_DEFINITIONS.length).toBeGreaterThanOrEqual(6);
    expect(guideForTrigger("canvas")?.id).toBe("canvas-controls");
    expect(GUIDE_DEFINITIONS.every(guide => guide.gifSrc?.endsWith(".gif"))).toBe(true);
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
