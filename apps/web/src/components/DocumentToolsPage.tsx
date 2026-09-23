import { useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, FileSpreadsheet, FileText, FileType2, HardDrive, Search, Upload, Wrench } from "lucide-react";
import DocumentViewer from "./DocumentViewer";
import { documentKindFor, fileToDataUrl, MAX_DOCUMENT_BYTES, saveDocument, DOCUMENT_ACCEPT, type DocumentKind, type UploadedDocument } from "../lib/documentStore";
import { emitGuideAction } from "../lib/featureGuides";
import { buildDocxPackage } from "../lib/docxModel";
import { useLanguage } from "../lib/i18n";

type Props = { owner: string | null; documents: UploadedDocument[]; onDocumentsChanged: () => void; onBack?: () => void };
type ToolTab = "all" | DocumentKind;

/** Backward-compatible test/API name retained for existing callers. */
export async function buildDocx(html: string) {
  return buildDocxPackage(html);
}

const filterTabs: Array<{ id: ToolTab; icon: typeof FileText }> = [
  { id: "all", icon: FileText },
  { id: "pdf", icon: FileText },
  { id: "docx", icon: FileType2 },
  { id: "pptx", icon: FileSpreadsheet },
  { id: "xlsx", icon: FileSpreadsheet },
];

function documentIcon(kind: DocumentKind) {
  return kind === "pdf" ? FileText : kind === "docx" ? FileType2 : FileSpreadsheet;
}

/**
 * The Tools tab is intentionally a viewer hub. DOCX remains importable and
 * viewable, but the old editor route is no longer exposed from the product UI.
 * Existing stored documents are untouched and DocumentViewer remains the one
 * viewer/annotation surface for every supported file type.
 */
export default function DocumentToolsPage({ owner, documents, onDocumentsChanged, onBack }: Props) {
  const { language } = useLanguage();
  const copy = language === "vi" ? {
    tabs: { all: "Tất cả", pdf: "PDF", docx: "DOCX", pptx: "PPTX", xlsx: "XLSX" },
    back: "Quay lại Công cụ", tools: "Công cụ", heading: "Trình xem tài liệu", savedLocally: "Lưu trên thiết bị",
    tabList: "Loại tài liệu", upload: "Tải tài liệu", uploading: "Đang tải…", unsupported: "Chỉ hỗ trợ PDF, DOCX, PPTX và XLSX.", tooLarge: "Tài liệu vượt quá 40 MB.", saveError: "Không thể lưu tài liệu.",
    library: "Thư viện tài liệu", libraryKicker: "THƯ VIỆN", allTitle: "Tài liệu trong thư viện", kindSuffix: "trong thư viện", localFiles: "tài liệu · lưu cục bộ",
    expand: "Mở thư viện tài liệu", collapse: "Thu gọn thư viện tài liệu", expandShort: "Mở thư viện", collapseShort: "Thu gọn thư viện",
    search: "Tìm trong thư viện…", searchLabel: "Tìm tài liệu trong thư viện", empty: "Chưa có tài liệu phù hợp. Hãy tải PDF, DOCX, PPTX hoặc XLSX lên.",
    choose: "Chọn tài liệu để xem", preview: "PDF có thể vẽ và xuất bản sao; DOCX, PPTX và XLSX được xem trong trình xem tương ứng. Bản gốc trong thư viện không bị thay đổi.",
  } : {
    tabs: { all: "All", pdf: "PDF", docx: "DOCX", pptx: "PPTX", xlsx: "XLSX" },
    back: "Back to Tools", tools: "Tools", heading: "Document viewer", savedLocally: "Saved on this device",
    tabList: "Document type", upload: "Upload document", uploading: "Uploading…", unsupported: "Only PDF, DOCX, PPTX, and XLSX files are supported.", tooLarge: "The document is larger than 40 MB.", saveError: "Could not save the document.",
    library: "Document library", libraryKicker: "LIBRARY", allTitle: "Documents in library", kindSuffix: "in library", localFiles: "documents · stored locally",
    expand: "Open document library", collapse: "Collapse document library", expandShort: "Open library", collapseShort: "Collapse library",
    search: "Search library…", searchLabel: "Search documents in library", empty: "No matching documents. Upload a PDF, DOCX, PPTX, or XLSX file.",
    choose: "Choose a document to view", preview: "PDF files support drawing and copy export. DOCX, PPTX, and XLSX files open in their respective viewers. The original in your library stays unchanged.",
  };
  const [tab, setTab] = useState<ToolTab>("all");
  const [selected, setSelected] = useState<UploadedDocument | null>(null);
  const [query, setQuery] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [libraryCollapsed, setLibraryCollapsed] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const libraryFiles = useMemo(() => documents.filter(file => (tab === "all" || file.kind === tab) && (!normalizedQuery || file.name.toLocaleLowerCase().includes(normalizedQuery))), [documents, normalizedQuery, tab]);

  const upload = async (file?: File) => {
    if (!file || uploading) return;
    const kind = documentKindFor(file.name, file.type);
    if (!kind) { setError(copy.unsupported); return; }
    if (file.size > MAX_DOCUMENT_BYTES) { setError(copy.tooLarge); return; }
    setUploading(true); setError("");
    try {
      const saved = await saveDocument(owner, { name: file.name, mimeType: file.type || "application/octet-stream", kind, size: file.size, dataUrl: await fileToDataUrl(file), folderId: null });
      onDocumentsChanged();
      setSelected(saved);
      setTab(kind);
      emitGuideAction("tools:document-open", { documentId: saved.id, kind });
    } catch (cause) { setError(cause instanceof Error ? cause.message : copy.saveError); }
    finally { setUploading(false); }
  };

  const libraryTitle = tab === "all" ? copy.allTitle : `${tab.toUpperCase()} ${copy.kindSuffix}`;
  const SelectedIcon = selected ? documentIcon(selected.kind) : FileText;

  return <section className={`document-tools-page document-tools-shell ${libraryCollapsed ? "library-collapsed" : ""}`} data-library-collapsed={libraryCollapsed ? "true" : "false"}>
    <header className="document-tools-header">
      <div className="document-tools-header-leading">
        <button className="text-button document-tools-back" onClick={onBack} aria-label={copy.back}><ArrowLeft size={16}/><span>{copy.tools}</span></button>
        <span className="document-tools-header-divider" aria-hidden="true"/>
        <div className="document-tools-heading-inline"><span className="document-tools-heading-icon"><Wrench size={17}/></span><div><strong>{copy.heading}</strong><small><HardDrive size={12}/> {copy.savedLocally}</small></div></div>
      </div>
      <div className="document-tools-header-actions">
        <div className="document-tools-tabs" role="tablist" aria-label={copy.tabList}>
          {filterTabs.map(({ id, icon: Icon }) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "active" : ""} data-tool-tab={id} onClick={() => { setTab(id); setSelected(current => current && (id === "all" || current.kind === id) ? current : null); emitGuideAction(`tools:filter:${id}`); }}><Icon size={16}/><span>{copy.tabs[id]}</span></button>)}
        </div>
        <input ref={input} hidden type="file" accept={DOCUMENT_ACCEPT} onChange={event => { void upload(event.target.files?.[0]); event.currentTarget.value = ""; }}/>
        <button className="primary-button document-tools-upload" data-help-id="tools-upload" disabled={uploading} onClick={() => input.current?.click()}><Upload size={16}/><span>{uploading ? copy.uploading : copy.upload}</span></button>
      </div>
    </header>
    {error && <p className="form-error document-tools-error" role="alert">{error}</p>}
    <div className="document-tool-layout document-tools-body">
      <aside className={`document-tool-list document-library ${libraryCollapsed ? "is-collapsed" : ""}`} aria-label={copy.library}>
        <div className="document-library-heading"><div><span className="document-library-kicker">{copy.libraryKicker}</span><h2>{libraryTitle}</h2>{!libraryCollapsed && <small>{libraryFiles.length} {copy.localFiles}</small>}</div><button className="icon-button document-library-toggle" type="button" onClick={() => setLibraryCollapsed(value => !value)} aria-label={libraryCollapsed ? copy.expand : copy.collapse} title={libraryCollapsed ? copy.expandShort : copy.collapseShort}>{libraryCollapsed ? <ChevronRight size={17}/> : <ChevronLeft size={17}/>}</button></div>
        {!libraryCollapsed && <>
          <label className="document-search tool-document-search"><Search size={15}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder={copy.search} aria-label={copy.searchLabel}/></label>
          <div className="document-library-list">
            {libraryFiles.map(file => { const Icon = documentIcon(file.kind); return <button key={file.id} data-document-id={file.id} data-document-kind={file.kind} className={selected?.id === file.id ? "active" : ""} title={file.name} onClick={() => { setSelected(file); emitGuideAction("tools:document-open", { documentId: file.id, kind: file.kind }); }}><span className="document-library-file-icon"><Icon size={16}/></span><span className="document-library-file-copy"><strong>{file.name}</strong><small>{file.kind.toUpperCase()} · {new Date(file.updatedAt).toLocaleDateString()}</small></span></button>; })}
            {!libraryFiles.length && <p className="field-hint document-library-empty">{copy.empty}</p>}
          </div>
        </>}
        {libraryCollapsed && <span className="document-library-collapsed-label" aria-hidden="true">{tab.toUpperCase()}</span>}
      </aside>
      <main className="document-tool-workspace">{selected ? <DocumentViewer source={selected} dedicated={selected.kind === "pdf"} onReady={detail => emitGuideAction("tools:viewer-ready", { ...detail, viewerSessionId: detail.sessionId, documentId: selected.id, kind: selected.kind })}/> : <div className="tool-empty-state"><SelectedIcon size={38}/><h2>{copy.choose}</h2><p>{copy.preview}</p></div>}</main>
    </div>
  </section>;
}
