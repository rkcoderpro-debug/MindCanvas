// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import FeatureGuideManager from "./FeatureGuideManager";
import { GUIDE_CONTENT_VERSION, GUIDE_REQUEST_EVENT, guideForId, readGuideProgress } from "../lib/featureGuides";

vi.mock("./FeatureGuideOverlay", () => ({ default: ({ guide, onSkip, expectedDocumentId, expectedViewerSessionId }: any) =>
  <button data-testid="guide" data-document-id={expectedDocumentId ?? ""} data-viewer-session-id={expectedViewerSessionId ?? ""} onClick={onSkip}>{guide.id}</button> }));
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

it("starts a PDF guide only for the viewer session that is still mounted", async () => {
  await act(async () => root.render(<FeatureGuideManager ownerId={null}/>));
  const viewer = document.createElement("section");
  viewer.className = "document-viewer";
  viewer.dataset.documentId = "doc-current";
  viewer.dataset.documentKind = "pdf";
  viewer.dataset.viewerSessionId = "viewer-current";
  document.body.append(viewer);

  await act(async () => window.dispatchEvent(new CustomEvent(GUIDE_REQUEST_EVENT, { detail: {
    guideId: "pdf-annotation", documentId: "doc-old", viewerSessionId: "viewer-old", kind: "pdf",
  } })));
  expect(host.querySelector("[data-testid=guide]")).toBeNull();

  await act(async () => window.dispatchEvent(new CustomEvent(GUIDE_REQUEST_EVENT, { detail: {
    guideId: "pdf-annotation", documentId: "doc-current", viewerSessionId: "viewer-current", kind: "pdf",
  } })));
  expect(host.querySelector<HTMLButtonElement>("[data-testid=guide]")?.dataset.documentId).toBe("doc-current");
  expect(host.querySelector<HTMLButtonElement>("[data-testid=guide]")?.dataset.viewerSessionId).toBe("viewer-current");
  viewer.remove();
});
