// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import { buildDocxPackage, DEFAULT_PAGE, type DocxDocument } from "./docxModel";
import { DOCX_FRAME_HTML, paginateDocx, renderDocxView, sanitizeDocxDOM } from "./docxView";

afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ""; });

function measuredRoot(html: string) {
  const root = document.createElement("div"); document.body.append(root);
  root.innerHTML = `<section class="mc-docx" style="width:200px;min-height:100px;padding:0"><article>${html}</article><footer>__MINDCANVAS_WORD_PAGE__/__MINDCANVAS_WORD_PAGES__</footer></section>`;
  const height = (element: Element): number => element.tagName === "TABLE"
    ? Array.from(element.querySelectorAll("tr")).reduce((total, row) => total + Number((row as HTMLElement).dataset.height ?? 0), 0)
    : Number((element as HTMLElement).dataset.height ?? 0);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const previous = this.parentElement ? Array.from(this.parentElement.children).slice(0, Array.from(this.parentElement.children).indexOf(this)) : [];
    const top = previous.reduce((total, item) => total + height(item), 0);
    return { width: 200, height: height(this), top, bottom: top + height(this), x: 0, y: top, left: 0, right: 200, toJSON: () => ({}) };
  });
  return root;
}

describe("DOCX page layout", () => {
  it("moves complete paragraphs to the next page without dropping or duplicating text", () => {
    const root = measuredRoot('<p data-height="60">English paragraph</p><p data-height="60">Đoạn tiếng Việt</p>');
    const result = paginateDocx(root);
    expect(result.pages).toHaveLength(2);
    expect(Array.from(root.querySelectorAll("article p")).map(p => p.textContent)).toEqual(["English paragraph", "Đoạn tiếng Việt"]);
    expect(Array.from(root.querySelectorAll("footer")).map(p => p.textContent)).toEqual(["1/2", "2/2"]);
    expect(result.oversized).toBe(false);
  });

  it("splits a long table by intact rows, retaining its column widths and shading", () => {
    const root = measuredRoot('<table style="width:180px"><colgroup><col style="width:60px"><col style="width:120px"></colgroup><tbody><tr data-height="60"><td style="background:#dbeafe">First</td><td>One</td></tr><tr data-height="60"><td>Second</td><td>Two</td></tr></tbody></table>');
    const result = paginateDocx(root);
    expect(result.pages).toHaveLength(2);
    expect(Array.from(root.querySelectorAll("tbody tr")).map(p => p.textContent)).toEqual(["FirstOne", "SecondTwo"]);
    expect(root.querySelectorAll('col[style="width:120px"]')).toHaveLength(2);
    expect((root.querySelector("td") as HTMLElement).style.background).toBe("rgb(219, 234, 254)");
  });

  it("keeps an oversized image visible and places its footer below the content", () => {
    const root = measuredRoot('<img data-height="150" alt="Tall diagram">');
    const result = paginateDocx(root);
    expect(result.oversized).toBe(true);
    expect(result.pages[0].style.height).toBe("auto");
    expect((root.querySelector("footer") as HTMLElement).style.position).toBe("static");
    expect(result.pages[0].lastElementChild?.tagName).toBe("FOOTER");
    expect(root.querySelector("img")?.getAttribute("alt")).toBe("Tall diagram");
  });

  it("does not cut a row-spanning table into disconnected cells", () => {
    const root = measuredRoot('<table data-height="150"><tbody><tr data-height="150"><td rowspan="2">Merged</td></tr><tr><td>Data</td></tr></tbody></table>');
    const result = paginateDocx(root);
    expect(result.pages).toHaveLength(1);
    expect(result.oversized).toBe(true);
    expect(root.querySelector("td[rowspan]")?.textContent).toBe("Merged");
  });

  it("retains endnotes once when a source section flows onto more pages", () => {
    const root = measuredRoot('<p data-height="60">First</p><p data-height="60">Second</p>');
    root.querySelector("section")!.append(document.createElement("ol"));
    root.querySelector("ol")!.textContent = "Endnote";
    paginateDocx(root);
    expect(root.querySelectorAll("ol")).toHaveLength(1);
    expect(root.querySelector("ol")?.textContent).toBe("Endnote");
  });
});

describe("DOCX rendering and isolation", () => {
  it("renders an actual OOXML package with styles, tables, margins, page breaks and PAGE fields", async () => {
    const model: DocxDocument = { schemaVersion: 1, page: structuredClone(DEFAULT_PAGE), warnings: [],
      blocks: [
        { type: "paragraph", style: "Normal", runs: [{ text: "Chemistry song ngữ", fontFamily: "Arial", fontSize: 14, color: "#174e79", bold: true }] },
        { type: "table", rows: [{ cells: [{ blocks: [{ type: "paragraph", style: "Normal", runs: [{ text: "Vocabulary" }] }], background: "#dbeafe" }] }] },
        { type: "pageBreak" }, { type: "paragraph", style: "Normal", runs: [{ text: "Second page" }] },
      ], footer: [{ type: "paragraph", style: "Normal", runs: [{ text: "Page" }] }] };
    const zip = await JSZip.loadAsync(await buildDocxPackage(model), { base64: true });
    zip.file("word/footer1.xml", '<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:fldSimple w:instr="PAGE"><w:r><w:t>1</w:t></w:r></w:fldSimple><w:r><w:t>/</w:t></w:r><w:fldSimple w:instr="NUMPAGES"><w:r><w:t>1</w:t></w:r></w:fldSimple></w:p></w:ftr>');
    const body = document.createElement("div"), styles = document.createElement("div"); document.body.append(styles, body);
    const result = await renderDocxView(await zip.generateAsync({ type: "uint8array" }), body, styles);
    expect(result.pages).toHaveLength(2);
    expect(body.textContent).toContain("Chemistry song ngữ");
    expect(body.textContent).toContain("Vocabulary");
    expect(body.querySelectorAll("table")).toHaveLength(1);
    expect(styles.textContent).toContain("mc-docx");
    expect(body.querySelector('span[style*="14pt"]')).not.toBeNull();
    expect(body.querySelector('span[style*="Arial"]')).not.toBeNull();
    expect(body.querySelector('td[style*="background"]')).not.toBeNull();
    expect(result.pages[0].style.width).toContain("pt");
    expect(Array.from(body.querySelectorAll("footer")).map(node => node.textContent)).toEqual(["1/2", "2/2"]);
  });

  it("removes active/external content while retaining document formatting and local images", () => {
    const root = document.createElement("div");
    root.innerHTML = '<p style="font-size:14pt;color:#174e79" onclick="alert(1)">Text</p><script>alert(1)</script><iframe></iframe><a href="javascript:alert(1)">Link</a><img src="https://external.test/image"><img src="data:image/png;base64,AA==">';
    sanitizeDocxDOM(root);
    expect(root.querySelector("script,iframe,[onclick]")).toBeNull();
    expect(root.querySelector("a")?.hasAttribute("href")).toBe(false);
    expect(root.querySelector('img[src^="https:"]')).toBeNull();
    expect(root.querySelector('img[src^="data:image/"]')).not.toBeNull();
    expect(root.querySelector("p")?.getAttribute("style")).toContain("font-size:14pt");
    expect(DOCX_FRAME_HTML).toContain("script-src 'none'");
  });

  it("rejects a corrupt document instead of reporting an empty successful preview", async () => {
    await expect(renderDocxView(new Uint8Array([1, 2, 3]), document.createElement("div"), document.createElement("div"))).rejects.toThrow();
  });
});
