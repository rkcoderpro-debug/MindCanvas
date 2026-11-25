import { PageBack } from "./PageNavigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Download, FileSpreadsheet, FileText, FileType2, FolderOpen, LibraryBig, Search, Share2, Trash2, Upload } from "lucide-react";
import DocumentViewer from "./DocumentViewer";
import WorkspaceFilePreview from "./WorkspaceFilePreview";
import Dialog from "./Dialog";
import { validateHtmlDocument, textFromDataUrl } from "../lib/htmlDocument";
import { useLearningTool } from "../lib/learningNavigation";
import { deleteDocument, documentKindFor, fileToDataUrl, MAX_DOCUMENT_BYTES, saveDocument, DOCUMENT_ACCEPT, type DocumentKind, type UploadedDocument } from "../lib/documentStore";
import { downloadOwnedCloudDocument, listOwnedCloudDocuments, type CloudDocumentDescriptor } from "../lib/documentCloud";
import { saveDocumentToStorage } from "../lib/supabase";
import { listMyLearningCopySources, type LearningCopySource } from "../lib/learningShare";
import type { AccountPlan } from "../lib/account";
import { emitGuideAction } from "../lib/featureGuides";
import { buildDocxPackage } from "../lib/docxModel";
import { LearningShareDialog } from "./LearningShareDialog";
import type { ReaderAction } from "./DocumentReaderBar";
import { useLanguage } from "../lib/i18n";
import { FOLDER_ROOT } from "../lib/folderLinks";
import type { useWorkspaceFiles } from "../hooks/useWorkspaceFiles";
import type { ProjectFolder } from "../lib/projectStore";
import { addWorkspaceFile, type WorkspaceFile } from "../lib/workspaceFiles";

export type LibraryWorkspace = {
  repository: ReturnType<typeof useWorkspaceFiles>;
  folders: ProjectFolder[];
  scope?: string | null;
  onScope?: (scope: string | null) => void;
  openFolder: (id: string | null) => void;
};

type Props = { owner: string | null; documents: UploadedDocument[]; onDocumentsChanged: () => void; accountPlan?: AccountPlan; onBack?: () => void; workspace?: LibraryWorkspace; fromWorkspace?: boolean };
type ToolTab = "all" | DocumentKind;

/** Backward-compatible test/API name retained for existing callers. */
export async function buildDocx(html: string) {
  return buildDocxPackage(html);
}

const filterTabs: Array<{ id: ToolTab; label: string }> = [
  { id: "all", label: "Tất cả" },
  { id: "html", label: "HTML" },
  { id: "pdf", label: "PDF" },
  { id: "docx", label: "DOCX" },
  { id: "pptx", label: "PPTX" },
  { id: "xlsx", label: "XLSX" },
];

function documentIcon(kind: DocumentKind | null) {
  return kind === "xlsx" ? FileSpreadsheet : kind === "docx" ? FileType2 : FileText;
}

function folderLabel(folders: ProjectFolder[], id: string) {
  const path = [], seen = new Set<string>();
  let folder = folders.find(entry => entry.id === id);
  while (folder && !seen.has(folder.id) && path.length < 16) {
    seen.add(folder.id); path.unshift(folder.name);
    const parent = folder.parentId;
    folder = folders.find(entry => entry.id === parent);
  }
  return path.join(" › ");
}

/**
 * The Tools tab is intentionally a viewer hub. DOCX remains importable and
 * viewable, but the old editor route is no longer exposed from the product UI.
 * Existing stored documents are untouched and DocumentViewer remains the one
 * viewer/annotation surface for every supported file type.
 */
export default function DocumentToolsPage({ owner, documents, onDocumentsChanged, accountPlan, onBack, workspace, fromWorkspace }: Props) {
  const { language, t } = useLanguage();
  const label = (vi: string, en: string) => language === "vi" ? vi : en;
  const [tab, setTab] = useState<ToolTab>("all");
  const navigation = useLearningTool();
  const [selected, setSelected] = useState<UploadedDocument | null>(null);
  const [workspaceSelection, setWorkspaceSelection] = useState<string | null>(null);
  const [localScope, setLocalScope] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [uploading, setUploading] = useState(false);
  const [cloudFiles, setCloudFiles] = useState<CloudDocumentDescriptor[]>([]);
  const [savedSources, setSavedSources] = useState<LearningCopySource[]>([]);
  const [syncingSelected, setSyncingSelected] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [sharing, setSharing] = useState(false);
  const [copyTarget, setCopyTarget] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const input = useRef<HTMLInputElement>(null), root = useRef<HTMLElement>(null);
  const returnTo = useRef<{ id?: string; scrollTop: number } | null>(null);
  const rememberBrowse = (id?: string) => {
    returnTo.current = { id, scrollTop: root.current?.closest(".main-area")?.scrollTop ?? 0 };
  };
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const scope = workspace?.scope === undefined ? localScope : workspace.scope;
  const folders = workspace?.folders ?? [];
  const selectedFile = workspace?.repository.files.find(file => file.id === workspaceSelection);
  const scopeExists = scope === FOLDER_ROOT || folders.some(folder => folder.id === scope);
  const fromFolder = (file: WorkspaceFile) => folders.some(folder => folder.id === file.folderId) ? file.folderId : null;
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

  const clearPreview = () => { setWorkspaceSelection(null); setSelected(null); setSharing(false); setCopyTarget(null); };
  const showDocument = (file: UploadedDocument) => {
    const show = () => { setWorkspaceSelection(null); setSelected(file); };
    if (navigation) navigation.open("document-viewer", show, clearPreview);
    else show();
  };
  const showWorkspaceFile = (file: WorkspaceFile) => {
    setError(""); setNotice("");
    const show = () => { setSelected(null); setWorkspaceSelection(file.id); };
    if (navigation) navigation.open("document-viewer", show, clearPreview);
    else show();
  };
  const closeDocument = () => {
    clearPreview(); navigation?.back();
    if (fromWorkspace) emitGuideAction("documents:back");
  };
  const changeScope = (value: string | null) => {
    setTab("all"); setQuery(""); setError(""); setNotice("");
    if (workspace?.onScope) workspace.onScope(value); else setLocalScope(value);
  };
  const openDocument = async (file: UploadedDocument) => {
    setError(""); setNotice("");
    if (file.dataUrl) { showDocument(file); return; }
    if (!owner) { setError("Tài liệu này cần đăng nhập để tải từ cloud."); return; }
    setUploading(true);
    try {
      const loaded = await downloadOwnedCloudDocument(owner, file.id);
      showDocument({ ...loaded, savedFrom: file.savedFrom });
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
    rememberBrowse();
    if (scope && workspace) {
      if (!scopeExists) return;
      if (file.size > MAX_DOCUMENT_BYTES) { setError(label("Tài liệu vượt quá 40 MB.", "File exceeds 40 MB.")); return; }
      setUploading(true); setError(""); setNotice("");
      try {
        const added = await addWorkspaceFile(owner, scope === FOLDER_ROOT ? null : scope, file);
        workspace.repository.setFiles(files => [added, ...files.filter(row => row.id !== added.id)]);
        workspace.repository.refresh();
        setTab("all"); setQuery(""); showWorkspaceFile(added);
        setNotice(label("Đã tải tài liệu vào Workspace.", "Uploaded the file to Workspace."));
      } catch { setError(label("Không thể tải tệp lên. Hãy kiểm tra tên tệp và thử lại.", "Upload failed. Check the file name and try again.")); }
      finally { setUploading(false); }
      return;
    }
    const kind = documentKindFor(file.name, file.type);
    if (!kind) { setError("Chỉ hỗ trợ HTML, PDF, DOCX, PPTX và XLSX."); return; }
    if (file.size > MAX_DOCUMENT_BYTES) { setError("Tài liệu vượt quá 40 MB."); return; }
    setUploading(true); setError(""); setNotice("");
    try {
      const dataUrl = await fileToDataUrl(file);
      if (kind === "html") validateHtmlDocument(textFromDataUrl(dataUrl));
      const saved = await saveDocument(owner, { name: file.name, mimeType: file.type || "application/octet-stream", kind, size: file.size, dataUrl, folderId: null });
      onDocumentsChanged();
      showDocument(saved);
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

  const folderItems = (workspace?.repository.files ?? []).filter(file => {
    const kind = documentKindFor(file.name);
    return file.ready && (!scope || (fromFolder(file) ?? FOLDER_ROOT) === scope) && (tab === "all" || kind === tab) &&
      (!normalizedQuery || file.name.toLocaleLowerCase().includes(normalizedQuery));
  });
  const legacyItems = scope ? [] : libraryFiles;
  const listing = [
    ...folderItems.map(file => ({ source: "workspace" as const, file, kind: documentKindFor(file.name), date: file.createdAt })),
    ...legacyItems.map(file => ({ source: "library" as const, file, kind: file.kind, date: file.updatedAt })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  const hasPreview = !!(selected || selectedFile);
  useLayoutEffect(() => {
    const element = root.current;
    if (!element || element.closest("[hidden]")) return;
    const area = element.closest<HTMLElement>(".main-area");
    if (hasPreview) {
      if (area) area.scrollTop = 0;
      element.querySelector<HTMLElement>(".document-reader-title h2")?.focus({ preventScroll: true });
    } else if (returnTo.current) {
      const previous = returnTo.current;
      returnTo.current = null;
      if (area) area.scrollTop = previous.scrollTop;
      const row = [...element.querySelectorAll<HTMLButtonElement>(".document-library-list button")]
        .find(button => button.dataset.documentId === previous.id);
      (row ?? element.querySelector<HTMLButtonElement>(".document-tools-upload"))?.focus({ preventScroll: true });
    }
  }, [hasPreview]);
  const noteOpen = (id: string, kind: DocumentKind | null) => {
    emitGuideAction("tools:document-open", { documentId: id, kind });
    if (fromWorkspace) emitGuideAction(kind === "pdf" ? "documents:open:pdf" : "documents:open", { documentId: id, kind });
  };
  const removeLocal = async (file: UploadedDocument) => {
    if (!window.confirm(label(`Xóa bản lưu trên thiết bị của “${file.name}”?`, `Remove the copy of “${file.name}” stored on this device?`))) return;
    try { await deleteDocument(owner, file.id); closeDocument(); onDocumentsChanged(); }
    catch { setError(label("Không thể xóa bản lưu trên thiết bị.", "Could not remove the local copy.")); }
  };
  const copyToFolder = async () => {
    if (!workspace || !selected || !copyTarget || copying || (copyTarget !== FOLDER_ROOT && !folders.some(folder => folder.id === copyTarget))) return;
    setCopying(true); setCopyError(false);
    try {
      const blob = await fetch(selected.dataUrl).then(response => response.blob());
      const saved = await addWorkspaceFile(owner, copyTarget === FOLDER_ROOT ? null : copyTarget, new File([blob], selected.name));
      workspace.repository.setFiles(files => [saved, ...files.filter(file => file.id !== saved.id)]);
      workspace.repository.refresh();
      setCopyTarget(null);
      setNotice(label("Đã lưu bản sao vào thư mục đã chọn.", "Saved a copy in the selected folder."));
    } catch { setCopyError(true); }
    finally { setCopying(false); }
  };
  const selectedIsCloud = selected && cloudFiles.some(row => row.id === selected.id);
  const readerActions: ReaderAction[] = selected ? [
    { id: "download", label: label("Tải tệp gốc", "Download original"), icon: Download, href: selected.dataUrl, download: selected.name },
    ...(owner ? [selectedIsCloud
      ? { id: "share", label: label("Chia sẻ", "Share"), icon: Share2, run: () => setSharing(true) }
      : { id: "sync", label: label("Lưu lên cloud để chia sẻ", "Save to cloud to share"), icon: Upload, disabled: syncingSelected, run: () => void publishSelected() }] : []),
    ...(workspace ? [{ id: "copy", label: label("Lưu bản sao vào thư mục", "Save a copy to folder"), icon: FolderOpen, run: () => { setCopyError(false); setCopyTarget(""); } }] : []),
    ...(fromWorkspace ? [{ id: "remove", label: label("Xóa bản trên thiết bị", "Remove local copy"), icon: Trash2, danger: true, run: () => void removeLocal(selected) }] : []),
  ] : [];
  const where = selected?.savedFrom ? label("Bản sao từ ", "Copied from ") + selected.savedFrom.ownerName
    : selectedIsCloud ? "Cloud" : label("Trên thiết bị", "On this device");
  const noMatches = normalizedQuery || tab !== "all" || scope;
  const formattedDate = useMemo(() => new Intl.DateTimeFormat(language === "vi" ? "vi-VN" : "en", { day: "numeric", month: "short", year: "numeric" }), [language]);
  const uploadLabel = uploading ? label("Đang tải…", "Uploading…")
    : scope ? label("Tải vào thư mục này", "Upload to this folder") : label("Tải tài liệu", "Upload document");

  return <section ref={root} className={"document-tools-page " + (hasPreview ? "document-reading-view" : "document-browse-view")}>
    {hasPreview ? <>
      <PageBack className="reader-back" onBack={closeDocument}>{label("Danh sách tài liệu", "Document list")}</PageBack>
      <div className="document-reader-notices">
        {error && <p className="form-error" role="alert">{error}</p>}
        {notice && <p className="lab-notice" role="status">{notice}</p>}
      </div>
      <div className="document-tool-workspace">
        {selectedFile && workspace
          ? <WorkspaceFilePreview key={selectedFile.id} owner={owner} accountPlan={accountPlan} file={selectedFile} onFolder={() => workspace.openFolder(fromFolder(selectedFile))}
              dedicated={!fromWorkspace} onReady={detail => emitGuideAction("tools:viewer-ready", detail)}/>
          : selected && <DocumentViewer key={selected.id} owner={owner} source={selected} dedicated={!fromWorkspace && selected.kind === "pdf"}
              reader={{ actions: readerActions, caption: where }} onReady={detail => emitGuideAction("tools:viewer-ready", detail)}/>}
      </div>
      {sharing && selected && <LearningShareDialog kind="document" id={selected.id} title={selected.name} plan={accountPlan} available onClose={() => setSharing(false)}/>}
    </> : <>
      {onBack && <PageBack className="reader-back" onBack={onBack}>{fromWorkspace ? t("manageFolders") : t("learningHub")}</PageBack>}
      <div className="document-browse-surface">
        <header className="document-browse-header">
          <div className="document-tools-heading-inline"><span className="document-browse-symbol"><LibraryBig size={23} aria-hidden="true"/></span>
            <div><h2>{label("Thư viện tài liệu", "Document library")}</h2><small>{label("Tìm và mở tài liệu để đọc.", "Find and open a document to read.")}</small></div>
          </div>
          <input ref={input} hidden type="file" accept={scope ? undefined : DOCUMENT_ACCEPT} onChange={event => { void upload(event.target.files?.[0]); event.currentTarget.value = ""; }}/>
          <button className="primary-button document-tools-upload" data-help-id="tools-upload" disabled={uploading || (!!scope && !scopeExists)}
            onClick={() => input.current?.click()}><Upload size={16}/>{uploadLabel}</button>
        </header>
        <div className="document-browse-filters">
          <div className="document-search-area"><label className="search-field tool-document-search"><Search size={17} aria-hidden="true"/>
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder={label("Tìm theo tên tài liệu…", "Search by title…")} aria-label={label("Tìm tài liệu trong thư viện", "Search the document library")}/>
          </label>
          {workspace && <div className="document-browse-scope">
            <select id="document-library-scope" aria-label={label("Vị trí", "Location")} value={scope ?? ""} disabled={uploading} onChange={event => changeScope(event.currentTarget.value || null)}>
              <option value="">{label("Tất cả vị trí", "All locations")}</option>
              <option value={FOLDER_ROOT}>{label("Workspace · Ngoài thư mục", "Workspace · No folder")}</option>
              {scope && !scopeExists && <option value={scope}>{label("Không mở được thư mục", "Folder unavailable")}</option>}
              {folders.map(folder => <option key={folder.id} value={folder.id}>{folderLabel(folders, folder.id)}</option>)}
            </select>
            <button type="button" className="secondary-button" title={scope && scopeExists ? label("Mở thư mục", "Open folder") : t("manageFolders")}
              onClick={() => workspace.openFolder(scope && scope !== FOLDER_ROOT && scopeExists ? scope : null)}>
              <FolderOpen size={16}/><span>{scope && scopeExists ? label("Mở thư mục", "Open folder") : t("manageFolders")}</span>
            </button>
          </div>}
          </div>
          <div className="document-browse-filters-end">
            <div className="document-tools-tabs" role="group" aria-label={label("Loại tài liệu", "Document type")}>
              {filterTabs.map(({ id, label: name }) => <button key={id} type="button" aria-pressed={tab === id} className={tab === id ? "active" : ""} data-tool-tab={id}
                onClick={() => { setTab(id); emitGuideAction("tools:filter:" + id); }}>{id === "all" ? label("Tất cả", "All") : name}</button>)}
            </div>
            <small className="document-browse-count">{listing.length} {label("tài liệu", listing.length === 1 ? "document" : "documents")}</small>
          </div>
        </div>
        <div className="document-reader-notices">
          {error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="lab-notice" role="status">{notice}</p>}
          {workspace?.repository.error != null && <div className="form-error" role="alert">{label("Chưa tải được tài liệu Workspace.", "Could not load Workspace files.")} <button type="button" className="secondary-button" onClick={workspace.repository.refresh}>{t("retry")}</button></div>}
        </div>
        <div className="document-tool-list document-browse-files" aria-label={label("Tài liệu trong thư viện", "Library documents")}>
          <div className="document-library-list">
            {listing.map(entry => {
              const { file, kind } = entry, Icon = documentIcon(kind);
              const location = entry.source === "workspace" ? folderLabel(folders, entry.file.folderId ?? "") || "Workspace"
                : entry.file.savedFrom ? label("Từ ", "From ") + entry.file.savedFrom.ownerName : cloudFiles.some(row => row.id === file.id) ? "Cloud" : label("Thiết bị", "Device");
              const date = new Date(entry.date);
              return <button key={entry.source + ":" + file.id} type="button" data-document-id={file.id} data-document-kind={kind ?? "file"} title={file.name}
                disabled={uploading} onClick={() => {
                  rememberBrowse(file.id);
                  if (entry.source === "workspace") showWorkspaceFile(entry.file); else void openDocument(entry.file);
                  noteOpen(file.id, kind);
                }}>
                <span className="document-library-file-icon"><Icon size={18} aria-hidden="true"/></span>
                <span className="document-browse-file-name"><strong>{file.name}</strong><small>{location}</small></span>
                {!Number.isNaN(date.getTime()) && <time dateTime={entry.date}>{formattedDate.format(date)}</time>}
                <span className="document-browse-type">{kind?.toUpperCase() ?? label("Tệp", "File")}</span>
                <ChevronRight size={15} aria-hidden="true"/>
              </button>;
            })}
          </div>
          {workspace?.repository.loading && <p role="status" className="field-hint document-library-empty">{t("loading")}</p>}
          {!listing.length && !workspace?.repository.loading && <div className="document-browse-empty">
            <FileText size={30} aria-hidden="true"/><h3>{noMatches ? label("Không có tài liệu phù hợp", "No matching documents") : label("Thư viện chưa có tài liệu", "No documents yet")}</h3>
            <p>{noMatches ? label("Thử đổi bộ lọc hoặc nhập tên khác.", "Try a different filter or search term.") : label("Tải một tệp lên để bắt đầu đọc.", "Upload a file to start reading.")}</p>
          </div>}
        </div>
      </div>
    </>}
    {copyTarget !== null && selected && <Dialog title={label("Lưu bản sao vào thư mục", "Save a copy to folder")} dismissible={!copying} onClose={() => setCopyTarget(null)}>
      <p>{selected.name}</p>
      <label>{label("Thư mục đích", "Destination folder")}<select value={copyTarget} disabled={copying} onChange={event => setCopyTarget(event.currentTarget.value)}>
        <option value="" disabled>{label("Chọn thư mục", "Choose a folder")}</option>
        <option value={FOLDER_ROOT}>{label("Workspace · Ngoài thư mục", "Workspace · No folder")}</option>
        {folders.map(folder => <option key={folder.id} value={folder.id}>{folderLabel(folders, folder.id)}</option>)}
      </select></label>
      {copyError && <p className="form-error" role="alert">{label("Không thể lưu bản sao. Hãy thử lại.", "Could not save the copy. Try again.")}</p>}
      <footer className="actions"><button type="button" className="secondary-button" disabled={copying} onClick={() => setCopyTarget(null)}>{t("cancel")}</button><button type="button" className="primary-button" disabled={copying || !copyTarget} onClick={() => void copyToFolder()}>{copying ? t("loading") : t("save")}</button></footer>
    </Dialog>}
  </section>;
}
