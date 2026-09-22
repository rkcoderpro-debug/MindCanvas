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

function guide(steps: GuideDefinition["steps"], id = "test-guide"): GuideDefinition {
  return { id, category: "canvas", titleVi: "Hướng dẫn", titleEn: "Guide", summaryVi: "", summaryEn: "", demo: "canvas", steps, gifSrc: "/guides/test.gif" };
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
    expect(document.body.querySelector(".feature-guide-backdrop")).toBeNull();
    expect(document.body.querySelector(".feature-guide-target-missing")).not.toBeNull();
    expect(complete).not.toHaveBeenCalled();
  });

  it("advances only after the highlighted control is actually clicked", async () => {
    const complete = vi.fn();
    const definition = guide([{ target: ".real-target", titleVi: "Bấm nút", titleEn: "Click button", bodyVi: "", bodyEn: "" }]);
    await act(async () => root.render(createElement(FeatureGuideOverlay, { guide: definition, onComplete: complete, onSkip: vi.fn() })));
    const target = document.createElement("button"); target.className = "real-target"; target.textContent = "Open"; target.getBoundingClientRect = rect; host.append(target);
    await act(async () => { await new Promise(resolve => window.setTimeout(resolve, 220)); });
    expect(document.body.querySelector(".feature-guide-next")?.getAttribute("disabled")).not.toBeNull();
    expect(document.body.querySelector(".feature-guide-focus")?.getAttribute("data-spotlight")).toBe("full-region");
    expect(document.body.querySelector(".feature-guide-target-hint")).toBeNull();
    await act(async () => { target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })); await new Promise(resolve => window.setTimeout(resolve, 220)); });
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("keeps an action step complete after its dialog target unmounts", async () => {
    const complete = vi.fn();
    const definition = guide([{ target: ".create-submit", completion: { type: "action", actions: [{ id: "created", labelVi: "Đã tạo", labelEn: "Created" }] }, titleVi: "Tạo", titleEn: "Create", bodyVi: "", bodyEn: "" }]);
    const target = document.createElement("button"); target.className = "create-submit"; target.getBoundingClientRect = rect; host.append(target);
    await act(async () => root.render(createElement(FeatureGuideOverlay, { guide: definition, onComplete: complete, onSkip: vi.fn() })));
    await act(async () => { window.dispatchEvent(new CustomEvent(GUIDE_ACTION_EVENT, { detail: { name: "created" } })); target.remove(); await new Promise(resolve => window.setTimeout(resolve, 220)); });
    const next = document.body.querySelector<HTMLButtonElement>(".feature-guide-next")!;
    expect(next.disabled).toBe(false);
    expect(document.body.textContent).toContain("Đã hoàn tất bước");
    await act(async () => next.click());
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("requires every declared practice action before completing", async () => {
    const complete = vi.fn();
    const definition = guide([{ kind: "practice", titleVi: "Thực hành", titleEn: "Practice", bodyVi: "", bodyEn: "", completion: { type: "manual", actions: [{ id: "one", labelVi: "Một", labelEn: "One" }, { id: "two", labelVi: "Hai", labelEn: "Two" }] } }]);
    await act(async () => root.render(createElement(FeatureGuideOverlay, { guide: definition, onComplete: complete, onSkip: vi.fn() })));
    expect(document.body.querySelector(".feature-guide-backdrop")).toBeNull();
    expect(document.body.querySelector(".feature-guide-practice-panel")).not.toBeNull();
    const next = () => document.body.querySelector<HTMLButtonElement>(".feature-guide-next")!;
    expect(next().disabled).toBe(true);
    await act(async () => window.dispatchEvent(new CustomEvent(GUIDE_ACTION_EVENT, { detail: { name: "one" } })));
    expect(next().disabled).toBe(true);
    await act(async () => window.dispatchEvent(new CustomEvent(GUIDE_ACTION_EVENT, { detail: { name: "two" } })));
    expect(next().disabled).toBe(false);
    await act(async () => next().click());
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("requires an explicit keep-or-trash choice for a practice canvas", async () => {
    const complete = vi.fn();
    const decision = vi.fn();
    const definition = guide([{ kind: "practice", titleVi: "Canvas", titleEn: "Canvas", bodyVi: "", bodyEn: "", completion: { type: "manual", actions: [{ id: "one", labelVi: "Một", labelEn: "One" }] } }], "canvas-controls");
    await act(async () => root.render(createElement(FeatureGuideOverlay, { guide: definition, practiceResourceId: "practice-1", onPracticeDecision: decision, onComplete: complete, onSkip: vi.fn() })));
    await act(async () => window.dispatchEvent(new CustomEvent(GUIDE_ACTION_EVENT, { detail: { name: "one" } })));
    const keep = [...document.body.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Giữ canvas");
    expect(keep).not.toBeUndefined();
    await act(async () => keep?.click());
    expect(decision).toHaveBeenCalledWith("keep", "practice-1");
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("recovers to the real canvas toolbar when the route changed before the guide advanced", async () => {
    const complete = vi.fn();
    const definition = guide([
      { target: ".workspace-nav-row > button:first-child", titleVi: "Workspace", titleEn: "Workspace", bodyVi: "", bodyEn: "" },
      { target: ".workspace-create-button", titleVi: "Tạo", titleEn: "Create", bodyVi: "", bodyEn: "" },
      { target: ".guide-project-name-input", completion: { type: "input", selector: ".guide-project-name-input", minLength: 1 }, titleVi: "Tên", titleEn: "Name", bodyVi: "", bodyEn: "" },
      { target: ".guide-project-create-submit", titleVi: "Mở", titleEn: "Open", bodyVi: "", bodyEn: "" },
      { target: '[data-tool="pen"]', titleVi: "Chọn Pen", titleEn: "Choose Pen", bodyVi: "", bodyEn: "" },
    ], "canvas-controls");
    const workspace = document.createElement("div");
    workspace.className = "workspace-nav-row";
    const workspaceButton = document.createElement("button");
    workspaceButton.textContent = "Workspace";
    workspaceButton.getBoundingClientRect = rect;
    workspace.append(workspaceButton);
    const toolbar = document.createElement("div");
    toolbar.className = "drawing-toolbar";
    const pen = document.createElement("button");
    pen.dataset.tool = "pen";
    pen.textContent = "Pen";
    pen.getBoundingClientRect = rect;
    toolbar.append(pen);
    await act(async () => root.render(createElement(FeatureGuideOverlay, { guide: definition, currentRoute: "canvas", onComplete: complete, onSkip: vi.fn() })));
    host.append(workspace, toolbar);
    await act(async () => { workspaceButton.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })); await new Promise(resolve => window.setTimeout(resolve, 220)); });
    expect(document.body.textContent).toContain("Chọn Pen");
    expect(document.body.querySelector(".feature-guide-progress")?.getAttribute("aria-label")).toBe("5/5");
  });
});
