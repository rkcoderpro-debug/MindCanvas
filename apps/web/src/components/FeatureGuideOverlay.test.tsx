// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FeatureGuideOverlay from "./FeatureGuideOverlay";
import { GUIDE_ACTION_EVENT, type GuideDefinition } from "../lib/featureGuides";

let host: HTMLDivElement;
let root: Root;

function rect() {
  return { left: 100, top: 80, width: 120, height: 36, right: 220, bottom: 116, x: 100, y: 80, toJSON: () => ({}) } as DOMRect;
}

function guide(steps: GuideDefinition["steps"]): GuideDefinition {
  return { id: "test-guide", category: "canvas", titleVi: "Hướng dẫn", titleEn: "Guide", summaryVi: "", summaryEn: "", demo: "canvas", steps, gifSrc: "/guides/test.gif" };
}

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

describe("FeatureGuideOverlay strict completion", () => {
  it("does not offer a bypass when a target is not present", async () => {
    const complete = vi.fn();
    const definition = guide([{ target: ".not-on-this-page", titleVi: "Mở khu vực", titleEn: "Open area", bodyVi: "", bodyEn: "" }]);
    await act(async () => root.render(createElement(FeatureGuideOverlay, { guide: definition, onComplete: complete, onSkip: vi.fn() })));
    const next = document.body.querySelector<HTMLButtonElement>(".feature-guide-next");
    expect(next).not.toBeNull();
    expect(next?.disabled).toBe(true);
    expect(document.body.textContent).toContain("Hãy mở đúng khu vực");
    expect(complete).not.toHaveBeenCalled();
  });

  it("advances only after the highlighted control is actually clicked", async () => {
    const complete = vi.fn();
    const definition = guide([{ target: ".real-target", titleVi: "Bấm nút", titleEn: "Click button", bodyVi: "", bodyEn: "" }]);
    await act(async () => root.render(createElement(FeatureGuideOverlay, { guide: definition, onComplete: complete, onSkip: vi.fn() })));
    const target = document.createElement("button"); target.className = "real-target"; target.textContent = "Open"; target.getBoundingClientRect = rect; host.append(target);
    await act(async () => { await new Promise(resolve => window.setTimeout(resolve, 40)); });
    expect(document.body.querySelector(".feature-guide-next")?.getAttribute("disabled")).not.toBeNull();
    await act(async () => { target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })); await new Promise(resolve => window.setTimeout(resolve, 220)); });
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("requires every declared practice action before completing", async () => {
    const complete = vi.fn();
    const definition = guide([{ kind: "practice", titleVi: "Thực hành", titleEn: "Practice", bodyVi: "", bodyEn: "", completion: { type: "manual", actions: [{ id: "one", labelVi: "Một", labelEn: "One" }, { id: "two", labelVi: "Hai", labelEn: "Two" }] } }]);
    await act(async () => root.render(createElement(FeatureGuideOverlay, { guide: definition, onComplete: complete, onSkip: vi.fn() })));
    const next = () => document.body.querySelector<HTMLButtonElement>(".feature-guide-next")!;
    expect(next().disabled).toBe(true);
    await act(async () => window.dispatchEvent(new CustomEvent(GUIDE_ACTION_EVENT, { detail: { name: "one" } })));
    expect(next().disabled).toBe(true);
    await act(async () => window.dispatchEvent(new CustomEvent(GUIDE_ACTION_EVENT, { detail: { name: "two" } })));
    expect(next().disabled).toBe(false);
    await act(async () => next().click());
    expect(complete).toHaveBeenCalledTimes(1);
  });
});
