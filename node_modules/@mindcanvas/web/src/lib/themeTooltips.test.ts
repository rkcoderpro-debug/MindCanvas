// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { installThemeTooltips } from "./themeTooltips";

let uninstall: () => void;
beforeEach(() => { vi.useFakeTimers(); uninstall = installThemeTooltips(document); });
afterEach(() => { uninstall(); vi.useRealTimers(); document.body.replaceChildren(); });

function makeButton(parent: HTMLElement, title: string) {
  const button = document.createElement("button");
  button.title = title;
  button.getBoundingClientRect = () => new DOMRect(60, 70, 30, 30);
  parent.append(button);
  return button;
}

it("suppresses the browser title during hover, uses one themed tooltip, and restores the original label", () => {
  const button = makeButton(document.body, "Thao tác project");
  button.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
  expect(button.title).toBe("");
  expect(button.getAttribute("aria-label")).toBe("Thao tác project");
  expect(document.querySelector(".theme-tooltip")).toBeNull();
  vi.advanceTimersByTime(400);
  expect(document.querySelector(".theme-tooltip[role=tooltip]")?.textContent).toBe("Thao tác project");
  button.dispatchEvent(new MouseEvent("pointerout", { bubbles: true, relatedTarget: document.body }));
  expect(document.querySelector(".theme-tooltip")).toBeNull();
  expect(button.title).toBe("Thao tác project");
  expect(button.hasAttribute("aria-label")).toBe(false);
});

it("places a keyboard tooltip inside an open dialog and respects live title updates", async () => {
  const dialog = document.createElement("dialog");
  dialog.open = true;
  document.body.append(dialog);
  const button = makeButton(dialog, "Mở phần cài đặt");
  button.textContent = "Cài đặt";
  button.setAttribute("aria-describedby", "existing-description");
  button.focus();
  vi.advanceTimersByTime(400);
  expect(dialog.querySelector(".theme-tooltip")?.textContent).toBe("Mở phần cài đặt");
  expect(button.getAttribute("aria-describedby")).toContain("existing-description mindcanvas-theme-tooltip");
  button.title = "Đóng phần cài đặt";
  await Promise.resolve();
  vi.advanceTimersByTime(400);
  expect(dialog.querySelector(".theme-tooltip")?.textContent).toBe("Đóng phần cài đặt");
  button.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
  expect(dialog.querySelector(".theme-tooltip")).toBeNull();
  expect(button.title).toBe("Đóng phần cài đặt");
  expect(button.getAttribute("aria-describedby")).toBe("existing-description");
});
