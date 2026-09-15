// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AiPanel from "./AiPanel";
import { LanguageProvider } from "../lib/i18n";
import { generateMindMap } from "../lib/api";

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
    const detail = host.querySelector(".ai-manual-panel .ai-mindmap-detail-control select") as HTMLSelectElement;
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

  it("exposes the same quality controls in Auto and forwards them to generation", async () => {
    vi.mocked(generateMindMap).mockResolvedValue({ provider: "gemini", graph: { title: "Map", nodes: [{ id: "root", label: "Root" }], edges: [] } });
    await act(async () => root.render(<LanguageProvider><AiPanel projectId="project" canUse={true} beforeGenerate={async () => true} onClose={() => undefined} onApply={() => undefined}/></LanguageProvider>));

    expect(host.querySelector(".ai-quality-controls")).not.toBeNull();
    const quality = host.querySelectorAll<HTMLSelectElement>(".ai-quality-controls select");
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(quality[0], "hard");
    await act(async () => quality[0].dispatchEvent(new Event("change", { bubbles: true })));
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(quality[1], "detailed");
    await act(async () => quality[1].dispatchEvent(new Event("change", { bubbles: true })));
    const detail = host.querySelector<HTMLSelectElement>(".ai-mindmap-detail-control select")!;
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(detail, "detailed");
    await act(async () => detail.dispatchEvent(new Event("change", { bubbles: true })));

    const textTab = host.querySelector<HTMLButtonElement>('.ai-source-tabs button[role="tab"]')!;
    await act(async () => textTab.click());
    const source = host.querySelector<HTMLTextAreaElement>(".ai-text-source textarea")!;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(source, "Source text");
    await act(async () => source.dispatchEvent(new Event("input", { bubbles: true })));
    await act(async () => (host.querySelector(".actions .primary-button") as HTMLButtonElement).click());

    expect(generateMindMap).toHaveBeenCalledWith("Source text", undefined, expect.any(AbortSignal), { difficulty: "hard", depth: "detailed" }, "detailed");
  });

  it("keeps an Auto request alive while minimized and notifies when it finishes", async () => {
    let resolveGeneration!: (value: Awaited<ReturnType<typeof generateMindMap>>) => void;
    vi.mocked(generateMindMap).mockReturnValue(new Promise(resolve => { resolveGeneration = resolve; }));
    function MinimizeHarness() {
      const [minimized, setMinimized] = useState(false);
      return <LanguageProvider><AiPanel projectId="project" canUse beforeGenerate={async () => true} minimized={minimized} onMinimize={() => setMinimized(true)} onRestore={() => setMinimized(false)} onClose={() => undefined} onApply={() => undefined}/></LanguageProvider>;
    }
    await act(async () => root.render(<MinimizeHarness/>));
    await act(async () => host.querySelector<HTMLButtonElement>('.ai-source-tabs button[role="tab"]')!.click());
    const source = host.querySelector<HTMLTextAreaElement>(".ai-text-source textarea")!;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(source, "Background source");
    await act(async () => source.dispatchEvent(new Event("input", { bubbles: true })));
    await act(async () => (host.querySelector(".actions .primary-button") as HTMLButtonElement).click());
    await act(async () => (host.querySelector('[aria-label="Thu nhỏ AI Auto"]') as HTMLButtonElement).click());
    expect(host.querySelector(".ai-task-launcher.working")?.textContent).toContain("AI Auto đang xử lý");
    await act(async () => resolveGeneration({ provider: "gemini", graph: { title: "Done", nodes: [{ id: "root", label: "Ready" }], edges: [] } }));
    expect(host.querySelector(".ai-task-launcher.ready")?.textContent).toContain("AI đã trả kết quả");
  });
});
