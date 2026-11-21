// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "../lib/i18n";
import DocxViewer from "./DocxViewer";

const mocked = vi.hoisted(() => ({ render: vi.fn() }));
vi.mock("../lib/docxView", () => ({ DOCX_FRAME_HTML: "<!doctype html><html><body></body></html>", renderDocxView: mocked.render }));
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.setItem("mindcanvas:language", "en");
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  mocked.render.mockReset();
  mocked.render.mockImplementation(async (_bytes, body: HTMLElement) => {
    body.innerHTML = '<section>First</section><section>Second</section>';
    const pages = Array.from(body.children) as HTMLElement[];
    pages.forEach(page => { page.getBoundingClientRect = () => ({ width: 800 } as DOMRect); });
    Object.defineProperty(body.ownerDocument.body, "scrollHeight", { configurable: true, value: 2400 });
    return { pages, oversized: false };
  });
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); localStorage.clear(); });
async function mount(dataUrl = "data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,AA==", onReady?: () => void) {
  await act(async () => root.render(<LanguageProvider><DocxViewer dataUrl={dataUrl} onReady={onReady}/></LanguageProvider>));
  await act(async () => host.querySelector("iframe")!.dispatchEvent(new Event("load")));
}

describe("Word document viewer controls", () => {
  it("shows pages and zoom controls in a script-disabled isolated iframe", async () => {
    const ready = vi.fn(); await mount(undefined, ready);
    expect(host.textContent).toContain("Page 1 / 2");
    expect(host.textContent).toContain("Fit width");
    expect(host.querySelector("iframe")?.getAttribute("sandbox")).toBe("allow-same-origin");
    expect(ready).toHaveBeenCalled();
    await act(async () => (Array.from(host.querySelectorAll("button")).find(button => button.textContent === "100%")!).click());
    expect(host.querySelector("iframe")?.style.transform).toBe("scale(1)");
    await act(async () => (host.querySelector('button[aria-label="Zoom in"]') as HTMLButtonElement).click());
    expect(host.querySelector("iframe")?.style.transform).toBe("scale(1.25)");
    expect(mocked.render.mock.calls.length).toBeLessThanOrEqual(2); // iframe load can occur twice in jsdom
  });

  it("offers a retry when rendering fails", async () => {
    mocked.render.mockRejectedValue(new Error("Malformed XML"));
    await mount();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Could not display");
    mocked.render.mockImplementation(async (_bytes, body: HTMLElement) => {
      body.innerHTML = "<section>First</section><section>Second</section>";
      return { pages: Array.from(body.children), oversized: false };
    });
    await act(async () => (host.querySelector('[role="alert"] button') as HTMLButtonElement).click());
    expect(host.textContent).toContain("Page 1 / 2");
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  it("does not report a disposed document as ready when a newer one finishes first", async () => {
    let finishOld: (value: unknown) => void = () => {};
    mocked.render.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }));
    const ready = vi.fn(); await mount(undefined, ready);
    await act(async () => root.render(<LanguageProvider><DocxViewer dataUrl="data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,AQ==" onReady={ready}/></LanguageProvider>));
    const count = ready.mock.calls.length;
    await act(async () => finishOld({ pages: [], oversized: false }));
    expect(ready).toHaveBeenCalledTimes(count);
    expect(host.textContent).toContain("Page 1 / 2");
  });
});
