import katex from "katex";
import "katex/contrib/mhchem";
import { buildDocxPackage } from "./docxModel";
import { escapeNoteHtml, noteMarkdownHtml, noteBodyMarkdown } from "./takenote";
import { downloadManualFile } from "./examManualSource";

const xml = (text: string) => text.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[char]!));
/** Convert KaTeX's semantic MathML to editable Word equations. Unknown constructs stay readable. */
function mathToOmml(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent?.trim() ? `<m:r><m:t>${xml(node.textContent)}</m:t></m:r>` : "";
  if (!(node instanceof Element) || ["annotation", "mphantom"].includes(node.localName)) return "";
  const children = [...node.children], parts = children.map(mathToOmml), body = parts.join("");
  const part = (index: number) => parts[index] || "<m:r><m:t> </m:t></m:r>";
  if (["mi", "mn", "mo", "mtext"].includes(node.localName)) return `<m:r><m:t xml:space="preserve">${xml(node.textContent ?? "")}</m:t></m:r>`;
  if (node.localName === "mfrac") return `<m:f><m:num>${part(0)}</m:num><m:den>${part(1)}</m:den></m:f>`;
  if (node.localName === "msqrt") return `<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e>${body}</m:e></m:rad>`;
  if (node.localName === "mroot") return `<m:rad><m:deg>${part(1)}</m:deg><m:e>${part(0)}</m:e></m:rad>`;
  if (node.localName === "msup") return `<m:sSup><m:e>${part(0)}</m:e><m:sup>${part(1)}</m:sup></m:sSup>`;
  if (node.localName === "msub") return `<m:sSub><m:e>${part(0)}</m:e><m:sub>${part(1)}</m:sub></m:sSub>`;
  if (node.localName === "msubsup") return `<m:sSubSup><m:e>${part(0)}</m:e><m:sub>${part(1)}</m:sub><m:sup>${part(2)}</m:sup></m:sSubSup>`;
  if (node.localName === "mtable") return `<m:m>${children.map(row => `<m:mr>${[...row.children].map(cell => `<m:e>${mathToOmml(cell)}</m:e>`).join("")}</m:mr>`).join("")}</m:m>`;
  if (node.localName === "mover" || node.localName === "munder") return `<m:${node.localName === "mover" ? "limUpp" : "limLow"}><m:e>${part(0)}</m:e><m:lim>${part(1)}</m:lim></m:${node.localName === "mover" ? "limUpp" : "limLow"}>`;
  return body;
}
export async function buildTakenoteDocx(markdown: string, title: string) {
  const parsed = new DOMParser().parseFromString(`<h1>${escapeNoteHtml(title)}</h1>${noteMarkdownHtml(noteBodyMarkdown(markdown, title), true)}`, "text/html");
  const equations: string[] = [];
  // The established Word model reads tbody rows. Keep Markdown header rows in it too.
  parsed.querySelectorAll("table").forEach(table => { const body = table.querySelector("tbody"); if (body) [...table.querySelectorAll("thead > tr")].reverse().forEach(row => body.prepend(row)); table.querySelectorAll("th").forEach(cell => { const bold = parsed.createElement("strong"); bold.append(...cell.childNodes); cell.append(bold); }); });
  parsed.querySelectorAll("[data-note-math]").forEach(element => {
    const latex = element.getAttribute("data-note-math") ?? "";
    try {
      const mathml = katex.renderToString(latex, { output: "mathml", trust: false, throwOnError: true, maxExpand: 1000, maxSize: 20 });
      const math = new DOMParser().parseFromString(mathml, "text/html").querySelector("math");
      if (!math) return;
      const id = equations.length; equations.push(`<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">${mathToOmml(math)}</m:oMath>`); element.textContent = `MCNOTEFORMULA${id}END`;
    } catch { /* Invalid equations remain visible as the original LaTeX. */ }
  });
  const base64 = await buildDocxPackage(parsed.body.innerHTML);
  const JSZip = (await import("jszip")).default, zip = await JSZip.loadAsync(base64, { base64: true });
  let documentXml = await zip.file("word/document.xml")!.async("text");
  // The model merges neighboring text runs, so split placeholders inside a run too.
  documentXml = documentXml.replace(/<w:r>(<w:rPr>[\s\S]*?<\/w:rPr>)?<w:t([^>]*)>([\s\S]*?)<\/w:t><\/w:r>/g, (match, properties, attributes, text: string) => {
    if (!/MCNOTEFORMULA\d+END/.test(text)) return match;
    return text.split(/(MCNOTEFORMULA\d+END)/).map(part => { const formula = /^MCNOTEFORMULA(\d+)END$/.exec(part); return formula ? equations[Number(formula[1])] ?? "" : part ? `<w:r>${properties ?? ""}<w:t${attributes}>${part}</w:t></w:r>` : ""; }).join("");
  });
  documentXml = documentXml.replace('<w:pStyle w:val="Heading1"/>', '<w:pStyle w:val="Title"/>').replace(/<w:tblPr>/g, '<w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblCellMar><w:top w:w="100" w:type="dxa"/><w:bottom w:w="100" w:type="dxa"/><w:left w:w="120" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tblCellMar>');
  zip.file("word/document.xml", documentXml);
  const relationships = await zip.file("word/_rels/document.xml.rels")!.async("text");
  zip.file("word/_rels/document.xml.rels", relationships.replace(/Target="word\/(styles|numbering)\.xml"/g, 'Target="$1.xml"').replace(/<Relationship Id="rId1"[^>]*Type="[^"]*\/officeDocument"[^>]*\/>/, ""));
  const normal = '<w:pPr><w:spacing w:after="140" w:line="300" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="22"/><w:color w:val="203044"/></w:rPr>';
  const heading = (id: string, size: number) => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${id}"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="260" w:after="140"/></w:pPr><w:rPr><w:b/><w:sz w:val="${size}"/><w:color w:val="183B56"/></w:rPr></w:style>`;
  zip.file("word/styles.xml", `<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/>${normal}</w:style>${heading("Title", 48)}${[36, 30, 26, 24, 22, 22].map((size, index) => heading(`Heading${index + 1}`, size)).join("")}<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:rPr><w:i/></w:rPr></w:style></w:styles>`);
  // Stable package bytes let repeated saves reuse the same library document.
  zip.forEach((_path, entry) => { entry.date = new Date("2000-01-01T00:00:00Z"); });
  return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}
export async function exportTakenotePdf(title: string, markdown: string) {
  const popup = window.open("", "_blank");
  if (!popup) throw new Error("Cho phép mở cửa sổ in để xuất PDF.");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    popup.opener = null;
    const doc = popup.document; doc.open(); doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeNoteHtml(title)}</title><style>html,body{color:#203044;background:#fff;margin:0;padding:0}body{font:11pt/1.65 Arial,sans-serif}h1{font-size:24pt;color:#183b56;line-height:1.25;margin:0 0 22pt}h2{font-size:17pt;margin:20pt 0 10pt;color:#183b56}h3{font-size:14pt;margin-top:16pt}p{margin:8pt 0}table{border-collapse:collapse;width:100%;margin:14pt 0}th,td{border:1px solid #aaa;padding:8px;text-align:left}th{background:#f0f4f8}pre{white-space:pre-wrap}tr,blockquote{break-inside:avoid}h1,h2,h3{break-after:avoid}math{font-size:1.05em}.katex-display{text-align:center;margin:14pt 0}blockquote{border-left:3px solid #6b859b;padding-left:14pt}@page{size:A4;margin:18mm}</style></head><body><h1>${escapeNoteHtml(title)}</h1><article>${takenotePrintHtml(noteBodyMarkdown(markdown, title))}</article></body></html>`); doc.close();
    // Native MathML avoids missing KaTeX web fonts and unrelated application print styles.
    const ready = async () => { void doc.body.offsetHeight; await doc.fonts?.ready; };
    await Promise.race([ready(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Tải bản in quá lâu. Hãy thử lại.")), 15000); })]);
    if (!popup.closed) { doc.body.dataset.notePrintReady = "true"; popup.focus(); popup.print(); }
  } catch (cause) { if (!popup.closed) popup.close(); throw cause; }
  finally { if (timer) clearTimeout(timer); }
}
export function takenotePrintHtml(markdown: string) {
  const parsed = new DOMParser().parseFromString(noteMarkdownHtml(markdown), "text/html");
  parsed.querySelectorAll(".katex").forEach(formula => { const math = formula.querySelector("math"); if (math) formula.replaceWith(math); });
  return parsed.body.innerHTML;
}
export function downloadNoteMarkdown(content: string, name: string) { downloadManualFile(new Blob([content], { type: "text/markdown;charset=utf-8" }), name); }
