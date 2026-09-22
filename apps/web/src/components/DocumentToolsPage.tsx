import { useMemo, useRef, useState } from "react";
import { ArrowLeft, FileText, FileType2, Search, Upload, Wrench } from "lucide-react";
import DocumentViewer from "./DocumentViewer";
import DocxEditor from "./DocxEditor";
import { documentKindFor, fileToDataUrl, MAX_DOCUMENT_BYTES, saveDocument, type UploadedDocument } from "../lib/documentStore";
import { emitGuideAction } from "../lib/featureGuides";
import { buildDocxPackage } from "../lib/docxModel";

type Props = { owner: string | null; documents: UploadedDocument[]; onDocumentsChanged: () => void; onBack?: () => void };
type ToolTab = "pdf" | "docx";

/** Backward-compatible test/API name retained for existing callers. */
export async function buildDocx(html: string) {
  return buildDocxPackage(html);
}

export default function DocumentToolsPage({ owner, documents, onDocumentsChanged, onBack }: Props) {
  const [tab, setTab] = useState<ToolTab>("pdf");
  const [selectedPdf, setSelectedPdf] = useState<UploadedDocument | null>(null);
  const [selectedDocx, setSelectedDocx] = useState<UploadedDocument | null>(null);
  const [creatingDocx, setCreatingDocx] = useState(false);
  const [query, setQuery] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const pdfs = useMemo(() => documents.filter(file => file.kind === "pdf" && (!normalizedQuery || file.name.toLocaleLowerCase().includes(normalizedQuery))), [documents, normalizedQuery]);
  const docxs = useMemo(() => documents.filter(file => file.kind === "docx" && (!normalizedQuery || file.name.toLocaleLowerCase().includes(normalizedQuery))), [documents, normalizedQuery]);

  const upload = async (file?: File) => {
    if (!file || uploading) return;
    const kind = documentKindFor(file.name, file.type);
    if (!kind || !["pdf", "docx"].includes(kind)) { setError("Công cụ này nhận PDF hoặc DOCX."); return; }
    if (file.size > MAX_DOCUMENT_BYTES) { setError("Tài liệu vượt quá 40 MB."); return; }
    setUploading(true); setError("");
    try {
      const saved = await saveDocument(owner, { name: file.name, mimeType: file.type || "application/octet-stream", kind, size: file.size, dataUrl: await fileToDataUrl(file), folderId: null });
      onDocumentsChanged();
      if (kind === "pdf") { setTab("pdf"); setSelectedPdf(saved); emitGuideAction("tools:pdf-open", { documentId: saved.id }); }
    else { setTab("docx"); setCreatingDocx(false); setSelectedDocx(saved); emitGuideAction("tools:docx-open", { documentId: saved.id }); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể lưu tài liệu."); }
    finally { setUploading(false); }
  };

  return <section className="document-tools-page">
    <header className="tool-page-heading"><div><button className="text-button document-tools-back" onClick={onBack}><ArrowLeft size={15}/> Công cụ</button><span className="eyebrow"><Wrench size={15}/> CÔNG CỤ</span><h1>Editor tài liệu</h1><p>Vẽ trên PDF và soạn thảo DOCX từ cùng thư viện tài liệu cục bộ.</p></div><div><input ref={input} hidden type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={event => { void upload(event.target.files?.[0]); event.currentTarget.value = ""; }}/><button className="primary-button" disabled={uploading} onClick={() => input.current?.click()}><Upload size={16}/>{uploading ? "Đang tải…" : "Tải PDF/DOCX"}</button></div></header>
    <div className="document-tools-tabs" role="tablist"><button className={tab === "pdf" ? "active" : ""} data-tool-tab="pdf" onClick={() => { setTab("pdf"); emitGuideAction("tools:pdf"); }}><FileText size={17}/>Vẽ trên PDF</button><button className={tab === "docx" ? "active" : ""} data-tool-tab="docx" onClick={() => { setTab("docx"); emitGuideAction("tools:docx"); }}><FileType2 size={17}/>Soạn thảo DOCX</button></div>
    <label className="document-search tool-document-search"><Search size={16}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Tìm tài liệu trong thư viện…"/></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    {tab === "pdf" ? <div className="document-tool-layout"><aside className="document-tool-list"><h3>PDF trong thư viện</h3>{pdfs.map(file => <button key={file.id} data-document-id={file.id} data-document-kind="pdf" className={selectedPdf?.id === file.id ? "active" : ""} onClick={() => { setSelectedPdf(file); emitGuideAction("tools:pdf-open", { documentId: file.id }); }}><FileText size={16}/><span>{file.name}<small>{new Date(file.updatedAt).toLocaleDateString()}</small></span></button>)}{!pdfs.length && <p className="field-hint">Chưa có PDF. Hãy tải một file lên.</p>}</aside><main className="document-tool-workspace">{selectedPdf ? <DocumentViewer source={selectedPdf} dedicated onReady={detail => emitGuideAction("tools:pdf-ready", { ...detail, documentId: selectedPdf.id })}/> : <div className="tool-empty-state"><FileText size={38}/><h2>Chọn PDF để bắt đầu</h2><p>Annotation được lưu thành bản xuất mới; PDF gốc không bị thay đổi.</p></div>}</main></div> : <div className="document-tool-layout"><aside className="document-tool-list"><h3>DOCX trong thư viện</h3><button type="button" className="document-tool-new" data-docx-action="new" onClick={() => { setCreatingDocx(true); setSelectedDocx(null); emitGuideAction("tools:docx-create"); }}><FileType2 size={16}/><span>Tạo DOCX mới<small>Bắt đầu từ trang trắng</small></span></button>{docxs.map(file => <button key={file.id} data-document-id={file.id} data-document-kind="docx" className={selectedDocx?.id === file.id ? "active" : ""} onClick={() => { setCreatingDocx(false); setSelectedDocx(file); emitGuideAction("tools:docx-open", { documentId: file.id }); }}><FileType2 size={16}/><span>{file.name}<small>{new Date(file.updatedAt).toLocaleDateString()}</small></span></button>)}{!docxs.length && <p className="field-hint">Chưa có DOCX. Hãy tải một file lên hoặc tạo trang trắng.</p>}</aside><main className="document-tool-workspace">{selectedDocx || creatingDocx ? <DocxEditor owner={owner} source={selectedDocx ?? null} onSaved={onDocumentsChanged}/> : <div className="tool-empty-state"><FileType2 size={38}/><h2>Chọn hoặc tạo DOCX để bắt đầu</h2><p>Bản gốc được giữ lại khi bạn lưu bản sửa.</p></div>}</main></div>}
  </section>;
}
