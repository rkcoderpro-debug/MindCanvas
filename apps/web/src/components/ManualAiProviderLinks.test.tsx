// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ManualAiProviderLinks from "./ManualAiProviderLinks";
const mock = vi.hoisted(() => ({ copy: vi.fn() }));
vi.mock("../lib/aiSource", () => ({ writeClipboardText: mock.copy }));
let root: Root, host: HTMLDivElement;
beforeEach(() => { (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; host = document.createElement("div"); document.body.append(host); root = createRoot(host); mock.copy.mockReset(); mock.copy.mockResolvedValue(undefined); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });
it("prepares once, copies and opens a provider tab with a null opener", async () => {
  const tab = { opener: "original", location: { replace: vi.fn() }, close: vi.fn() }, prepare = vi.fn(async () => "Tạo HTML\n$x^2$");
  vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
  await act(async () => root.render(<ManualAiProviderLinks prompt="initial" onPrepare={prepare}/>));
  await act(async () => [...host.querySelectorAll("button")].find(node => node.textContent?.includes("ChatGPT"))!.click());
  expect(prepare).toHaveBeenCalledTimes(1); expect(tab.opener).toBeNull(); expect(mock.copy).toHaveBeenCalledWith("Tạo HTML\n$x^2$"); expect(new URL(tab.location.replace.mock.calls[0][0]).searchParams.get("q")).toBe("Tạo HTML\n$x^2$");
});
it("opens Gemini with a copy instruction and reports clipboard or popup failure honestly", async () => {
  const tab = { opener: "original", location: { replace: vi.fn() }, close: vi.fn() };
  const opened = vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
  await act(async () => root.render(<ManualAiProviderLinks prompt="My note"/>));
  const gemini = [...host.querySelectorAll("button")].find(node => node.textContent?.includes("Gemini"))!;
  await act(async () => gemini.click()); expect(tab.location.replace).toHaveBeenCalledWith("https://gemini.google.com/app"); expect(host.textContent).toContain("Ctrl+V");
  mock.copy.mockRejectedValue(new Error("denied")); await act(async () => gemini.click()); expect(host.textContent).toContain("chưa cho sao chép");
  opened.mockReturnValue(null); await act(async () => gemini.click()); expect(host.textContent).toContain("chặn tab mới");
});
it("does not navigate or copy if quota preparation fails", async () => {
  const tab = { opener: "original", location: { replace: vi.fn() }, close: vi.fn() }; vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
  await act(async () => root.render(<ManualAiProviderLinks prompt="My note" onPrepare={async () => { throw new Error("Quota reached"); }}/>));
  await act(async () => host.querySelector("button")!.click()); expect(tab.close).toHaveBeenCalled(); expect(tab.location.replace).not.toHaveBeenCalled(); expect(mock.copy).not.toHaveBeenCalled(); expect(host.textContent).toContain("Quota reached");
});
