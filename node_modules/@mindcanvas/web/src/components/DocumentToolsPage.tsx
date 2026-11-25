import { PageBack } from "./PageNavigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, FileSpreadsheet, FileText, FileType2, FolderOpen, HardDrive, Search, Upload, Wrench } from "lucide-react";
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
import { LearningShareButton } from "./LearningShareDialog";
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

const filterTabs: Array<{ id: ToolTab; label: string; icon: typeof FileText }> = [
  { id: "all", label: "Tất cả", icon: FileText },
  { id: "html", label: "HTML", icon: FileText },
  { id: "pdf", label: "PDF", icon: FileText },
  { id: "docx", label: "DOCX", icon: FileType2 },
  { id: "pptx", label: "PPTX", icon: FileSpreadsheet },
  { id: "xlsx", label: "XLSX", icon: FileSpreadsheet },
];

function documentIcon(kind: DocumentKind | null) {
  return kind === "pdf" ? FileText : kind === "docx" ? FileType2 : FileSpreadsheet;
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
  const [libraryCollapsed, setLibraryCollapsed] = useState(false);
  const [copyTarget, setCopyTarget] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const input = useRef<HTMLInputElement>(null);
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

  const clearPreview = () => { setWorkspaceSelection(null); setSelected(null); setLibraryCollapsed(false); setCopyTarget(null); };
  const showDocument = (file: UploadedDocument) => {
    const show = () => { setWorkspaceSelection(null); setSelected(file); setLibraryCollapsed(file.kind === "html"); };
    if (navigation) navigation.open("document-viewer", show, clearPreview);
    else show();
  };
  const showWorkspaceFile = (file: WorkspaceFile) => {
    setError(""); setNotice("");
    const show = () => { setSelected(null); setWorkspaceSelection(file.id); setLibraryCollapsed(documentKindFor(file.name) === "html"); };
    if (navigation) navigation.open("document-viewer", show, clearPreview);
    else show();
  };
  const closeDocument = () => {
    clearPreview(); navigation?.back();
    if (fromWorkspace) emitGuideAction("documents:back");
  };
  const changeScope = (value: string | null) => {
    closeDocument(); setTab("all"); setQuery(""); setError(""); setNotice("");
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
  const chosenId = selectedFile?.id ?? selected?.id;
  const hasPreview = !!(selected || selectedFile);
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
  const libraryTitle = tab === "all" ? "Tài liệu trong thư viện" : `${tab.toUpperCase()} trong thư viện`;

  return <section className={`document-tools-page document-tools-shell ${libraryCollapsed ? "library-collapsed" : ""} ${(selected?.kind ?? documentKindFor(selectedFile?.name ?? "")) === "html" ? "html-reading" : ""}`} data-library-collapsed={libraryCollapsed ? "true" : "false"}>
    <header className="document-tools-header">
      <div className="document-tools-header-leading">
        {hasPreview ? <PageBack className="document-tools-back" onBack={closeDocument}>{label("Thư viện tài liệu", "Document library")}</PageBack> : onBack && <PageBack className="document-tools-back" onBack={onBack}>{fromWorkspace ? t("manageFolders") : t("learningHub")}</PageBack>}
        <span className="document-tools-header-divider" aria-hidden="true"/>
        <div className="document-tools-heading-inline"><span className="document-tools-heading-icon"><Wrench size={17}/></span><div><strong>{language === "en" ? t("documentViewer") : "Thư viện tài liệu"}</strong><small><HardDrive size={12}/> Thiết bị{owner ? " và cloud" : ""}</small></div></div>
      </div>
      <div className="document-tools-header-actions">
        <div className="document-tools-tabs" role="tablist" aria-label="Loại tài liệu">
          {filterTabs.map(({ id, label, icon: Icon }) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "active" : ""} data-tool-tab={id} onClick={() => { if (hasPreview && id !== "all" && id !== (selected?.kind ?? documentKindFor(selectedFile?.name ?? ""))) closeDocument(); setLibraryCollapsed(false); setTab(id); emitGuideAction(`tools:filter:${id}`); }}><Icon size={16}/><span>{label}</span></button>)}
        </div>
        <input ref={input} hidden type="file" accept={scope ? undefined : DOCUMENT_ACCEPT} onChange={event => { void upload(event.target.files?.[0]); event.currentTarget.value = ""; }}/>
        <button className="primary-button document-tools-upload" data-help-id="tools-upload" disabled={uploading || (!!scope && !scopeExists)} onClick={() => input.current?.click()}><Upload size={16}/><span>{uploading ? label("Đang tải…", "Uploading…") : scope ? label("Tải vào thư mục này", "Upload to this folder") : label("Tải tài liệu", "Upload document")}</span></button>
      </div>
    </header>
    <div className="document-library-meta">
    {workspace && <div className="document-library-folder-control">
      <label htmlFor="document-library-scope">{label("Vị trí", "Location")}</label>
      <select id="document-library-scope" value={scope ?? ""} disabled={uploading} onChange={event => changeScope(event.currentTarget.value || null)}>
        <option value="">{label("Tất cả tài liệu", "All documents")}</option>
        <option value={FOLDER_ROOT}>{label("Workspace · Ngoài thư mục", "Workspace · No folder")}</option>
        {scope && !scopeExists && <option value={scope}>{label("Không mở được thư mục", "Folder unavailable")}</option>}
        {folders.map(folder => <option key={folder.id} value={folder.id}>{folderLabel(folders, folder.id)}</option>)}
      </select>
      <button type="button" className="secondary-button" onClick={() => workspace.openFolder(scope && scope !== FOLDER_ROOT && scopeExists ? scope : null)}><FolderOpen size={16}/>{scope && scopeExists ? label("Mở thư mục", "Open folder") : t("manageFolders")}</button>
    </div>}
    {error && <p className="form-error document-tools-error" role="alert">{error}</p>}{notice && <p className="lab-notice document-tools-error" role="status">{notice}</p>}
    {workspace?.repository.error != null && <div className="document-tools-error" role="alert">{label("Chưa tải được tài liệu Workspace.", "Could not load Workspace files.")} <button type="button" className="secondary-button" onClick={workspace.repository.refresh}>{t("retry")}</button></div>}
    </div>
    <div className="document-tool-layout document-tools-body">
      <aside className={`document-tool-list document-library ${libraryCollapsed ? "is-collapsed" : ""}`} aria-label="Thư viện tài liệu">
        <div className="document-library-heading"><div><span className="document-library-kicker">THƯ VIỆN</span><h2>{libraryTitle}</h2>{!libraryCollapsed && <small>{listing.length} {label("tài liệu", "documents")}</small>}</div><button className="icon-button document-library-toggle" type="button" onClick={() => setLibraryCollapsed(value => !value)} aria-label={libraryCollapsed ? "Mở thư viện tài liệu" : "Thu gọn thư viện tài liệu"} title={libraryCollapsed ? "Mở thư viện" : "Thu gọn thư viện"}>{libraryCollapsed ? <ChevronRight size={17}/> : <ChevronLeft size={17}/>}</button></div>
        {!libraryCollapsed && <>
          <label className="document-search tool-document-search"><Search size={15}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Tìm trong thư viện…" aria-label="Tìm tài liệu trong thư viện"/></label>
          <div className="document-library-list">
            {listing.map(entry => {
              const { file, kind } = entry, Icon = documentIcon(kind);
              const where = entry.source === "workspace" ? folderLabel(folders, entry.file.folderId ?? "") || "Workspace"
                : entry.file.savedFrom ? `${label("Từ", "From")} ${entry.file.savedFrom.ownerName}` : cloudFiles.some(row => row.id === file.id) ? "Cloud" : label("Thiết bị", "Device");
              return <button key={`${entry.source}:${file.id}`} data-document-id={file.id} data-document-kind={kind ?? "file"} className={chosenId === file.id ? "active" : ""} title={file.name} disabled={uploading} onClick={() => {
                if (entry.source === "workspace") showWorkspaceFile(entry.file); else void openDocument(entry.file);
                noteOpen(file.id, kind);
              }}><span className="document-library-file-icon"><Icon size={16}/></span><span className="document-library-file-copy"><strong>{file.name}</strong><small>{kind?.toUpperCase() ?? label("Tệp", "File")} · {where}</small></span></button>;
            })}
            {workspace?.repository.loading && <p role="status" className="field-hint document-library-empty">{t("loading")}</p>}
            {!listing.length && !workspace?.repository.loading && <p className="field-hint document-library-empty">{label("Chưa có tài liệu phù hợp.", "No matching documents.")}</p>}
          </div>
        </>}
        {libraryCollapsed && <span className="document-library-collapsed-label" aria-hidden="true">{tab.toUpperCase()}</span>}
      </aside>
      <main className="document-tool-workspace">{hasPreview && fromWorkspace && <button type="button" className="secondary-button manager-back-button" onClick={closeDocument}>{label("← Danh sách tài liệu", "← Back to documents")}</button>}
        {selectedFile && workspace ? <WorkspaceFilePreview key={selectedFile.id} owner={owner} file={selectedFile} onFolder={() => workspace.openFolder(fromFolder(selectedFile))} onClose={closeDocument} dedicated={!fromWorkspace} onReady={detail => emitGuideAction("tools:viewer-ready", detail)}/>
        : selected ? <>
          {(selected.savedFrom || owner || fromWorkspace || workspace) && <div className="document-selected-actions">
            {selected.savedFrom && <small className="learning-copy-provenance">Đã lưu từ {selected.savedFrom.ownerName} · {selected.savedFrom.title}</small>}
            <div className="actions">
              {workspace && <button type="button" className="secondary-button" onClick={() => { setCopyError(false); setCopyTarget(""); }}><FolderOpen size={15}/>{label("Lưu bản sao vào thư mục", "Save a copy to folder")}</button>}
              {owner && (cloudFiles.some(row => row.id === selected.id) ? <LearningShareButton kind="document" id={selected.id} title={selected.name} plan={accountPlan} available/> : <button className="secondary-button" disabled={syncingSelected} onClick={() => void publishSelected()}><Upload size={15}/>{syncingSelected ? "Đang tải lên…" : "Lưu lên cloud để chia sẻ"}</button>)}
              {fromWorkspace && <><a className="secondary-button" href={selected.dataUrl} download={selected.name}>{label("Tải xuống", "Download")}</a><button type="button" className="text-danger-button" onClick={() => void removeLocal(selected)}>{label("Xóa bản trên thiết bị", "Remove local copy")}</button></>}
            </div>
          </div>}
          <DocumentViewer key={selected.id} owner={owner} source={selected} dedicated={!fromWorkspace && selected.kind === "pdf"} onClose={closeDocument} onReady={detail => emitGuideAction("tools:viewer-ready", detail)}/>
        </>
        : <div className="tool-empty-state"><FileText size={38}/><h2>{label("Chọn tài liệu để xem", "Choose a document to view")}</h2><p>{label("Xem HTML, PDF, DOCX, PPTX, XLSX và một số tệp mã nguồn. Chọn vị trí để mở hoặc tải tệp vào một thư mục Workspace.", "Preview HTML, PDF, DOCX, PPTX, XLSX and some source files. Choose a location to browse or upload to a Workspace folder.")}</p></div>}</main>
    </div>
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
