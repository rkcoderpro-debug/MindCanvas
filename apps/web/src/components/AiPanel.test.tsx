// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AiPanel from "./AiPanel";
import { LanguageProvider } from "../lib/i18n";

vi.mock("../lib/api", () => ({
  consumeAiManualUsage: vi.fn(async () => ({ ok: true, requestId: "test-request" })),
  generateMindMap: vi.fn(),
  generateMindMapFromFile: vi.fn(),
}));

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
  it("uses a detail-specific generic prompt and applies pasted JSON without calling the Auto API", async () => {
    const beforeGenerate = vi.fn(async () => true);
    const onApply = vi.fn();
    await act(async () => root.render(<LanguageProvider><AiPanel projectId="project" canUse={true} beforeGenerate={beforeGenerate} onClose={() => undefined} onApply={onApply}/></LanguageProvider>));

    const manualMode = [...host.querySelectorAll<HTMLButtonElement>('button[role="tab"]')].find(button => button.textContent?.includes("AI Manual"))!;
    await act(async () => manualMode.click());

    expect(host.querySelector(".ai-source-tabs")).toBeNull();
    const detail = host.querySelector(".ai-manual-panel select") as HTMLSelectElement;
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(detail, "detailed");
    await act(async () => detail.dispatchEvent(new Event("change", { bubbles: true })));
    expect((host.querySelector(".ai-manual-prompt textarea") as HTMLTextAreaElement).value).toContain("Detail level: detailed");
    expect((host.querySelector(".ai-manual-prompt textarea") as HTMLTextAreaElement).value).toContain("mindcanvas-mindmap.json");

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
