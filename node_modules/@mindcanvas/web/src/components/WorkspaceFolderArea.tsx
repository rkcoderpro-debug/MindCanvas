import FolderTreePicker from "./FolderTreePicker";
import { formatStorage, type AccountPlan } from "../lib/account";
import { WorkspaceShareButton } from "./WorkspaceShareDialog";
import { ensureFolderAttachments } from "../lib/shareAttachments";
import { lazy, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronRight, Download, File, FilePlus2, Folder, FolderPlus, LibraryBig, Link2, Move, RefreshCw, Search, Trash2, Upload } from "lucide-react";
import Dialog from "./Dialog";
import type { useWorkspaceFiles } from "../hooks/useWorkspaceFiles";
import FilePicker from "./FilePicker";
import { useLanguage } from "../lib/i18n";
import { folderPermalink } from "../lib/folderLinks";
import { copyTextWithFallback } from "../lib/share";
import { type ProjectFolder } from "../lib/projectStore";
import { addWorkspaceFile, deleteWorkspaceFile, downloadWorkspaceBlob, moveWorkspaceFile, readWorkspaceFile, type WorkspaceFile } from "../lib/workspaceFiles";
import { useDocumentLibrary } from "../hooks/useDocumentLibrary";
import { downloadOwnedCloudDocument } from "../lib/documentCloud";
import type { UploadedDocument } from "../lib/documentStore";

const DocumentToolsPage = lazy(() => import("./DocumentToolsPage"));

export function folderTrail(folders: readonly ProjectFolder[], id: string | null) {
  const byId = new Map(folders.map(folder => [folder.id, folder]));
  const chain: ProjectFolder[] = [];
  for (let next = id; next && chain.length < 16;) {
    const folder = byId.get(next);
    if (!folder || chain.some(item => item.id === folder.id)) break;
    chain.unshift(folder);
    next = folder.parentId ?? null;
  }
  return chain;
}

type Props = {
  owner: string | null;
  accountPlan?: AccountPlan;
  current: ProjectFolder | null;
  folders: ProjectFolder[];
  onFolder: (id: string) => void;
  onRoot: () => void;
  onNewFolder: () => void;
  onNewProject: () => void;
  onImportProject: () => void;
  onLibrary: () => void;
  onOpenFile: (id: string) => void;
  repository: ReturnType<typeof useWorkspaceFiles>;
  documents: UploadedDocument[];
  onDocumentsChanged: () => void;
  projectList: ReactNode;
};
export default function WorkspaceFolderArea({ owner, accountPlan, current, folders, onFolder, onRoot, onNewFolder, onNewProject,
  onImportProject, onLibrary, onOpenFile, repository, documents, onDocumentsChanged, projectList }: Props) {
  const { language,t } = useLanguage();
  const vn = language === "vi";
  const label = (vi: string, en: string) => vn ? vi : en;
  const currentId = current?.id ?? null;
  const folderPaths = useMemo(() => new Map(folders.map(folder => [folder.id, folderTrail(folders, folder.id).map(item => item.name).join(" › ")])), [folders]);
  const children = folders.filter(folder => (folder.parentId ?? null) === currentId);
  const trail = folderTrail(folders,currentId);
  const { files,setFiles,loading,refresh,error: readError } = repository;
  const [query,setQuery] = useState("");
  const [status,setStatus] = useState("");
  const [error,setError] = useState("");
  const [uploading,setUploading] = useState(false);
  const [working,setWorking] = useState(false);
  const [action,setAction] = useState<{ file: WorkspaceFile; kind: "move" | "delete" } | null>(null);
  const [destination,setDestination] = useState("");
  const [reading, setReading] = useState<{ file: UploadedDocument; cloud: boolean } | null>(null);
  const root = useRef<HTMLElement>(null);
  const resume = useRef<{ id: string; top: number } | null>(null);
  const locked = useRef(false);
  const alive = useRef(false);
  const catalog = useDocumentLibrary(owner, documents);
  const inScope = (folderId: string | null) => !currentId || folderId === currentId;
  const location = (folderId: string | null) => (folderId && folderPaths.get(folderId)) || "Workspace";
  const libraryItems = [
    ...files.filter(file => inScope(file.folderId)).map(file => ({ source: "workspace" as const, file, date: file.createdAt, place: location(file.folderId) })),
    ...catalog.files.filter(file => inScope(file.folderId)).map(file => ({ source: "document" as const, file, date: file.updatedAt,
      place: file.folderId ? location(file.folderId) : catalog.cloudIds.has(file.id) ? "Cloud" : label("Thiết bị", "Device") })),
  ];
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const shownFiles = libraryItems.filter(({ file }) => file.name.toLocaleLowerCase().includes(normalizedQuery))
    .sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0) || a.file.name.localeCompare(b.file.name, language));
  const issue = (cause: unknown) => {
    const details = cause as { message?: string; code?: string } | null;
    if (details?.message === "WORKSPACE_FILE_SIZE") return label("vượt giới hạn 40 MB", "exceeds the 40 MB limit");
    if (details?.message === "WORKSPACE_FILE_NAME") return label("tên tệp phải có từ 1 đến 255 ký tự", "file names must contain 1–255 characters");
    if (details?.code === "PGRST205" || details?.code === "42P01") return label("Kho tệp chưa được bật trên máy chủ.", "File storage is not set up on this server.");
    return label("Không thể truy cập tệp. Hãy thử lại.", "Could not access the file. Try again.");
  };

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useLayoutEffect(() => {
    if (reading || !root.current || !resume.current) return;
    const { id, top } = resume.current;
    resume.current = null;
    const area = root.current.closest<HTMLElement>(".main-area");
    if (area) area.scrollTop = top;
    [...root.current.querySelectorAll<HTMLButtonElement>("[data-manager-document]")]
      .find(button => button.dataset.managerDocument === id)?.focus({ preventScroll: true });
  }, [reading]);

  const copy = async () => {
    const href = folderPermalink(currentId);
    const copied = await copyTextWithFallback(href);
    setStatus(copied ? label("Đã sao chép liên kết. Chỉ tài khoản có quyền mới mở được.", "Link copied. Only an authorized account can open it.") : href);
  };

  const upload = async (selected: File[]) => {
    if (locked.current || !selected.length) return;
    locked.current = true; setUploading(true); setError(""); setStatus("");
    const failed: string[] = [];
    try {
      for (const file of selected) {
        try {
          const added = await addWorkspaceFile(owner,currentId,file);
          setFiles(rows => [added,...rows.filter(row => row.id !== added.id)]);
        } catch (cause) { failed.push(`${file.name}: ${issue(cause)}`); }
      }
      refresh();
      if (!alive.current) return;
      if (failed.length) setError(failed.join(" · "));
      const saved = selected.length - failed.length;
      if (saved) setStatus(label(`Đã thêm ${saved} tệp.`, `Added ${saved} file(s).`));

    } finally { locked.current = false; if (alive.current) setUploading(false); }
  };

  const download = async (file: WorkspaceFile) => {
    if (locked.current) return;
    locked.current = true; setWorking(true); setError("");
    try {
      const blob = await readWorkspaceFile(owner,file.id);
      if (alive.current) downloadWorkspaceBlob(blob,file.name);
    }
    catch (cause) { if (alive.current) setError(issue(cause)); }
    finally { locked.current = false; if (alive.current) setWorking(false); }
  };

  const openDocument = async (file: UploadedDocument) => {
    if (locked.current) return;
    const top = root.current?.closest(".main-area")?.scrollTop ?? 0;
    locked.current = true; setWorking(true); setError("");
    try {
      const loaded = file.dataUrl ? file : owner ? await downloadOwnedCloudDocument(owner, file.id) : null;
      if (!loaded) throw new Error("DOCUMENT_UNAVAILABLE");
      if (!alive.current) return;
      resume.current = { id: file.id, top };
      setReading({ file: { ...loaded, savedFrom: file.savedFrom }, cloud: catalog.cloudIds.has(file.id) });
      if (!file.dataUrl) onDocumentsChanged();
    } catch (cause) { if (alive.current) setError(issue(cause)); }
    finally { locked.current = false; if (alive.current) setWorking(false); }
  };

  const commit = async () => {
    if (!action || locked.current) return;
    locked.current = true; setWorking(true); setError(""); setStatus("");
    try {
      if (action.kind === "delete") {
        await deleteWorkspaceFile(owner,action.file.id);
        setFiles(rows => rows.filter(row => row.id !== action.file.id));
      } else {
        const moved = await moveWorkspaceFile(owner,action.file.id,destination || null);
        setFiles(rows => rows.map(row => row.id === moved.id ? moved : row));
      }
      setStatus(action.kind === "delete" ? label("Đã xóa tệp.", "File deleted.") : label("Đã chuyển tệp.", "File moved."));
      setAction(null);
    } catch (cause) { setError(issue(cause)); }
    finally { locked.current = false; setWorking(false); }
  };
  const enabled = !working && !uploading;
  const originalFolder = action?.file.folderId && folderPaths.has(action.file.folderId) ? action.file.folderId : "";
  if (reading) return <DocumentToolsPage owner={owner} documents={documents} onDocumentsChanged={onDocumentsChanged} accountPlan={accountPlan}
    workspace={{ repository, folders, openFolder: id => id ? onFolder(id) : onRoot() }} fromWorkspace initialDocument={reading} onBack={() => setReading(null)}/>;

  return <section ref={root} className="workspace-home workspace-folder-area" aria-label={current?.name ?? t("manageFolders")}>
    <nav className="workspace-folder-crumbs" aria-label={label("Đường dẫn thư mục", "Folder path")}>
      {current ? <button type="button" onClick={onRoot}>{label("Tất cả thư mục", "All folders")}</button> : <span aria-current="page">{label("Tất cả thư mục", "All folders")}</span>}
      {trail.map((folder,index) => <span key={folder.id}><ChevronRight size={14} aria-hidden="true"/>{index === trail.length-1 ? <strong aria-current="page">{folder.name}</strong> : <button onClick={() => onFolder(folder.id)}>{folder.name}</button>}</span>)}
    </nav>
    <header className="workspace-folder-header"><div className="home-heading">
      <div><span className="eyebrow">{current ? t("folders") : t("workspace")}</span><h1>{current?.name ?? t("manageFolders")}</h1></div>
    </div>
    <div className="workspace-folder-tools">
      <FilePicker className="workspace-folder-picker" layout="inline" buttonLabel={uploading ? label("Đang tải lên…", "Uploading…") : label("Thêm tài liệu", "Add files")}
        aria-label={label("Thêm tài liệu", "Add files")} description={label("Mọi định dạng · tối đa 40 MB mỗi tệp", "Any format · up to 40 MB per file")}
        multiple disabled={!enabled} onChange={event => void upload(Array.from(event.currentTarget.files ?? []))} onDropFiles={selected => void upload(selected)}/>
      <div className="actions">
        <button type="button" className="secondary-button folder-manager-new-folder" disabled={trail.length >= 16} onClick={onNewFolder}><FolderPlus size={17}/>{current ? label("Tạo thư mục con", "New subfolder") : t("newFolder")}</button>
        <button type="button" className="secondary-button" onClick={onNewProject}><FilePlus2 size={17}/>{t("newProject")}</button>
        <button type="button" className="secondary-button" onClick={onImportProject}><Upload size={17}/>{t("import")}</button>
        <button type="button" className="secondary-button" onClick={() => void copy()}><Link2 size={17}/>{label("Sao chép link thư mục", "Copy folder link")}</button>
        {current && <WorkspaceShareButton item={{kind:"folder",id:current.id,title:current.name}} friends={{plan:accountPlan}} available={!!owner}
          prepare={owner ? ()=>ensureFolderAttachments(owner,current.id) : undefined}/>}
      </div>
    </div>
    </header>
    {status && <p role="status" className="workspace-file-status">{status}</p>}
    {children.length > 0 && <div className="workspace-child-folders"><h2>{current ? label("Thư mục con", "Subfolders") : t("folders")}</h2>
      <ul>{children.map(folder => <li key={folder.id}><button type="button" className="secondary-button" onClick={() => onFolder(folder.id)}><Folder size={18}/><span>{folder.name}</span><ChevronRight size={15}/></button></li>)}</ul>
    </div>}
    <div className="workspace-folder-columns">
      <section className="workspace-file-box workspace-library-box" aria-label={label("Thư viện tài liệu", "Document library")}>
        <header>
          <div><h2>{label("Thư viện tài liệu", "Document library")}</h2>
            <small>{libraryItems.length} {label("tài liệu", libraryItems.length === 1 ? "document" : "documents")}</small>
          </div>
          <button type="button" className="secondary-button manager-documents" onClick={onLibrary}>
            <LibraryBig size={16}/>{label("Mở thư viện", "Open library")}
          </button>
        </header>
        <div className="workspace-file-search">
          <label className="search-field"><Search size={16} aria-hidden="true"/>
            <input type="search" value={query} onChange={event => setQuery(event.target.value)}
              placeholder={label("Tìm tên tệp…", "Search files…")} aria-label={label("Tìm tên tệp", "Search file names")}/>
          </label>
          <button type="button" className="icon-button" disabled={!enabled || loading || catalog.loading}
            aria-label={label("Làm mới tài liệu", "Refresh files")} title={label("Làm mới tài liệu", "Refresh files")}
            onClick={() => { setError(""); refresh(); catalog.refresh(); onDocumentsChanged(); }}><RefreshCw size={17}/></button>
        </div>
        {(error || readError != null) && !action && <p className="form-error" role="alert">{error || issue(readError)}</p>}
        {catalog.error != null && <p className="form-error" role="alert">{label("Chưa tải được tài liệu Cloud.", "Could not load Cloud documents.")}</p>}
        {(loading || catalog.loading || working && !action) && <p role="status">{t("loading")}</p>}
        {!shownFiles.length && !loading && !catalog.loading && <p>{normalizedQuery ? label("Không tìm thấy tệp phù hợp.", "No matching files.") : label("Chưa có tài liệu ở đây.", "No documents here yet.")}</p>}
        {shownFiles.length > 0 && <ul className="workspace-file-list workspace-document-list">{shownFiles.map(entry => {
          const workspaceFile = entry.source === "workspace" ? entry.file : null;
          const date = new Date(entry.date).toLocaleDateString(vn ? "vi-VN" : "en-US");
          const description = workspaceFile && !workspaceFile.ready ? label("Tải lên chưa hoàn tất", "Upload incomplete")
            : [entry.place, formatStorage(entry.file.size), date].join(" · ");
          return <li key={entry.source + ":" + entry.file.id}>
            <File size={18} aria-hidden="true"/>
            <button type="button" className="workspace-file-open workspace-file-name" disabled={!enabled}
              data-manager-document={entry.source === "document" ? entry.file.id : undefined}
              onClick={() => entry.source === "workspace" ? onOpenFile(entry.file.id) : void openDocument(entry.file)}>
              <strong title={entry.file.name}>{entry.file.name}</strong>
              <small title={description}>{description}</small>
            </button>
            {workspaceFile && <div className="workspace-file-actions">
              {workspaceFile.ready && <WorkspaceShareButton item={{ kind: "file", id: workspaceFile.id, title: workspaceFile.name }} friends={{ plan: accountPlan }} available={!!owner} compact/>}
              <button type="button" className="icon-button" disabled={!enabled || !workspaceFile.ready}
                aria-label={label("Tải xuống", "Download") + ": " + workspaceFile.name} title={label("Tải xuống", "Download")}
                onClick={() => void download(workspaceFile)}><Download size={17}/></button>
              <button type="button" className="icon-button" disabled={!enabled || !workspaceFile.ready}
                aria-label={t("move") + ": " + workspaceFile.name} title={t("move")} onClick={() => {
                  setError("");
                  setDestination(workspaceFile.folderId && folderPaths.has(workspaceFile.folderId) ? workspaceFile.folderId : "");
                  setAction({ file: workspaceFile, kind: "move" });
                }}><Move size={17}/></button>
              <button type="button" className="icon-button workspace-file-danger" disabled={!enabled}
                aria-label={t("delete") + ": " + workspaceFile.name} title={t("delete")}
                onClick={() => { setError(""); setAction({ file: workspaceFile, kind: "delete" }); }}><Trash2 size={17}/></button>
            </div>}
          </li>;
        })}</ul>}
      </section>
      {projectList}
    </div>
    {action && <Dialog title={action.kind === "move" ? label("Chuyển tài liệu", "Move file") : label("Xóa tài liệu?", "Delete file?")} dismissible={!working} onClose={() => setAction(null)}>
      <p className="workspace-file-status">{action.file.name}</p>
      {action.kind === "move" && <FolderTreePicker folders={folders} selected={destination || null}
        onSelect={id => setDestination(id ?? "")} label={t("folders")} disabled={working}/>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <footer className="actions">
        <button className="secondary-button" disabled={working} onClick={() => setAction(null)}>{t("cancel")}</button>
        <button className={action.kind === "delete" ? "danger-button" : "primary-button"} disabled={working || (action.kind === "move" && destination === originalFolder)} onClick={() => void commit()}>{working ? t("loading") : action.kind === "delete" ? t("delete") : t("move")}</button>
      </footer>
    </Dialog>}
  </section>;
}
