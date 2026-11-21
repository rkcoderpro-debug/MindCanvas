// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { readClipboardSource } from "./aiSource";

const originalClipboard = navigator.clipboard;

afterEach(() => {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: originalClipboard });
});

describe("AI clipboard source", () => {
  it("reads text from the clipboard", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { readText: async () => "  Notes from clipboard  " } });
    await expect(readClipboardSource()).resolves.toEqual({ kind: "text", text: "Notes from clipboard" });
  });

  it("prefers a copied image when the browser exposes clipboard read", async () => {
    const blob = new Blob(["image"], { type: "image/png" });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
      read: async () => [{ types: ["image/png"], getType: async () => blob }],
      readText: async () => "fallback",
    } });
    const result = await readClipboardSource();
    expect(result.kind).toBe("image");
    if (result.kind === "image") expect(result.file).toMatchObject({ name: "clipboard-image.png", type: "image/png" });
  });
});
