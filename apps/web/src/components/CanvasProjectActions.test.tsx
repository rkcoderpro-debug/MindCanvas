// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import CanvasProjectActions from "./CanvasProjectActions";

it("groups the project actions and collapses on Escape, action selection or outside click", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const run = vi.fn();
  const actions = ["Move", "Share", "Copy link", "Download"].map(id => ({ id, label: id, icon: null, run }));
  try {
    await act(async () => root.render(<CanvasProjectActions actions={actions}/>));
    const trigger = host.querySelector<HTMLButtonElement>("[aria-expanded]")!;
    const choices = host.querySelector<HTMLDivElement>(".canvas-project-action-list")!;
    expect(choices.hidden).toBe(true);
    await act(async () => trigger.click());
    expect(choices.hidden).toBe(false);
    expect([...choices.querySelectorAll("button")].map(action => action.textContent)).toEqual(actions.map(action => action.label));
    await act(async () => choices.firstElementChild!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(document.activeElement).toBe(trigger);
    expect(choices.hidden).toBe(true);
    await act(async () => trigger.click());
    await act(async () => document.body.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true })));
    expect(choices.hidden).toBe(true);
    await act(async () => trigger.click());
    await act(async () => choices.querySelector("button")!.click());
    expect(run).toHaveBeenCalledOnce();
    expect(choices.hidden).toBe(true);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
