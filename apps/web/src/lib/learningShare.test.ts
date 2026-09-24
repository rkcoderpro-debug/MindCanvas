import { describe, expect, it } from "vitest";
import { canShare } from "./learningShare";
import { labSandboxDocument } from "./lab";

describe("learning share plan gates", () => {
  it("requires Plus for quiz and decks, Pro for Lab; Free can still receive", () => {
    for (const plan of [undefined, "free"]) {
      expect(canShare("quiz", plan)).toBe(false);
      expect(canShare("flashcard", plan)).toBe(false);
      expect(canShare("lab", plan)).toBe(false);
      expect(canShare("document", plan)).toBe(false);
    }
    expect(canShare("quiz", "plus")).toBe(true);
    expect(canShare("flashcard", "plus")).toBe(true);
    expect(canShare("lab", "plus")).toBe(false);
    for (const plan of ["pro", "max"]) {
      expect(canShare("lab", plan)).toBe(true);
      expect(canShare("document", plan)).toBe(true);
    }
  });
});

describe("Lab sandbox document", () => {
  it("places CSP before untrusted markup and blocks connections, forms, frames and objects", () => {
    const html = '<html><head><script>fetch("/private")</script></head><body>Simulation</body></html>';
    const result = labSandboxDocument(html);
    expect(result.indexOf("Content-Security-Policy")).toBeLessThan(result.indexOf("<script>"));
    expect(result).toContain("connect-src 'none'");
    expect(result).toContain("form-action 'none'");
    expect(result).toContain("frame-src 'none'");
    expect(result).toContain(html);
  });

  it("allows the supported CDN libraries without granting API, same-origin or navigation access", () => {
    const result = labSandboxDocument("<main>CDN Lab</main>", { allowExternalResources: true });
    expect(result).toContain("script-src 'unsafe-inline' 'unsafe-eval' https://unpkg.com https://cdn.jsdelivr.net https://cdn.tailwindcss.com https://cdnjs.cloudflare.com");
    expect(result).toContain("style-src 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com");
    expect(result).toContain("connect-src 'none'");
    expect(result).toContain("frame-src blob: data:");
    expect(result).toContain("navigate-to 'none'");
    expect(result).toContain("localStorage");
    expect(result).not.toContain("allow-same-origin");
    expect(result).not.toContain("generativelanguage.googleapis.com");
  });
});
