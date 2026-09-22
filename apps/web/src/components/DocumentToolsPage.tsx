import { useEffect, useMemo, useRef, useState } from "react";
import { Bold, Download, FileSpreadsheet, FileText, Highlighter, Italic, List, Save, Underline, Upload, Wrench } from "lucide-react";
import DocumentViewer from "./DocumentViewer";
import { DOCUMENT_ACCEPT, documentKindFor, fileToDataUrl, MAX_DOCUMENT_BYTES, saveDocument, type DocumentKind, type UploadedDocument } from "../lib/documentStore";
import { useLanguage } from "../lib/i18n";
import { emitGuideAction } from "../lib/featureGuides";

type Props = { owner: string | null; documents: UploadedDocument[]; onDocumentsChanged: () => void };
type ToolTab = "pdf" | "docx";

function bytesFromDataUrl(dataUrl: string) {
  const raw = dataUrl.split(",", 2)[1] ?? "";
  const binary = atob(raw);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function escapeXml(value: string) {
  return value.replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&apos;", '"': "&quot;" }[character] ?? character));
}

function decodeBasicEntities(value: string) {
  return value.replace(/&(?:amp|#38);/gi, "&").replace(/&(?:lt|#60);/gi, "<").replace(/&(?:gt|#62);/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'");
}

function ooxmlColor(value: string | null) {
  if (!value) return "";
  const hex = value.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) return hex[1].length === 3 ? hex[1].split("").map(part => part + part).join("").toUpperCase() : hex[1].toUpperCase();
  const rgb = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgb) return [rgb[1], rgb[2], rgb[3]].map(part => Number(part).toString(16).padStart(2, "0")).join("").toUpperCase();
  return ({ yellow: "FFFF00", khaki: "F0E68C", "lightyellow": "FFFFE0" } as Record<string, string>)[value.trim().toLocaleLowerCase()] ?? "";
}

function ooxmlHalfPoints(element: Element) {
  const style = element.getAttribute("style") ?? "";
  const size = style.match(/font-size\s*:\s*([\d.]+)\s*(px|pt)?/i);
  if (size) return Math.max(8, Math.min(160, Math.round(Number(size[1]) * (size[2]?.toLocaleLowerCase() === "px" ? 1.5 : 2))));
  const legacy = element.tagName.toLowerCase() === "font" ? Number(element.getAttribute("size")) : 0;
  return legacy ? ({ 1: 16, 2: 20, 3: 24, 4: 28, 5: 36, 6: 48, 7: 72 } as Record<number, number>)[legacy] ?? 24 : 0;
}

function inlineRuns(node: Node, bold = false, italic = false, underline = false, highlight = "", fontSize = 0): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const value = escapeXml(node.textContent ?? "");
    if (!value) return "";
    const properties = `${bold ? "<w:b/>" : ""}${italic ? "<w:i/>" : ""}${underline ? '<w:u w:val="single"/>' : ""}${highlight ? `<w:shd w:fill="${highlight}"/>` : ""}${fontSize ? `<w:sz w:val="${fontSize}"/><w:szCs w:val="${fontSize}"/>` : ""}`;
    return `<w:r><w:rPr>${properties}</w:rPr><w:t xml:space="preserve">${value}</w:t></w:r>`;
  }
  if (!(node instanceof Element)) return "";
  const tag = node.tagName.toLowerCase();
  if (tag === "br") return "<w:r><w:br/></w:r>";
  const style = node.getAttribute("style") ?? "";
  const styleHighlight = ooxmlColor(style.match(/background(?:-color)?\s*:\s*([^;]+)/i)?.[1] ?? node.getAttribute("bgcolor"));
  const styleFontSize = ooxmlHalfPoints(node);
  return [...node.childNodes].map(child => inlineRuns(child, bold || tag === "strong" || tag === "b", italic || tag === "em" || tag === "i", underline || tag === "u", styleHighlight || highlight, styleFontSize || fontSize)).join("");
}

function htmlToDocxXml(html: string) {
  const parser = typeof DOMParser === "function" ? new DOMParser() : null;
  const root = parser?.parseFromString(html, "text/html").body;
  if (!root) return `<w:p><w:r><w:t>${escapeXml(decodeBasicEntities(html.replace(/<[^>]+>/g, " ")))}</w:t></w:r></w:p>`;
  const blocks = [...root.querySelectorAll("p,h1,h2,h3,li,div,blockquote")];
  const source = blocks.length ? blocks : [root];
  return source.map(block => {
    const tag = block instanceof Element ? block.tagName.toLowerCase() : "p";
    const style = tag === "h1" ? '<w:pStyle w:val="Heading1"/>' : tag === "h2" ? '<w:pStyle w:val="Heading2"/>' : tag === "h3" ? '<w:pStyle w:val="Heading3"/>' : "";
    const bullet = tag === "li" ? '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>' : "";
    return `<w:p><w:pPr>${style}${bullet}</w:pPr>${inlineRuns(block)}</w:p>`;
  }).join("") || "<w:p/>";
}

export async function buildDocx(html: string) {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file("word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>`);
  zip.file("word/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:sz w:val="22"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style></w:styles>`);
  zip.file("word/numbering.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr><w:rPr><w:rFonts w:ascii="Symbol" w:hAnsi="Symbol"/></w:rPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`);
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${htmlToDocxXml(html)}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`);
  return zip.generateAsync({ type: "base64", compression: "DEFLATE" });
}

function downloadDataUrl(dataUrl: string, name: string) {
  const link = document.createElement("a"); link.href = dataUrl; link.download = name; link.click();
}

function DocxEditor({ owner, source, onSaved }: { owner: string | null; source: UploadedDocument | null; onSaved: () => void }) {
  const { language } = useLanguage();
  const editor = useRef<HTMLDivElement>(null);
  const [html, setHtml] = useState("<p></p>"), [loading, setLoading] = useState(false), [saving, setSaving] = useState(false), [notice, setNotice] = useState(""), [error, setError] = useState(""), [warnings, setWarnings] = useState<string[]>([]);
  const draftKey = source ? `mindcanvas:docx-draft:${owner ?? "guest"}:${source.id}` : "";
  useEffect(() => {
    if (!source) { setHtml("<p></p>"); setWarnings([]); return; }
    let alive = true;
    setLoading(true); setError(""); setNotice("");
    void (async () => {
      try {
        let savedDraft = "";
        try { savedDraft = draftKey ? localStorage.getItem(draftKey) ?? "" : ""; } catch {}
        const mammoth = await import("mammoth");
        const bytes = bytesFromDataUrl(source.dataUrl);
        const buffer = new ArrayBuffer(bytes.byteLength); new Uint8Array(buffer).set(bytes);
        const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
        if (alive) { setHtml(savedDraft || result.value || "<p></p>"); setWarnings(result.messages.map(message => message.message).filter(Boolean)); if (savedDraft) setNotice("Đã khôi phục bản nháp cục bộ."); }
      } catch (cause) { if (alive) setError(cause instanceof Error ? cause.message : "Không thể mở DOCX."); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [draftKey, source?.dataUrl]);
  useEffect(() => { if (editor.current && editor.current.innerHTML !== html) editor.current.innerHTML = html; }, [html, loading]);
  useEffect(() => {
    if (!draftKey || loading) return;
    const timer = window.setTimeout(() => { try { localStorage.setItem(draftKey, html); } catch {} }, 450);
    return () => window.clearTimeout(timer);
  }, [draftKey, html, loading]);
  const command = (name: string, value?: string) => { editor.current?.focus(); document.execCommand(name, false, value); setHtml(editor.current?.innerHTML ?? html); };
  const exportDocument = async (saveCopy: boolean) => {
    const currentHtml = editor.current?.innerHTML ?? html;
    setSaving(true); setError(""); setNotice("");
    try {
      const baseName = (source?.name ?? "Tài liệu mới.docx").replace(/\.docx$/i, "");
      const name = saveCopy ? `${baseName} — bản sửa.docx` : `${baseName}.docx`;
      const dataUrl = `data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,${await buildDocx(currentHtml)}`;
      if (saveCopy) { await saveDocument(owner, { name, mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", kind: "docx", size: Math.ceil((dataUrl.length * 3) / 4), dataUrl, folderId: source?.folderId ?? null }); try { if (draftKey) localStorage.removeItem(draftKey); } catch {} onSaved(); emitGuideAction("docx:save"); }
      downloadDataUrl(dataUrl, name); setNotice(language === "vi" ? "Đã xuất DOCX hợp lệ. Bản gốc vẫn được giữ." : "Valid DOCX exported. The original is preserved.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể xuất DOCX."); }
    finally { setSaving(false); }
  };
  return <section className="docx-editor-panel"><header className="tool-editor-heading"><div><span className="eyebrow">DOCX EDITOR</span><h2>{source?.name ?? "Tài liệu DOCX mới"}</h2><p>Soạn thảo cơ bản với nhập/xuất DOCX. Các thành phần OOXML chưa hỗ trợ sẽ được báo khi mở.</p></div><div className="tool-editor-actions"><button className="secondary-button" disabled={saving || loading} onClick={() => void exportDocument(true)}><Save size={15}/>{saving ? "Đang lưu…" : "Lưu bản mới"}</button><button className="primary-button" disabled={saving || loading} onClick={() => void exportDocument(false)}><Download size={15}/>Xuất DOCX</button></div></header><div className="docx-editor-toolbar" role="toolbar" aria-label="Định dạng DOCX"><select aria-label="Kiểu đoạn" onChange={event => command("formatBlock", event.target.value)} defaultValue="p"><option value="p">Đoạn văn</option><option value="h1">Tiêu đề 1</option><option value="h2">Tiêu đề 2</option><option value="h3">Tiêu đề 3</option></select><button type="button" onClick={() => command("bold")} title="Đậm"><Bold size={16}/></button><button type="button" onClick={() => command("italic")} title="Nghiêng"><Italic size={16}/></button><button type="button" onClick={() => command("underline")} title="Gạch chân"><Underline size={16}/></button><button type="button" onClick={() => command("hiliteColor", "#fff2a8")} title="Highlight"><Highlighter size={16}/></button><button type="button" onClick={() => command("insertUnorderedList")} title="Danh sách"><List size={16}/></button><label className="docx-font-size">Cỡ chữ <select onChange={event => command("fontSize", event.target.value)} defaultValue="3"><option value="2">10</option><option value="3">12</option><option value="4">14</option><option value="5">18</option><option value="6">24</option></select></label></div>{error && <p className="form-error" role="alert">{error}</p>}{warnings.length > 0 && <div className="form-warning" role="status">Mammoth cảnh báo: {warnings.join(" · ")}</div>}{notice && <p className="form-success" role="status">{notice}</p>}{loading ? <div className="document-loading">Đang đọc DOCX…</div> : <div ref={editor} className="docx-editable" contentEditable suppressContentEditableWarning onInput={event => setHtml(event.currentTarget.innerHTML)} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "s") { event.preventDefault(); void exportDocument(true); } }} />}</section>;
}

export default function DocumentToolsPage({ owner, documents, onDocumentsChanged }: Props) {
  const { language } = useLanguage();
  const [tab, setTab] = useState<ToolTab>("pdf"), [selectedPdf, setSelectedPdf] = useState<UploadedDocument | null>(null), [selectedDocx, setSelectedDocx] = useState<UploadedDocument | null>(null), [query, setQuery] = useState(""), [uploading, setUploading] = useState(false), [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const pdfs = useMemo(() => documents.filter(file => file.kind === "pdf" && (!query.trim() || file.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))), [documents, query]);
  const docxs = useMemo(() => documents.filter(file => file.kind === "docx" && (!query.trim() || file.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))), [documents, query]);
  const upload = async (file?: File) => {
    if (!file || uploading) return;
    const kind = documentKindFor(file.name, file.type);
    if (!kind || !["pdf", "docx"].includes(kind)) { setError("Công cụ này nhận PDF hoặc DOCX."); return; }
    if (file.size > MAX_DOCUMENT_BYTES) { setError("Tài liệu vượt quá 40 MB."); return; }
    setUploading(true); setError("");
    try { const saved = await saveDocument(owner, { name: file.name, mimeType: file.type || "application/octet-stream", kind, size: file.size, dataUrl: await fileToDataUrl(file), folderId: null }); onDocumentsChanged(); if (kind === "pdf") { setTab("pdf"); setSelectedPdf(saved); } else { setTab("docx"); setSelectedDocx(saved); } }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể lưu tài liệu."); }
    finally { setUploading(false); }
  };
  return <section className="document-tools-page"><header className="tool-page-heading"><div><span className="eyebrow"><Wrench size={15}/> CÔNG CỤ</span><h1>Editor tài liệu</h1><p>Vẽ trên PDF và soạn thảo DOCX từ cùng thư viện tài liệu cục bộ.</p></div><div><input ref={input} hidden type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={event => { void upload(event.target.files?.[0]); event.currentTarget.value = ""; }}/><button className="primary-button" disabled={uploading} onClick={() => input.current?.click()}><Upload size={16}/>{uploading ? "Đang tải…" : "Tải PDF/DOCX"}</button></div></header><div className="document-tools-tabs" role="tablist"><button className={tab === "pdf" ? "active" : ""} onClick={() => { setTab("pdf"); emitGuideAction("tools:pdf"); }}><FileText size={17}/>Vẽ trên PDF</button><button className={tab === "docx" ? "active" : ""} onClick={() => { setTab("docx"); emitGuideAction("tools:docx"); }}><FileSpreadsheet size={17}/>Soạn thảo DOCX</button></div><label className="document-search tool-document-search"><FileText size={16}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Tìm tài liệu trong thư viện…"/></label>{error && <p className="form-error" role="alert">{error}</p>}{tab === "pdf" ? <div className="document-tool-layout"><aside className="document-tool-list"><h3>PDF trong thư viện</h3>{pdfs.map(file => <button key={file.id} className={selectedPdf?.id === file.id ? "active" : ""} onClick={() => { setSelectedPdf(file); emitGuideAction("tools:pdf-open", { documentId: file.id }); }}><FileText size={16}/><span>{file.name}<small>{new Date(file.updatedAt).toLocaleDateString()}</small></span></button>)}{!pdfs.length && <p className="field-hint">Chưa có PDF. Hãy tải một file lên.</p>}</aside><main className="document-tool-workspace">{selectedPdf ? <DocumentViewer source={selectedPdf} dedicated onReady={detail => emitGuideAction("tools:pdf-ready", { ...detail, documentId: selectedPdf.id })}/> : <div className="tool-empty-state"><FileText size={38}/><h2>Chọn PDF để bắt đầu</h2><p>Annotation được lưu thành bản xuất mới; PDF gốc không bị thay đổi.</p></div>}</main></div> : <div className="document-tool-layout"><aside className="document-tool-list"><h3>DOCX trong thư viện</h3>{docxs.map(file => <button key={file.id} className={selectedDocx?.id === file.id ? "active" : ""} onClick={() => { setSelectedDocx(file); emitGuideAction("tools:docx-open", { documentId: file.id }); }}><FileSpreadsheet size={16}/><span>{file.name}<small>{new Date(file.updatedAt).toLocaleDateString()}</small></span></button>)}{!docxs.length && <p className="field-hint">Chưa có DOCX. Hãy tải một file lên.</p>}</aside><main className="document-tool-workspace">{selectedDocx ? <DocxEditor owner={owner} source={selectedDocx} onSaved={onDocumentsChanged}/> : <div className="tool-empty-state"><FileSpreadsheet size={38}/><h2>Chọn DOCX để bắt đầu</h2><p>Bản gốc được giữ lại khi bạn lưu bản sửa.</p></div>}</main></div>}</section>;
}
