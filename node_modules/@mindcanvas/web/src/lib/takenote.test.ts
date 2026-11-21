// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import JSZip from "jszip";
import { emptyNoteSettings, validateNoteResult, validateNoteSettings } from "../../../../packages/shared/src/takenotes.js";
import { noteManualPrompt, noteMarkdownHtml } from "./takenote";
import { buildTakenoteDocx, takenotePrintHtml } from "./takenoteExport";
import { emptyNoteWorkspace, listNotes, loadNoteWorkspace, persistNoteWorkspace, saveNote } from "./takenoteStore";
import { htmlDocumentWarnings, htmlSandboxDocument, textFromDataUrl, validateHtmlDocument } from "./htmlDocument";
import { manualProviderUrl } from "./manualProvider";
import { documentKindFor, fileToDataUrl, listDocuments, saveDocument } from "./documentStore";
beforeEach(() => { globalThis.indexedDB = new IDBFactory(); localStorage.clear(); });
it("uses attribute-only Manual prompts for actual Markdown, DOCX or self-contained HTML", () => {
  const settings = emptyNoteSettings();
  expect(noteManualPrompt(settings)).toContain("no extracted source content");
  expect(noteManualPrompt(settings, "docx")).toContain("actual downloadable editable Microsoft Word");
  expect(noteManualPrompt({ ...settings, format: "html", visuals: ["simulation"] })).toContain("sandbox=allow-scripts");
  expect(noteManualPrompt({ ...settings, format: "html" })).toContain("Do not return JSON");
  expect(() => validateNoteSettings({ ...settings, visuals: ["nonsense"] })).toThrow();
  expect(() => validateNoteResult({ title: "Title", content: "", warnings: [] }, "knowledge")).toThrow();
});
it("renders structured Markdown with tables, LaTeX and chemistry without injecting source HTML", () => {
  const html = noteMarkdownHtml('# Lesson\n\n<script>bad()</script>\n\n- **One**\n- Two\n\n| Symbol | Meaning |\n| --- | --- |\n| $x^2$ | Area |\n\n$$\\frac{1}{2}mv^2$$\n\n$\\ce{H2O}$');
  expect(html).toContain("<h1>Lesson</h1>"); expect(html).toContain("<ul>"); expect(html).toContain("<table>"); expect(html).toContain("<math");
  expect(html).toContain("&lt;script&gt;"); expect(html).not.toContain("<script>"); expect(html).not.toContain("formula-invalid");
  const printable = takenotePrintHtml("Động năng $E_k=\\frac12 mv^2$ và $\\ce{H2O}$");
  expect(printable).toContain("<math"); expect(printable).not.toContain("katex-html"); expect(printable).not.toContain("katex-mathml");
});
it("exports headings, tables and editable Word equations without missing or duplicated formulas", async () => {
  const blob = await buildTakenoteDocx("## Công thức\n\nĐộng năng $E_k=\\frac{1}{2}mv^2$ và $\\sqrt{x}$.\n\n$\\ce{H2O}$\n\n| Vật | Giá trị |\n| --- | --- |\n| A | 2 |", "Bài học");
  const bytes = await new Promise<ArrayBuffer>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result as ArrayBuffer); r.onerror = () => reject(r.error); r.readAsArrayBuffer(blob); });
  const zip = await JSZip.loadAsync(bytes), xml = await zip.file("word/document.xml")!.async("text");
  expect(xml).toContain("<w:tbl>"); expect(xml).toContain("Heading2"); expect(xml).toContain("<m:f>"); expect(xml).toContain("<m:rad>"); expect(xml).toContain("<m:sSub>");
  expect(await zip.file("word/_rels/document.xml.rels")!.async("text")).toContain('Target="styles.xml"');
  expect(xml).not.toContain("MCNOTEFORMULA"); expect(new DOMParser().parseFromString(xml, "application/xml").querySelector("parsererror")).toBeNull();
  vi.useFakeTimers({ toFake: ["Date"] });
  try {
    vi.setSystemTime(new Date("2030-01-01T00:00:00Z"));
    const same = await buildTakenoteDocx("## Công thức\n\nĐộng năng $E_k=\\frac{1}{2}mv^2$ và $\\sqrt{x}$.\n\n$\\ce{H2O}$\n\n| Vật | Giá trị |\n| --- | --- |\n| A | 2 |", "Bài học");
    const other = await new Promise<ArrayBuffer>(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result as ArrayBuffer); reader.readAsArrayBuffer(same); });
    expect(new Uint8Array(other)).toEqual(new Uint8Array(bytes));
  } finally { vi.useRealTimers(); }
});
it("persists large HTML notes and drafts per owner in IndexedDB", async () => {
  const work = emptyNoteWorkspace(); work.sourceText = "Private course material"; work.settings.format = "html";
  work.result = { id: crypto.randomUUID(), owner: "alice", format: "html", title: "Lesson", content: `<main>${"Nội dung ".repeat(20000)}</main>`, settings: work.settings, warnings: [], updatedAt: new Date().toISOString() };
  await persistNoteWorkspace("alice", work); await saveNote("alice", work.result);
  expect((await loadNoteWorkspace("alice")).sourceText).toBe("Private course material");
  expect((await listNotes("alice"))[0].content).toBe(work.result.content); expect(await listNotes("bob")).toEqual([]); expect((await loadNoteWorkspace("bob")).result).toBeNull();
  await expect(saveNote("bob", work.result)).rejects.toThrow("tài khoản");
});
it("recognizes, stores and decodes original UTF-8 HTML in the document library", async () => {
  expect(documentKindFor("LESSON.HTM")).toBe("html"); expect(documentKindFor("lesson.html")).toBe("html");
  const html = "<!doctype html><html><body><h1>Động năng</h1><button>Thử</button></body></html>";
  const dataUrl = await fileToDataUrl(new Blob([html], { type: "text/html" })); expect(textFromDataUrl(dataUrl)).toBe(html);
  await saveDocument("alice", { name: "lesson.html", kind: "html", mimeType: "text/html", size: html.length, folderId: null, dataUrl });
  expect((await listDocuments("alice"))[0].kind).toBe("html"); expect(await listDocuments("bob")).toEqual([]);
});
it("puts restrictive policy before imported scripts and removes navigation and embedded resources", () => {
  const html = '<html><head><meta http-equiv="refresh" content="0;url=https://evil.test"><script>document.body.dataset.loaded="yes"</script></head><body><h1>Lesson</h1><script src="https://evil.test/a.js"></script><iframe src="https://evil.test"></iframe><form><input></form><a href="https://evil.test">Go</a></body></html>';
  expect(validateHtmlDocument(html)).toBe(html); expect(htmlDocumentWarnings(html)).toHaveLength(1);
  const protectedHtml = htmlSandboxDocument(html), parsed = new DOMParser().parseFromString(protectedHtml, "text/html");
  expect(parsed.head.firstElementChild?.getAttribute("http-equiv")).toBe("Content-Security-Policy");
  expect(protectedHtml).toContain("connect-src 'none'"); expect(parsed.querySelector("iframe,form,script[src],meta[http-equiv=refresh],a[href]")).toBeNull();
  expect(parsed.querySelector("script")?.textContent).toContain("dataset.loaded");
  expect(() => validateHtmlDocument("plain text")).toThrow(); expect(() => validateHtmlDocument("<main></main>")).toThrow();
});
it("encodes ChatGPT prompts exactly and falls back for long URLs; Gemini uses copy and open", () => {
  const prompt = "Tạo bài học\n$x^2$ & ? # / +";
  const result = manualProviderUrl("chatgpt", "https://chatgpt.com/", prompt);
  expect(new URL(result.url).searchParams.get("q")).toBe(prompt); expect(result.prefilled).toBe(true);
  expect(manualProviderUrl("chatgpt", "https://chatgpt.com/", "ậ".repeat(3000))).toEqual({ url: "https://chatgpt.com/", prefilled: false });
  expect(manualProviderUrl("gemini", "https://gemini.google.com/app", prompt)).toEqual({ url: "https://gemini.google.com/app", prefilled: false });
});
