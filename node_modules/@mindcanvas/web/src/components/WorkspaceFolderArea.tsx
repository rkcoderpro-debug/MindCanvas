import { WorkspaceShareButton } from "./WorkspaceShareDialog";
import { ensureFolderAttachments } from "../lib/shareAttachments";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronRight, Download, File, FilePlus2, Folder, FolderPlus, LibraryBig, Link2, Move, RefreshCw, Search, Trash2, Upload } from "lucide-react";
import Dialog from "./Dialog";
import type { useWorkspaceFiles } from "../hooks/useWorkspaceFiles";
import FilePicker from "./FilePicker";
import { useLanguage } from "../lib/i18n";
import { folderPermalink, workspaceFilePermalink } from "../lib/folderLinks";
import { copyTextWithFallback } from "../lib/share";
import { type ProjectFolder } from "../lib/projectStore";
import { addWorkspaceFile, deleteWorkspaceFile, downloadWorkspaceBlob, moveWorkspaceFile, readWorkspaceFile, type WorkspaceFile } from "../lib/workspaceFiles";

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
  current: ProjectFolder | null;
  folders: ProjectFolder[];
  onFolder: (id: string) => void;
  onRoot: () => void;
  onNewFolder: () => void;
  onNewProject: () => void;
  onImportProject: () => void;
  onLibrary: () => void;
  onOpenFile: (id: string | null) => void;
  onSignIn?: () => void;
  activeFileId: string | null;
  repository: ReturnType<typeof useWorkspaceFiles>;
  projectList: ReactNode;
};
export default function WorkspaceFolderArea({ owner,current,folders,onFolder,onRoot,onNewFolder,onNewProject,onImportProject,onLibrary,onOpenFile,onSignIn,activeFileId,repository,projectList }: Props) {
  const { language,t } = useLanguage();
  const vn = language === "vi";
  const label = (vi: string, en: string) => vn ? vi : en;
  const currentId = current?.id ?? null;
  const folderIds = new Set(folders.map(folder => folder.id));
  const children = folders.filter(folder => (folder.parentId ?? null) === currentId);
  const trail = folderTrail(folders,currentId);
  const { files,setFiles,loading,refresh,error: readError } = repository;
  const activeFile = files.find(file => file.id === activeFileId);
  const fileLinkInput = useRef<HTMLInputElement>(null);
  const [fileLinkCopied,setFileLinkCopied] = useState(false);
  const [query,setQuery] = useState("");
  const [status,setStatus] = useState("");
  const [error,setError] = useState("");
  const [uploading,setUploading] = useState(false);
  const [working,setWorking] = useState(false);
  const [action,setAction] = useState<{ file: WorkspaceFile; kind: "move" | "delete" } | null>(null);
  const [destination,setDestination] = useState("");
  const locked = useRef(false);
  const alive = useRef(false);
  const shownFiles = files.filter(file => {
    const folderId = file.folderId && folderIds.has(file.folderId) ? file.folderId : null;
    return folderId === currentId && file.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  });
  const issue = (cause: unknown) => {
    const details = cause as { message?: string; code?: string } | null;
    if (details?.message === "WORKSPACE_FILE_SIZE") return label("vượt giới hạn 40 MB", "exceeds the 40 MB limit");
    if (details?.message === "WORKSPACE_FILE_NAME") return label("tên tệp phải có từ 1 đến 255 ký tự", "file names must contain 1–255 characters");
    if (details?.code === "PGRST205" || details?.code === "42P01") return label("Kho tệp chưa được bật trên máy chủ.", "File storage is not set up on this server.");
    return label("Không thể truy cập tệp. Hãy thử lại.", "Could not access the file. Try again.");
  };

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { setFileLinkCopied(false); }, [activeFileId]);

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
  return <section className="workspace-home workspace-folder-area" aria-label={current?.name ?? t("manageFolders")}>
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
        {current && <WorkspaceShareButton item={{kind:"folder",id:current.id,title:current.name}} available={!!owner}
          prepare={owner ? ()=>ensureFolderAttachments(owner,current.id) : undefined}/>}
        {!current && <button type="button" className="secondary-button manager-documents" onClick={onLibrary}><LibraryBig size={17}/>{label("Tài liệu đã tải lên", "Uploaded documents")}</button>}
      </div>
    </div>
    </header>
    {status && <p role="status" className="workspace-file-status">{status}</p>}
    {children.length > 0 && <div className="workspace-child-folders"><h2>{current ? label("Thư mục con", "Subfolders") : t("folders")}</h2>
      <ul>{children.map(folder => <li key={folder.id}><button type="button" className="secondary-button" onClick={() => onFolder(folder.id)}><Folder size={18}/><span>{folder.name}</span><ChevronRight size={15}/></button></li>)}</ul>
    </div>}
    <div className="workspace-file-box">
      <header><div><h2>{label("Tài liệu", "Files")}</h2><small>{owner ? label("Riêng tư · đồng bộ theo tài khoản", "Private · synced with your account") : label("Lưu trên thiết bị này. Link không mang theo tệp.", "Stored on this device. The link does not include your files.")}</small></div>
        <div className="workspace-file-search"><label className="search-field"><Search size={16} aria-hidden="true"/><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={label("Tìm tên tệp…", "Search files…")} aria-label={label("Tìm tên tệp", "Search file names")}/></label>
          <button type="button" className="icon-button" disabled={!enabled || loading} aria-label={label("Làm mới tài liệu", "Refresh files")} title={label("Làm mới tài liệu", "Refresh files")} onClick={() => { setError(""); refresh(); }}><RefreshCw size={17}/></button></div>
      </header>
      {(error || readError != null) && !action && <p className="form-error" role="alert">{error || issue(readError)}</p>}
      {loading ? <p role="status">{t("loading")}</p> : shownFiles.length === 0 ? <p>{query.trim() ? label("Không tìm thấy tệp phù hợp.", "No matching files.") : label("Chưa có tệp. Bấm Thêm tài liệu để tải bài tập hoặc học liệu lên.", "No files yet. Click Add files to upload homework or study material.")}</p> :
        <ul className="workspace-file-list">{shownFiles.map(file => <li key={file.id}>
          <File size={18} aria-hidden="true"/><button type="button" className="workspace-file-open workspace-file-name" onClick={() => onOpenFile(file.id)}><strong title={file.name}>{file.name}</strong>
            <small>{!file.ready ? label("Tải lên chưa hoàn tất", "Upload incomplete") : `${file.size < 1024 ? `${file.size} B` : file.size < 1048576 ? `${(file.size / 1024).toFixed(1)} KB` : `${(file.size / 1048576).toFixed(1)} MB`} · ${new Date(file.createdAt).toLocaleDateString(vn ? "vi-VN" : "en-US")}`}</small></button>
          <div className="workspace-file-actions">
            {file.ready&&<WorkspaceShareButton item={{kind:"file",id:file.id,title:file.name}} available={!!owner} compact/>}
            <button type="button" className="icon-button" disabled={!enabled || !file.ready} aria-label={`${label("Tải xuống", "Download")}: ${file.name}`} title={label("Tải xuống", "Download")} onClick={() => void download(file)}><Download size={17}/></button>
            <button type="button" className="icon-button" disabled={!enabled || !file.ready} aria-label={`${t("move")}: ${file.name}`} title={t("move")} onClick={() => { setError(""); setDestination(currentId ?? ""); setAction({ file,kind:"move" }); }}><Move size={17}/></button>
            <button type="button" className="icon-button workspace-file-danger" disabled={!enabled} aria-label={`${t("delete")}: ${file.name}`} title={t("delete")} onClick={() => { setError(""); setAction({ file,kind:"delete" }); }}><Trash2 size={17}/></button>
          </div>
        </li>)}</ul>}
    </div>
    {projectList}
    {activeFileId && <Dialog title={activeFile?.name ?? label("Tài liệu", "File")} onClose={() => onOpenFile(null)}>
      {loading && !activeFile ? <p role="status">{t("loading")}</p> : !activeFile
        ? <div><p role="status">{label("Tệp không còn tồn tại hoặc tài khoản hiện tại không có quyền mở.", "This file no longer exists or you do not have access.")}</p>
          {onSignIn && <button type="button" className="primary-button" onClick={onSignIn}>{t("login")}</button>}</div>
        : <div className="workspace-file-detail">
          <p>{activeFile.ready ? label("Link cá nhân dùng để mở lại tệp này trong Workspace.", "Use this private link to reopen the file in Workspace.") : label("Tải lên chưa hoàn tất.", "Upload incomplete.")}</p>
          <label>{label("Link cá nhân", "Private link")}<input ref={fileLinkInput} readOnly value={workspaceFilePermalink(activeFile.id)} onFocus={event => event.currentTarget.select()}/></label>
          {error && <p role="alert">{error}</p>}
          <footer className="actions">
            {activeFile.ready&&<WorkspaceShareButton item={{kind:"file",id:activeFile.id,title:activeFile.name}} available={!!owner}/>}
            <button type="button" className="secondary-button" onClick={async () => setFileLinkCopied(await copyTextWithFallback(workspaceFilePermalink(activeFile.id),fileLinkInput.current))}>
              <Link2 size={16}/>{fileLinkCopied ? t("shareCopied") : t("copyLink")}
            </button>
            <button type="button" className="primary-button" disabled={!activeFile.ready || !enabled} onClick={() => void download(activeFile)}>
              <Download size={16}/>{label("Tải xuống", "Download")}
            </button>
          </footer>
        </div>}
    </Dialog>}
    {action && <Dialog title={action.kind === "move" ? label("Chuyển tài liệu", "Move file") : label("Xóa tài liệu?", "Delete file?")} dismissible={!working} onClose={() => setAction(null)}>
      <p className="workspace-file-status">{action.file.name}</p>
      {action.kind === "move" && <label>{t("folders")}<select value={destination} onChange={event => setDestination(event.target.value)}><option value="">{label("Ngoài thư mục", "No folder")}</option>
        {folders.map(folder => <option key={folder.id} value={folder.id}>{folderTrail(folders,folder.id).map(item => item.name).join(" › ")}</option>)}</select></label>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <footer className="actions">
        <button className="secondary-button" disabled={working} onClick={() => setAction(null)}>{t("cancel")}</button>
        <button className={action.kind === "delete" ? "danger-button" : "primary-button"} disabled={working || (action.kind === "move" && destination === (currentId ?? ""))} onClick={() => void commit()}>{working ? t("loading") : action.kind === "delete" ? t("delete") : t("move")}</button>
      </footer>
    </Dialog>}
  </section>;
}
