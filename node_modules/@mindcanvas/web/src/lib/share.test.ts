// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { copyTextWithFallback, shareProjectLink } from "./share";

const originalClipboard = navigator.clipboard;
const originalShare = navigator.share;
const originalExecCommand = document.execCommand;

afterEach(() => {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: originalClipboard });
  Object.defineProperty(navigator, "share", { configurable: true, value: originalShare });
  Object.defineProperty(document, "execCommand", { configurable: true, value: originalExecCommand });
  vi.restoreAllMocks();
});

describe("mobile sharing fallbacks", () => {
  it("copies through the visible link input when Clipboard API is unavailable", async () => {
    const input = document.createElement("input");
    input.value = "https://example.test/invite";
    document.body.append(input);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    Object.defineProperty(document, "execCommand", { configurable: true, value: vi.fn(() => true) });

    await expect(copyTextWithFallback(input.value, input)).resolves.toBe(true);
    expect(document.execCommand).toHaveBeenCalledWith("copy");
    input.remove();
  });

  it("uses the native share sheet when the browser exposes it", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: share });

    await expect(shareProjectLink("https://example.test/invite", "Canvas", "Open Canvas")).resolves.toBe("shared");
    expect(share).toHaveBeenCalledWith({ title: "Canvas", text: "Open Canvas", url: "https://example.test/invite" });
  });
});
