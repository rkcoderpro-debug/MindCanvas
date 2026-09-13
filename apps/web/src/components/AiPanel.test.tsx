// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AiPanel from "./AiPanel";
import { LanguageProvider } from "../lib/i18n";

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  localStorage.clear();
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

describe("AI Manual mind-map flow", () => {
  it("works for a guest without calling the Auto API", async () => {
    const beforeGenerate = vi.fn(async () => true);
    const onApply = vi.fn();
    await act(async () => root.render(<LanguageProvider><AiPanel projectId="project" canUse={false} beforeGenerate={beforeGenerate} onClose={() => undefined} onApply={onApply}/></LanguageProvider>));

    const textTab = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(button => button.textContent?.includes("Dán văn bản"))!;
    await act(async () => textTab.click());
    const source = host.querySelector(".ai-text-source textarea") as HTMLTextAreaElement;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(source, "Nội dung học tập");
    await act(async () => source.dispatchEvent(new Event("input", { bubbles: true })));
    await act(async () => (host.querySelector("footer .primary-button") as HTMLButtonElement).click());
    expect(host.querySelector(".ai-manual-prompt textarea")).not.toBeNull();

    const json = host.querySelector(".ai-manual-json textarea") as HTMLTextAreaElement;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(json, JSON.stringify({ title: "Bản đồ", nodes: [{ id: "root", label: "Ý chính" }], edges: [] }));
    await act(async () => json.dispatchEvent(new Event("input", { bubbles: true })));
    const validate = [...host.querySelectorAll<HTMLButtonElement>(".ai-manual-panel button")].find(button => button.textContent === "Kiểm tra kết quả")!;
    await act(async () => validate.click());
    expect(host.querySelector(".graph-preview")).not.toBeNull();
    await act(async () => ([...host.querySelectorAll<HTMLButtonElement>("footer .primary-button")].at(-1) as HTMLButtonElement).click());
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(beforeGenerate).not.toHaveBeenCalled();
  });
});
