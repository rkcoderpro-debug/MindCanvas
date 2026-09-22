import { useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, FileText, FileType2, HardDrive, PanelLeft, Search, Upload, Wrench } from "lucide-react";
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
  const [libraryCollapsed, setLibraryCollapsed] = useState(false);
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

  const libraryTitle = tab === "pdf" ? "PDF trong thư viện" : "DOCX trong thư viện";
  const libraryFiles = tab === "pdf" ? pdfs : docxs;
  const libraryCount = libraryFiles.length;

  return <section className={`document-tools-page document-tools-shell ${libraryCollapsed ? "library-collapsed" : ""}`} data-library-collapsed={libraryCollapsed ? "true" : "false"}>
    <header className="document-tools-header">
      <div className="document-tools-header-leading">
        <button className="text-button document-tools-back" onClick={onBack} aria-label="Quay lại Công cụ"><ArrowLeft size={16}/><span>Công cụ</span></button>
        <span className="document-tools-header-divider" aria-hidden="true"/>
        <div className="document-tools-heading-inline"><span className="document-tools-heading-icon"><Wrench size={17}/></span><div><strong>Editor tài liệu</strong><small><HardDrive size={12}/> Lưu trên thiết bị</small></div></div>
      </div>
      <div className="document-tools-header-actions">
        <div className="document-tools-tabs" role="tablist" aria-label="Loại tài liệu">
          <button role="tab" aria-selected={tab === "pdf"} className={tab === "pdf" ? "active" : ""} data-tool-tab="pdf" onClick={() => { setTab("pdf"); emitGuideAction("tools:pdf"); }}><FileText size={16}/><span>PDF</span></button>
          <button role="tab" aria-selected={tab === "docx"} className={tab === "docx" ? "active" : ""} data-tool-tab="docx" onClick={() => { setTab("docx"); emitGuideAction("tools:docx"); }}><FileType2 size={16}/><span>DOCX</span></button>
        </div>
        <input ref={input} hidden type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={event => { void upload(event.target.files?.[0]); event.currentTarget.value = ""; }}/>
        <button className="primary-button document-tools-upload" disabled={uploading} onClick={() => input.current?.click()}><Upload size={16}/><span>{uploading ? "Đang tải…" : "Tải tài liệu"}</span></button>
      </div>
    </header>
    {error && <p className="form-error document-tools-error" role="alert">{error}</p>}
    <div className="document-tool-layout document-tools-body">
      <aside className={`document-tool-list document-library ${libraryCollapsed ? "is-collapsed" : ""}`} aria-label="Thư viện tài liệu">
        <div className="document-library-heading"><div><span className="document-library-kicker">THƯ VIỆN</span><h2>{libraryTitle}</h2>{!libraryCollapsed && <small>{libraryCount} tài liệu · lưu cục bộ</small>}</div><button className="icon-button document-library-toggle" type="button" onClick={() => setLibraryCollapsed(value => !value)} aria-label={libraryCollapsed ? "Mở thư viện tài liệu" : "Thu gọn thư viện tài liệu"} title={libraryCollapsed ? "Mở thư viện" : "Thu gọn thư viện"}>{libraryCollapsed ? <ChevronRight size={17}/> : <ChevronLeft size={17}/>}</button></div>
        {!libraryCollapsed && <>
          <label className="document-search tool-document-search"><Search size={15}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Tìm trong thư viện…" aria-label="Tìm tài liệu trong thư viện"/></label>
          <div className="document-library-list">
            {tab === "docx" && <button type="button" className="document-tool-new" data-docx-action="new" onClick={() => { setCreatingDocx(true); setSelectedDocx(null); emitGuideAction("tools:docx-create"); }}><FileType2 size={16}/><span>Tạo DOCX mới<small>Bắt đầu từ trang trắng</small></span></button>}
            {libraryFiles.map(file => <button key={file.id} data-document-id={file.id} data-document-kind={file.kind} className={(tab === "pdf" ? selectedPdf?.id : selectedDocx?.id) === file.id ? "active" : ""} title={file.name} onClick={() => { if (tab === "pdf") { setSelectedPdf(file); emitGuideAction("tools:pdf-open", { documentId: file.id }); } else { setCreatingDocx(false); setSelectedDocx(file); emitGuideAction("tools:docx-open", { documentId: file.id }); } }}><span className="document-library-file-icon">{tab === "pdf" ? <FileText size={16}/> : <FileType2 size={16}/>}</span><span className="document-library-file-copy"><strong>{file.name}</strong><small>{new Date(file.updatedAt).toLocaleDateString()}</small></span></button>)}
            {!libraryFiles.length && <p className="field-hint document-library-empty">{tab === "pdf" ? "Chưa có PDF. Hãy tải một file lên." : "Chưa có DOCX. Hãy tải một file lên hoặc tạo trang trắng."}</p>}
          </div>
        </>}
        {libraryCollapsed && <span className="document-library-collapsed-label" aria-hidden="true">{tab.toUpperCase()}</span>}
      </aside>
      <main className="document-tool-workspace">{tab === "pdf" ? selectedPdf ? <DocumentViewer source={selectedPdf} dedicated onReady={detail => emitGuideAction("tools:pdf-ready", { ...detail, documentId: selectedPdf.id })}/> : <div className="tool-empty-state"><FileText size={38}/><h2>Chọn PDF để bắt đầu</h2><p>Annotation được lưu thành bản xuất mới; PDF gốc không bị thay đổi.</p></div> : selectedDocx || creatingDocx ? <DocxEditor owner={owner} source={selectedDocx ?? null} onSaved={onDocumentsChanged}/> : <div className="tool-empty-state"><FileType2 size={38}/><h2>Chọn hoặc tạo DOCX để bắt đầu</h2><p>Bản gốc được giữ lại khi bạn lưu bản sửa.</p></div>}</main>
    </div>
  </section>;
}
