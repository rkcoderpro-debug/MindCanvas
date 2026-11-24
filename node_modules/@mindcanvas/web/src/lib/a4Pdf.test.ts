// @vitest-environment jsdom
import { Blob as NodeBlob } from "node:buffer";
import { PDFDocument } from "pdf-lib";
import { expect, it, vi } from "vitest";
import { blankBoard } from "./board";
import { newA4Layout, newA4Page } from "./a4Canvas";
import { downloadA4Pdf } from "./a4Pdf";

it("downloads an actual A4 PDF in the requested range using the same page SVG as preview", async () => {
  const pixels = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+tmioAAAAASUVORK5CYII=", "base64");
  const board = { ...blankBoard("Sổ toán"), a4: { ...newA4Layout(), pages: ["Trang một", "Trang hai", "Trang ba"].map(text => newA4Page(text)) } };
  const progress = vi.fn();
  const files: NodeBlob[] = [];
  const droppedUrl = vi.fn();
  class DrawableSvg {
    onload?: () => void;
    set src(_value: string) { queueMicrotask(() => this.onload?.()); }
  }
  vi.stubGlobal("Blob", NodeBlob);
  vi.stubGlobal("Image", DrawableSvg);
  vi.stubGlobal("URL", Object.assign(class extends URL {}, {
    createObjectURL: (blob: NodeBlob) => { files.push(blob); return "blob:test-" + files.length; },
    revokeObjectURL: droppedUrl,
  }));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => ({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D));
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(callback =>
    callback(new NodeBlob([new Uint8Array(pixels)], { type: "image/png" }) as unknown as Blob));
  let filename = "";
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { filename = this.download; });
  try {
    await expect(downloadA4Pdf(board, 2, 4)).rejects.toThrow("Invalid page range.");
    await downloadA4Pdf(board, 2, 3, progress);
    expect(progress.mock.calls).toEqual([[2], [3]]);
    expect(await files[0].text()).toContain("Trang hai");
    expect(await files[1].text()).toContain("Trang ba");
    expect(files[2].type).toBe("application/pdf");
    const doc = await PDFDocument.load(new Uint8Array(await files[2].arrayBuffer()));
    expect(doc.getPageCount()).toBe(2);
    for (const page of doc.getPages()) {
      expect(page.getWidth() * 25.4 / 72).toBeCloseTo(210, 6);
      expect(page.getHeight() * 25.4 / 72).toBeCloseTo(297, 6);
    }
    expect(filename).toBe("Sổ toán.pdf");
  } finally {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
