// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import FeatureGuideManager from "./FeatureGuideManager";
import { GUIDE_CONTENT_VERSION, guideForId, readGuideProgress } from "../lib/featureGuides";

vi.mock("./FeatureGuideOverlay", () => ({ default: ({ guide, onSkip }: any) =>
  <button data-testid="guide" onClick={onSkip}>{guide.id}</button> }));
vi.mock("./FeatureGuideCelebration", () => ({ default: () => null }));
let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  localStorage.clear();
  host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove(); vi.useRealTimers();
});

for (const id of ["workspace-navigation", "canvas-controls", "learning-hub", "folder-manager"]) {
  for (const status of ["skipped", "completed", "active"]) {
    it(`manually opens ${id} with stored ${status} progress and allows replay after closing`, async () => {
      localStorage.setItem(`mindcanvas:feature-guides:${GUIDE_CONTENT_VERSION}:guest`, JSON.stringify({ [id]: { status } }));
      const consumed = vi.fn();
      await act(async () => root.render(<FeatureGuideManager ownerId={null} manualGuideId={id} onManualConsumed={consumed}/>));
      await act(async () => vi.advanceTimersByTime(2000));
      expect(host.textContent).toBe(id);
      expect(consumed).toHaveBeenCalledTimes(1);
      // Mounting and missing targets must never mark a guide skipped.
      expect(readGuideProgress(null)[id]?.status).toBe(status);
      await act(async () => root.render(<FeatureGuideManager ownerId={null}/>));
      await act(async () => host.querySelector<HTMLButtonElement>("button")!.click());
      await act(async () => root.render(<FeatureGuideManager ownerId={null} manualGuideId={id}/>));
      await act(async () => vi.advanceTimersByTime(2000));
      expect(host.textContent).toBe(id);
    });
  }
  it(`does not automatically replay completed ${id}`, async () => {
    localStorage.setItem(`mindcanvas:feature-guides:${GUIDE_CONTENT_VERSION}:guest`, JSON.stringify({ [id]: { status: "completed" } }));
    const trigger = guideForId(id)!.trigger;
    await act(async () => root.render(<FeatureGuideManager ownerId={null} trigger={trigger}/>));
    await act(async () => vi.advanceTimersByTime(2500));
    expect(host.querySelector("button")).toBeNull();
  });
}
