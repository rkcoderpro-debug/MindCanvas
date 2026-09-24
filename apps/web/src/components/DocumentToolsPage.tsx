import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, FileSpreadsheet, FileText, FileType2, HardDrive, Search, Upload, Wrench } from "lucide-react";
import DocumentViewer from "./DocumentViewer";
import { documentKindFor, fileToDataUrl, MAX_DOCUMENT_BYTES, saveDocument, DOCUMENT_ACCEPT, type DocumentKind, type UploadedDocument } from "../lib/documentStore";
import { downloadOwnedCloudDocument, listOwnedCloudDocuments, type CloudDocumentDescriptor } from "../lib/documentCloud";
import { saveDocumentToStorage } from "../lib/supabase";
import { listMyLearningCopySources, type LearningCopySource } from "../lib/learningShare";
import type { AccountPlan } from "../lib/account";
import { emitGuideAction } from "../lib/featureGuides";
import { buildDocxPackage } from "../lib/docxModel";
import { LearningShareButton } from "./LearningShareDialog";

type Props = { owner: string | null; documents: UploadedDocument[]; onDocumentsChanged: () => void; accountPlan?: AccountPlan; onBack?: () => void };
type ToolTab = "all" | DocumentKind;

/** Backward-compatible test/API name retained for existing callers. */
export async function buildDocx(html: string) {
  return buildDocxPackage(html);
}

const filterTabs: Array<{ id: ToolTab; label: string; icon: typeof FileText }> = [
  { id: "all", label: "Tất cả", icon: FileText },
  { id: "pdf", label: "PDF", icon: FileText },
  { id: "docx", label: "DOCX", icon: FileType2 },
  { id: "pptx", label: "PPTX", icon: FileSpreadsheet },
  { id: "xlsx", label: "XLSX", icon: FileSpreadsheet },
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
export default function DocumentToolsPage({ owner, documents, onDocumentsChanged, accountPlan, onBack }: Props) {
  const [tab, setTab] = useState<ToolTab>("all");
  const [selected, setSelected] = useState<UploadedDocument | null>(null);
  const [query, setQuery] = useState("");
  const [uploading, setUploading] = useState(false);
  const [cloudFiles, setCloudFiles] = useState<CloudDocumentDescriptor[]>([]);
  const [savedSources, setSavedSources] = useState<LearningCopySource[]>([]);
  const [syncingSelected, setSyncingSelected] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [libraryCollapsed, setLibraryCollapsed] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  useEffect(() => {
    let alive = true;
    if (!owner) { setCloudFiles([]); setSavedSources([]); return () => { alive = false; }; }
    void Promise.all([listOwnedCloudDocuments(owner), listMyLearningCopySources().catch(() => [])])
      .then(([cloud, sources]) => { if (alive) { setCloudFiles(cloud); setSavedSources(sources); } })
      .catch(cause => { if (alive) setError(cause instanceof Error ? cause.message : "Không thể đọc thư viện tài liệu cloud."); });
    return () => { alive = false; };
  }, [owner]);

  const libraryFiles = useMemo(() => {
    const provenance = new Map(savedSources.filter(item => item.kind === "document").map(item => [item.copy_id, { title: item.source_title, ownerName: item.owner_name }]));
    const local = documents.map(file => ({ ...file, savedFrom: file.savedFrom ?? provenance.get(file.id) }));
    const localIds = new Set(local.map(file => file.id));
    const cloudOnly: UploadedDocument[] = cloudFiles.filter(file => !localIds.has(file.id)).map(file => ({
      ...file, owner: owner ?? "guest", dataUrl: "", folderId: null, savedFrom: provenance.get(file.id),
    }));
    return [...local, ...cloudOnly]
      .filter(file => (tab === "all" || file.kind === tab) && (!normalizedQuery || file.name.toLocaleLowerCase().includes(normalizedQuery)))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [cloudFiles, documents, normalizedQuery, owner, savedSources, tab]);

  const openDocument = async (file: UploadedDocument) => {
    setError(""); setNotice("");
    if (file.dataUrl) { setSelected(file); return; }
    if (!owner) { setError("Tài liệu này cần đăng nhập để tải từ cloud."); return; }
    setUploading(true);
    try {
      const loaded = await downloadOwnedCloudDocument(owner, file.id);
      setSelected({ ...loaded, savedFrom: file.savedFrom });
      onDocumentsChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể tải tài liệu từ cloud."); }
    finally { setUploading(false); }
  };

  const publishSelected = async () => {
    if (!owner || !selected || !selected.dataUrl || syncingSelected) return;
    setSyncingSelected(true); setError(""); setNotice("");
    try {
      const blob = await fetch(selected.dataUrl).then(response => response.blob());
      const file = new File([blob], selected.name, { type: selected.mimeType || blob.type });
      await saveDocumentToStorage(file, selected.id, "");
      setCloudFiles(current => [{ id: selected.id, name: selected.name, mimeType: selected.mimeType, kind: selected.kind, size: selected.size, updatedAt: selected.updatedAt }, ...current.filter(row => row.id !== selected.id)]);
      setNotice("Đã lưu tài liệu lên cloud. Bạn có thể chia sẻ tài liệu này với người khác.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể lưu tài liệu lên cloud."); }
    finally { setSyncingSelected(false); }
  };

  const upload = async (file?: File) => {
    if (!file || uploading) return;
    const kind = documentKindFor(file.name, file.type);
    if (!kind) { setError("Chỉ hỗ trợ PDF, DOCX, PPTX và XLSX."); return; }
    if (file.size > MAX_DOCUMENT_BYTES) { setError("Tài liệu vượt quá 40 MB."); return; }
    setUploading(true); setError(""); setNotice("");
    try {
      const saved = await saveDocument(owner, { name: file.name, mimeType: file.type || "application/octet-stream", kind, size: file.size, dataUrl: await fileToDataUrl(file), folderId: null });
      onDocumentsChanged();
      setSelected(saved);
      setTab(kind);
      if (owner) {
        try {
          await saveDocumentToStorage(file, saved.id, "");
          setCloudFiles(current => [{ id: saved.id, name: saved.name, mimeType: saved.mimeType, kind: saved.kind, size: saved.size, updatedAt: saved.updatedAt }, ...current.filter(row => row.id !== saved.id)]);
        } catch { setNotice("Đã lưu trên thiết bị; chưa thể tải lên cloud nên chưa chia sẻ được."); }
      }
      emitGuideAction("tools:document-open", { documentId: saved.id, kind });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể lưu tài liệu."); }
    finally { setUploading(false); }
  };

  const libraryTitle = tab === "all" ? "Tài liệu trong thư viện" : `${tab.toUpperCase()} trong thư viện`;
  const SelectedIcon = selected ? documentIcon(selected.kind) : FileText;

  return <section className={`document-tools-page document-tools-shell ${libraryCollapsed ? "library-collapsed" : ""}`} data-library-collapsed={libraryCollapsed ? "true" : "false"}>
    <header className="document-tools-header">
      <div className="document-tools-header-leading">
        <button className="text-button document-tools-back" onClick={onBack} aria-label="Quay lại Học tập"><ArrowLeft size={16}/><span>Học tập</span></button>
        <span className="document-tools-header-divider" aria-hidden="true"/>
        <div className="document-tools-heading-inline"><span className="document-tools-heading-icon"><Wrench size={17}/></span><div><strong>Thư viện tài liệu</strong><small><HardDrive size={12}/> Thiết bị{owner ? " và cloud" : ""}</small></div></div>
      </div>
      <div className="document-tools-header-actions">
        <div className="document-tools-tabs" role="tablist" aria-label="Loại tài liệu">
          {filterTabs.map(({ id, label, icon: Icon }) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "active" : ""} data-tool-tab={id} onClick={() => { setTab(id); setSelected(current => current && (id === "all" || current.kind === id) ? current : null); emitGuideAction(`tools:filter:${id}`); }}><Icon size={16}/><span>{label}</span></button>)}
        </div>
        <input ref={input} hidden type="file" accept={DOCUMENT_ACCEPT} onChange={event => { void upload(event.target.files?.[0]); event.currentTarget.value = ""; }}/>
        <button className="primary-button document-tools-upload" data-help-id="tools-upload" disabled={uploading} onClick={() => input.current?.click()}><Upload size={16}/><span>{uploading ? "Đang tải…" : "Tải tài liệu"}</span></button>
      </div>
    </header>
    {error && <p className="form-error document-tools-error" role="alert">{error}</p>}{notice && <p className="lab-notice document-tools-error" role="status">{notice}</p>}
    <div className="document-tool-layout document-tools-body">
      <aside className={`document-tool-list document-library ${libraryCollapsed ? "is-collapsed" : ""}`} aria-label="Thư viện tài liệu">
        <div className="document-library-heading"><div><span className="document-library-kicker">THƯ VIỆN</span><h2>{libraryTitle}</h2>{!libraryCollapsed && <small>{libraryFiles.length} tài liệu · thiết bị và cloud</small>}</div><button className="icon-button document-library-toggle" type="button" onClick={() => setLibraryCollapsed(value => !value)} aria-label={libraryCollapsed ? "Mở thư viện tài liệu" : "Thu gọn thư viện tài liệu"} title={libraryCollapsed ? "Mở thư viện" : "Thu gọn thư viện"}>{libraryCollapsed ? <ChevronRight size={17}/> : <ChevronLeft size={17}/>}</button></div>
        {!libraryCollapsed && <>
          <label className="document-search tool-document-search"><Search size={15}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Tìm trong thư viện…" aria-label="Tìm tài liệu trong thư viện"/></label>
          <div className="document-library-list">
            {libraryFiles.map(file => { const Icon = documentIcon(file.kind); return <button key={file.id} data-document-id={file.id} data-document-kind={file.kind} className={selected?.id === file.id ? "active" : ""} title={file.name} onClick={() => { void openDocument(file); emitGuideAction("tools:document-open", { documentId: file.id, kind: file.kind }); }}><span className="document-library-file-icon"><Icon size={16}/></span><span className="document-library-file-copy"><strong>{file.name}</strong><small>{file.kind.toUpperCase()} · {file.savedFrom ? `Từ ${file.savedFrom.ownerName}` : cloudFiles.some(row => row.id === file.id) ? "Cloud" : "Thiết bị"}</small></span></button>; })}
            {!libraryFiles.length && <p className="field-hint document-library-empty">Chưa có tài liệu phù hợp. Hãy tải PDF, DOCX, PPTX hoặc XLSX lên.</p>}
          </div>
        </>}
        {libraryCollapsed && <span className="document-library-collapsed-label" aria-hidden="true">{tab.toUpperCase()}</span>}
      </aside>
      <main className="document-tool-workspace">{selected ? <><div className="document-selected-actions">{selected.savedFrom && <small className="learning-copy-provenance">Đã lưu từ {selected.savedFrom.ownerName} · {selected.savedFrom.title}</small>}<div className="actions">{owner && (cloudFiles.some(row => row.id === selected.id) ? <LearningShareButton kind="document" id={selected.id} title={selected.name} plan={accountPlan} available/> : <button className="secondary-button" disabled={syncingSelected} onClick={() => void publishSelected()}><Upload size={15}/>{syncingSelected ? "Đang tải lên…" : "Lưu lên cloud để chia sẻ"}</button>)}</div></div><DocumentViewer source={selected} dedicated={selected.kind === "pdf"} onReady={detail => emitGuideAction("tools:viewer-ready", { ...detail, documentId: selected.id, kind: selected.kind })}/></> : <div className="tool-empty-state"><SelectedIcon size={38}/><h2>Chọn tài liệu để xem</h2><p>PDF có thể vẽ và xuất bản sao; DOCX, PPTX và XLSX được xem trong trình xem tương ứng. Bản gốc trong thư viện không bị thay đổi.</p></div>}</main>
    </div>
  </section>;
}
