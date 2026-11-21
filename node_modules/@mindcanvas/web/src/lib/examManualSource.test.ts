// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import JSZip from "jszip";
import { manualSourceBundle, OCR_WARNING, readLocalBytes, readManualExamSource, sourceOcrPrompt } from "./examManualSource";
const pdf = vi.hoisted(() => ({ pages: ["Water freezes at 0 degrees under standard atmospheric pressure."], destroy: vi.fn(), getDocument: vi.fn() }));
vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({ GlobalWorkerOptions: {}, getDocument: pdf.getDocument }));
beforeEach(() => {
  pdf.destroy.mockReset(); pdf.getDocument.mockReset(); pdf.pages = ["Water freezes at 0 degrees under standard atmospheric pressure."];
  pdf.getDocument.mockImplementation(() => ({ promise: Promise.resolve({ numPages: pdf.pages.length, getPage: async (n: number) => ({ cleanup: () => {}, getTextContent: async () => ({ items: [{ str: pdf.pages[n - 1], hasEOL: true }] }) }) }), destroy: pdf.destroy }));
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Manual source must not upload"); }));
});
afterEach(() => { vi.unstubAllGlobals(); });
it("reads a UTF-8 text file locally without network", async () => {
  const file = new File(["Ôn tập: nước đóng băng và chuyển trạng thái."], "notes.txt"), source = await readManualExamSource(file, "material");
  expect(source.text).toContain("Ôn tập"); expect(source.role).toBe("material"); expect(fetch).not.toHaveBeenCalled();
});
it("reads DOCX paragraphs, tables and equation text locally", async () => {
  const zip = new JSZip(); zip.file("word/document.xml", '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><w:body><w:p><w:r><w:t>Review thermal motion of water particles.</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Solid water: </w:t></w:r><m:oMath><m:r><m:t>0 C</m:t></m:r></m:oMath></w:p></w:tc></w:tr></w:tbl></w:body></w:document>');
  const source = await readManualExamSource(new File([await zip.generateAsync({ type: "arraybuffer" })], "notes.docx"), "template");
  expect(source.text).toContain("Solid water: 0 C"); expect(source.pageCount).toBeUndefined(); expect(source.warnings.join(" ")).toContain("công thức"); expect(fetch).not.toHaveBeenCalled();
});
it("reads PDF page markers and destroys the worker after extraction", async () => {
  pdf.pages.push("This second page includes a learning concept and an explanation.");
  const source = await readManualExamSource(new File(["mock pdf"], "notes.pdf"), "material");
  expect(source.pageCount).toBe(2); expect(source.text).toContain("[PAGE 2]"); expect(pdf.destroy).toHaveBeenCalledTimes(1); expect(fetch).not.toHaveBeenCalled();
});
it("marks incomplete PDF pages for external OCR without sending a request", async () => {
  pdf.pages.push(""); const source = await readManualExamSource(new File(["mock pdf"], "scan.pdf"), "template");
  expect(source.text).toContain("[PAGE 2]\n[UNREADABLE]"); expect(source.warnings).toContain(OCR_WARNING); expect(sourceOcrPrompt(source)).toContain(source.id); expect(fetch).not.toHaveBeenCalled();
});
it("prepares image OCR prompt with source identity and no automated OCR", async () => {
  const source = await readManualExamSource(new File(["image bytes"], "scan.png"), "template");
  expect(source.text).toContain("[UNREADABLE]"); expect(source.warnings).toContain(OCR_WARNING); expect(sourceOcrPrompt(source)).toContain("never guess"); expect(pdf.getDocument).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
});
it("packages only prompt and exact original bytes with safe paths", async () => {
  const file = new File(["A sufficiently long original learning material."], "../unsafe:notes.txt"), source = await readManualExamSource(file, "material");
  const blob = await manualSourceBundle("Exam prompt", [source], new Map([[source.id, file]])), zip = await JSZip.loadAsync(await readLocalBytes(blob));
  expect(await zip.file("prompt.txt")!.async("text")).toBe("Exam prompt");
  const names = Object.keys(zip.files).filter(name => !zip.files[name].dir);
  expect(names.some(name => /sources|\.json$|README/.test(name))).toBe(false);
  const originalPath = names.find(name => name.startsWith("originals/"))!;
  expect(originalPath).not.toContain("../"); expect(await zip.file(originalPath)!.async("text")).toBe(await new Response(await readLocalBytes(file)).text());

});
it("rejects empty, oversized, unsupported, corrupted and aborted source inputs", async () => {
  await expect(readManualExamSource(new File([], "empty.txt"), "material")).rejects.toThrow(/nội dung/);
  await expect(readManualExamSource(new File([new Uint8Array(10 * 1024 * 1024 + 1)], "large.txt"), "material")).rejects.toThrow(/10 MB/);
  await expect(readManualExamSource(new File(["original source words"], "slides.pptx"), "material")).rejects.toThrow(/Manual hỗ trợ/);
  await expect(readManualExamSource(new File(["broken"], "broken.docx"), "material")).rejects.toThrow();
  const controller = new AbortController(); controller.abort(); await expect(readManualExamSource(new File(["source material"], "notes.txt"), "material", controller.signal)).rejects.toThrow(/Aborted/);
});
