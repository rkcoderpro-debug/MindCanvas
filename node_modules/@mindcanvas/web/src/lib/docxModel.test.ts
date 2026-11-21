// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { buildDocxPackage, importDocx, modelFromHtml, modelToHtml } from "./docxModel";

describe("structured DOCX model", () => {
  it("round-trips headings, marks, lists, tables and page settings through OOXML", async () => {
    const source = modelFromHtml(`<h1 data-docx-style="Title">Tiêu đề</h1><p><strong>Đậm</strong> <em>nghiêng</em> <span style="color:#c1121f;background-color:#fff2a8;font-size:18pt">màu</span></p><ol><li>Câu một</li></ol><table><tbody><tr><th>Cột A</th><th>Cột B</th></tr><tr><td colspan="2">Gộp</td></tr><tr><td rowspan="2">Dọc</td><td>Ô 1</td></tr><tr><td>Ô 2</td></tr></tbody></table><div data-page-break="true"></div><p>Cuối trang</p>`);
    source.page.size = "Letter";
    source.page.orientation = "landscape";
    const base64 = await buildDocxPackage(source);
    const zip = await JSZip.loadAsync(base64, { base64: true });
    expect(await zip.file("word/document.xml")?.async("text")).toContain("gridSpan");
    expect(await zip.file("word/document.xml")?.async("text")).toContain("vMerge");
    expect(await zip.file("word/numbering.xml")?.async("text")).toContain("decimal");
    const imported = await importDocx(Uint8Array.from(atob(base64), character => character.charCodeAt(0)));
    expect(imported.page.size).toBe("Letter");
    expect(imported.page.orientation).toBe("landscape");
    expect(imported.blocks.some(block => block.type === "table")).toBe(true);
    expect(imported.blocks.filter(block => block.type === "paragraph").some(block => block.style === "Title")).toBe(true);
    expect(imported.blocks.filter(block => block.type === "paragraph").some(block => block.list?.kind === "number")).toBe(true);
  });

  it("renders a model as an editable semantic surface without using command APIs", () => {
    const model = modelFromHtml("<h2>Heading</h2><p><u>Text</u></p><ul><li>One</li></ul>");
    const html = modelToHtml(model);
    expect(html).toContain('data-docx-style="Heading2"');
    expect(html).toContain("<u>Text</u>");
    expect(html).toContain("data-docx-list-level");
  });

  it("keeps image media, hyperlinks and explicit page breaks in a round trip", async () => {
    const pixel = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    const source = modelFromHtml(`<p>Truy cập <a href="https://example.com">tài liệu</a></p><figure style="text-align:right"><img src="${pixel}" alt="mẫu" width="24" height="18"/></figure><div data-page-break="true"></div><p>Sau trang</p>`);
    source.header = [{ type: "paragraph", style: "Normal", runs: [{ text: "Đầu trang" }] }];
    source.footer = [{ type: "paragraph", style: "Normal", runs: [{ text: "Chân trang" }] }];
    const base64 = await buildDocxPackage(source);
    const zip = await JSZip.loadAsync(base64, { base64: true });
    const documentXml = await zip.file("word/document.xml")?.async("text");
    expect(documentXml).toContain("w:hyperlink");
    expect(documentXml).toContain("headerReference");
    expect(await zip.file("word/header1.xml")?.async("text")).toContain("Đầu trang");
    expect(await zip.file("word/footer1.xml")?.async("text")).toContain("PAGE");
    expect(await zip.file("word/media/image1.png")?.async("uint8array")).toBeTruthy();
    const imported = await importDocx(Uint8Array.from(atob(base64), character => character.charCodeAt(0)));
    expect(imported.blocks.some(block => block.type === "image")).toBe(true);
    expect(imported.blocks.some(block => block.type === "image" && block.align === "right" && block.widthPx === 24 && block.heightPx === 18)).toBe(true);
    expect(imported.blocks.some(block => block.type === "pageBreak")).toBe(true);
    expect(imported.header?.some(block => block.type === "paragraph" && block.runs.some(run => run.text === "Đầu trang"))).toBe(true);
    expect(imported.footer?.some(block => block.type === "paragraph" && block.runs.some(run => run.text === "Chân trang"))).toBe(true);
    const paragraph = imported.blocks.find(block => block.type === "paragraph" && block.runs.some(run => run.href));
    expect(paragraph?.type === "paragraph" && paragraph.runs.some(run => run.href === "https://example.com")).toBe(true);
  });
});
