// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { buildDocx } from "./DocumentToolsPage";
import { shouldHandleAnnotationMove, shouldRequestPdfGuide } from "./DocumentViewer";

describe("DOCX editor export", () => {
  it("writes a readable OOXML package instead of renaming HTML", async () => {
    const base64 = await buildDocx("<h1>Lesson</h1><p><strong>Bold</strong> <span style=\"background-color: rgb(255, 242, 168); font-size: 18px\">highlight</span> &amp; text</p><ul><li>One</li></ul>");
    const zip = await JSZip.loadAsync(base64, { base64: true });
    const documentXml = await zip.file("word/document.xml")?.async("text");
    expect(documentXml).toContain("<w:pStyle w:val=\"Heading1\"/>");
    expect(documentXml).toContain("<w:b/>");
    expect(documentXml).toContain("<w:shd w:fill=\"FFF2A8\"/>");
    expect(documentXml).toContain("<w:sz w:val=\"27\"/>");
    expect(documentXml).toContain("w:numId");
    expect(await zip.file("[Content_Types].xml")?.async("text")).toContain("wordprocessingml.document.main+xml");
    expect(await zip.file("word/numbering.xml")?.async("text")).toContain("w:numFmt w:val=\"bullet\"");
    expect(await zip.file("word/document.xml")?.async("text")).toContain("Lesson");
  });

  it("does not start the PDF guide for a DOCX that appears first", () => {
    const orderedKinds = ["docx", "pdf"] as const;
    expect(orderedKinds.map(kind => shouldRequestPdfGuide(kind))).toEqual([false, true]);
    expect(shouldRequestPdfGuide("pdf", true, true)).toBe(false);
  });

  it("ignores hover moves and unrelated pointers while drawing a PDF", () => {
    expect(shouldHandleAnnotationMove(null, 1, 0, "mouse")).toBe(false);
    expect(shouldHandleAnnotationMove(7, 8, 1, "mouse")).toBe(false);
    expect(shouldHandleAnnotationMove(7, 7, 0, "mouse")).toBe(false);
    expect(shouldHandleAnnotationMove(7, 7, 1, "mouse")).toBe(true);
    expect(shouldHandleAnnotationMove(7, 7, 0, "pen")).toBe(false);
    expect(shouldHandleAnnotationMove(7, 7, 1, "pen")).toBe(true);
  });
});
