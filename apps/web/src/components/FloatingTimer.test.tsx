// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FloatingTimer from "./FloatingTimer";
import { LanguageProvider } from "../lib/i18n";

let root: Root;
let host: HTMLDivElement;
let boundsSpy: ReturnType<typeof vi.spyOn>;

function pointer(type: string, values: { pointerId: number; clientX: number; clientY: number }) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    button: { value: 0 },
    pointerId: { value: values.pointerId },
    clientX: { value: values.clientX },
    clientY: { value: values.clientY },
  });
  return event;
}

beforeEach(() => {
  localStorage.clear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  boundsSpy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this.classList.contains("floating-timer")) return { left: 100, top: 120, width: 330, height: 420, right: 430, bottom: 540, x: 100, y: 120, toJSON: () => ({}) } as DOMRect;
    if (this.classList.contains("timer-launcher")) return { left: 100, top: 120, width: 130, height: 40, right: 230, bottom: 160, x: 100, y: 120, toJSON: () => ({}) } as DOMRect;
    return { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  });
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  await act(async () => root.unmount());
  boundsSpy.mockRestore();
  host.remove();
});

describe("floating timer launcher", () => {
  it("remembers its open position and can be dragged after hiding", async () => {
    await act(async () => root.render(<LanguageProvider><FloatingTimer /></LanguageProvider>));
    const hide = host.querySelector<HTMLButtonElement>(".floating-timer-actions button:last-child")!;
    await act(async () => hide.click());

    const launcher = host.querySelector<HTMLButtonElement>(".timer-launcher")!;
    expect(launcher.style.left).toBe("100px");
    expect(launcher.style.top).toBe("120px");

    await act(async () => launcher.dispatchEvent(pointer("pointerdown", { pointerId: 7, clientX: 115, clientY: 135 })));
    await act(async () => window.dispatchEvent(pointer("pointermove", { pointerId: 7, clientX: 165, clientY: 160 })));
    await act(async () => window.dispatchEvent(pointer("pointerup", { pointerId: 7, clientX: 165, clientY: 160 })));
    await act(async () => launcher.click());

    expect(host.querySelector(".floating-timer")).toBeNull();
    expect(launcher.style.left).toBe("150px");
    expect(launcher.style.top).toBe("145px");
  });
});
