import { useEffect, useRef, useState } from "react";
import { ChevronRight, Download, File, Folder, FolderPlus, Link2, Move, RefreshCw, Search, Trash2 } from "lucide-react";
import Dialog from "./Dialog";
import FilePicker from "./FilePicker";
import { useLanguage } from "../lib/i18n";
import { folderPermalink } from "../lib/folderLinks";
import { copyTextWithFallback } from "../lib/share";
import { type ProjectFolder } from "../lib/projectStore";
import { addWorkspaceFile, deleteWorkspaceFile, downloadWorkspaceBlob, listWorkspaceFiles, moveWorkspaceFile, readWorkspaceFile, type WorkspaceFile } from "../lib/workspaceFiles";
import "./workspaceFolders.css";

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
};
export default function WorkspaceFolderArea({ owner,current,folders,onFolder,onRoot,onNewFolder }: Props) {
  const { language,t } = useLanguage();
  const vn = language === "vi";
  const label = (vi: string, en: string) => vn ? vi : en;
  const currentId = current?.id ?? null;
  const folderIds = new Set(folders.map(folder => folder.id));
  const children = folders.filter(folder => (folder.parentId ?? null) === currentId);
  const trail = folderTrail(folders,currentId);
  const [files,setFiles] = useState<WorkspaceFile[]>([]);
  const [query,setQuery] = useState("");
  const [status,setStatus] = useState("");
  const [error,setError] = useState("");
  const [loading,setLoading] = useState(true);
  const [refresh,setRefresh] = useState(0);
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
  useEffect(() => {
    let active = true;
    setLoading(true);
    void listWorkspaceFiles(owner).then(rows => { if (active) setFiles(rows); })
      .catch(cause => { if (active) setError(issue(cause)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [owner,refresh]);

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
          await addWorkspaceFile(owner,currentId,file);
        } catch (cause) { failed.push(`${file.name}: ${issue(cause)}`); }
      }
      if (!alive.current) return;
      if (failed.length) setError(failed.join(" · "));
      const saved = selected.length - failed.length;
      if (saved) setStatus(label(`Đã thêm ${saved} tệp.`, `Added ${saved} file(s).`));
      setRefresh(n => n+1);
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
  return <section className="workspace-folder-area">
    <nav className="workspace-folder-crumbs" aria-label={label("Đường dẫn thư mục", "Folder path")}>
      {current ? <button type="button" onClick={onRoot}>{label("Tất cả thư mục", "All folders")}</button> : <span aria-current="page">{label("Tất cả thư mục", "All folders")}</span>}
      {trail.map((folder,index) => <span key={folder.id}><ChevronRight size={14} aria-hidden="true"/>{index === trail.length-1 ? <strong aria-current="page">{folder.name}</strong> : <button onClick={() => onFolder(folder.id)}>{folder.name}</button>}</span>)}
    </nav>
    <div className="workspace-folder-tools">
      <FilePicker className="workspace-folder-picker" layout="inline" buttonLabel={uploading ? label("Đang tải lên…", "Uploading…") : label("Thêm tài liệu", "Add files")}
        aria-label={label("Thêm tài liệu", "Add files")} description={label("Mọi định dạng · tối đa 40 MB mỗi tệp", "Any format · up to 40 MB per file")}
        multiple disabled={!enabled} onChange={event => void upload(Array.from(event.currentTarget.files ?? []))} onDropFiles={selected => void upload(selected)}/>
      <div className="actions">
        <button type="button" className="secondary-button" disabled={trail.length >= 16} onClick={onNewFolder}><FolderPlus size={17}/>{current ? label("Tạo thư mục con", "New subfolder") : t("newFolder")}</button>
        <button type="button" className="secondary-button" onClick={() => void copy()}><Link2 size={17}/>{label("Sao chép link thư mục", "Copy folder link")}</button>
      </div>
    </div>
    {status && <p role="status" className="workspace-file-status">{status}</p>}
    {children.length > 0 && <div className="workspace-child-folders"><h2>{current ? label("Thư mục con", "Subfolders") : t("folders")}</h2>
      <ul>{children.map(folder => <li key={folder.id}><button type="button" className="secondary-button" onClick={() => onFolder(folder.id)}><Folder size={18}/><span>{folder.name}</span><ChevronRight size={15}/></button></li>)}</ul>
    </div>}
    <div className="workspace-file-box">
      <header><div><h2>{label("Tài liệu", "Files")}</h2><small>{owner ? label("Riêng tư · đồng bộ theo tài khoản", "Private · synced with your account") : label("Lưu trên thiết bị này. Link không mang theo tệp.", "Stored on this device. The link does not include your files.")}</small></div>
        <div className="workspace-file-search"><label className="search-field"><Search size={16} aria-hidden="true"/><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={label("Tìm tên tệp…", "Search files…")} aria-label={label("Tìm tên tệp", "Search file names")}/></label>
          <button type="button" className="icon-button" disabled={!enabled || loading} aria-label={label("Làm mới tài liệu", "Refresh files")} title={label("Làm mới tài liệu", "Refresh files")} onClick={() => { setError(""); setRefresh(n => n+1); }}><RefreshCw size={17}/></button></div>
      </header>
      {error && !action && <p className="form-error" role="alert">{error}</p>}
      {loading ? <p role="status">{t("loading")}</p> : shownFiles.length === 0 ? <p>{query.trim() ? label("Không tìm thấy tệp phù hợp.", "No matching files.") : label("Chưa có tệp. Bấm Thêm tài liệu để tải bài tập hoặc học liệu lên.", "No files yet. Click Add files to upload homework or study material.")}</p> :
        <ul className="workspace-file-list">{shownFiles.map(file => <li key={file.id}>
          <File size={18} aria-hidden="true"/><div className="workspace-file-name"><strong title={file.name}>{file.name}</strong>
            <small>{!file.ready ? label("Tải lên chưa hoàn tất", "Upload incomplete") : `${file.size < 1024 ? `${file.size} B` : file.size < 1048576 ? `${(file.size / 1024).toFixed(1)} KB` : `${(file.size / 1048576).toFixed(1)} MB`} · ${new Date(file.createdAt).toLocaleDateString(vn ? "vi-VN" : "en-US")}`}</small></div>
          <div className="workspace-file-actions">
            <button type="button" className="icon-button" disabled={!enabled || !file.ready} aria-label={`${label("Tải xuống", "Download")}: ${file.name}`} title={label("Tải xuống", "Download")} onClick={() => void download(file)}><Download size={17}/></button>
            <button type="button" className="icon-button" disabled={!enabled || !file.ready} aria-label={`${t("move")}: ${file.name}`} title={t("move")} onClick={() => { setError(""); setDestination(currentId ?? ""); setAction({ file,kind:"move" }); }}><Move size={17}/></button>
            <button type="button" className="icon-button workspace-file-danger" disabled={!enabled} aria-label={`${t("delete")}: ${file.name}`} title={t("delete")} onClick={() => { setError(""); setAction({ file,kind:"delete" }); }}><Trash2 size={17}/></button>
          </div>
        </li>)}</ul>}
    </div>
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
